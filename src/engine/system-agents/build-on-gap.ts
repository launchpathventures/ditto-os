/**
 * Build-on-Gap — Trigger Build Meta-Process for Unmatched Sub-Goals
 *
 * When neither the Process Model Library nor existing processes match
 * a sub-goal, the Build meta-process creates a new process: research
 * the domain, generate a process definition, save it, and validate
 * with a supervised first run.
 *
 * Build depth = 1: the orchestrator can trigger Build, but Build
 * cannot trigger Build. If Build hits a gap, it uses its tools
 * directly (web-search, LLM reasoning) rather than spawning
 * another orchestration cycle.
 *
 * Provenance: Original to Ditto — no existing orchestration system
 * routes unmatched goals to dynamic process creation.
 *
 * Brief 103
 */

import { randomUUID } from "crypto";
import { db, schema } from "../../db";
import { eq, and } from "drizzle-orm";
import { createCompletion, extractText } from "../llm";
import type { TrustTier } from "../../db/schema";
import { harnessEvents } from "../events";

// ============================================================
// Types
// ============================================================

export interface BuildResult {
  /** Whether the build succeeded */
  success: boolean;
  /** The process slug if build succeeded */
  processSlug: string | null;
  /** The process ID if build succeeded */
  processId: string | null;
  /** Build status */
  status: "built" | "first_run_failed" | "archived" | "depth_exceeded" | "duplicate_waiting" | "error";
  /** Human-readable explanation */
  reasoning: string;
  /** LLM cost for the build (cents) */
  costCents: number;
}

export interface BuildContext {
  /** The sub-goal ID being built for */
  subGoalId: string;
  /** The sub-goal description */
  subGoalDescription: string;
  /** The parent goal ID */
  goalId: string;
  /** Current build depth (0 = first build, must be < 1 for build to proceed) */
  buildDepth: number;
  /** Industry context keywords */
  industryKeywords?: string[];
  /** Whether to attempt a first-run validation */
  validateFirstRun?: boolean;
}

// ============================================================
// Active build tracking (for concurrent deduplication)
// ============================================================

/** Maps capability keywords → { buildId, promise } for dedup */
const activeBuilds = new Map<string, { buildId: string; promise: Promise<BuildResult> }>();

/**
 * Generate a dedup key from a sub-goal description.
 * Uses top-3 meaningful keywords sorted alphabetically.
 */
function dedupKey(description: string): string {
  const tokens = description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .sort();
  return tokens.slice(0, 3).join("|");
}

// ============================================================
// Main entry
// ============================================================

/**
 * Trigger the Build meta-process for a sub-goal.
 *
 * Flow:
 * 1. Check build depth (must be 0)
 * 2. Check for concurrent builds targeting the same capability
 * 3. Research the domain (LLM synthesis)
 * 4. Generate a process definition
 * 5. Save the process to DB
 * 6. Optionally validate with a supervised first run
 *
 * Constraint: Build depth = 1. This function does NOT call
 * decomposeGoal() or routeSubGoal() — it uses tools directly.
 */
export async function triggerBuild(ctx: BuildContext): Promise<BuildResult> {
  // ── Build depth enforcement (AC6) ──
  if (ctx.buildDepth >= 1) {
    return {
      success: false,
      processSlug: null,
      processId: null,
      status: "depth_exceeded",
      reasoning: `Build depth ${ctx.buildDepth} >= 1 — harness rejects nested builds`,
      costCents: 0,
    };
  }

  // ── Concurrent build deduplication (AC15) ──
  const key = dedupKey(ctx.subGoalDescription);
  const existingBuild = activeBuilds.get(key);
  if (existingBuild) {
    await logBuildActivity(ctx, "build.dedup_waiting", {
      existingBuildId: existingBuild.buildId,
      dedupKey: key,
    });
    // Wait for the existing build to complete
    return existingBuild.promise;
  }

  const buildId = randomUUID();
  const buildPromise = executeBuild(ctx, buildId);

  // Register for dedup
  activeBuilds.set(key, { buildId, promise: buildPromise });

  try {
    return await buildPromise;
  } finally {
    activeBuilds.delete(key);
  }
}

// ============================================================
// Build execution
// ============================================================

async function executeBuild(ctx: BuildContext, buildId: string): Promise<BuildResult> {
  let totalCostCents = 0;

  try {
    await logBuildActivity(ctx, "build.started", { buildId });

    // ── Step 1: Research the domain ──
    const researchResult = await researchDomain(ctx.subGoalDescription, ctx.industryKeywords);
    totalCostCents += researchResult.costCents;

    // ── Step 2: Generate process definition via LLM ──
    const generationResult = await generateProcessDefinition(
      ctx.subGoalDescription,
      researchResult.synthesis,
      ctx.industryKeywords,
    );
    totalCostCents += generationResult.costCents;

    if (!generationResult.definition) {
      await logBuildActivity(ctx, "build.generation_failed", {
        buildId,
        costCents: totalCostCents,
      });
      return {
        success: false,
        processSlug: null,
        processId: null,
        status: "error",
        reasoning: "Failed to generate process definition from LLM",
        costCents: totalCostCents,
      };
    }

    // ── Step 3: Save process to DB ──
    const slug = generationResult.definition.slug;
    const [process] = await db
      .insert(schema.processes)
      .values({
        name: generationResult.definition.name,
        slug,
        description: generationResult.definition.description,
        definition: generationResult.definition.definition as unknown as Record<string, unknown>,
        status: "draft", // Draft until first-run validates
        trustTier: "supervised" as TrustTier, // Always supervised for generated processes
      })
      .returning();

    await logBuildActivity(ctx, "build.process_created", {
      buildId,
      processSlug: slug,
      processId: process.id,
      costCents: totalCostCents,
    });

    // ── Step 4: First-run validation (AC7) ──
    if (ctx.validateFirstRun !== false) {
      const firstRunResult = await validateFirstRun(process.id, slug, ctx);

      if (!firstRunResult.success) {
        // First run failed — retry once (AC7: maximum 1 build retry)
        const retryResult = await validateFirstRun(process.id, slug, ctx);

        if (!retryResult.success) {
          // Archive the process (not delete — preserves learning)
          await db
            .update(schema.processes)
            .set({ status: "archived" })
            .where(eq(schema.processes.id, process.id));

          await logBuildActivity(ctx, "build.first_run_failed", {
            buildId,
            processSlug: slug,
            processId: process.id,
            costCents: totalCostCents,
            firstRunError: retryResult.error,
          });

          return {
            success: false,
            processSlug: slug,
            processId: process.id,
            status: "first_run_failed",
            reasoning: `First-run gate failed after retry: ${retryResult.error}. Process archived, sub-goal escalated.`,
            costCents: totalCostCents,
          };
        }
      }

      // First run succeeded — promote to active
      await db
        .update(schema.processes)
        .set({ status: "active" })
        .where(eq(schema.processes.id, process.id));
    }

    await logBuildActivity(ctx, "build.completed", {
      buildId,
      processSlug: slug,
      processId: process.id,
      costCents: totalCostCents,
    });

    // Brief 155 MP-1.5: emit build-process-created notification
    harnessEvents.emit({
      type: "build-process-created",
      goalWorkItemId: ctx.goalId,
      processSlug: slug,
      processName: generationResult.definition.name,
      processDescription: generationResult.definition.description,
    });

    return {
      success: true,
      processSlug: slug,
      processId: process.id,
      status: "built",
      reasoning: `Built and validated process "${generationResult.definition.name}" for sub-goal`,
      costCents: totalCostCents,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await logBuildActivity(ctx, "build.error", {
      buildId,
      error: errMsg,
      costCents: totalCostCents,
    });
    return {
      success: false,
      processSlug: null,
      processId: null,
      status: "error",
      reasoning: `Build failed: ${errMsg}`,
      costCents: totalCostCents,
    };
  }
}

// ============================================================
// Domain research
// ============================================================

interface ResearchResult {
  synthesis: string;
  costCents: number;
}

async function researchDomain(
  description: string,
  industryKeywords?: string[],
): Promise<ResearchResult> {
  const industryContext = industryKeywords?.length
    ? `\nIndustry context: ${industryKeywords.join(", ")}`
    : "";

  const response = await createCompletion({
    purpose: "analysis",
    system: `You are a process design researcher. Given a capability description, synthesize what steps, tools, and patterns would be needed to implement this as a repeatable process. Be concise and practical.`,
    messages: [{
      role: "user",
      content: `Design a repeatable process for this capability:\n\n${description}${industryContext}\n\nProvide:\n1. Key steps (3-6)\n2. Required tools/integrations\n3. Success criteria\n4. Common failure modes`,
    }],
    maxTokens: 1024,
  });

  return {
    synthesis: extractText(response.content),
    costCents: response.costCents,
  };
}

// ============================================================
// Process generation
// ============================================================

interface GenerationResult {
  definition: {
    name: string;
    slug: string;
    description: string;
    definition: Record<string, unknown>;
  } | null;
  costCents: number;
}

async function generateProcessDefinition(
  subGoalDescription: string,
  research: string,
  industryKeywords?: string[],
): Promise<GenerationResult> {
  const response = await createCompletion({
    purpose: "writing",
    system: `You are a process definition generator. Given a capability description and research, produce a process definition in JSON format.

Output ONLY a JSON object (no markdown fences):
{
  "name": "Human-readable process name",
  "slug": "kebab-case-slug",
  "description": "One-line description",
  "steps": [
    {
      "id": "step-id",
      "name": "Step Name",
      "executor": "ai-agent" | "human" | "script",
      "description": "What this step does",
      "depends_on": ["previous-step-id"]
    }
  ]
}

Rules:
- 3-6 steps
- First step should gather/validate inputs
- Include at least one human review step for quality
- Use "ai-agent" for research/analysis, "human" for approval/review, "script" for automation
- Step IDs should be descriptive kebab-case`,
    messages: [{
      role: "user",
      content: `Create a process for:\n${subGoalDescription}\n\nResearch synthesis:\n${research}${industryKeywords?.length ? `\nIndustry: ${industryKeywords.join(", ")}` : ""}`,
    }],
    maxTokens: 1024,
  });

  const text = extractText(response.content);

  try {
    const cleaned = text
      .replace(/```json?\s*\n?/g, "")
      .replace(/```\s*$/g, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      name: string;
      slug: string;
      description: string;
      steps: Array<{
        id: string;
        name: string;
        executor: string;
        description?: string;
        depends_on?: string[];
      }>;
    };

    // Build full process definition
    const definition = {
      name: parsed.name,
      id: parsed.slug,
      version: 1,
      status: "draft",
      description: parsed.description,
      trigger: { type: "manual" },
      inputs: [],
      steps: parsed.steps.map((s) => ({
        id: s.id,
        name: s.name,
        executor: s.executor,
        description: s.description || "",
        depends_on: s.depends_on || [],
      })),
      outputs: [],
      governance: {
        trust_tier: "supervised",
      },
    };

    return {
      definition: {
        name: parsed.name,
        slug: parsed.slug,
        description: parsed.description,
        definition,
      },
      costCents: response.costCents,
    };
  } catch {
    return { definition: null, costCents: response.costCents };
  }
}

// ============================================================
// First-run validation (AC7)
// ============================================================

interface FirstRunResult {
  success: boolean;
  error?: string;
}

/**
 * Validate a generated process with a supervised first run.
 * Uses startProcessRun + fullHeartbeat from the heartbeat module.
 *
 * Note: Lazy import to avoid circular dependency with heartbeat.ts.
 */
async function validateFirstRun(
  processId: string,
  processSlug: string,
  ctx: BuildContext,
): Promise<FirstRunResult> {
  try {
    const { startProcessRun, fullHeartbeat } = await import("../heartbeat");

    const runId = await startProcessRun(
      processSlug,
      {
        workItemId: ctx.subGoalId,
        content: ctx.subGoalDescription,
        isFirstRunValidation: true,
        buildDepth: ctx.buildDepth + 1, // Increment depth to prevent nested builds
      },
      "system:build-validator",
      { parentTrustTier: "supervised" }, // Always supervised for first run
    );

    const result = await fullHeartbeat(runId);

    if (result.status === "completed") {
      return { success: true };
    }

    // Any non-completed status is a failure for first-run validation
    return {
      success: false,
      error: `First run ended with status: ${result.status} — ${result.message}`,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errMsg };
  }
}

// ============================================================
// Goal cancellation support (AC16)
// ============================================================

/**
 * Archive any build-in-progress processes for a cancelled goal.
 * Called from the orchestrator when a user cancels a goal.
 * Filters by goalId in activity metadata to avoid archiving processes
 * from unrelated goals.
 */
export async function archiveBuildInProgress(goalId: string): Promise<number> {
  // Find draft processes that were created by builds for this goal
  const activities = await db
    .select()
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.action, "build.process_created"),
        eq(schema.activities.entityType, "work_item"),
      ),
    );

  let archived = 0;
  for (const activity of activities) {
    const meta = activity.metadata as Record<string, unknown> | null;
    if (!meta) continue;

    // Only archive processes from builds belonging to THIS goal
    if (meta.goalId !== goalId) continue;

    const processId = meta.processId as string | undefined;
    if (!processId) continue;

    const [process] = await db
      .select()
      .from(schema.processes)
      .where(
        and(
          eq(schema.processes.id, processId),
          eq(schema.processes.status, "draft"),
        ),
      )
      .limit(1);

    if (process) {
      await db
        .update(schema.processes)
        .set({ status: "archived" })
        .where(eq(schema.processes.id, processId));
      archived++;
    }
  }

  return archived;
}

// ============================================================
// Activity logging
// ============================================================

async function logBuildActivity(
  ctx: BuildContext,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.insert(schema.activities).values({
    action,
    actorType: "system",
    entityType: "work_item",
    entityId: ctx.subGoalId,
    metadata: {
      ...metadata,
      goalId: ctx.goalId,
      subGoalDescription: ctx.subGoalDescription,
      buildDepth: ctx.buildDepth,
    },
  });
}
