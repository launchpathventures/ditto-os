import { describe, it, expect, vi } from "vitest";
import { createHarnessContext, type HarnessContext, type AuthorizationGateRequest } from "../harness.js";
import { MissingStepRunIdError } from "../../errors.js";
import { authorizationGateHandler } from "./authorization-gate.js";

function makeContext(overrides: Partial<HarnessContext> = {}): HarnessContext {
  const ctx = createHarnessContext({
    processRun: { id: "run-1", processId: "proc-1", inputs: {} },
    stepDefinition: { id: "step-1", name: "Send email", executor: "ai-agent" },
    processDefinition: {
      name: "Test",
      id: "proc-1",
      version: 1,
      status: "active",
      description: "Test",
      trigger: { type: "manual" },
      inputs: [],
      steps: [],
      outputs: [],
      quality_criteria: [],
      feedback: { metrics: [], capture: [] },
      trust: { initial_tier: "supervised", upgrade_path: [], downgrade_triggers: [] },
    },
    trustTier: "supervised",
    stepRunId: "step-run-1",
  });
  return { ...ctx, ...overrides };
}

function makeRequest(overrides: Partial<AuthorizationGateRequest> = {}): AuthorizationGateRequest {
  return {
    authorizationId: "auth-1",
    event: "pending",
    header: "Want me to send this to ops@example.com?",
    preview: [{ type: "text", text: "Subject: Pricing sweep\n\nThree SKUs need attention." }],
    recipientLabel: "ops@example.com",
    actionClass: "email-send",
    createdAt: new Date(Date.now() - 1_000).toISOString(),
    toolCall: {
      toolName: "gmail-authorized-send",
      input: {
        to: "ops@example.com",
        subject: "Pricing sweep",
        body: "Three SKUs need attention.",
      },
      execute: vi.fn(async () => ({
        status: "sent" as const,
        messageId: "msg-1",
        sentAt: "2026-05-05T00:00:00.000Z",
        recipients: ["ops@example.com"],
      })),
    },
    ...overrides,
  };
}

function outputBlock(ctx: HarnessContext) {
  const blocks = ctx.stepResult?.outputs.contentBlocks as unknown[];
  return blocks[0] as { type: string; state: string; executionResult?: unknown; expiresAt?: string | null };
}

describe("authorization-gate", () => {
  it("refuses to run without stepRunId before invoking the wrapped tool", async () => {
    const tool = vi.fn(async () => ({ status: "sent" as const }));
    const ctx = makeContext({
      stepRunId: "",
      authorizationRequest: makeRequest({
        event: "send-it",
        toolCall: {
          toolName: "gmail-authorized-send",
          input: {},
          execute: tool,
        },
      }),
    });

    await expect(authorizationGateHandler.execute(ctx)).rejects.toBeInstanceOf(MissingStepRunIdError);
    expect(tool).not.toHaveBeenCalled();
  });

  it("emits a pending authorization-request block without invoking the tool", async () => {
    const request = makeRequest();
    const ctx = makeContext({ authorizationRequest: request });

    await authorizationGateHandler.execute(ctx);

    expect(request.toolCall.execute).not.toHaveBeenCalled();
    expect(outputBlock(ctx)).toMatchObject({
      type: "authorization-request",
      state: "pending",
    });
    expect(outputBlock(ctx).expiresAt).toEqual(expect.any(String));
    expect(ctx.shortCircuit).toBe(true);
  });

  it("transitions pending -> executing -> succeeded on Send it", async () => {
    const ctx = makeContext({
      authorizationRequest: makeRequest({ event: "send-it" }),
    });

    await authorizationGateHandler.execute(ctx);

    expect(ctx.authorizationRequest?.toolCall.execute).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ops@example.com" }),
      "step-run-1",
    );
    expect(outputBlock(ctx)).toMatchObject({
      type: "authorization-request",
      state: "succeeded",
      executionResult: { status: "sent", messageId: "msg-1" },
    });
    expect(ctx.stepResult?.outputs.authorization).toMatchObject({
      transitions: ["pending", "executing", "succeeded"],
    });
  });

  it("transitions pending -> executing -> failed on tool error without leaking reasonForLog to the block text", async () => {
    const ctx = makeContext({
      authorizationRequest: makeRequest({
        event: "send-it",
        toolCall: {
          toolName: "gmail-authorized-send",
          input: {},
          execute: vi.fn(async () => {
            throw new Error("raw oauth stack trace");
          }),
        },
      }),
    });

    await authorizationGateHandler.execute(ctx);

    expect(outputBlock(ctx)).toMatchObject({
      state: "failed",
      executionResult: {
        status: "failed",
        reasonForVisitor: expect.stringContaining("couldn't send"),
      },
    });
    expect(JSON.stringify(outputBlock(ctx))).toContain("raw oauth stack trace");
    expect(ctx.reviewDetails.authorizationGate).toMatchObject({
      transitions: ["pending", "executing", "failed"],
      reasonForLog: "raw oauth stack trace",
    });
  });

  it.each([
    ["not-yet", "rejected"],
    ["edit-first", "edit-requested"],
    ["expired", "expired"],
  ] as const)("transitions %s to %s and records feedback memory shape", async (event, state) => {
    const recordAuthorizationOutcome = vi.fn(async () => undefined);
    const ctx = makeContext({
      recordAuthorizationOutcome,
      authorizationRequest: makeRequest({ event }),
    });

    await authorizationGateHandler.execute(ctx);

    expect(ctx.authorizationRequest?.toolCall.execute).not.toHaveBeenCalled();
    expect(outputBlock(ctx)).toMatchObject({ state });
    expect(recordAuthorizationOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        processRunId: "run-1",
        stepRunId: "step-run-1",
        state,
        actionClass: "email-send",
        recipientLabel: "ops@example.com",
        payload: expect.objectContaining({
          state,
          actionClass: "email-send",
          recipientLabel: "ops@example.com",
        }),
      }),
    );
  });
});
