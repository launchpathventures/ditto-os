/**
 * CLI Command: capture
 * Capture work items with auto-classification and auto-routing (Brief 014b).
 *
 * Flow:
 * 1. If --type and --process provided → non-interactive mode (unchanged)
 * 2. Otherwise → auto-classification pipeline:
 *    a. Create work item in `intake` status
 *    b. Run intake-classifier → determine type
 *    c. Run router → match to best process
 *    d. Run orchestrator → trigger process run
 *    e. If any step has low confidence → fall back to interactive @clack/prompts
 *
 * Provenance: Original to Agent OS — no CLI does capture → classify → route from free text.
 */

import { defineCommand } from "citty";
import * as clack from "@clack/prompts";
import { db, schema } from "../../db";
import { eq, ne, and } from "drizzle-orm";
import type { WorkItemType } from "../../db/schema";
import { startSystemAgentRun } from "../../engine/heartbeat";
import { flattenSteps, type ProcessDefinition } from "../../engine/process-loader";

const validTypes: WorkItemType[] = ["task", "question", "goal", "insight", "outcome"];

export const captureCommand = defineCommand({
  meta: {
    name: "capture",
    description: "Capture a work item",
  },
  args: {
    text: {
      type: "positional",
      description: "What to capture",
      required: true,
    },
    type: {
      type: "string",
      description: "Work item type: task, question, goal, insight, outcome",
    },
    process: {
      type: "string",
      description: "Process slug to assign to",
    },
  },
  async run({ args }) {
    if (!args.text) {
      console.error("Usage: pnpm cli capture <text>");
      process.exit(1);
    }

    // Non-interactive mode: --type and --process provided (unchanged from 4b)
    if (args.type && args.process) {
      await captureNonInteractive(args.text, args.type, args.process);
      return;
    }

    // Auto-classification pipeline
    await captureAutoClassify(args.text);
  },
});

/**
 * Non-interactive capture with explicit type and process (unchanged from 4b).
 */
async function captureNonInteractive(
  text: string,
  typeArg: string,
  processSlug: string,
): Promise<void> {
  if (!validTypes.includes(typeArg as WorkItemType)) {
    console.error(`Invalid type: ${typeArg}. Valid: ${validTypes.join(", ")}`);
    process.exit(1);
  }
  const itemType = typeArg as WorkItemType;

  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!proc) {
    console.error(`Process not found: ${processSlug}`);
    process.exit(1);
  }

  const [workItem] = await db
    .insert(schema.workItems)
    .values({
      type: itemType,
      status: "routed",
      content: text,
      source: "capture",
      assignedProcess: proc.id,
    })
    .returning();

  const shortId = workItem.id.slice(0, 8);
  const typeLabel = itemType.charAt(0).toUpperCase() + itemType.slice(1);
  console.log(`\n✓ Captured #${shortId} as ${typeLabel} (routed)`);
}

/**
 * Auto-classification pipeline: classify → route → orchestrate.
 * Falls back to interactive selection on low confidence or failure.
 */
async function captureAutoClassify(text: string): Promise<void> {
  // Step 1: Create work item in intake status
  const [workItem] = await db
    .insert(schema.workItems)
    .values({
      type: "task", // Provisional — will be updated by classifier
      status: "intake",
      content: text,
      source: "capture",
    })
    .returning();

  // Step 2: Run intake-classifier
  const classification = await runIntakeClassifier(text);

  if (!classification || classification.confidence === "low") {
    // Fallback to interactive selection
    console.log("\n⚠ Couldn't confidently classify this. Let's do it manually:");
    await fallbackToInteractive(workItem.id, text);
    return;
  }

  // Update work item type
  const itemType = classification.type as WorkItemType;
  await db
    .update(schema.workItems)
    .set({ type: itemType, updatedAt: new Date() })
    .where(eq(schema.workItems.id, workItem.id));

  // Step 3: Run router
  const routing = await runRouter(text, itemType);

  const shortId = workItem.id.slice(0, 8);
  const typeLabel = itemType.charAt(0).toUpperCase() + itemType.slice(1);

  if (!routing || !routing.processSlug) {
    // No matching process — create as unassigned (AC7)
    console.log(`\n✓ Captured #${shortId} as ${typeLabel}`);
    console.log(`  Classified: ${itemType} (${classification.reasoning})`);
    console.log(`  No matching process — left unassigned`);
    console.log(`  (Classification is supervised — reviewing builds routing confidence.)`);
    return;
  }

  // Look up the process to get its ID and name
  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, routing.processSlug))
    .limit(1);

  if (!proc) {
    // Process slug from router doesn't exist — leave unassigned
    console.log(`\n✓ Captured #${shortId} as ${typeLabel}`);
    console.log(`  Classified: ${itemType} (${classification.reasoning})`);
    console.log(`  No matching process — left unassigned`);
    return;
  }

  // Update work item with routing
  await db
    .update(schema.workItems)
    .set({
      status: "routed",
      assignedProcess: proc.id,
      updatedAt: new Date(),
    })
    .where(eq(schema.workItems.id, workItem.id));

  // Step 4: For goals — scope negotiation before orchestration (Brief 022 AC 1-2)
  if (itemType === "goal" || itemType === "outcome") {
    await goalScopeNegotiation(workItem.id, text, proc, routing.processSlug);
    return;
  }

  // For tasks/questions — direct orchestration (AC 3: existing flow unchanged)
  await runOrchestrator(routing.processSlug, workItem.id, text);

  console.log(`\n✓ Captured #${shortId} as ${typeLabel}`);
  console.log(`  Classified: ${itemType} (${classification.reasoning})`);
  console.log(`  Routed to: ${proc.name} (${proc.slug})`);
  console.log(`  Work item: #${shortId}`);
  console.log(`  (Classification is supervised — reviewing builds routing confidence.)`);
}

// ============================================================
// Goal scope negotiation (Brief 022 AC 1-2)
// Shows proposed scope before orchestrator decomposes.
// ============================================================

async function goalScopeNegotiation(
  workItemId: string,
  goalText: string,
  proc: { id: string; name: string; slug: string; definition: Record<string, unknown> },
  processSlug: string,
): Promise<void> {
  const shortId = workItemId.slice(0, 8);
  const definition = proc.definition as unknown as ProcessDefinition;
  const steps = flattenSteps(definition);

  // Build scope proposal (AC 1)
  console.log("");
  clack.intro(`Goal: ${goalText}`);
  console.log("");
  console.log("  PROPOSED SCOPE");
  console.log(`  Process: ${proc.name}`);
  console.log("");

  // Show included steps
  for (const step of steps) {
    const isConditional = !!(step.route_to && step.route_to.length > 0);
    const marker = isConditional ? "?" : "\u2713"; // ? or ✓
    const note = isConditional ? " (conditional — may be skipped)" : "";
    console.log(`  ${marker} ${step.name}${note}`);
  }
  console.log("");
  console.log(`  Estimated tasks: ${steps.length}`);
  console.log(`  Needs from you: review decisions at trust gates`);
  console.log("");

  // Confirm/adjust/cancel (AC 2)
  const action = await clack.select({
    message: "Proceed with this scope?",
    options: [
      { value: "confirm", label: "Confirm — start working" },
      { value: "adjust", label: "Adjust — re-enter a modified goal" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (clack.isCancel(action) || action === "cancel") {
    // Mark the work item as failed so it doesn't linger (Flag 3 fix)
    await db
      .update(schema.workItems)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(schema.workItems.id, workItemId));
    clack.cancel("Goal cancelled.");
    return;
  }

  if (action === "adjust") {
    const newGoal = await clack.text({
      message: "Enter your adjusted goal:",
      initialValue: goalText,
    });

    if (clack.isCancel(newGoal)) {
      clack.cancel("Goal cancelled.");
      return;
    }

    // Update the work item content and re-run orchestration with the adjusted text
    await db
      .update(schema.workItems)
      .set({ content: newGoal as string, updatedAt: new Date() })
      .where(eq(schema.workItems.id, workItemId));

    await runOrchestrator(processSlug, workItemId, newGoal as string, "goal");
    console.log(`\n\u2713 Goal #${shortId} confirmed (adjusted) — orchestrator decomposing...`);
    return;
  }

  // Confirm — run orchestrator with goal type
  await runOrchestrator(processSlug, workItemId, goalText, "goal");
  console.log(`\n\u2713 Goal #${shortId} confirmed — orchestrator decomposing...`);
  console.log(`  Run \`pnpm cli status\` to see the goal tree.`);
}

// ============================================================
// System agent runners — call system agents and read outputs
// ============================================================

interface ClassificationOutput {
  type: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  matchedKeyword: string | null;
}

interface RoutingOutput {
  processSlug: string | null;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

/**
 * Run the intake-classifier system agent and extract classification result.
 * Returns null if the system agent process doesn't exist.
 */
async function runIntakeClassifier(
  content: string,
): Promise<ClassificationOutput | null> {
  const result = await startSystemAgentRun(
    "intake-classifier",
    { content },
    "system:capture",
  );

  if (!result) return null;

  // Read step run outputs from the DB
  return readSystemAgentOutput<ClassificationOutput>(
    result.processRunId,
    "classification-result",
  );
}

/**
 * Run the router system agent and extract routing result.
 * Returns null if the system agent process doesn't exist.
 */
async function runRouter(
  content: string,
  workItemType: WorkItemType,
): Promise<RoutingOutput | null> {
  // Load active domain processes (AC9: exclude system processes)
  const allProcesses = await db
    .select()
    .from(schema.processes)
    .where(ne(schema.processes.status, "archived"));

  // Filter out system processes by checking definition.system flag
  const nonSystemProcesses = allProcesses
    .filter((p) => !(p.definition as Record<string, unknown>)?.system)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      description: p.description || "",
    }));

  if (nonSystemProcesses.length === 0) {
    return { processSlug: null, confidence: "high", reasoning: "No domain processes available" };
  }

  const result = await startSystemAgentRun(
    "router",
    {
      content,
      workItemType,
      availableProcesses: nonSystemProcesses,
    },
    "system:capture",
  );

  if (!result) return null;

  return readSystemAgentOutput<RoutingOutput>(
    result.processRunId,
    "routing-result",
  );
}

/**
 * Run the orchestrator system agent.
 * Fire-and-forget: starts the process run but doesn't wait for it.
 */
async function runOrchestrator(
  processSlug: string,
  workItemId: string,
  content: string,
  workItemType?: string,
): Promise<void> {
  await startSystemAgentRun(
    "orchestrator",
    { processSlug, workItemId, content, workItemType },
    "system:capture",
  );
}

/**
 * Read a system agent's step output from the DB.
 * Looks up the step run for the given process run and extracts the named output.
 */
async function readSystemAgentOutput<T>(
  processRunId: string,
  outputName: string,
): Promise<T | null> {
  const stepRuns = await db
    .select()
    .from(schema.stepRuns)
    .where(eq(schema.stepRuns.processRunId, processRunId));

  // Find the step run that has outputs (there should be exactly one for single-step system agents)
  for (const sr of stepRuns) {
    const outputs = sr.outputs as Record<string, unknown> | null;
    if (outputs && outputs[outputName]) {
      return outputs[outputName] as T;
    }
  }

  return null;
}

// ============================================================
// Fallback: interactive classification (from 4b)
// ============================================================

/**
 * Fall back to interactive @clack/prompts when auto-classification fails.
 * Updates the existing work item with user selections.
 */
async function fallbackToInteractive(
  workItemId: string,
  text: string,
): Promise<void> {
  clack.intro("Capture work item");
  console.log(`  "${text}"\n`);

  // Select type
  const typeResult = await clack.select({
    message: "What kind of work is this?",
    options: [
      { value: "task", label: "Task — something to do" },
      { value: "question", label: "Question — something to answer" },
      { value: "goal", label: "Goal — something to achieve" },
      { value: "insight", label: "Insight — something learned" },
      { value: "outcome", label: "Outcome — a time-bound goal" },
    ],
  });

  if (clack.isCancel(typeResult)) {
    // Clean up the intake work item
    clack.cancel("Cancelled.");
    process.exit(0);
  }
  const itemType = typeResult as WorkItemType;

  let assignedProcessId: string | null = null;

  // Select process
  const activeProcesses = await db
    .select()
    .from(schema.processes)
    .where(ne(schema.processes.status, "archived"));

  // Filter out system processes
  const domainProcesses = [];
  for (const p of activeProcesses) {
    const def = p.definition as Record<string, unknown> | undefined;
    if (!def?.system) {
      domainProcesses.push(p);
    }
  }

  if (domainProcesses.length > 0) {
    const processResult = await clack.select({
      message: "Assign to a process?",
      options: [
        { value: "__none__", label: "None — leave unassigned" },
        ...domainProcesses.map((p) => ({
          value: p.id,
          label: `${p.name} (${p.slug})`,
        })),
      ],
    });

    if (clack.isCancel(processResult)) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }

    if (processResult !== "__none__") {
      assignedProcessId = processResult as string;
    }
  }

  // Update the work item
  await db
    .update(schema.workItems)
    .set({
      type: itemType,
      status: assignedProcessId ? "routed" : "intake",
      assignedProcess: assignedProcessId,
      updatedAt: new Date(),
    })
    .where(eq(schema.workItems.id, workItemId));

  const shortId = workItemId.slice(0, 8);
  const typeLabel = itemType.charAt(0).toUpperCase() + itemType.slice(1);
  console.log(`\n✓ Captured #${shortId} as ${typeLabel}${assignedProcessId ? " (routed)" : ""}`);
}
