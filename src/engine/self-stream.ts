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
import type { ContentBlock, ConfidenceAssessment } from "./content-blocks";
import { registerBlockActions } from "./surface-actions";

// ============================================================
// Stream event types (for consumers)
// ============================================================

export type SelfStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "tool-call-start"; toolName: string; toolCallId: string }
  | { type: "tool-call-result"; toolCallId: string; result: string; blocks?: ContentBlock[]; metadata?: Record<string, unknown> }
  | { type: "structured-data"; data: Record<string, unknown> }
  | { type: "content-block"; block: ContentBlock }
  | { type: "credential-request"; service: string; processSlug: string | null; fieldLabel: string; placeholder: string }
  | { type: "confidence"; assessment: ConfidenceAssessment }
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

  // Brief 068: Track tool activity for confidence assessment
  let toolsWereCalled = false;
  let confidenceEmitted = false;
  let toolErrors = 0;
  let totalToolCalls = 0;
  let knowledgeSearchReturnedZero = false;
  let toolTimedOut = false;
  const toolCategories = new Set<string>();

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
      } else if (event.type === "thinking-delta") {
        yield { type: "thinking-delta", text: event.text };
      } else if (event.type === "tool-use-start") {
        // CLI internal tool calls — surface for activity visibility
        yield { type: "tool-call-start", toolName: event.toolName, toolCallId: event.toolCallId };
      } else if (event.type === "tool-use-end") {
        yield { type: "tool-call-result", toolCallId: event.toolCallId, result: event.summary ?? "" };
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

      const result = await executeDelegation(toolUse.name, input);

      // Brief 068: Track tool activity for heuristic floor
      if (toolUse.name !== "assess_confidence") {
        toolsWereCalled = true;
        totalToolCalls++;
        if (!result.success) toolErrors++;
        if (result.output.includes("timed out")) toolTimedOut = true;
        if (toolUse.name === "search_knowledge" && result.success) {
          // Check for zero results
          try {
            const parsed = JSON.parse(result.output);
            if (Array.isArray(parsed) && parsed.length === 0) knowledgeSearchReturnedZero = true;
            if (typeof parsed === "object" && parsed !== null && "results" in parsed) {
              const r = parsed as { results: unknown[] };
              if (Array.isArray(r.results) && r.results.length === 0) knowledgeSearchReturnedZero = true;
            }
          } catch {
            // Not JSON — check for empty indicators in text
            if (result.output.includes("No results") || result.output.includes("no matching")) {
              knowledgeSearchReturnedZero = true;
            }
          }
        }
        // Track categories for fallback synthesis
        const toolCatMap: Record<string, string> = {
          search_knowledge: "knowledge", get_briefing: "briefings", get_process_detail: "processes",
          list_processes: "processes", generate_process: "processes", detect_risks: "signals",
          suggest_next: "suggestions", create_work_item: "work", quick_capture: "captures",
        };
        toolCategories.add(toolCatMap[toolUse.name] ?? "activity");
      }

      // Brief 068: Handle assess_confidence result — emit confidence event with heuristic floor
      if (toolUse.name === "assess_confidence" && result.success && result.metadata?.confidenceAssessment) {
        const assessment = result.metadata.confidenceAssessment as ConfidenceAssessment;

        // Apply heuristic floor overrides (Brief 068 AC16)
        if (totalToolCalls > 0 && toolErrors === totalToolCalls) {
          assessment.level = "low";
          assessment.uncertainties.push({
            label: "Multiple tool calls failed",
            detail: "Response may not be reliable — tool results were unavailable",
            severity: "major",
          });
        }
        if (knowledgeSearchReturnedZero) {
          const alreadyFlagged = assessment.uncertainties.some(
            (u) => u.label.toLowerCase().includes("no matching knowledge") || u.label.toLowerCase().includes("knowledge"),
          );
          if (!alreadyFlagged) {
            assessment.uncertainties.push({
              label: "No matching knowledge found",
              detail: "Response based on general knowledge only",
              severity: "minor",
            });
          }
        }
        if (toolTimedOut) {
          assessment.uncertainties.push({
            label: "Tool call timed out",
            detail: "Results may be incomplete",
            severity: "minor",
          });
        }
        // Downgrade level if heuristics added major uncertainties
        if (assessment.level === "high" && assessment.uncertainties.some((u) => u.severity === "major")) {
          assessment.level = "medium";
        }

        yield { type: "confidence", assessment };
        confidenceEmitted = true;
      }

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

  // 5b. Brief 068: Synthesize default confidence if tools were called but assess_confidence was not
  if (toolsWereCalled && !confidenceEmitted) {
    const categories = [...toolCategories];
    const summary = categories.length > 0
      ? `Checked ${categories.join(", ")}`
      : `Completed ${totalToolCalls} action${totalToolCalls !== 1 ? "s" : ""}`;
    const uncertainties: ConfidenceAssessment["uncertainties"] = [{
      label: "Confidence not explicitly assessed",
      detail: "Self did not evaluate confidence for this response",
      severity: "minor",
    }];
    if (toolErrors === totalToolCalls && totalToolCalls > 0) {
      uncertainties.unshift({
        label: "Multiple tool calls failed",
        detail: "Response may not be reliable — tool results were unavailable",
        severity: "major",
      });
    }
    if (knowledgeSearchReturnedZero) {
      uncertainties.push({
        label: "No matching knowledge found",
        detail: "Response based on general knowledge only",
        severity: "minor",
      });
    }
    const level: ConfidenceAssessment["level"] =
      (toolErrors === totalToolCalls && totalToolCalls > 0) ? "low" : "medium";

    yield {
      type: "confidence",
      assessment: { level, summary, checks: [], uncertainties },
    };
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
  RecordBlock,
  MetricBlock,
  SuggestionBlock,
  KnowledgeCitationBlock,
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
export async function toolResultToContentBlocks(
  toolName: string,
  input: Record<string, unknown>,
  result: DelegationResult,
): Promise<ContentBlock[]> {
  if (!result.success) return [];

  switch (toolName) {
    case "get_process_detail": {
      // Brief 069 AC1: Record (process fields + trust evidence) + Metric (trust score)
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        const blocks: ContentBlock[] = [];

        // RecordBlock: process entity with fields
        const fields: RecordBlock["fields"] = [];
        if (parsed.status) fields.push({ label: "Status", value: String(parsed.status) });
        if (parsed.trustTier) fields.push({ label: "Trust tier", value: String(parsed.trustTier) });

        const trust = parsed.trust as Record<string, unknown> | undefined;
        if (trust) {
          if (typeof trust.approvalRate === "number")
            fields.push({ label: "Approval rate", value: `${Math.round(trust.approvalRate * 100)}%` });
          if (typeof trust.consecutiveClean === "number")
            fields.push({ label: "Consecutive clean", value: String(trust.consecutiveClean) });
          if (trust.summary) fields.push({ label: "Trust summary", value: String(trust.summary) });
        }

        const steps = parsed.steps as Array<unknown> | undefined;
        if (steps) fields.push({ label: "Steps", value: String(steps.length) });

        const recentRuns = parsed.recentRuns as Array<unknown> | undefined;
        if (recentRuns) fields.push({ label: "Recent runs", value: String(recentRuns.length) });

        const trustTier = parsed.trustTier as string | undefined;
        const statusVariant = trustTier === "autonomous" ? "positive" as const
          : trustTier === "critical" ? "negative" as const
          : trustTier === "spot_checked" ? "info" as const
          : "neutral" as const;

        const record: RecordBlock = {
          type: "record",
          title: (parsed.name as string) ?? "Process",
          subtitle: (parsed.slug as string) ?? undefined,
          status: trustTier ? { label: String(trustTier).replace(/_/g, " "), variant: statusVariant } : undefined,
          fields,
        };
        blocks.push(record);

        // MetricBlock: trust score with trend
        if (trust && typeof trust.approvalRate === "number") {
          const metrics: MetricBlock["metrics"] = [{
            value: `${Math.round(trust.approvalRate * 100)}%`,
            label: "Trust score",
            trend: trust.trend === "up" ? "up" : trust.trend === "down" ? "down" : "flat",
          }];
          if (typeof trust.runsInWindow === "number") {
            metrics.push({ value: String(trust.runsInWindow), label: "Runs observed" });
          }
          blocks.push({ type: "metric", metrics } as MetricBlock);
        }

        return blocks;
      } catch {
        return [];
      }
    }

    case "approve_review":
    case "edit_review":
    case "reject_review": {
      // Brief 069 AC8: StatusCard + conditional Alert for correction patterns
      const blocks: ContentBlock[] = [];
      const statusCard: StatusCardBlock = {
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
        },
      };
      blocks.push(statusCard);

      // Conditional Alert: only when output contains correction pattern or substantive rationale
      const patternMatch = result.output.match(/Pattern detected: "([^"]+)" — (\d+) times/);
      if (patternMatch) {
        const alert: AlertBlock = {
          type: "alert",
          severity: "info",
          title: "Correction pattern detected",
          content: `"${patternMatch[1]}" has occurred ${patternMatch[2]} times. This may indicate the process needs adjustment.`,
        };
        blocks.push(alert);
      }

      return blocks;
    }

    case "create_work_item": {
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

    case "quick_capture": {
      // Brief 069 AC9: StatusCard + KnowledgeCitation if classified
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        const blocks: ContentBlock[] = [];

        const statusCard: StatusCardBlock = {
          type: "status_card",
          entityType: "work_item",
          entityId: (parsed.id as string) ?? "",
          title: (parsed.message as string) ?? "Captured",
          status: "captured",
          details: {},
        };
        if (parsed.type) statusCard.details["Classified as"] = String(parsed.type);
        blocks.push(statusCard);

        // KnowledgeCitation if the capture was classified with a known type
        if (parsed.type && parsed.type !== "note") {
          const citation: KnowledgeCitationBlock = {
            type: "knowledge_citation",
            label: "Classification",
            sources: [{ name: `Classified as ${parsed.type}`, type: "intake-classifier" }],
          };
          blocks.push(citation);
        }

        return blocks;
      } catch {
        return [];
      }
    }

    case "get_briefing": {
      // Brief 069 AC3: KnowledgeSynthesis (existing) + Checklist (focus items) + Metric (stats)
      // Use structured metadata when available, fall back to text parsing
      const blocks: ContentBlock[] = [];
      const meta = result.metadata as {
        stats?: { completedSinceLastVisit: number; activeRuns: number; pendingReviews: number; pendingHumanInput: number; totalExceptions: number };
        focus?: Array<{ priority: string; label: string; reason: string }>;
      } | undefined;

      // MetricBlock from stats
      if (meta?.stats) {
        const s = meta.stats;
        const metrics: MetricBlock["metrics"] = [];
        if (s.pendingReviews > 0) metrics.push({ value: String(s.pendingReviews), label: "Reviews pending" });
        if (s.pendingHumanInput > 0) metrics.push({ value: String(s.pendingHumanInput), label: "Waiting for input" });
        if (s.totalExceptions > 0) metrics.push({ value: String(s.totalExceptions), label: "Exceptions" });
        if (s.completedSinceLastVisit > 0) metrics.push({ value: String(s.completedSinceLastVisit), label: "Completed" });
        if (metrics.length > 0) {
          blocks.push({ type: "metric", metrics } as MetricBlock);
        }
      } else {
        // Fallback: parse stats from text
        const statsMatch = result.output.match(
          /Since your last visit: (\d+) completed, (\d+) running, (\d+) reviews pending, (\d+) waiting for your input, (\d+) exceptions/,
        );
        if (statsMatch) {
          const metrics: MetricBlock["metrics"] = [];
          const pending = parseInt(statsMatch[3], 10);
          const waiting = parseInt(statsMatch[4], 10);
          const exceptions = parseInt(statsMatch[5], 10);
          if (pending > 0) metrics.push({ value: String(pending), label: "Reviews pending" });
          if (waiting > 0) metrics.push({ value: String(waiting), label: "Waiting for input" });
          if (exceptions > 0) metrics.push({ value: String(exceptions), label: "Exceptions" });
          const completed = parseInt(statsMatch[1], 10);
          if (completed > 0) metrics.push({ value: String(completed), label: "Completed" });
          if (metrics.length > 0) {
            blocks.push({ type: "metric", metrics } as MetricBlock);
          }
        }
      }

      // ChecklistBlock from focus items
      if (meta?.focus && meta.focus.length > 0) {
        const items: ChecklistBlock["items"] = meta.focus.map((f) => ({
          label: `${f.label}: ${f.reason}`,
          status: f.priority === "critical" ? "warning" as const : "pending" as const,
        }));
        blocks.push({ type: "checklist", title: "Focus", items } as ChecklistBlock);
      } else {
        // Fallback: parse FOCUS items from text
        const focusLines = result.output.match(/^\s+\[(critical|high|normal)\]\s+(.+)$/gm);
        if (focusLines && focusLines.length > 0) {
          const items: ChecklistBlock["items"] = focusLines.map((line) => {
            const match = line.match(/\[(critical|high|normal)\]\s+(.+)/);
            if (!match) return { label: line.trim(), status: "pending" as const };
            return {
              label: match[2].trim(),
              status: match[1] === "critical" ? "warning" as const : "pending" as const,
            };
          });
          blocks.push({ type: "checklist", title: "Focus", items } as ChecklistBlock);
        }
      }

      // Existing: KnowledgeSynthesis from user model
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
      // Brief 069 AC2: Alert per risk (max 3) + Suggestion if >3 risks
      // Use structured metadata when available, fall back to text parsing
      const blocks: ContentBlock[] = [];
      const meta = result.metadata as { risks?: Array<{ severity: string; type: string; entityLabel: string; detail: string }> } | undefined;
      const risks = meta?.risks;

      if (risks && risks.length > 0) {
        const capped = risks.slice(0, 3);
        for (const risk of capped) {
          const alert: AlertBlock = {
            type: "alert",
            severity: risk.severity === "error" ? "error" : "warning",
            title: risk.entityLabel,
            content: risk.detail,
          };
          blocks.push(alert);
        }
        if (risks.length > 3) {
          const suggestion: SuggestionBlock = {
            type: "suggestion",
            content: `${risks.length - 3} additional signal(s) detected. Consider reviewing all operational signals.`,
            reasoning: `Showing top 3 of ${risks.length} signals to avoid visual noise.`,
          };
          blocks.push(suggestion);
        }
      } else {
        // Fallback: parse text output
        const riskLines = result.output.match(/^\[(\w+)\]\s+(\w[\w_-]*?):\s+(.+?)\s+—\s+(.+)$/gm);
        if (riskLines && riskLines.length > 0) {
          const capped = riskLines.slice(0, 3);
          for (const line of capped) {
            const match = line.match(/^\[(\w+)\]\s+(\w[\w_-]*?):\s+(.+?)\s+—\s+(.+)$/);
            if (match) {
              const alert: AlertBlock = {
                type: "alert",
                severity: match[1].toLowerCase() === "error" ? "error" : "warning",
                title: match[3],
                content: match[4],
              };
              blocks.push(alert);
            }
          }
          if (riskLines.length > 3) {
            const suggestion: SuggestionBlock = {
              type: "suggestion",
              content: `${riskLines.length - 3} additional signal(s) detected. Consider reviewing all operational signals.`,
              reasoning: `Showing top 3 of ${riskLines.length} signals to avoid visual noise.`,
            };
            blocks.push(suggestion);
          }
        }
      }
      return blocks;
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

    case "suggest_next": {
      // Brief 069 AC4: SuggestionBlock per suggestion
      // Use structured metadata when available, fall back to text parsing
      const blocks: ContentBlock[] = [];
      const meta = result.metadata as { suggestions?: Array<{ type: string; content: string }> } | undefined;
      const ts = Date.now();

      if (meta?.suggestions && meta.suggestions.length > 0) {
        for (let i = 0; i < meta.suggestions.length; i++) {
          const s = meta.suggestions[i];
          const suggestion: SuggestionBlock = {
            type: "suggestion",
            content: s.content,
            reasoning: s.type,
            actions: [
              { id: `suggest-accept-${i}-${ts}`, label: "Accept", style: "primary" },
              { id: `suggest-dismiss-${i}-${ts}`, label: "Dismiss", style: "secondary" },
            ],
          };
          blocks.push(suggestion);
        }
      } else {
        // Fallback: parse text output
        const suggestionLines = result.output.match(/^(\w[\w ]*?):\s+(.+)$/gm);
        if (suggestionLines) {
          const content = suggestionLines.filter((l) => !l.startsWith("Suggestions ("));
          const capped = content.slice(0, 2);
          for (let i = 0; i < capped.length; i++) {
            const match = capped[i].match(/^(\w[\w ]*?):\s+(.+)$/);
            if (match) {
              const suggestion: SuggestionBlock = {
                type: "suggestion",
                content: match[2].trim(),
                reasoning: match[1].trim(),
                actions: [
                  { id: `suggest-accept-${i}-${ts}`, label: "Accept", style: "primary" },
                  { id: `suggest-dismiss-${i}-${ts}`, label: "Dismiss", style: "secondary" },
                ],
              };
              blocks.push(suggestion);
            }
          }
        }
      }
      return blocks;
    }

    case "adjust_trust": {
      // Brief 069 AC5: Record + Checklist + StatusCard
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        const blocks: ContentBlock[] = [];

        if (parsed.action === "proposal") {
          // Record: before/after trust tier with evidence fields
          const fields: RecordBlock["fields"] = [];
          if (parsed.currentTier) fields.push({ label: "Current tier", value: String(parsed.currentTier).replace(/_/g, " ") });
          if (parsed.proposedTier) fields.push({ label: "Proposed tier", value: String(parsed.proposedTier).replace(/_/g, " ") });
          if (parsed.reason) fields.push({ label: "Reason", value: String(parsed.reason) });

          const trust = parsed.trust as Record<string, unknown> | undefined;
          if (trust) {
            if (typeof trust.approvalRate === "number")
              fields.push({ label: "Approval rate", value: `${Math.round(trust.approvalRate * 100)}%` });
            if (typeof trust.runsInWindow === "number")
              fields.push({ label: "Runs observed", value: String(trust.runsInWindow) });
            if (trust.trend) fields.push({ label: "Trend", value: String(trust.trend) });
          }

          const record: RecordBlock = {
            type: "record",
            title: (parsed.processName as string) ?? "Trust Adjustment",
            subtitle: "Trust tier change proposal",
            status: { label: "Pending confirmation", variant: "caution" },
            fields,
          };
          blocks.push(record);

          // Checklist: safety net criteria
          const checklist: ChecklistBlock = {
            type: "checklist",
            title: "Safety Net",
            items: [
              { label: "Auto-pause on low confidence", status: "done" },
              { label: "Revert on rejection", status: "done" },
              { label: "Weekly digest of autonomous decisions", status: "done" },
              { label: "Adjustable anytime from process detail", status: "done" },
            ],
          };
          blocks.push(checklist);
        }

        // StatusCard: confirms the action (both proposal and applied)
        const statusCard: StatusCardBlock = {
          type: "status_card",
          entityType: "process_run",
          entityId: (input.processSlug as string) ?? "",
          title: (parsed.processName as string) ?? "Trust Adjustment",
          status: parsed.action === "applied" ? "applied" : "proposed",
          details: {},
        };
        if (parsed.fromTier) statusCard.details["From"] = String(parsed.fromTier).replace(/_/g, " ");
        if (parsed.toTier) statusCard.details["To"] = String(parsed.toTier).replace(/_/g, " ");
        if (parsed.currentTier) statusCard.details["Current"] = String(parsed.currentTier).replace(/_/g, " ");
        if (parsed.proposedTier) statusCard.details["Proposed"] = String(parsed.proposedTier).replace(/_/g, " ");
        blocks.push(statusCard);

        return blocks;
      } catch {
        return [];
      }
    }

    case "adapt_process": {
      // Brief 069 AC6: ProcessProposalBlock showing adapted steps
      // Output is text, but input.adaptedDefinition has the steps
      const blocks: ContentBlock[] = [];
      const adaptedDef = input.adaptedDefinition as Record<string, unknown> | undefined;
      if (adaptedDef && Array.isArray(adaptedDef.steps)) {
        const steps = adaptedDef.steps as Array<Record<string, unknown>>;
        const block: ProcessProposalBlock = {
          type: "process_proposal",
          name: "Adapted Process",
          description: (input.reasoning as string) ?? undefined,
          steps: steps.map((s) => ({
            name: (s.name as string) ?? (s.id as string) ?? "Step",
            description: s.description as string | undefined,
            status: "pending" as const,
          })),
        };
        blocks.push(block);
      }
      return blocks;
    }

    case "connect_service": {
      // Brief 069 AC7: StatusCard showing connection status
      try {
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        const action = parsed.action as string;
        const block: StatusCardBlock = {
          type: "status_card",
          entityType: "work_item",
          entityId: (parsed.service as string) ?? (input.service as string) ?? "",
          title: action === "available_services"
            ? "Available Services"
            : (parsed.service as string) ?? "Service",
          status: action === "verification"
            ? (parsed.connected ? "connected" : "not connected")
            : action === "setup_guide"
              ? (parsed.isConnected ? "connected" : "setup required")
              : "available",
          details: {},
        };
        if (parsed.message) block.details["Info"] = String(parsed.message);
        if (parsed.authType) block.details["Auth"] = String(parsed.authType);
        return [block];
      } catch {
        return [];
      }
    }

    case "consult_role":
      // Brief 069 AC10: Consultant perspective is narrative only — no blocks
      return [];

    case "assess_confidence":
      // Brief 069 AC11: Stays as metadata per Insight-129, no blocks
      return [];

    default:
      return [];
  }
}
