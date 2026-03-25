/**
 * Ditto — Self Streaming Adapter
 *
 * Thin adapter that wraps selfConverse() to yield streaming events
 * compatible with the Vercel AI SDK data stream protocol.
 *
 * The Self's conversation loop (context assembly → LLM → tool_use → repeat)
 * runs server-side. This adapter streams text deltas and tool activity
 * to the browser as they happen.
 *
 * Design: Rather than modifying the existing non-streaming selfConverse(),
 * we run the conversation loop here with the Anthropic/OpenAI streaming APIs
 * to yield real text deltas. Tool calls execute inline and results stream back.
 *
 * Provenance: Vercel AI SDK streamText pattern, Brief 039.
 */

import {
  type LlmMessage,
  type LlmToolResultBlock,
  type LlmContentBlock,
  type LlmToolUseBlock,
  extractToolUse,
} from "./llm";
import { createStreamingCompletion, type StreamEvent } from "./llm-stream";
import {
  loadWorkStateSummary,
  loadSelfMemories,
  loadSessionTurns,
  getOrCreateSession,
  appendSessionTurn,
  recordSelfDecision,
  detectSelfRedirect,
  recordSelfCorrection,
} from "./self-context";
import { selfTools, executeDelegation } from "./self-delegation";
import { assembleSelfContext } from "./self";
import type { ContentBlock } from "./content-blocks";
import { registerBlockActions } from "./surface-actions";

// ============================================================
// Stream event types (for consumers)
// ============================================================

export type SelfStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call-start"; toolName: string; toolCallId: string }
  | { type: "tool-call-result"; toolCallId: string; result: string; blocks?: ContentBlock[] }
  | { type: "structured-data"; data: Record<string, unknown> }
  | { type: "content-block"; block: ContentBlock }
  | { type: "credential-request"; service: string; processSlug: string | null; fieldLabel: string; placeholder: string }
  | { type: "status"; message: string }
  | { type: "finish"; sessionId: string; delegationsExecuted: number; consultationsExecuted: number; costCents: number };

/** Maximum tool_use turns in a single streaming conversation cycle */
const MAX_TOOL_TURNS = 10;

/**
 * Process a human message through the Self with streaming output.
 *
 * Yields SelfStreamEvent items as they occur:
 * - text-delta: partial text from the LLM
 * - tool-call-start: delegation/consultation beginning
 * - tool-call-result: delegation/consultation complete
 * - status: processing status messages
 * - finish: final metadata
 *
 * AC4: Streaming adapter compatible with Vercel AI SDK.
 */
export async function* selfConverseStream(
  userId: string,
  message: string,
): AsyncGenerator<SelfStreamEvent> {
  // 1. Assemble context
  const context = await assembleSelfContext(userId, "web");

  // 2. Load session turns
  const priorTurns = await loadSessionTurns(context.sessionId, 2000);

  const messages: LlmMessage[] = [];
  for (const turn of priorTurns) {
    messages.push({
      role: turn.role as "user" | "assistant",
      content: turn.content,
    });
  }
  messages.push({ role: "user", content: message });

  // 3. Record user turn
  await appendSessionTurn(context.sessionId, {
    role: "user",
    content: message,
    timestamp: Date.now(),
    surface: "web",
  });

  // 4. Cross-turn redirect detection
  let lastDelegatedRole: string | null = null;
  for (let i = priorTurns.length - 1; i >= 0; i--) {
    const turnContent = priorTurns[i].content;
    if (typeof turnContent === "string") {
      const roleMatch = turnContent.match(/^Role: (\w+)$/m);
      if (roleMatch && priorTurns[i].role === "assistant") {
        lastDelegatedRole = roleMatch[1];
        break;
      }
    }
  }

  if (lastDelegatedRole) {
    const { isRedirect, mentionedRole } = detectSelfRedirect(message);
    if (isRedirect && mentionedRole) {
      await recordSelfCorrection(userId, lastDelegatedRole, mentionedRole, message.slice(0, 200));
    }
  }

  // 5. Streaming conversation loop
  let delegationsExecuted = 0;
  let consultationsExecuted = 0;
  let totalCostCents = 0;
  let fullResponse = "";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    // Stream the LLM response
    let turnText = "";
    let turnToolUses: LlmToolUseBlock[] = [];
    let turnContent: LlmContentBlock[] = [];
    let turnCostCents = 0;

    for await (const event of createStreamingCompletion({
      system: context.systemPrompt,
      messages,
      tools: selfTools,
      maxTokens: 4096,
    })) {
      if (event.type === "text-delta") {
        turnText += event.text;
        yield { type: "text-delta", text: event.text };
      } else if (event.type === "content-complete") {
        turnContent = event.content;
        turnToolUses = extractToolUse(event.content);
        turnCostCents = event.costCents;
        totalCostCents += turnCostCents;
      }
    }

    if (turnToolUses.length === 0) {
      // Final response — no tool calls
      fullResponse += turnText;
      await recordSelfDecision({
        decisionType: "inline_response",
        details: { responseLength: turnText.length },
        costCents: turnCostCents,
      });
      break;
    }

    // Tool calls — execute delegations
    messages.push({ role: "assistant", content: turnContent });

    const toolResults: LlmToolResultBlock[] = [];

    for (const toolUse of turnToolUses) {
      const input = toolUse.input as Record<string, unknown>;

      if (toolUse.name === "consult_role") {
        consultationsExecuted++;
      } else {
        delegationsExecuted++;
      }

      yield {
        type: "tool-call-start",
        toolName: toolUse.name,
        toolCallId: toolUse.id,
      };
      yield {
        type: "status",
        message: toolUse.name === "consult_role"
          ? `Consulting ${input.role}...`
          : toolUse.name === "start_dev_role"
            ? `Delegating to ${input.role}...`
            : `Running ${toolUse.name}...`,
      };

      const result = await executeDelegation(toolUse.name, input);

      // Record decisions
      if (toolUse.name === "start_dev_role") {
        const role = input.role as string;
        if (lastDelegatedRole && role !== lastDelegatedRole) {
          const { isRedirect } = detectSelfRedirect(message);
          if (isRedirect) {
            await recordSelfCorrection(userId, lastDelegatedRole, role, (input.task as string).slice(0, 200));
          }
        }
        lastDelegatedRole = role;
        await recordSelfDecision({
          decisionType: "delegation",
          details: { role, task: (input.task as string).slice(0, 200) },
          costCents: 0,
        });
      } else if (toolUse.name === "consult_role") {
        await recordSelfDecision({
          decisionType: "consultation",
          details: { role: input.role, question: input.question, responseLength: result.output.length },
          costCents: result.costCents ?? 0,
        });
      }

      // Build content blocks from tool results (Brief 045)
      const blocks = await toolResultToContentBlocks(toolUse.name, input, result);

      yield {
        type: "tool-call-result",
        toolCallId: toolUse.id,
        result: result.output.slice(0, 500),
        blocks,
      };

      // Register action IDs for session-scoped validation (AC14)
      if (blocks.length > 0) {
        registerBlockActions(blocks, context.sessionId);
      }

      // Emit individual content blocks for streaming
      for (const block of blocks) {
        yield { type: "content-block", block };
      }

      // Credential request needs special frontend handling (AC11-12)
      if (result.success && result.output.startsWith("{")) {
        try {
          const parsed = JSON.parse(result.output) as Record<string, unknown>;

          if (parsed.credentialRequest && typeof parsed.credentialRequest === "object") {
            const cred = parsed.credentialRequest as Record<string, unknown>;
            yield {
              type: "credential-request",
              service: cred.service as string,
              processSlug: (cred.processSlug as string) ?? null,
              fieldLabel: (cred.fieldLabel as string) ?? "API Key",
              placeholder: (cred.placeholder as string) ?? "",
            };
          }

          // Backward compat: still emit structured-data for non-block consumers
          yield { type: "structured-data", data: parsed };
        } catch {
          // Not valid JSON — skip
        }
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.output,
      });
    }

    messages.push({ role: "user", content: toolResults });
    fullResponse += turnText + "\n";
  }

  // 6. Record assistant turn
  await appendSessionTurn(context.sessionId, {
    role: "assistant",
    content: fullResponse,
    timestamp: Date.now(),
    surface: "web",
  });

  yield {
    type: "finish",
    sessionId: context.sessionId,
    delegationsExecuted,
    consultationsExecuted,
    costCents: totalCostCents,
  };
}

// ============================================================
// Tool result → ContentBlock mapping (Brief 045, AC12)
// ============================================================

import type {
  StatusCardBlock,
  ReviewCardBlock,
  AlertBlock,
  DataBlock,
  GatheringIndicatorBlock,
  ProcessProposalBlock,
  KnowledgeSynthesisBlock,
} from "./content-blocks";
import { getUserModel } from "./user-model";
import type { DelegationResult } from "./self-delegation";

/**
 * Convert a tool result into typed content blocks for surface rendering.
 * Each tool declares its output block type.
 */
async function toolResultToContentBlocks(
  toolName: string,
  input: Record<string, unknown>,
  result: DelegationResult,
): Promise<ContentBlock[]> {
  if (!result.success) return [];

  switch (toolName) {
    case "get_process_detail": {
      // Try to parse structured output
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        const block: StatusCardBlock = {
          type: "status_card",
          entityType: "process_run",
          entityId: (input.processSlug as string) ?? "",
          title: (parsed.name as string) ?? "Process",
          status: (parsed.status as string) ?? "active",
          details: {},
        };
        // Extract key-value details
        if (parsed.trust && typeof parsed.trust === "object") {
          const trust = parsed.trust as Record<string, unknown>;
          if (trust.tier) block.details["Trust tier"] = String(trust.tier);
          if (typeof trust.approvalRate === "number")
            block.details["Approval rate"] = `${Math.round(trust.approvalRate * 100)}%`;
          if (trust.trend) block.details["Trend"] = String(trust.trend);
        }
        if (parsed.stepsCount) block.details["Steps"] = String(parsed.stepsCount);
        return [block];
      } catch {
        return [];
      }
    }

    case "approve_review":
    case "edit_review":
    case "reject_review": {
      const block: StatusCardBlock = {
        type: "status_card",
        entityType: "process_run",
        entityId: (input.runId as string) ?? "",
        title: "Review Action",
        status: toolName === "approve_review"
          ? "approved"
          : toolName === "edit_review"
            ? "edited"
            : "rejected",
        details: {
          Action: toolName.replace("_review", ""),
          Result: result.output.slice(0, 100),
        },
      };
      return [block];
    }

    case "create_work_item":
    case "quick_capture": {
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        const block: StatusCardBlock = {
          type: "status_card",
          entityType: "work_item",
          entityId: (parsed.id as string) ?? "",
          title: (parsed.content as string)?.slice(0, 60) ?? "Work Item",
          status: (parsed.classification as string) ?? "created",
          details: {},
        };
        if (parsed.classification) block.details["Type"] = String(parsed.classification);
        return [block];
      } catch {
        return [];
      }
    }

    case "get_briefing": {
      // Briefing is narrative text for the Self to weave.
      // Also emit a knowledge synthesis card if the user model has entries
      // — this gives the user visual confirmation of what Ditto knows.
      const blocks: ContentBlock[] = [];
      try {
        const userId = (input.userId as string) ?? "default";
        const model = await getUserModel(userId);
        if (model.entries.length >= 2) {
          const ksBlock: KnowledgeSynthesisBlock = {
            type: "knowledge_synthesis",
            entries: model.entries.map((e) => ({
              dimension: e.dimension,
              content: e.content,
              confidence: e.confidence,
            })),
            totalDimensions: 9,
          };
          blocks.push(ksBlock);
        }
      } catch {
        // Non-critical — skip knowledge synthesis card
      }
      return blocks;
    }

    case "update_user_model": {
      // During onboarding, show a subtle gathering indicator
      if (result.success) {
        const block: GatheringIndicatorBlock = {
          type: "gathering_indicator",
          message: "Getting to know your business...",
        };
        return [block];
      }
      return [];
    }

    case "generate_process": {
      // When previewing a process (save=false), emit a process proposal card
      if (result.success && input.save === false) {
        try {
          const parsed = JSON.parse(result.output) as Record<string, unknown>;
          const steps = (parsed.steps as Array<Record<string, unknown>>) ?? [];
          const block: ProcessProposalBlock = {
            type: "process_proposal",
            name: (input.name as string) ?? "New Process",
            description: (input.description as string) ?? undefined,
            steps: steps.map((s) => ({
              name: (s.name as string) ?? (s.id as string) ?? "Step",
              description: s.description as string | undefined,
              status: "pending" as const,
            })),
          };
          return [block];
        } catch {
          return [];
        }
      }
      return [];
    }

    case "detect_risks": {
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        const signals = parsed.signals as Array<Record<string, unknown>> | undefined;
        if (signals && signals.length > 0) {
          const block: DataBlock = {
            type: "data",
            format: "table",
            title: "Operational Signals",
            headers: ["Type", "Description", "Severity"],
            data: signals.map((s) => ({
              Type: String(s.type ?? ""),
              Description: String(s.description ?? ""),
              Severity: String(s.severity ?? ""),
            })),
          };
          return [block];
        }
      } catch {
        // Not parseable
      }
      return [];
    }

    default:
      return [];
  }
}
