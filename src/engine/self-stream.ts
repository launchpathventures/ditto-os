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
  | { type: "tool-call-result"; toolCallId: string; result: string; blocks?: ContentBlock[]; metadata?: Record<string, unknown> }
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
            : toolUse.name === "plan_with_role"
              ? `Planning with ${input.role}...`
              : toolUse.name === "start_pipeline"
                ? `Starting pipeline: ${(input.processSlug as string) ?? "dev-pipeline"}...`
                : `Running ${toolUse.name}...`,
      };

      const result = await executeDelegation(toolUse.name, input);

      // Record decisions
      if (toolUse.name === "start_pipeline") {
        await recordSelfDecision({
          decisionType: "pipeline",
          details: {
            processSlug: (input.processSlug as string) ?? "dev-pipeline",
            task: (input.task as string).slice(0, 200),
          },
          costCents: 0,
        });
      } else if (toolUse.name === "start_dev_role") {
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
        metadata: result.metadata,
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
  CodeBlock,
  ChecklistBlock,
  DataBlock,
  GatheringIndicatorBlock,
  ProcessProposalBlock,
  KnowledgeSynthesisBlock,
  ArtifactBlock,
  TextBlock,
  ProgressBlock,
} from "./content-blocks";
import { getUserModel } from "./user-model";
import type { DelegationResult } from "./self-delegation";

/**
 * Parse command output sections from a dev role result into typed ContentBlocks.
 * Looks for `$ <command>` markers in the output (produced by run_command).
 * Emits CodeBlock for stdout/stderr, ChecklistBlock for test summaries,
 * AlertBlock for failures/timeouts. (Brief 051)
 */
function parseCommandOutputBlocks(output: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Match command output sections: starts with "$ executable args"
  const cmdPattern = /^\$ (.+)$/gm;
  let match: RegExpExecArray | null;
  const cmdStarts: { command: string; index: number }[] = [];

  while ((match = cmdPattern.exec(output)) !== null) {
    cmdStarts.push({ command: match[1], index: match.index });
  }

  for (let i = 0; i < cmdStarts.length; i++) {
    const start = cmdStarts[i];
    const endIndex = i + 1 < cmdStarts.length ? cmdStarts[i + 1].index : output.length;
    const section = output.slice(start.index, endIndex).trim();

    // Extract exit code
    const exitMatch = section.match(/Exit code: (\d+)/);
    const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null;

    // Check for timeout
    if (section.includes("timed out")) {
      const alertBlock: AlertBlock = {
        type: "alert",
        severity: "error",
        title: `Command Timed Out`,
        content: `\`${start.command}\` exceeded the timeout limit.`,
      };
      blocks.push(alertBlock);
      continue;
    }

    // Check for test results (vitest/jest patterns)
    const testSummaryMatch = section.match(/Tests\s+.*?(\d+)\s+passed/);
    const testFailMatch = section.match(/(\d+)\s+failed/);
    if (testSummaryMatch) {
      const passed = parseInt(testSummaryMatch[1], 10);
      const failed = testFailMatch ? parseInt(testFailMatch[1], 10) : 0;
      const items: ChecklistBlock["items"] = [];
      if (passed > 0) {
        items.push({ label: `${passed} tests passed`, status: "done" });
      }
      if (failed > 0) {
        items.push({ label: `${failed} tests failed`, status: "warning" });
      }
      const checkBlock: ChecklistBlock = {
        type: "checklist",
        title: start.command,
        items,
      };
      blocks.push(checkBlock);
      continue;
    }

    // Check for type-check results
    if (start.command.includes("type-check") || start.command.includes("tsc")) {
      const isPass = exitCode === 0;
      const alertBlock: AlertBlock = {
        type: "alert",
        severity: isPass ? "info" : "error",
        title: isPass ? "Type-check passed" : "Type-check failed",
        content: `\`${start.command}\` exited with code ${exitCode ?? "unknown"}.`,
      };
      blocks.push(alertBlock);
      continue;
    }

    // Generic command output → CodeBlock
    if (section.length > 50) {
      const codeBlock: CodeBlock = {
        type: "code",
        language: "shell",
        content: section,
        filename: start.command,
      };
      blocks.push(codeBlock);
    }
  }

  return blocks;
}

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

    case "plan_with_role": {
      const blocks: ContentBlock[] = [];
      const metadata = result.metadata ?? {};
      const proposedWrites = metadata.proposedWrites as Array<{ path: string; content: string }> | undefined;

      if (proposedWrites && proposedWrites.length > 0) {
        // AC10: Proposed files → ArtifactBlock with "Pending Approval"
        for (const pw of proposedWrites) {
          const block: ArtifactBlock = {
            type: "artifact",
            artifactId: `planning-${pw.path.replace(/[/\\]/g, "-")}-${Date.now()}`,
            title: pw.path,
            artifactType: "document",
            status: { label: "Pending Approval", variant: "caution" },
            summary: pw.content.slice(0, 200) + (pw.content.length > 200 ? "..." : ""),
            version: 1,
          };
          blocks.push(block);
        }
      }

      // Check for action items / checklist patterns in the output
      const output = result.output;
      const hasChecklist = /^[-*]\s+\[[ x]\]/m.test(output) || /^\d+\.\s+\[[ x]\]/m.test(output);
      if (hasChecklist) {
        const items: ChecklistBlock["items"] = [];
        const checklistLines = output.match(/^[-*\d.]+\s+\[([x ])\]\s*(.+)$/gm) ?? [];
        for (const line of checklistLines) {
          const match = line.match(/\[([x ])\]\s*(.+)$/);
          if (match) {
            items.push({
              label: match[2].trim(),
              status: match[1] === "x" ? "done" : "pending",
            });
          }
        }
        if (items.length > 0) {
          const checkBlock: ChecklistBlock = {
            type: "checklist",
            title: "Action Items",
            items,
          };
          blocks.push(checkBlock);
        }
      }

      // If no proposed writes and no checklist, emit as TextBlock for inline analysis
      if (blocks.length === 0 && output.length > 0) {
        const textBlock: TextBlock = {
          type: "text",
          text: output,
        };
        blocks.push(textBlock);
      }

      return blocks;
    }

    case "start_pipeline": {
      // Brief 053 AC5: Emit ProgressBlock for pipeline start
      try {
        const parsed = JSON.parse(result.output) as {
          runId: string;
          processSlug: string;
          status: string;
          steps: string[];
        };
        const blocks: ContentBlock[] = [];

        const progressBlock: ProgressBlock = {
          type: "progress",
          processRunId: parsed.runId,
          currentStep: parsed.steps[0] ?? "Starting",
          totalSteps: parsed.steps.length,
          completedSteps: 0,
          status: "running",
        };
        blocks.push(progressBlock);

        const textBlock: TextBlock = {
          type: "text",
          text: `Starting the dev pipeline (${parsed.steps.length} steps). I'll keep you updated as steps complete.`,
        };
        blocks.push(textBlock);

        return blocks;
      } catch {
        return [];
      }
    }

    case "start_dev_role": {
      const role = (input.role as string) ?? "unknown";
      const output = result.output;
      const runId = result.metadata?.runId as string | undefined;

      // Extract command output blocks from the result (Brief 051)
      const commandBlocks = parseCommandOutputBlocks(output);

      if (output.length > 500) {
        // Substantial output → ArtifactBlock reference card + command blocks
        const processSlug = result.metadata?.processSlug as string | undefined;
        const block: ArtifactBlock = {
          type: "artifact",
          artifactId: runId ?? `dev-${role}-${Date.now()}`,
          title: `${role.charAt(0).toUpperCase() + role.slice(1)} Output`,
          artifactType: "document",
          status: { label: "Ready for Review", variant: "caution" },
          summary: output.slice(0, 200) + (output.length > 200 ? "..." : ""),
          version: 1,
          actions: [{
            id: `open-artifact-${runId ?? role}`,
            label: "Open",
            style: "primary",
            payload: { processSlug: processSlug ?? `dev-${role}-standalone` },
          }],
        };
        return [block, ...commandBlocks];
      }

      // Short output → TextBlock rendered inline + command blocks
      const textBlock: TextBlock = {
        type: "text",
        text: output,
      };
      return [textBlock, ...commandBlocks];
    }

    default:
      return [];
  }
}
