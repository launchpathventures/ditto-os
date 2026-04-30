/**
 * Outbound Quality Gate — Staged Actions Tests (Brief 129)
 *
 * Tests: staged queue iteration, per-action approval/rejection,
 * dispatch callback, backward compat with legacy single outboundAction,
 * mixed staged + legacy scenarios.
 */

import { describe, it, expect, vi } from "vitest";
import { createHarnessContext, type HarnessContext, type StagedOutboundAction } from "../harness.js";
import { outboundQualityGateHandler } from "./outbound-quality-gate.js";

function makeContext(overrides: Partial<HarnessContext> = {}): HarnessContext {
  const ctx = createHarnessContext({
    processRun: { id: "run-1", processId: "proc-1", inputs: {} },
    stepDefinition: { id: "step-1", name: "Test Step", executor: "ai-agent" },
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

function makeStagedAction(overrides: Partial<StagedOutboundAction> = {}): StagedOutboundAction {
  return {
    toolName: "crm.send_email",
    args: { to: "test@example.com", subject: "Hello", body: "Hi there" },
    draftId: `draft-${Math.random().toString(36).slice(2, 8)}`,
    content: "Hello\n\nHi there",
    channel: "email",
    recipientId: "person-1",
    ...overrides,
  };
}

describe("outbound-quality-gate (staged actions — Brief 129)", () => {
  it("canHandle returns true when stagedOutboundActions has entries", () => {
    const ctx = makeContext({
      stagedOutboundActions: [makeStagedAction()],
    });
    expect(outboundQualityGateHandler.canHandle(ctx)).toBe(true);
  });

  it("canHandle returns false with empty staged queue and no outboundAction", () => {
    const ctx = makeContext();
    expect(outboundQualityGateHandler.canHandle(ctx)).toBe(false);
  });

  it("approves staged actions that pass all rules", async () => {
    const staged = makeStagedAction({ content: "Professional greeting" });
    const ctx = makeContext({
      stagedOutboundActions: [staged],
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spam",
          check: (content) => content.includes("BUY NOW") ? "Spam" : null,
        },
      ],
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(staged.approved).toBe(true);
    expect(ctx.reviewResult).toBe("skip"); // no violations
  });

  it("rejects staged actions that violate rules", async () => {
    const staged = makeStagedAction({ content: "BUY NOW!!!" });
    const ctx = makeContext({
      stagedOutboundActions: [staged],
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spam",
          check: (content) => content.includes("BUY NOW") ? "Spam detected" : null,
        },
      ],
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(staged.approved).toBe(false);
    expect(ctx.reviewResult).toBe("flag");
    expect(ctx.reviewDetails.outboundQualityViolations).toContain("[no-spam] Spam detected");
  });

  it("checks each staged action independently — mixed approval/rejection", async () => {
    const goodAction = makeStagedAction({ draftId: "good-1", content: "Hi Sarah, nice work on the project" });
    const badAction = makeStagedAction({ draftId: "bad-1", content: "BUY NOW — limited offer!" });
    const ctx = makeContext({
      stagedOutboundActions: [goodAction, badAction],
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spam",
          check: (content) => content.includes("BUY NOW") ? "Spam" : null,
        },
      ],
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(goodAction.approved).toBe(true);
    expect(badAction.approved).toBe(false);
    expect(ctx.reviewResult).toBe("flag"); // at least one violation
  });

  it("records each staged action individually via callback", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const action1 = makeStagedAction({ draftId: "d1", recipientId: "p-1", content: "Hello" });
    const action2 = makeStagedAction({ draftId: "d2", recipientId: "p-2", content: "World" });
    const ctx = makeContext({
      stagedOutboundActions: [action1, action2],
      recordOutboundAction: recorder,
      sendingIdentity: "agent-of-user",
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(recorder).toHaveBeenCalledTimes(2);
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "p-1", blocked: false }),
    );
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "p-2", blocked: false }),
    );
  });

  it("dispatches approved actions via dispatchStagedAction callback", async () => {
    const dispatcher = vi.fn().mockResolvedValue("sent");
    const staged = makeStagedAction({ content: "Clean content" });
    const ctx = makeContext({
      stagedOutboundActions: [staged],
      dispatchStagedAction: dispatcher,
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(staged.approved).toBe(true);
    expect(dispatcher).toHaveBeenCalledTimes(1);
    expect(dispatcher).toHaveBeenCalledWith(staged);
  });

  it("does NOT dispatch rejected actions", async () => {
    const dispatcher = vi.fn().mockResolvedValue("sent");
    const staged = makeStagedAction({ content: "BUY NOW" });
    const ctx = makeContext({
      stagedOutboundActions: [staged],
      dispatchStagedAction: dispatcher,
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spam",
          check: (content) => content.includes("BUY NOW") ? "Spam" : null,
        },
      ],
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(staged.approved).toBe(false);
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("backward compat: empty staged queue is a no-op", async () => {
    const ctx = makeContext({
      outboundAction: {
        channel: "email",
        actionType: "single",
        content: "Hello!",
      },
    });

    const result = await outboundQualityGateHandler.execute(ctx);
    expect(result.stagedOutboundActions).toEqual([]);
    expect(result.reviewResult).toBe("skip");
  });

  it("backward compat: legacy single outboundAction still works", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    const ctx = makeContext({
      outboundAction: {
        channel: "email",
        actionType: "single",
        recipientId: "person-1",
        content: "BUY NOW!",
      },
      outboundQualityRules: [
        {
          id: "no-spam",
          description: "No spam",
          check: (content) => content.includes("BUY NOW") ? "Spam" : null,
        },
      ],
      recordOutboundAction: recorder,
    });

    const result = await outboundQualityGateHandler.execute(ctx);
    expect(result.reviewResult).toBe("flag");
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ blocked: true }),
    );
  });

  it("does not short-circuit — downstream handlers still run", async () => {
    const staged = makeStagedAction({ content: "BUY NOW" });
    const ctx = makeContext({
      stagedOutboundActions: [staged],
      outboundQualityRules: [
        { id: "r1", description: "test", check: () => "violation" },
      ],
    });

    const result = await outboundQualityGateHandler.execute(ctx);
    expect(result.shortCircuit).toBe(false);
  });

  it("handles staged actions with no content gracefully", async () => {
    const staged = makeStagedAction({ content: undefined });
    const ctx = makeContext({
      stagedOutboundActions: [staged],
    });

    await outboundQualityGateHandler.execute(ctx);
    expect(staged.approved).toBe(true);
  });

  describe("pre-dispatch budget guard (Brief 172)", () => {
    it("blocks dispatch when checkBudgetBeforeDispatch returns blocked", async () => {
      const staged = makeStagedAction({ content: "Professional outreach" });
      const dispatch = vi.fn(async () => "dispatched");
      const budgetCheck = vi.fn(async () => ({
        blocked: true,
        reason: "budget exhausted",
      }));

      const ctx = makeContext({
        stagedOutboundActions: [staged],
        dispatchStagedAction: dispatch,
        checkBudgetBeforeDispatch: budgetCheck,
      });

      const result = await outboundQualityGateHandler.execute(ctx);

      expect(budgetCheck).toHaveBeenCalledOnce();
      expect(dispatch).not.toHaveBeenCalled();
      expect(staged.approved).toBe(false);
      expect(result.reviewResult).toBe("flag");
      expect(
        (result.reviewDetails.outboundQualityViolations as string[]).some((v) =>
          v.includes("budget"),
        ),
      ).toBe(true);
    });

    it("records blocked action with budget-reason via recordOutboundAction", async () => {
      const staged = makeStagedAction();
      const recorder = vi.fn<NonNullable<HarnessContext["recordOutboundAction"]>>(
        async () => {},
      );
      const budgetCheck = vi.fn(async () => ({
        blocked: true,
        reason: "budget exhausted for goal",
      }));

      const ctx = makeContext({
        stagedOutboundActions: [staged],
        recordOutboundAction: recorder,
        checkBudgetBeforeDispatch: budgetCheck,
      });

      await outboundQualityGateHandler.execute(ctx);

      expect(recorder).toHaveBeenCalledOnce();
      const recorded = recorder.mock.calls[0]![0];
      expect(recorded.blocked).toBe(true);
      expect(recorded.blockReason).toContain("budget");
    });

    it("allows dispatch when checkBudgetBeforeDispatch returns not blocked", async () => {
      const staged = makeStagedAction({ content: "fine content" });
      const dispatch = vi.fn(async () => "dispatched");
      const budgetCheck = vi.fn(async () => ({ blocked: false }));

      const ctx = makeContext({
        stagedOutboundActions: [staged],
        dispatchStagedAction: dispatch,
        checkBudgetBeforeDispatch: budgetCheck,
      });

      await outboundQualityGateHandler.execute(ctx);

      expect(budgetCheck).toHaveBeenCalledOnce();
      expect(dispatch).toHaveBeenCalledOnce();
      expect(staged.approved).toBe(true);
    });

    it("skips budget check when staged action failed content rules", async () => {
      const staged = makeStagedAction({ content: "BUY NOW CHEAP" });
      const budgetCheck = vi.fn(async () => ({ blocked: false }));

      const ctx = makeContext({
        stagedOutboundActions: [staged],
        outboundQualityRules: [
          {
            id: "no-spam",
            description: "no spam",
            check: (c) => (c.includes("BUY NOW") ? "Spam detected" : null),
          },
        ],
        checkBudgetBeforeDispatch: budgetCheck,
      });

      await outboundQualityGateHandler.execute(ctx);

      // Already flagged by content rule — budget check skipped.
      expect(budgetCheck).not.toHaveBeenCalled();
      expect(staged.approved).toBe(false);
    });

    it("works when no budget check is registered (backward compat)", async () => {
      const staged = makeStagedAction();
      const dispatch = vi.fn(async () => "dispatched");

      const ctx = makeContext({
        stagedOutboundActions: [staged],
        dispatchStagedAction: dispatch,
        // checkBudgetBeforeDispatch: null (default)
      });

      await outboundQualityGateHandler.execute(ctx);

      expect(staged.approved).toBe(true);
      expect(dispatch).toHaveBeenCalledOnce();
    });
  });
});
