/**
 * Journey Smoke Test Helpers (Brief 111)
 *
 * Shared utilities for journey-level integration tests that use
 * real LLM calls and real email delivery to smoke-test@agentmail.to.
 *
 * These helpers drive the engine directly — handleChatTurn for front
 * door, fullHeartbeat for process advancement, pulse for chaining.
 */

import { eq, desc, and, like } from "drizzle-orm";
import type { TestDb } from "../test-utils";
import * as schema from "../db/schema";

// ============================================================
// Test inbox configuration
// ============================================================

export const SMOKE_TEST_EMAIL = process.env.SMOKE_TEST_EMAIL || "smoke-test@agentmail.to";

// ============================================================
// Front Door Simulation
// ============================================================

export interface FrontDoorResult {
  sessionId: string;
  detectedMode: string | null;
  emailCaptured: boolean;
  done: boolean;
  turns: Array<{ userMessage: string; alexReply: string }>;
  totalCostCents: number;
}

/**
 * Simulate a full front-door conversation with real LLM.
 *
 * Drives handleChatTurn through multiple turns with the given messages.
 * The final message should trigger ACTIVATE (done=true).
 *
 * Returns the session state and all turns for assertion.
 */
export async function simulateFrontDoorChat(
  db: TestDb,
  messages: string[],
  context: "front-door" | "referred" = "front-door",
): Promise<FrontDoorResult> {
  const { handleChatTurn } = await import("./network-chat");

  let sessionId: string | null = null;
  const turns: FrontDoorResult["turns"] = [];
  let detectedMode: string | null = null;
  let emailCaptured = false;
  let done = false;
  let totalCostCents = 0;

  for (const message of messages) {
    const result = await handleChatTurn(
      sessionId,
      message,
      context,
      "127.0.0.1", // test IP
      null,
    );

    sessionId = result.sessionId;
    if (result.detectedMode) detectedMode = result.detectedMode;
    if (result.emailCaptured) emailCaptured = true;
    if (result.done) done = true;

    turns.push({ userMessage: message, alexReply: result.reply });

    // Log the conversation turn for visibility
    console.log(`[journey-chat] User: ${message}`);
    console.log(`[journey-chat] Alex: ${result.reply}`);
    console.log(`[journey-chat] --- (mode=${result.detectedMode}, email=${result.emailCaptured}, done=${result.done})`);
  }

  return {
    sessionId: sessionId!,
    detectedMode,
    emailCaptured,
    done,
    turns,
    totalCostCents,
  };
}

// ============================================================
// Process Advancement
// ============================================================

export interface AdvanceResult {
  processRunId: string;
  stepsExecuted: number;
  status: string;
  message: string;
}

/**
 * Advance a process run through the heartbeat.
 * Calls fullHeartbeat which runs all available steps until pause/complete.
 */
export async function advanceProcess(
  processRunId: string,
): Promise<AdvanceResult> {
  const { fullHeartbeat } = await import("./heartbeat");
  const result = await fullHeartbeat(processRunId);
  return {
    processRunId: result.processRunId,
    stepsExecuted: result.stepsExecuted,
    status: result.status,
    message: result.message,
  };
}

// ============================================================
// Time Manipulation
// ============================================================

/**
 * Advance timestamps on delayed runs to simulate time passing.
 * This allows testing chain triggers (e.g., "5 days later, follow-up fires").
 */
export async function advanceTime(
  db: TestDb,
  daysForward: number,
): Promise<void> {
  const shiftMs = daysForward * 24 * 60 * 60 * 1000;
  const now = new Date();
  const past = new Date(now.getTime() - shiftMs);

  // Shift delayed_runs executeAt into the past so pulse picks them up
  await db.run(
    /* sql */ `UPDATE delayed_runs SET execute_at = execute_at - ${shiftMs} WHERE execute_at > ${past.getTime()}`,
  );
}

// ============================================================
// Assertions
// ============================================================

/**
 * Assert a process chain was created for the given trigger process.
 */
export async function assertChainCreated(
  db: TestDb,
  sourceProcessSlug: string,
  targetProcessSlug: string,
): Promise<boolean> {
  // Check delayed_runs for the target process slug
  const delayedRuns = await db
    .select()
    .from(schema.delayedRuns)
    .limit(50);

  const hasChain = delayedRuns.some((dr) =>
    dr.processSlug === targetProcessSlug,
  );

  // Also check if a process run was directly created for the target
  if (!hasChain) {
    const [targetProc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, targetProcessSlug))
      .limit(1);

    if (targetProc) {
      const runs = await db
        .select()
        .from(schema.processRuns)
        .where(eq(schema.processRuns.processId, targetProc.id))
        .limit(1);

      return runs.length > 0;
    }
  }

  return hasChain;
}

/**
 * Assert a person record was created with the given email.
 */
export async function assertPersonCreated(
  db: TestDb,
  email: string,
): Promise<boolean> {
  const persons = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.email, email))
    .limit(1);

  return persons.length > 0;
}

/**
 * Assert a process run has a specific status.
 */
export async function assertProcessRunStatus(
  db: TestDb,
  processSlug: string,
  expectedStatus: string,
): Promise<{ found: boolean; actualStatus: string | null }> {
  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!proc) return { found: false, actualStatus: null };

  const [run] = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.processId, proc.id))
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(1);

  if (!run) return { found: false, actualStatus: null };

  return {
    found: true,
    actualStatus: run.status,
  };
}

/**
 * Check the test inbox for delivered emails via AgentMail API.
 *
 * Uses the AgentMail client to list messages in the smoke-test inbox.
 * Returns the messages found.
 */
export async function assertEmailDelivered(
  expectedSubjectContains?: string,
): Promise<{ delivered: boolean; messageCount: number; subjects: string[] }> {
  try {
    const { AgentMailClient } = await import("agentmail");

    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) {
      console.warn("[journey-test] AGENTMAIL_API_KEY not set — skipping email delivery check");
      return { delivered: false, messageCount: 0, subjects: [] };
    }

    const client = new AgentMailClient({ apiKey });

    // Find the smoke-test inbox by email address
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inboxes = await client.inboxes.list() as any;
    const inboxList = inboxes.inboxes ?? inboxes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testInbox = inboxList.find((ib: any) => ib.email === SMOKE_TEST_EMAIL);

    if (!testInbox) {
      console.warn(`[journey-test] Test inbox ${SMOKE_TEST_EMAIL} not found`);
      return { delivered: false, messageCount: 0, subjects: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.inboxes.messages.list(testInbox.id ?? testInbox.inbox_id, { limit: 20 }) as any;
    const messages = response.messages ?? response.data ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subjects = messages.map((m: any) => m.subject || "(no subject)");

    if (expectedSubjectContains) {
      const matching = subjects.filter((s: string) =>
        s.toLowerCase().includes(expectedSubjectContains.toLowerCase()),
      );
      return {
        delivered: matching.length > 0,
        messageCount: matching.length,
        subjects: matching,
      };
    }

    return {
      delivered: messages.length > 0,
      messageCount: messages.length,
      subjects,
    };
  } catch (err) {
    console.error("[journey-test] Email delivery check failed:", err);
    return { delivered: false, messageCount: 0, subjects: [] };
  }
}

/**
 * Clear the test inbox before each test.
 * Deletes all messages in the smoke-test inbox.
 */
export async function clearTestInbox(): Promise<void> {
  try {
    const { AgentMailClient } = await import("agentmail");

    const apiKey = process.env.AGENTMAIL_API_KEY;
    if (!apiKey) return;

    const client = new AgentMailClient({ apiKey });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inboxes = await client.inboxes.list() as any;
    const inboxList = inboxes.inboxes ?? inboxes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testInbox = inboxList.find((ib: any) => ib.email === SMOKE_TEST_EMAIL);

    if (!testInbox) return;

    const inboxId = testInbox.id ?? testInbox.inbox_id;

    // List and delete all messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.inboxes.messages.list(inboxId, { limit: 100 }) as any;
    const messages = response.messages ?? response.data ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const msg of messages as any[]) {
      try {
        await client.inboxes.messages.delete(inboxId, msg.id ?? msg.message_id);
      } catch {
        // Ignore individual delete failures
      }
    }
  } catch {
    // Silently fail — inbox may not exist or API may not support deletion
  }
}

// ============================================================
// Cost tracking
// ============================================================

let totalJourneyCost = 0;

export function trackCost(costCents: number): void {
  totalJourneyCost += costCents;
}

export function getTotalCost(): number {
  return totalJourneyCost;
}

export function resetCost(): void {
  totalJourneyCost = 0;
}
