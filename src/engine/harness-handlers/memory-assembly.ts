/**
 * Memory Assembly Handler
 *
 * Assembles agent context from memories before step execution.
 * Loads agent-scoped + process-scoped memories, sorts, budgets, renders.
 *
 * Provenance:
 * - Assembly function: Letta compile(), Open SWE get_agent()
 * - Scope filtering: Mem0 mem0/memory/main.py
 * - Reinforcement sorting: memU src/memu/database/models.py
 */

import { db, schema } from "../../db";
import { eq, and, desc } from "drizzle-orm";
import type { HarnessHandler, HarnessContext } from "../harness";

/** Default token budget for memory injection (4 chars ≈ 1 token) */
const DEFAULT_TOKEN_BUDGET = 2000;
const CHARS_PER_TOKEN = 4;

/**
 * Render a single memory as a formatted line.
 */
function renderMemory(memory: {
  type: string;
  content: string;
  confidence: number;
  reinforcementCount: number;
}): string {
  return `- [${memory.type}] ${memory.content} (confidence: ${memory.confidence}, reinforced: ${memory.reinforcementCount}x)`;
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

    // Load process-scoped memories
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
          eq(schema.memories.active, true)
        )
      )
      .orderBy(
        desc(schema.memories.reinforcementCount),
        desc(schema.memories.confidence)
      );

    // AC10: gracefully handle zero memories
    if (agentMemories.length === 0 && processMemories.length === 0) {
      context.memories = "";
      context.memoriesInjected = 0;
      return context;
    }

    // Dedup across scopes — if same content exists in both, keep only the agent-scoped version
    const agentContents = new Set(agentMemories.map((m) => m.content));
    const dedupedProcessMemories = processMemories.filter(
      (m) => !agentContents.has(m.content)
    );

    // Render within budget
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

    context.memories = sections.join("\n\n");
    context.memoriesInjected = injectedCount;

    return context;
  },
};
