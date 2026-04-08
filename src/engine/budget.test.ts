/**
 * Budget Infrastructure Tests (Brief 107)
 *
 * Tests budget lifecycle: creation, spend recording, exhaustion detection,
 * overspend rejection, and LLM context formatting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";

// Mock the db module to use test database
vi.mock("../db", () => ({
  get db() {
    return (globalThis as Record<string, unknown>).__testDb;
  },
  schema,
}));

describe("budget", () => {
  let testDb: TestDb;
  let cleanup: () => void;
  let goalWorkItemId: string;

  // Import after mock is set up
  let createBudget: typeof import("./budget").createBudget;
  let recordLoad: typeof import("./budget").recordLoad;
  let recordSpend: typeof import("./budget").recordSpend;
  let getBudgetStatus: typeof import("./budget").getBudgetStatus;
  let formatBudgetForLlm: typeof import("./budget").formatBudgetForLlm;
  let checkBudgetWarning: typeof import("./budget").checkBudgetWarning;
  let checkBudgetExhausted: typeof import("./budget").checkBudgetExhausted;
  let buildExhaustionNotification: typeof import("./budget").buildExhaustionNotification;
  let requestTopUp: typeof import("./budget").requestTopUp;

  beforeEach(async () => {
    const result = createTestDb();
    testDb = result.db;
    cleanup = result.cleanup;
    (globalThis as Record<string, unknown>).__testDb = testDb;

    // Create a goal work item for testing
    const [workItem] = await testDb
      .insert(schema.workItems)
      .values({
        type: "goal",
        status: "in_progress",
        content: "Get Auckland clients",
        source: "conversation",
      })
      .returning();
    goalWorkItemId = workItem.id;

    // Dynamic import to pick up mock
    const budgetModule = await import("./budget");
    createBudget = budgetModule.createBudget;
    recordLoad = budgetModule.recordLoad;
    recordSpend = budgetModule.recordSpend;
    getBudgetStatus = budgetModule.getBudgetStatus;
    formatBudgetForLlm = budgetModule.formatBudgetForLlm;
    checkBudgetWarning = budgetModule.checkBudgetWarning;
    checkBudgetExhausted = budgetModule.checkBudgetExhausted;
    buildExhaustionNotification = budgetModule.buildExhaustionNotification;
    requestTopUp = budgetModule.requestTopUp;
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as Record<string, unknown>).__testDb;
  });

  // --------------------------------------------------------
  // AC3: createBudget
  // --------------------------------------------------------

  it("creates a budget in 'created' status", async () => {
    const result = await createBudget(goalWorkItemId, 200000, "user-1");

    const [budget] = await testDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, result.id));

    expect(budget).toBeDefined();
    expect(budget.goalWorkItemId).toBe(goalWorkItemId);
    expect(budget.totalCents).toBe(200000);
    expect(budget.spentCents).toBe(0);
    expect(budget.status).toBe("created");
    expect(budget.userId).toBe("user-1");
  });

  it("rejects non-positive totalCents", async () => {
    await expect(createBudget(goalWorkItemId, 0, "user-1")).rejects.toThrow("positive integer");
    await expect(createBudget(goalWorkItemId, -100, "user-1")).rejects.toThrow("positive integer");
  });

  it("rejects non-integer totalCents", async () => {
    await expect(createBudget(goalWorkItemId, 100.5, "user-1")).rejects.toThrow("positive integer");
  });

  // --------------------------------------------------------
  // AC5: recordLoad (Stripe payment confirmed)
  // --------------------------------------------------------

  it("records a load transaction and sets status to funded", async () => {
    const { id: budgetId } = await createBudget(goalWorkItemId, 200000, "user-1");

    await recordLoad(budgetId, 200000, "pi_stripe_123");

    const [budget] = await testDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, budgetId));
    expect(budget.status).toBe("funded");

    const txns = await testDb
      .select()
      .from(schema.budgetTransactions)
      .where(eq(schema.budgetTransactions.budgetId, budgetId));
    expect(txns).toHaveLength(1);
    expect(txns[0].type).toBe("load");
    expect(txns[0].amountCents).toBe(200000);
    expect(txns[0].stripePaymentId).toBe("pi_stripe_123");
  });

  // --------------------------------------------------------
  // AC6: recordSpend
  // --------------------------------------------------------

  it("records spend and increments spentCents", async () => {
    const { id: budgetId } = await createBudget(goalWorkItemId, 200000, "user-1");
    await recordLoad(budgetId, 200000, "pi_1");

    await recordSpend(budgetId, 50000, "Research phase", "sub-goal-1");

    const [budget] = await testDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, budgetId));
    expect(budget.spentCents).toBe(50000);
    expect(budget.status).toBe("active");

    const txns = await testDb
      .select()
      .from(schema.budgetTransactions)
      .where(eq(schema.budgetTransactions.budgetId, budgetId));
    const spendTxn = txns.find(t => t.type === "spend");
    expect(spendTxn).toBeDefined();
    expect(spendTxn!.amountCents).toBe(50000);
    expect(spendTxn!.description).toBe("Research phase");
    expect(spendTxn!.subGoalId).toBe("sub-goal-1");
  });

  it("rejects overspend", async () => {
    const { id: budgetId } = await createBudget(goalWorkItemId, 100000, "user-1");
    await recordLoad(budgetId, 100000, "pi_1");

    await recordSpend(budgetId, 90000, "Most of budget");
    await expect(
      recordSpend(budgetId, 20000, "Over limit")
    ).rejects.toThrow("exceed budget");
  });

  it("sets status to exhausted when fully spent", async () => {
    const { id: budgetId } = await createBudget(goalWorkItemId, 100000, "user-1");
    await recordLoad(budgetId, 100000, "pi_1");

    await recordSpend(budgetId, 100000, "Full spend");

    const [budget] = await testDb
      .select()
      .from(schema.budgets)
      .where(eq(schema.budgets.id, budgetId));
    expect(budget.status).toBe("exhausted");
    expect(budget.spentCents).toBe(100000);
  });

  // --------------------------------------------------------
  // AC7: getBudgetStatus
  // --------------------------------------------------------

  it("returns budget status with calculated fields", async () => {
    const { id: budgetId } = await createBudget(goalWorkItemId, 200000, "user-1");
    await recordLoad(budgetId, 200000, "pi_1");
    await recordSpend(budgetId, 180000, "Research");

    const status = await getBudgetStatus(goalWorkItemId);
    expect(status).not.toBeNull();
    expect(status!.totalCents).toBe(200000);
    expect(status!.spentCents).toBe(180000);
    expect(status!.remainingCents).toBe(20000);
    expect(status!.percentUsed).toBe(90);
  });

  it("returns null for nonexistent goal", async () => {
    const status = await getBudgetStatus("no-such-goal");
    expect(status).toBeNull();
  });

  // --------------------------------------------------------
  // AC11: Integer cents arithmetic
  // --------------------------------------------------------

  it("uses integer arithmetic throughout", async () => {
    const { id: budgetId } = await createBudget(goalWorkItemId, 333, "user-1");
    await recordLoad(budgetId, 333, "pi_1");
    await recordSpend(budgetId, 111, "One third");
    await recordSpend(budgetId, 111, "Two thirds");

    const status = await getBudgetStatus(goalWorkItemId);
    expect(status!.spentCents).toBe(222);
    expect(status!.remainingCents).toBe(111);
    expect(Number.isInteger(status!.percentUsed)).toBe(true);
  });

  // --------------------------------------------------------
  // AC12: Immutable transactions
  // --------------------------------------------------------

  it("creates immutable transaction records", async () => {
    const { id: budgetId } = await createBudget(goalWorkItemId, 200000, "user-1");
    await recordLoad(budgetId, 200000, "pi_1");
    await recordSpend(budgetId, 50000, "Phase 1");
    await recordSpend(budgetId, 30000, "Phase 2");

    const txns = await testDb
      .select()
      .from(schema.budgetTransactions)
      .where(eq(schema.budgetTransactions.budgetId, budgetId));

    // 1 load + 2 spend = 3 immutable records
    expect(txns).toHaveLength(3);
    expect(txns.filter(t => t.type === "load")).toHaveLength(1);
    expect(txns.filter(t => t.type === "spend")).toHaveLength(2);
  });

  // --------------------------------------------------------
  // AC13: LLM context formatting
  // --------------------------------------------------------

  it("formats budget for LLM without financial details", async () => {
    const status: import("./budget").BudgetStatusResult = {
      budgetId: "b-1",
      goalWorkItemId: "g-1",
      totalCents: 200000,
      spentCents: 120000,
      remainingCents: 80000,
      percentUsed: 60,
      status: "active",
    };

    const formatted = formatBudgetForLlm(status);
    expect(formatted).toBe("Budget: $800.00 remaining of $2000.00 (60% used)");
    // Must NOT contain transaction IDs, card info, etc.
    expect(formatted).not.toContain("pi_");
    expect(formatted).not.toContain("stripe");
  });

  // --------------------------------------------------------
  // AC10: Warning detection at 90%
  // --------------------------------------------------------

  it("detects 90% warning threshold", async () => {
    await createBudget(goalWorkItemId, 100000, "user-1");
    const [budget] = await testDb.select().from(schema.budgets).where(eq(schema.budgets.goalWorkItemId, goalWorkItemId));
    await recordLoad(budget.id, 100000, "pi_1");
    await recordSpend(budget.id, 90000, "90% spent");

    const warning = await checkBudgetWarning(goalWorkItemId);
    expect(warning).not.toBeNull();
    expect(warning!.percentUsed).toBe(90);
  });

  it("no warning below 90%", async () => {
    await createBudget(goalWorkItemId, 100000, "user-1");
    const [budget] = await testDb.select().from(schema.budgets).where(eq(schema.budgets.goalWorkItemId, goalWorkItemId));
    await recordLoad(budget.id, 100000, "pi_1");
    await recordSpend(budget.id, 80000, "80% spent");

    const warning = await checkBudgetWarning(goalWorkItemId);
    expect(warning).toBeNull();
  });

  // --------------------------------------------------------
  // AC8: Exhaustion detection
  // --------------------------------------------------------

  it("detects budget exhaustion", async () => {
    await createBudget(goalWorkItemId, 100000, "user-1");
    const [budget] = await testDb.select().from(schema.budgets).where(eq(schema.budgets.goalWorkItemId, goalWorkItemId));
    await recordLoad(budget.id, 100000, "pi_1");
    await recordSpend(budget.id, 100000, "Fully spent");

    const exhausted = await checkBudgetExhausted(goalWorkItemId);
    expect(exhausted).not.toBeNull();
    expect(exhausted!.status).toBe("exhausted");
  });

  it("no exhaustion when budget remains", async () => {
    await createBudget(goalWorkItemId, 100000, "user-1");
    const [budget] = await testDb.select().from(schema.budgets).where(eq(schema.budgets.goalWorkItemId, goalWorkItemId));
    await recordLoad(budget.id, 100000, "pi_1");
    await recordSpend(budget.id, 50000, "Half spent");

    const exhausted = await checkBudgetExhausted(goalWorkItemId);
    expect(exhausted).toBeNull();
  });

  // --------------------------------------------------------
  // AC9: Exhaustion notification / requestTopUp (Flag 4+6)
  // --------------------------------------------------------

  it("buildExhaustionNotification produces correct content", () => {
    const status: import("./budget").BudgetStatusResult = {
      budgetId: "b-1",
      goalWorkItemId: "g-1",
      totalCents: 200000,
      spentCents: 200000,
      remainingCents: 0,
      percentUsed: 100,
      status: "exhausted",
    };

    const notification = buildExhaustionNotification(status, "Get Auckland clients");
    expect(notification.subject).toContain("Get Auckland clients");
    expect(notification.body).toContain("$2000.00");
    expect(notification.body).toContain("top up");
    expect(notification.checkoutUrl).toContain("budgetId=b-1");
  });

  it("requestTopUp returns notification for exhausted budget", async () => {
    await createBudget(goalWorkItemId, 100000, "user-1");
    const [budget] = await testDb.select().from(schema.budgets).where(eq(schema.budgets.goalWorkItemId, goalWorkItemId));
    await recordLoad(budget.id, 100000, "pi_1");
    await recordSpend(budget.id, 100000, "Fully spent");

    const topUp = await requestTopUp(goalWorkItemId);
    expect(topUp).not.toBeNull();
    expect(topUp!.subject).toContain("Get Auckland clients");
    expect(topUp!.body).toContain("$1000.00");
    expect(topUp!.checkoutUrl).toContain("budgetId=");
  });

  it("requestTopUp returns null for non-exhausted budget", async () => {
    await createBudget(goalWorkItemId, 100000, "user-1");
    const [budget] = await testDb.select().from(schema.budgets).where(eq(schema.budgets.goalWorkItemId, goalWorkItemId));
    await recordLoad(budget.id, 100000, "pi_1");
    await recordSpend(budget.id, 50000, "Half spent");

    const topUp = await requestTopUp(goalWorkItemId);
    expect(topUp).toBeNull();
  });
});
