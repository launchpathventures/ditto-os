/**
 * Ditto — Inbound Email Processor (Brief 098b)
 *
 * Processes inbound emails from AgentMail webhooks:
 * 1. Match sender email → person record
 * 2. Check for waiting_human process step → resume it
 * 3. Classify reply: opt-out, positive reply, general
 * 4. Record interaction
 *
 * Layer classification: L6 (Human/entry point) — inbound email is a
 * human-initiated event that enters the system.
 *
 * Provenance: AgentMail webhook-agent example (pattern), Brief 098b.
 */

import { db, schema } from "../db";
import { eq, and, gte, desc, notInArray } from "drizzle-orm";
import type { TrustTier } from "../db/schema";
import { isOptOutSignal } from "./channel";
import { notifyUser } from "./notify-user";
import { recordInteraction, optOutPerson, findPersonByEmailGlobal, createPerson } from "./people";
import { resumeHumanStep, pauseGoal } from "./heartbeat";
import { selfConverse } from "./self";
import { fireEvent } from "./scheduler";

// ============================================================
// Types
// ============================================================

export interface InboundEmailPayload {
  /** AgentMail event type */
  event_type: string;
  message: {
    from: string;
    to?: string;
    subject?: string;
    text?: string;
    /** AgentMail extracted reply text (without quoted history) */
    extracted_text?: string;
    message_id?: string;
    thread_id?: string;
  };
}

export interface InboundProcessingResult {
  action: "resumed_step" | "opt_out" | "positive_reply" | "interaction_recorded" | "unknown_sender" | "user_request" | "cancellation";
  personId?: string;
  processRunId?: string;
  interactionId?: string;
  networkUserId?: string;
  details?: string;
}

// ============================================================
// Waiting Step Detection
// ============================================================

/**
 * Find a process run that is waiting for human input AND is associated
 * with a given person (via process run inputs containing the person's ID or email).
 */
async function findWaitingRunForPerson(personId: string): Promise<{
  processRunId: string;
} | null> {
  const waitingRuns = await db
    .select({
      id: schema.processRuns.id,
      inputs: schema.processRuns.inputs,
    })
    .from(schema.processRuns)
    .where(eq(schema.processRuns.status, "waiting_human"));

  for (const run of waitingRuns) {
    const inputs = run.inputs as Record<string, unknown> | null;
    if (!inputs) continue;

    // Check if the run's inputs reference this person
    const inputValues = Object.values(inputs);
    if (inputValues.includes(personId)) {
      return { processRunId: run.id };
    }
  }

  return null;
}

/**
 * Look up the trust tier of the most recent active process run associated
 * with a person. Used by fireEvent to enforce trust inheritance (098a AC9).
 * Returns null if no active run is found (chain will use target's default tier).
 */
async function getParentTrustTierForPerson(personId: string): Promise<TrustTier | null> {
  const activeRuns = await db
    .select({
      id: schema.processRuns.id,
      inputs: schema.processRuns.inputs,
      trustTierOverride: schema.processRuns.trustTierOverride,
    })
    .from(schema.processRuns)
    .where(
      notInArray(schema.processRuns.status, ["approved", "rejected", "failed", "cancelled", "skipped"]),
    )
    .orderBy(desc(schema.processRuns.startedAt))
    .limit(50);

  for (const run of activeRuns) {
    const inputs = run.inputs as Record<string, unknown> | null;
    if (!inputs) continue;
    if (Object.values(inputs).includes(personId)) {
      // Use the override tier if present (chain-inherited), otherwise look up the process default
      if (run.trustTierOverride) return run.trustTierOverride as TrustTier;
      // Fall back to looking up the process trust tier
      const [processInfo] = await db
        .select({ trustTier: schema.processes.trustTier })
        .from(schema.processes)
        .innerJoin(schema.processRuns, eq(schema.processRuns.processId, schema.processes.id))
        .where(eq(schema.processRuns.id, run.id))
        .limit(1);
      return (processInfo?.trustTier as TrustTier) ?? null;
    }
  }
  return null;
}

// ============================================================
// Reply Classification (Basic — AC6)
// ============================================================

/**
 * Classify an inbound reply. Basic classification for 098b:
 * - opt-out: triggers opt-out management
 * - positive: fires event for chain triggers (connecting-introduction)
 * - general: default — just record the interaction
 *
 * Full intent classification (new requests, mode switching) deferred to Brief 099.
 */
function classifyReply(text: string): "opt_out" | "positive" | "general" {
  if (isOptOutSignal(text)) {
    return "opt_out";
  }

  // Positive reply signals
  const lower = text.toLowerCase().trim();
  const positiveSignals = [
    "sounds good",
    "sounds great",
    "let's do it",
    "let's go",
    "go ahead",
    "yes please",
    "yes, please",
    "interested",
    "i'm interested",
    "tell me more",
    "love to",
    "would love to",
    "count me in",
    "let's connect",
    "happy to chat",
    "sure",
    "absolutely",
    "definitely",
    "looking forward",
  ];

  if (positiveSignals.some((signal) => lower.includes(signal))) {
    return "positive";
  }

  return "general";
}

// ============================================================
// Cancellation Detection (Brief 125)
// ============================================================

/**
 * Detect clear cancellation intent in a user's email reply.
 * Keyword-based — no LLM call — for speed and reliability.
 *
 * Returns true only for unambiguous cancellation signals.
 * Ambiguous cases ("maybe hold off", "I'm not sure") return false
 * and should be routed to Self for judgment.
 *
 * Provenance: Same pattern as isOptOutSignal() in channel.ts.
 */
export function isCancellationSignal(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Exact matches (short replies)
  const exactSignals = [
    "cancel",
    "cancel this",
    "cancel that",
    "cancel it",
    "cancel everything",
    "stop",
    "stop this",
    "stop that",
    "stop it",
    "stop everything",
    "never mind",
    "nevermind",
    "don't do this",
    "dont do this",
    "don't do that",
    "dont do that",
    "pause",
    "pause this",
    "pause everything",
    "hold off",
    "hold off on this",
    "hold off on that",
    "abort",
  ];

  if (exactSignals.includes(lower)) return true;

  // Prefix matches (replies that start with cancel intent)
  const prefixSignals = [
    "cancel ",
    "please cancel",
    "please stop",
    "stop all ",
    "stop the ",
    "don't send",
    "dont send",
    "don't contact",
    "dont contact",
    "do not send",
    "do not contact",
  ];

  if (prefixSignals.some((s) => lower.startsWith(s))) return true;

  // Substring matches (embedded in longer text)
  const substringSignals = [
    "cancel this outreach",
    "cancel the outreach",
    "stop the outreach",
    "stop all outreach",
    "cancel all outreach",
    "kill this",
    "shut it down",
  ];

  if (substringSignals.some((s) => lower.includes(s))) return true;

  return false;
}

type WorkItemRow = {
  id: string;
  type: string;
  content: string;
  executionIds: string[] | null;
  decomposition: Array<{ taskId: string }> | null;
};

/**
 * Find the parent goal workItem for a given processRunId.
 * Accepts a pre-fetched work items array to avoid repeated DB queries
 * when called in a loop.
 */
function findGoalInWorkItems(
  processRunId: string,
  allWorkItems: WorkItemRow[],
): { goalWorkItemId: string; goalName: string } | null {
  for (const item of allWorkItems) {
    const execIds = item.executionIds || [];
    if (execIds.includes(processRunId)) {
      if (item.type === "goal") {
        return { goalWorkItemId: item.id, goalName: item.content || "goal" };
      }
      // It's a task — find the parent goal
      for (const goalCandidate of allWorkItems) {
        if (goalCandidate.type !== "goal") continue;
        if (goalCandidate.decomposition?.some((t) => t.taskId === item.id)) {
          return { goalWorkItemId: goalCandidate.id, goalName: goalCandidate.content || "goal" };
        }
      }
    }
  }
  return null;
}

/**
 * Resolve which goal a user's email reply is about, using thread context.
 * Looks up the interaction that was sent in the same thread and finds its
 * associated processRunId, then resolves the parent goal.
 *
 * Also validates ownership: the interaction must belong to the given userId.
 */
async function resolveGoalFromThread(
  threadId: string,
  userId: string,
): Promise<{
  goalWorkItemId: string;
  goalName: string;
  processRunId: string;
} | null> {
  // Find interactions in this thread that belong to the user
  const interactions = await db
    .select({
      id: schema.interactions.id,
      processRunId: schema.interactions.processRunId,
      userId: schema.interactions.userId,
      metadata: schema.interactions.metadata,
    })
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId))
    .limit(200);

  // Collect processRunIds from matching interactions (usually 1)
  const candidates: string[] = [];
  for (const interaction of interactions) {
    const metadata = interaction.metadata as Record<string, unknown> | null;
    if (!metadata) continue;
    if (metadata.threadId !== threadId) continue;
    if (!interaction.processRunId) continue;
    candidates.push(interaction.processRunId);
  }

  if (candidates.length === 0) return null;

  // Single DB query for work items — shared across all candidates
  const allWorkItems = await db
    .select({
      id: schema.workItems.id,
      type: schema.workItems.type,
      content: schema.workItems.content,
      executionIds: schema.workItems.executionIds,
      decomposition: schema.workItems.decomposition,
    })
    .from(schema.workItems)
    .limit(200) as WorkItemRow[];

  for (const processRunId of candidates) {
    const goal = findGoalInWorkItems(processRunId, allWorkItems);
    if (goal) {
      return { ...goal, processRunId };
    }
  }

  return null;
}

// ============================================================
// User Email Detection (Insight-162)
// ============================================================

/**
 * Check if the sender is a network user (the Ditto user, not a contact).
 * If yes, handle their email as a user request — acknowledge, record,
 * and route appropriately.
 *
 * Returns null if the sender is NOT a network user (falls through to
 * contact reply handling).
 *
 * For MVP: record the email, check for waiting steps on the user's
 * own processes, acknowledge receipt. Full intent classification
 * (new requests, status queries, corrections) deferred to Brief 099.
 */
async function handleUserEmail(
  senderEmail: string,
  message: InboundEmailPayload["message"],
): Promise<InboundProcessingResult | null> {
  const [networkUser] = await db
    .select()
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.email, senderEmail))
    .limit(1);

  if (!networkUser) return null; // Not a user — fall through to contact handling

  const replyText = message.extracted_text || message.text || "";
  const subject = message.subject || "";

  console.log(`[inbound] User email from ${senderEmail} (${networkUser.name || "unnamed"}): "${subject}"`);

  // Brief 126 AC21: Cancellation MUST run BEFORE waiting-step resume.
  // A "cancel" reply should cancel, not resume a waiting step.
  // Brief 125: Check for cancellation intent before routing to Self.
  // Clear cancellation signals are handled immediately (no LLM roundtrip).
  // Ambiguous cases fall through to Self for judgment.
  if (isCancellationSignal(replyText)) {
    const threadId = message.thread_id;
    if (threadId) {
      const goalContext = await resolveGoalFromThread(threadId, networkUser.id);
      if (goalContext) {
        // Ensure personId exists — reuse the same pattern as the Self routing
        // path below (line ~440). Without personId we can't record the
        // interaction or send a confirmation, violating AC9.
        let personId = networkUser.personId;
        if (!personId) {
          const person = await createPerson({
            userId: networkUser.id,
            name: networkUser.name || senderEmail,
            email: senderEmail,
            source: "manual",
            visibility: "connection",
          });
          personId = person.id;
          await db
            .update(schema.networkUsers)
            .set({ personId: person.id })
            .where(eq(schema.networkUsers.id, networkUser.id));
        }

        console.log(`[inbound] Cancellation detected from ${senderEmail} — pausing goal ${goalContext.goalWorkItemId.slice(0, 8)}`);

        try {
          await pauseGoal(goalContext.goalWorkItemId);
        } catch (err) {
          // pauseGoal failure is non-fatal — still record + notify
          console.error(`[inbound] pauseGoal failed for ${goalContext.goalWorkItemId}:`, err);
        }

        // Record the cancellation interaction
        await recordInteraction({
          personId,
          userId: networkUser.id,
          type: "reply_received",
          channel: "email",
          mode: "connecting",
          subject,
          summary: replyText.slice(0, 500),
          outcome: "negative",
          processRunId: goalContext.processRunId,
          metadata: {
            messageId: message.message_id,
            threadId: message.thread_id,
            cancellation: true,
            goalWorkItemId: goalContext.goalWorkItemId,
          },
        });

        // Notify user: "Done — I've paused this."
        // Brief 126 AC19: If mode was "both", inform user that CoS intake didn't start
        // and can be restarted separately.
        try {
          const [cancelledRun] = await db
            .select({ inputs: schema.processRuns.inputs })
            .from(schema.processRuns)
            .where(eq(schema.processRuns.id, goalContext.processRunId))
            .limit(1);
          const runInputs = cancelledRun?.inputs as Record<string, unknown> | null;
          const wasBothMode = runInputs?.detectedMode === "both";

          const body = wasBothMode
            ? `Done — I've paused ${goalContext.goalName}. Note: the chief-of-staff intake hadn't started yet (it was queued after outreach). Reply if you'd like me to restart either one separately.`
            : `Done — I've paused ${goalContext.goalName}. Reply if you want me to pick it back up.`;

          await notifyUser({
            userId: networkUser.id,
            personId,
            subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
            body,
            inReplyToMessageId: message.message_id,
            includeOptOut: false,
          });
        } catch {
          // Notification is non-fatal
        }

        return {
          action: "cancellation",
          networkUserId: networkUser.id,
          personId,
          processRunId: goalContext.processRunId,
          details: `Goal ${goalContext.goalWorkItemId} paused via email cancellation`,
        };
      }
    }
    // No thread context or no matching goal — fall through to Self
    // Self will handle it conversationally
    console.log(`[inbound] Cancellation signal from ${senderEmail} but no thread context — routing to Self`);
  }

  // Check if user is replying to a waiting_human step on one of their processes.
  // This runs AFTER cancellation check — a "cancel" reply cancels, doesn't resume.
  if (networkUser.personId) {
    const waitingRun = await findWaitingRunForPerson(networkUser.personId);
    if (waitingRun) {
      console.log(`[inbound] User reply resumes waiting step in run ${waitingRun.processRunId.slice(0, 8)}`);

      await resumeHumanStep(waitingRun.processRunId, {
        feedback: replyText,
        email_subject: subject,
        responded_via: "email",
      });

      const interaction = await recordInteraction({
        personId: networkUser.personId,
        userId: networkUser.id,
        type: "reply_received",
        channel: "email",
        mode: "connecting",
        subject,
        summary: replyText.slice(0, 500),
        outcome: "positive",
        processRunId: waitingRun.processRunId,
        metadata: { resumedStep: true, userInitiated: true },
      });

      return {
        action: "resumed_step",
        networkUserId: networkUser.id,
        personId: networkUser.personId,
        processRunId: waitingRun.processRunId,
        interactionId: interaction.id,
      };
    }
  }

  // --- Voice model collection (Brief 124) ---
  // Passively collect user's writing style from their email replies.
  // V1: store the raw reply text as a voice_model memory scoped to the user (self scope).
  // The LLM does style matching at generation time from raw samples — no extraction needed.
  // Throttle: max 1 sample per hour per user to prevent burst conversations from
  // filling all slots with back-and-forth context rather than representative samples.
  if (replyText.trim().length >= 50) {
    // Only store substantive replies (>= 50 chars) — skip "ok" / "thanks"
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [recentSample] = await db
        .select({ id: schema.memories.id })
        .from(schema.memories)
        .where(
          and(
            eq(schema.memories.scopeType, "self"),
            eq(schema.memories.scopeId, networkUser.id),
            eq(schema.memories.type, "voice_model"),
            gte(schema.memories.createdAt, oneHourAgo),
          ),
        )
        .limit(1);

      if (!recentSample) {
        await db.insert(schema.memories).values({
          scopeType: "self",
          scopeId: networkUser.id,
          type: "voice_model",
          content: replyText.trim().slice(0, 2000),
          source: "system",
          metadata: {
            collectedFrom: "inbound_email",
            subject,
            collectedAt: new Date().toISOString(),
          },
        });
        console.log(`[inbound] Stored voice model sample for user ${networkUser.id.slice(0, 8)} (${replyText.trim().length} chars)`);
      }
    } catch {
      // Voice model collection is non-fatal
    }
  }

  // No waiting step — route through the Self for intent classification.
  // The Self IS the intent classifier: 19 tools handle every user intent
  // via LLM tool_use. Same brain, same tools, different surface.

  // AC6: If personId is null, create the person record first (no crash on edge case)
  let personId = networkUser.personId;
  if (!personId) {
    console.log(`[inbound] User ${networkUser.id} has no personId — creating person record`);
    const person = await createPerson({
      userId: networkUser.id,
      name: networkUser.name || senderEmail,
      email: senderEmail,
      source: "manual",
      visibility: "connection",
    });
    personId = person.id;

    // Link the person record to the network user
    await db
      .update(schema.networkUsers)
      .set({ personId: person.id })
      .where(eq(schema.networkUsers.id, networkUser.id));
  }

  // Record the inbound interaction
  const interaction = await recordInteraction({
    personId,
    userId: networkUser.id,
    type: "reply_received",
    channel: "email",
    mode: "connecting",
    subject,
    summary: replyText.slice(0, 500),
    outcome: "neutral",
    metadata: {
      messageId: message.message_id,
      threadId: message.thread_id,
      userInitiated: true,
    },
  });

  // Route through the Self — same brain, different surface.
  // Self's response becomes the email reply via notifyUser().
  const messageText = subject && replyText
    ? `Subject: ${subject}\n\n${replyText}`
    : replyText || subject || "";

  try {
    const selfResult = await selfConverse(networkUser.id, messageText, "inbound", undefined, {
      chatEscalationAvailable: true,
      userEmail: senderEmail,
    });

    // Send Self's response via notifyUser
    if (selfResult.response.trim()) {
      await notifyUser({
        userId: networkUser.id,
        personId,
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        body: selfResult.response,
        inReplyToMessageId: message.message_id,
      });
    }
  } catch (err) {
    // Self failure — fall back to acknowledgment so the user isn't ghosted
    console.error(`[inbound] Self failed for user ${networkUser.id}:`, err);
    try {
      await notifyUser({
        userId: networkUser.id,
        personId,
        subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        body: "Got it. I'm working on this — I'll follow up shortly.",
        inReplyToMessageId: message.message_id,
      });
    } catch {
      // Double failure — notification is non-fatal
    }
  }

  return {
    action: "user_request",
    networkUserId: networkUser.id,
    personId,
    interactionId: interaction.id,
    details: "Routed through Self (inbound surface)",
  };
}

// ============================================================
// Immediate User Notification
// ============================================================

/**
 * Notify the user immediately when something actionable happens.
 *
 * Positive replies and opt-outs are time-sensitive — the user should know
 * NOW, not in 3 days when the status composer runs. A great EA walks over
 * and says "good news — they replied" the moment it happens.
 *
 * Fire-and-forget: notification failure doesn't affect inbound processing.
 */
async function notifyUserImmediately(
  userId: string,
  personId: string,
  event: "positive_reply" | "opt_out" | "step_resumed",
  context: { personName: string; personEmail: string; subject: string; summary: string },
): Promise<void> {
  let subject: string;
  let body: string;

  // Compose the notification content (channel-agnostic)
  switch (event) {
    case "positive_reply":
      subject = `${context.personName} replied positively`;
      body = [
        `Good news — ${context.personName} (${context.personEmail}) replied to "${context.subject}":`,
        "",
        `> ${context.summary}`,
        "",
        "I'll keep the conversation going. Reply if you want me to handle it differently.",
      ].join("\n");
      break;

    case "opt_out":
      subject = `${context.personName} opted out`;
      body = [
        `${context.personName} (${context.personEmail}) asked not to be contacted further. I've stopped all outreach to them immediately.`,
        "",
        "No action needed — just keeping you in the loop.",
      ].join("\n");
      break;

    case "step_resumed":
      subject = `${context.personName} replied — process advancing`;
      body = [
        `${context.personName} (${context.personEmail}) replied to "${context.subject}". Their response has been fed into the process and it's advancing now.`,
        "",
        `> ${context.summary}`,
        "",
        "I'll let you know when the next step is ready.",
      ].join("\n");
      break;
  }

  try {
    const result = await notifyUser({ userId, personId, subject, body });
    if (result.success) {
      console.log(`[inbound] Notified user ${userId.slice(0, 8)} via ${result.channel}: ${event}`);
    }
  } catch (err) {
    // Fire-and-forget — notification failure is non-fatal
    console.error(`[inbound] Failed to notify user ${userId.slice(0, 8)}:`, err);
  }
}

// ============================================================
// Main Processing Function
// ============================================================

/**
 * Process an inbound email. Called asynchronously after the webhook
 * returns 200 to AgentMail.
 *
 * Processing flow:
 * 0. Check if sender is a network user (the boss) → handle as user request
 * 1. Match sender email to person record (contact reply)
 * 2. If person has a waiting_human step → resume it with email text
 * 3. Classify reply: opt-out → mark opted out; positive → record with outcome
 * 4. Record interaction regardless
 */
export async function processInboundEmail(
  payload: InboundEmailPayload,
): Promise<InboundProcessingResult> {
  const { message } = payload;
  const senderEmail = message.from?.toLowerCase().trim();

  if (!senderEmail) {
    console.warn("[inbound] No sender email in payload");
    return { action: "unknown_sender", details: "No sender email" };
  }

  // 0. Check if sender is a network user (the boss is talking)
  // This is fundamentally different from a contact replying — it's
  // the user delegating work, asking questions, or providing context.
  const userResult = await handleUserEmail(senderEmail, message);
  if (userResult) return userResult;

  // 1. Match sender to person record (contact reply path)
  const person = await findPersonByEmailGlobal(senderEmail);

  if (!person) {
    console.log(`[inbound] Unknown sender: ${senderEmail} — no person record found`);
    return { action: "unknown_sender", details: `No person record for ${senderEmail}` };
  }

  const replyText = message.extracted_text || message.text || "";
  const subject = message.subject || "";

  // 2. Check for waiting_human step
  const waitingRun = await findWaitingRunForPerson(person.id);

  if (waitingRun) {
    console.log(
      `[inbound] Resuming waiting step for person ${person.id} in run ${waitingRun.processRunId.slice(0, 8)}`,
    );

    // Resume the human step with email content as input
    // Include timedOut: false so downstream steps know this was a real reply (Brief 121)
    const result = await resumeHumanStep(waitingRun.processRunId, {
      feedback: replyText,
      email_subject: subject,
      responded_via: "email",
      timedOut: false,
    });

    // Record the interaction
    const interaction = await recordInteraction({
      personId: person.id,
      userId: person.userId,
      type: "reply_received",
      channel: "email",
      mode: "connecting",
      subject,
      summary: replyText.slice(0, 500),
      outcome: "positive",
      processRunId: waitingRun.processRunId,
      metadata: {
        messageId: message.message_id,
        threadId: message.thread_id,
        resumedStep: true,
      },
    });

    // Notify user immediately — their contact replied and the process is advancing
    notifyUserImmediately(person.userId, person.id, "step_resumed", {
      personName: person.name,
      personEmail: senderEmail,
      subject,
      summary: replyText.slice(0, 200),
    }).catch(() => {}); // fire-and-forget

    return {
      action: "resumed_step",
      personId: person.id,
      processRunId: waitingRun.processRunId,
      interactionId: interaction.id,
    };
  }

  // 3. Classify the reply
  const classification = classifyReply(replyText);

  // 4. Handle opt-out
  if (classification === "opt_out") {
    console.log(`[inbound] Opt-out from ${senderEmail} — marking person ${person.id} as opted out`);

    await optOutPerson(person.id);

    // Invalidate any authenticated chat sessions (Brief 123 — session revocation on opt-out)
    try {
      await db
        .update(schema.chatSessions)
        .set({ expiresAt: new Date(0) })
        .where(eq(schema.chatSessions.authenticatedEmail, senderEmail.toLowerCase()));
    } catch {
      // Non-fatal — session invalidation is best-effort
    }

    const interaction = await recordInteraction({
      personId: person.id,
      userId: person.userId,
      type: "opt_out",
      channel: "email",
      mode: "connecting",
      subject,
      summary: replyText.slice(0, 500),
      metadata: {
        messageId: message.message_id,
        threadId: message.thread_id,
      },
    });

    // Notify user immediately — contact opted out
    notifyUserImmediately(person.userId, person.id, "opt_out", {
      personName: person.name,
      personEmail: senderEmail,
      subject,
      summary: replyText.slice(0, 200),
    }).catch(() => {}); // fire-and-forget

    return {
      action: "opt_out",
      personId: person.id,
      interactionId: interaction.id,
    };
  }

  // 5. Record interaction (positive or general)
  const interaction = await recordInteraction({
    personId: person.id,
    userId: person.userId,
    type: "reply_received",
    channel: "email",
    mode: "connecting",
    subject,
    summary: replyText.slice(0, 500),
    outcome: classification === "positive" ? "positive" : "neutral",
    metadata: {
      messageId: message.message_id,
      threadId: message.thread_id,
      classification,
    },
  });

  if (classification === "positive") {
    console.log(
      `[inbound] Positive reply from ${senderEmail} — firing positive-reply event`,
    );

    // Brief 126 AC20: Fire the chain trigger event for connecting-introduction.
    // Look up the parent process run's trust tier so chain-spawned processes
    // inherit the more restrictive tier (098a AC9) — enforced, not just commented.
    const parentRunTier = await getParentTrustTierForPerson(person.id);
    fireEvent("positive-reply", {
      personId: person.id,
      userId: person.userId,
      email: senderEmail,
      subject,
      replyText: replyText.slice(0, 500),
    }, parentRunTier ? { parentTrustTier: parentRunTier } : undefined).catch((err) => {
      console.error(`[inbound] fireEvent("positive-reply") failed:`, err);
    });

    // Notify user immediately — this is the most exciting thing that can happen
    notifyUserImmediately(person.userId, person.id, "positive_reply", {
      personName: person.name,
      personEmail: senderEmail,
      subject,
      summary: replyText.slice(0, 200),
    }).catch(() => {}); // fire-and-forget
  }

  console.log(
    `[inbound] Recorded ${classification} reply from ${senderEmail}, interaction ${interaction.id}`,
  );

  return {
    action: classification === "positive" ? "positive_reply" : "interaction_recorded",
    personId: person.id,
    interactionId: interaction.id,
  };
}
