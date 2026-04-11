/**
 * Memory Assembly Handler
 *
 * Assembles agent context from memories before step execution.
 * Loads agent-scoped + process-scoped + person-scoped memories, sorts, budgets, renders.
 *
 * Also assembles intra-run context: outputs from completed steps in the same
 * process run. This is ephemeral per-run state — NOT durable memory. It replaces
 * the standalone dev-pipeline's buildContextPreamble() which passed prior role
 * outputs to subsequent roles. Intra-run context uses a separate token budget
 * from durable memories.
 *
 * Provenance:
 * - Assembly function: Letta compile(), Open SWE get_agent()
 * - Scope filtering: Mem0 mem0/memory/main.py
 * - Reinforcement sorting: memU src/memu/database/models.py
 * - Intra-run context: Ditto dev-session.ts buildContextPreamble() concept (Brief 027)
 */

import { db, schema } from "../../db";
import { eq, and, desc, ne } from "drizzle-orm";
import type { HarnessHandler, HarnessContext } from "../harness";
import { resolveTools } from "../tool-resolver";
import { getCognitiveCoreCompact, getCognitiveModeExtension } from "../cognitive-core";
import { resolveModeFromProcess, resolveGhostModeOverride } from "../cognitive-mode-resolver";

/** Default token budget for memory injection (4 chars ≈ 1 token) */
const DEFAULT_TOKEN_BUDGET = 2000;
const CHARS_PER_TOKEN = 4;

/**
 * Separate token budget for intra-run context (Brief 027, AC7).
 * Intra-run context is ephemeral per-run state — outputs from prior steps
 * in the same process run. It is NOT durable memory (not learned, not
 * reinforced, not confidence-scored). It uses a separate budget so it
 * doesn't starve durable agent/process memories.
 */
export const RUN_CONTEXT_TOKEN_BUDGET = 1500;

/**
 * Separate token budget for solution knowledge (Brief 060, AC9).
 * Solution memories are structured knowledge extracted from corrections.
 * They don't compete with operational corrections/preferences.
 */
export const SOLUTION_KNOWLEDGE_TOKEN_BUDGET = 1000;

/**
 * Compact type abbreviations for memory rendering (Insight-170: token efficiency).
 */
const MEMORY_TYPE_ABBREV: Record<string, string> = {
  correction: "c",
  preference: "p",
  context: "x",
  skill: "s",
  user_model: "u",
  solution: "sol",
};

/**
 * Render a single memory as a formatted line.
 * Token efficiency (Insight-170): compact type prefix, metadata only for low-confidence.
 */
function renderMemory(memory: {
  type: string;
  content: string;
  confidence: number;
  reinforcementCount: number;
}): string {
  const abbrev = MEMORY_TYPE_ABBREV[memory.type] || memory.type;
  if (memory.confidence < 0.7) {
    return `- [${abbrev}] ${memory.content} (${memory.confidence.toFixed(1)}, ${memory.reinforcementCount}x)`;
  }
  return `- [${abbrev}] ${memory.content}`;
}

/**
 * Truncate text to fit within a character budget, preserving line breaks.
 * Adds ellipsis when truncated.
 */
function truncateToCharBudget(text: string, charBudget: number): string {
  if (text.length <= charBudget) return text;
  return text.slice(0, charBudget - 20) + "\n... (truncated)";
}

export const memoryAssemblyHandler: HarnessHandler = {
  name: "memory-assembly",

  canHandle(_context: HarnessContext): boolean {
    // Always runs — every step gets memory context
    return true;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    const tokenBudget =
      (context.stepDefinition.config?.memory_token_budget as number) ??
      DEFAULT_TOKEN_BUDGET;
    const charBudget = tokenBudget * CHARS_PER_TOKEN;

    // Load agent-scoped memories (if we have an agent ID)
    // Currently no agent assignment mechanism, so agent_role is used as scopeId
    const agentRole = context.stepDefinition.agent_role;
    let agentMemories: Array<{
      type: string;
      content: string;
      confidence: number;
      reinforcementCount: number;
    }> = [];

    if (agentRole) {
      agentMemories = await db
        .select({
          type: schema.memories.type,
          content: schema.memories.content,
          confidence: schema.memories.confidence,
          reinforcementCount: schema.memories.reinforcementCount,
        })
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.scopeType, "agent"),
            eq(schema.memories.scopeId, agentRole),
            eq(schema.memories.active, true)
          )
        )
        .orderBy(
          desc(schema.memories.reinforcementCount),
          desc(schema.memories.confidence)
        );
    }

    // Load process-scoped memories (excluding solution type — those have their own budget)
    const processMemories = await db
      .select({
        type: schema.memories.type,
        content: schema.memories.content,
        confidence: schema.memories.confidence,
        reinforcementCount: schema.memories.reinforcementCount,
      })
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "process"),
          eq(schema.memories.scopeId, context.processRun.processId),
          eq(schema.memories.active, true),
          ne(schema.memories.type, "solution"),
        )
      )
      .orderBy(
        desc(schema.memories.reinforcementCount),
        desc(schema.memories.confidence)
      );

    // Load person-scoped memories if a personId is provided in step config or run inputs
    const personId =
      (context.stepDefinition.config?.person_id as string) ??
      (context.processRun.inputs as Record<string, unknown>)?.personId as string | undefined;

    let personMemories: Array<{
      type: string;
      content: string;
      confidence: number;
      reinforcementCount: number;
    }> = [];

    if (personId) {
      personMemories = await db
        .select({
          type: schema.memories.type,
          content: schema.memories.content,
          confidence: schema.memories.confidence,
          reinforcementCount: schema.memories.reinforcementCount,
        })
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.scopeType, "person"),
            eq(schema.memories.scopeId, personId),
            eq(schema.memories.active, true),
          ),
        )
        .orderBy(
          desc(schema.memories.reinforcementCount),
          desc(schema.memories.confidence),
        );
    }

    // Dedup across scopes — if same content exists in both, keep only the agent-scoped version
    const agentContents = new Set(agentMemories.map((m) => m.content));
    const dedupedProcessMemories = processMemories.filter(
      (m) => !agentContents.has(m.content)
    );
    const allPriorContents = new Set([
      ...agentContents,
      ...dedupedProcessMemories.map((m) => m.content),
    ]);
    const dedupedPersonMemories = personMemories.filter(
      (m) => !allPriorContents.has(m.content),
    );

    // Render durable memories within budget
    const sections: string[] = [];
    let totalChars = 0;
    let injectedCount = 0;

    if (agentMemories.length > 0) {
      const header = "## Agent Memory";
      totalChars += header.length + 1; // +1 for newline
      const lines: string[] = [header];
      for (const mem of agentMemories) {
        const line = renderMemory(mem);
        if (totalChars + line.length + 1 > charBudget) break;
        lines.push(line);
        totalChars += line.length + 1;
        injectedCount++;
      }
      if (lines.length > 1) {
        sections.push(lines.join("\n"));
      }
    }

    if (dedupedProcessMemories.length > 0) {
      const processName = context.processDefinition.name;
      const header = `## Process Memory (${processName})`;
      totalChars += header.length + 1;
      const lines: string[] = [header];
      for (const mem of dedupedProcessMemories) {
        const line = renderMemory(mem);
        if (totalChars + line.length + 1 > charBudget) break;
        lines.push(line);
        totalChars += line.length + 1;
        injectedCount++;
      }
      if (lines.length > 1) {
        sections.push(lines.join("\n"));
      }
    }

    // --- Person memory (Brief 079/080) ---
    if (dedupedPersonMemories.length > 0) {
      const header = "## Person Memory";
      totalChars += header.length + 1;
      const lines: string[] = [header];
      for (const mem of dedupedPersonMemories) {
        const line = renderMemory(mem);
        if (totalChars + line.length + 1 > charBudget) break;
        lines.push(line);
        totalChars += line.length + 1;
        injectedCount++;
      }
      if (lines.length > 1) {
        sections.push(lines.join("\n"));
      }
    }

    // --- Solution knowledge (Brief 060, AC9-10) ---
    // Separate budget for solution memories. Category-filtered, salience-sorted.
    const solutionCharBudget = SOLUTION_KNOWLEDGE_TOKEN_BUDGET * CHARS_PER_TOKEN;
    const solutionMemories = await db
      .select({
        id: schema.memories.id,
        content: schema.memories.content,
        confidence: schema.memories.confidence,
        reinforcementCount: schema.memories.reinforcementCount,
        metadata: schema.memories.metadata,
      })
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.scopeType, "process"),
          eq(schema.memories.scopeId, context.processRun.processId),
          eq(schema.memories.type, "solution"),
          eq(schema.memories.active, true),
        ),
      )
      .orderBy(
        desc(schema.memories.reinforcementCount),
        desc(schema.memories.confidence),
      );

    if (solutionMemories.length > 0) {
      const header = "## Prior Solution Knowledge";
      let solutionChars = header.length + 1;
      const solutionLines: string[] = [header];

      for (const sol of solutionMemories) {
        // Salience: confidence × log(reinforcementCount + 1)
        const meta = (sol.metadata ?? {}) as Record<string, unknown>;
        const category = (meta.category as string) || "unknown";
        const confidence = sol.confidence;
        const reinforced = sol.reinforcementCount;

        const line = `- [${category}] ${sol.content} (confidence: ${confidence}, reinforced: ${reinforced}x)`;
        if (solutionChars + line.length + 1 > solutionCharBudget) break;
        solutionLines.push(line);
        solutionChars += line.length + 1;
        injectedCount++;
      }

      if (solutionLines.length > 1) {
        sections.push(solutionLines.join("\n"));
      }
    }

    // --- Intra-run context (Brief 027, AC7) ---
    // Load outputs from completed steps in the SAME process run.
    // This is ephemeral per-run state, not durable memory.
    // Uses a separate token budget so it doesn't starve agent/process memories.
    const runContextCharBudget = RUN_CONTEXT_TOKEN_BUDGET * CHARS_PER_TOKEN;
    const completedSteps = await db
      .select({
        stepId: schema.stepRuns.stepId,
        outputs: schema.stepRuns.outputs,
        confidenceLevel: schema.stepRuns.confidenceLevel,
      })
      .from(schema.stepRuns)
      .where(
        and(
          eq(schema.stepRuns.processRunId, context.processRun.id),
          eq(schema.stepRuns.status, "approved"),
        ),
      );

    if (completedSteps.length > 0) {
      const runContextLines: string[] = ["## Run Context (prior steps in this run)"];
      let runContextChars = runContextLines[0].length + 1;

      for (const step of completedSteps) {
        // Skip the current step
        if (step.stepId === context.stepDefinition.id) continue;

        const header = `### ${step.stepId}`;
        if (runContextChars + header.length + 1 > runContextCharBudget) break;
        runContextLines.push(header);
        runContextChars += header.length + 1;

        if (step.outputs && typeof step.outputs === "object") {
          // Extract the first output value as text summary
          const outputValues = Object.values(step.outputs as Record<string, unknown>);
          for (const val of outputValues) {
            const text = typeof val === "string" ? val : JSON.stringify(val);
            const truncated = truncateToCharBudget(text, runContextCharBudget - runContextChars - 10);
            runContextLines.push(truncated);
            runContextChars += truncated.length + 1;
            if (runContextChars >= runContextCharBudget) break;
          }
        }

        if (runContextChars >= runContextCharBudget) break;
      }

      if (runContextLines.length > 1) {
        sections.push(runContextLines.join("\n"));
        injectedCount += completedSteps.length;
      }
    }

    // AC10: gracefully handle zero memories (including zero run context)
    if (sections.length === 0) {
      context.memories = "";
      context.memoriesInjected = 0;
    } else {
      context.memories = sections.join("\n\n");
      context.memoriesInjected = injectedCount;
    }

    // --- Cognitive mode extension (Brief 114, Brief 124) ---
    // Resolve mode from process operator + ID, load compact core + mode extension.
    // Mode governs process execution only — conversational surfaces use full core + self.md.
    // Ghost mode override (Brief 124): when sendingIdentity is "ghost", load ghost mode
    // regardless of process operator. Identity-driven, not operator-driven.
    const resolvedMode =
      resolveGhostModeOverride(context.sendingIdentity) ??
      resolveModeFromProcess(
        context.processDefinition.operator,
        context.processDefinition.id,
      );

    const cognitiveCoreSections: string[] = [];
    const compactCore = getCognitiveCoreCompact();
    if (compactCore) {
      cognitiveCoreSections.push(compactCore);
    }

    if (resolvedMode) {
      const modeExtension = getCognitiveModeExtension(resolvedMode);
      if (modeExtension) {
        cognitiveCoreSections.push(modeExtension);
      }
    }

    if (cognitiveCoreSections.length > 0) {
      const cognitiveContext = cognitiveCoreSections.join("\n\n");
      // Prepend cognitive context before memories
      context.memories = context.memories
        ? cognitiveContext + "\n\n" + context.memories
        : cognitiveContext;
    }

    // --- Voice model injection (Brief 124) ---
    // When ghost mode is active, inject user's voice samples into the prompt.
    // The voice model is loaded by the voice-calibration handler (packages/core)
    // via the voiceModelLoader callback. We inject it here as context.
    if (resolvedMode === "ghost" && context.voiceModel) {
      const voiceSection = [
        "## Voice Reference",
        "Write in this person's voice. Here are their recent emails:",
        "",
        context.voiceModel,
      ].join("\n");

      context.memories = context.memories
        ? context.memories + "\n\n" + voiceSection
        : voiceSection;
    }

    // Record resolved mode on stepRun for audit trail
    if (resolvedMode) {
      try {
        await db
          .update(schema.stepRuns)
          .set({ cognitiveMode: resolvedMode })
          .where(eq(schema.stepRuns.id, context.stepRunId));
      } catch {
        // Non-critical — don't fail the pipeline if audit write fails
      }
    }

    // --- Integration tool resolution (Brief 025) ---
    // Resolve step-level tools into LlmToolDefinitions + dispatch function.
    // Separate from memory budget — tools don't consume token budget.
    if (context.stepDefinition.tools && context.stepDefinition.tools.length > 0) {
      const resolved = resolveTools(context.stepDefinition.tools, undefined, context.processRun.processId, context.stagedOutboundActions);
      if (resolved.tools.length > 0) {
        context.resolvedTools = resolved;
        console.log(
          `    Resolved ${resolved.tools.length} integration tool(s): ${resolved.tools.map((t) => t.name).join(", ")}`,
        );
      }
    }

    return context;
  },
};
