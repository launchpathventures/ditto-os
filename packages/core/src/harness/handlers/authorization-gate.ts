/**
 * @ditto/core — Authorization Gate Handler
 *
 * Wraps one side-effecting tool call with an explicit per-action user choice.
 * The handler emits the pending authorization block, executes only after the
 * accepted affordance event, and records terminal non-send outcomes through an
 * injected product-layer memory bridge.
 */

import { MissingStepRunIdError } from "../../errors.js";
import type { AuthorizationRequestBlock, AuthorizationRequestState, AuthorizationResult } from "../../content-blocks.js";
import type { AuthorizationGateRequest, HarnessContext, HarnessHandler } from "../harness.js";

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

function assertStepRunId(stepRunId: string | null | undefined): asserts stepRunId is string {
  if (!stepRunId) {
    throw new MissingStepRunIdError(
      "authorization-gate requires stepRunId before side-effect execution",
    );
  }
}

export function buildAuthorizationRequestBlock(
  request: AuthorizationGateRequest,
  state: AuthorizationRequestState,
  executionResult: AuthorizationResult | null = null,
): AuthorizationRequestBlock {
  const expiresAt = state === "pending"
    ? request.expiresAt ?? addMs(new Date(), request.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS).toISOString()
    : null;

  return {
    type: "authorization-request",
    state,
    header: request.header,
    preview: request.preview,
    recipientLabel: request.recipientLabel,
    actionClass: request.actionClass,
    executionResult,
    expiresAt,
    authorizationId: request.authorizationId,
    toolName: request.toolCall.toolName,
    toolInput: request.toolCall.input,
  };
}

function blockResult(block: AuthorizationRequestBlock, transitions: AuthorizationRequestState[]) {
  return {
    outputs: {
      authorization: {
        state: block.state,
        transitions,
        block,
      },
      contentBlocks: [block],
    },
    confidence: "high" as const,
  };
}

async function recordTerminalOutcome(
  context: HarnessContext,
  request: AuthorizationGateRequest,
  state: "rejected" | "edit-requested" | "expired",
): Promise<void> {
  if (!context.recordAuthorizationOutcome) return;

  const createdAt = request.createdAt ? Date.parse(request.createdAt) : NaN;
  const idleMsBeforeExpire = state === "expired" && Number.isFinite(createdAt)
    ? Math.max(0, Date.now() - createdAt)
    : undefined;

  await context.recordAuthorizationOutcome({
    processRunId: context.processRun.id,
    stepRunId: context.stepRunId,
    state,
    actionClass: request.actionClass,
    recipientLabel: request.recipientLabel,
    idleMsBeforeExpire,
    payload: {
      state,
      actionClass: request.actionClass,
      recipientLabel: request.recipientLabel,
      ...(idleMsBeforeExpire != null ? { idleMsBeforeExpire } : {}),
    },
  });
}

function failedResult(error: unknown): AuthorizationResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "failed",
    reasonForVisitor: "I couldn't send it from Gmail just now. Try again in a minute.",
    reasonForLog: message,
  };
}

export const authorizationGateHandler: HarnessHandler = {
  name: "authorization-gate",

  canHandle(context: HarnessContext): boolean {
    return context.authorizationRequest !== null;
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    const request = context.authorizationRequest;
    if (!request) return context;

    assertStepRunId(context.stepRunId);

    switch (request.event) {
      case "pending": {
        const block = buildAuthorizationRequestBlock(request, "pending");
        context.stepResult = blockResult(block, ["pending"]);
        context.shortCircuit = true;
        return context;
      }

      case "not-yet": {
        await recordTerminalOutcome(context, request, "rejected");
        const block = buildAuthorizationRequestBlock(request, "rejected");
        context.stepResult = blockResult(block, ["pending", "rejected"]);
        context.shortCircuit = true;
        return context;
      }

      case "edit-first": {
        await recordTerminalOutcome(context, request, "edit-requested");
        const block = buildAuthorizationRequestBlock(request, "edit-requested");
        context.stepResult = blockResult(block, ["pending", "edit-requested"]);
        context.shortCircuit = true;
        return context;
      }

      case "expired": {
        await recordTerminalOutcome(context, request, "expired");
        const block = buildAuthorizationRequestBlock(request, "expired");
        context.stepResult = blockResult(block, ["pending", "expired"]);
        context.shortCircuit = true;
        return context;
      }

      case "send-it":
      case "retry": {
        try {
          const result = await request.toolCall.execute(request.toolCall.input, context.stepRunId);
          const finalState: AuthorizationRequestState =
            result.status === "sent" ? "succeeded" :
            result.status === "partial" ? "partial" :
            "failed";
          const block = buildAuthorizationRequestBlock(request, finalState, result);
          context.stepResult = blockResult(block, ["pending", "executing", finalState]);
          context.reviewDetails = {
            ...context.reviewDetails,
            authorizationGate: {
              toolName: request.toolCall.toolName,
              transitions: ["pending", "executing", finalState],
            },
          };
        } catch (error) {
          const result = failedResult(error);
          const block = buildAuthorizationRequestBlock(request, "failed", result);
          context.stepResult = blockResult(block, ["pending", "executing", "failed"]);
          context.reviewDetails = {
            ...context.reviewDetails,
            authorizationGate: {
              toolName: request.toolCall.toolName,
              transitions: ["pending", "executing", "failed"],
              reasonForLog: result.reasonForLog,
            },
          };
        }
        context.shortCircuit = true;
        return context;
      }

      case "explain":
      case "retry-item": {
        const block = buildAuthorizationRequestBlock(request, "pending");
        context.stepResult = blockResult(block, ["pending"]);
        context.shortCircuit = true;
        return context;
      }
    }
  },
};
