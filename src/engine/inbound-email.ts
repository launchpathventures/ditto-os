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
import { eq } from "drizzle-orm";
import { isOptOutSignal } from "./channel";
import { notifyUser } from "./notify-user";
import { recordInteraction, optOutPerson, findPersonByEmailGlobal, createPerson } from "./people";
import { resumeHumanStep } from "./heartbeat";
import { selfConverse } from "./self";

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
  action: "resumed_step" | "opt_out" | "positive_reply" | "interaction_recorded" | "unknown_sender" | "user_request";
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

  // Check if user is replying to a waiting_human step on one of their processes
  if (networkUser.personId) {
    const waitingRun = await findWaitingRunForPerson(networkUser.personId);
    if (waitingRun) {
      console.log(`[inbound] User reply resumes waiting step in run ${waitingRun.processRunId.slice(0, 8)}`);

      await resumeHumanStep(waitingRun.processRunId, {
        feedback: replyText,
        email_subject: subject,
        responded_via: "email",
      });

      // Record as interaction on the user's own person record
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
    const selfResult = await selfConverse(networkUser.id, messageText, "inbound");

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
    const result = await resumeHumanStep(waitingRun.processRunId, {
      feedback: replyText,
      email_subject: subject,
      responded_via: "email",
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
      `[inbound] Positive reply from ${senderEmail} — event: positive-reply (chain trigger)`,
    );
    // Note: Event-type chain triggers (connecting-introduction) are logged
    // but not yet active (098a AC11). When event handlers are fully wired,
    // this will fire the "positive-reply" event.

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
