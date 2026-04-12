/**
 * Ditto — Self Tools: Network Agent
 *
 * Three Self tools for the Network Agent:
 * - create_sales_plan: Collaborative sales planning (Selling mode)
 * - create_connection_plan: Connection request planning (Connecting mode)
 * - network_status: Briefing on active outreach, connections, pipeline
 *
 * Plus web front door functions:
 * - verifyOutreach: Confirm a message was genuinely from Ditto
 * - startIntake: Begin conversational intake for a new visitor
 *
 * These tools delegate to process templates. Self decides the mode and
 * creates the plan; the network-agent executes it.
 *
 * Provenance: Brief 079/083/085, ADR-016 (Self tools), Insight-150 (posture).
 */

import { db, schema } from "../../db";
import type { RunStatus } from "../../db/schema";
import { eq, and, desc, sql, notInArray } from "drizzle-orm";
import type { DelegationResult } from "../self-delegation";
import { listConnections, listPeople, getPersonByEmail, getPersonById, createPerson } from "../people";
import { handleActivateCycle } from "./cycle-tools";

// ============================================================
// create_sales_plan
// ============================================================

interface SalesPlanInput {
  goal: string;
  icp?: string;
  messaging?: string;
  cadence?: string;
}

export async function handleCreateSalesPlan(
  input: SalesPlanInput,
): Promise<DelegationResult> {
  if (!input.goal || input.goal.trim().length === 0) {
    return {
      toolName: "create_sales_plan",
      success: false,
      output: "A sales goal is required. What are you trying to achieve?",
    };
  }

  // Delegate to cycle activation (Brief 118: sales plan → sales-marketing cycle)
  const cycleResult = await handleActivateCycle({
    cycleType: "sales-marketing",
    goals: input.goal.trim(),
    icp: input.icp?.trim(),
    cadence: input.cadence?.trim() || "5 prospects per week",
    continuous: true,
  });

  // Wrap the result with the create_sales_plan tool name for backward compat
  return {
    ...cycleResult,
    toolName: "create_sales_plan",
    metadata: {
      ...cycleResult.metadata,
      mode: "selling",
      messaging: input.messaging?.trim() || null,
    },
  };
}

// ============================================================
// create_connection_plan
// ============================================================

interface ConnectionPlanInput {
  need: string;
  context?: string;
  constraints?: string;
}

export async function handleCreateConnectionPlan(
  input: ConnectionPlanInput,
): Promise<DelegationResult> {
  if (!input.need || input.need.trim().length === 0) {
    return {
      toolName: "create_connection_plan",
      success: false,
      output: "Tell me what kind of person you're looking for.",
    };
  }

  // Delegate to cycle activation (Brief 118: connection plan → network-connecting cycle)
  const cycleResult = await handleActivateCycle({
    cycleType: "network-connecting",
    goals: input.need.trim(),
    boundaries: input.constraints?.trim(),
    continuous: true,
  });

  return {
    ...cycleResult,
    toolName: "create_connection_plan",
    metadata: {
      ...cycleResult.metadata,
      mode: "connecting",
      context: input.context?.trim() || null,
    },
  };
}

// ============================================================
// network_status
// ============================================================

interface NetworkStatusInput {
  userId: string;
}

export async function handleNetworkStatus(
  input: NetworkStatusInput,
): Promise<DelegationResult> {
  if (!input.userId) {
    return {
      toolName: "network_status",
      success: false,
      output: "User ID is required for network status.",
    };
  }

  // Parallel fetch: connections, people, interactions, and active cycles
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const terminalStatuses: RunStatus[] = ["approved", "rejected", "failed", "cancelled", "skipped"];

  const [connections, allPeople, recentInteractions, activeCycles] = await Promise.all([
    listConnections(input.userId),
    listPeople(input.userId),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.interactions)
      .where(
        and(
          eq(schema.interactions.userId, input.userId),
          sql`${schema.interactions.createdAt} > ${weekAgo}`,
        ),
      ),
    db
      .select({
        cycleType: schema.processRuns.cycleType,
        status: schema.processRuns.status,
        currentStepId: schema.processRuns.currentStepId,
        createdAt: schema.processRuns.createdAt,
      })
      .from(schema.processRuns)
      .where(
        and(
          sql`${schema.processRuns.cycleType} IS NOT NULL`,
          notInArray(schema.processRuns.status, terminalStatuses),
        ),
      )
      .orderBy(desc(schema.processRuns.createdAt)),
  ]);

  const recentCount = recentInteractions[0]?.count ?? 0;

  // Find cooling connections (no interaction in 2+ weeks)
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const cooling = connections.filter(
    (c) => c.lastInteractionAt && new Date(c.lastInteractionAt).getTime() < twoWeeksAgo,
  );

  // Count opted-out people
  const optedOut = allPeople.filter((p) => p.optedOut).length;

  const statusLines = [
    `**Network Status**`,
    ``,
    `- **${connections.length}** connections (visible relationships)`,
    `- **${allPeople.length - connections.length}** people in working graph (internal)`,
    `- **${recentCount}** interactions this week`,
    `- **${optedOut}** opted out`,
  ];

  if (cooling.length > 0) {
    statusLines.push(``);
    statusLines.push(`**Cooling connections** (no contact in 2+ weeks):`);
    for (const person of cooling.slice(0, 5)) {
      const daysSince = person.lastInteractionAt
        ? Math.floor((Date.now() - new Date(person.lastInteractionAt).getTime()) / (24 * 60 * 60 * 1000))
        : "unknown";
      statusLines.push(`- ${person.name}${person.organization ? ` (${person.organization})` : ""} — ${daysSince} days ago`);
    }
    if (cooling.length > 5) {
      statusLines.push(`- ...and ${cooling.length - 5} more`);
    }
  }

  if (activeCycles.length > 0) {
    statusLines.push(``);
    statusLines.push(`**Active Cycles**`);
    // Deduplicate by cycle type (show most recent)
    const seen = new Set<string>();
    for (const cycle of activeCycles) {
      if (!cycle.cycleType || seen.has(cycle.cycleType)) continue;
      seen.add(cycle.cycleType);
      statusLines.push(
        `- ${cycle.cycleType}: ${cycle.status}${cycle.currentStepId ? ` (phase: ${cycle.currentStepId})` : ""}`,
      );
    }
  }

  return {
    toolName: "network_status",
    success: true,
    output: statusLines.join("\n"),
  };
}

// ============================================================
// Web Front Door: Verify Outreach (Brief 085)
// ============================================================

export interface VerifyOutreachResult {
  verified: boolean;
  personaName?: string;
  recentSubject?: string;
  recentDate?: string;
}

/**
 * Verify that a recent message to the given email was genuinely from Ditto.
 * Recipients use this to confirm "Alex from Ditto" is real, not phishing.
 */
export async function verifyOutreach(email: string): Promise<VerifyOutreachResult> {
  if (!email || !email.includes("@")) {
    return { verified: false };
  }

  // Find any person with this email across all users
  // (verification is not user-scoped — the recipient doesn't know the user)
  const people = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.email, email.toLowerCase().trim()));

  if (people.length === 0) {
    return { verified: false };
  }

  // Find the most recent interaction with this person
  const person = people[0];
  const recentInteractions = await db
    .select()
    .from(schema.interactions)
    .where(eq(schema.interactions.personId, person.id))
    .orderBy(desc(schema.interactions.createdAt))
    .limit(1);

  if (recentInteractions.length === 0) {
    return { verified: false };
  }

  const recent = recentInteractions[0];
  const personaName = person.personaAssignment === "mira" ? "Mira" : "Alex";

  return {
    verified: true,
    personaName,
    recentSubject: recent.subject ?? undefined,
    recentDate: recent.createdAt
      ? new Date(recent.createdAt).toISOString().split("T")[0]
      : undefined,
  };
}

// ============================================================
// Web Front Door: Conversational Intake (Brief 085)
// ============================================================

/**
 * Ensure a networkUsers record exists for this email.
 * Creates one if it doesn't exist. Returns the existing or new record.
 *
 * networkUsers.id is the canonical user identity used by:
 * - people.userId (which network user owns this person record)
 * - interactions.userId (which user's interaction is this)
 * - status-composer (iterates active network users)
 * - process chain inputs (userId parameter)
 */
async function ensureNetworkUser(
  email: string,
  name?: string,
): Promise<{ id: string; email: string }> {
  // Check if network user already exists
  const [existing] = await db
    .select({ id: schema.networkUsers.id, email: schema.networkUsers.email })
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.email, email.toLowerCase()))
    .limit(1);

  if (existing) return existing;

  // Create new network user
  const [created] = await db
    .insert(schema.networkUsers)
    .values({
      email: email.toLowerCase(),
      name: name ?? email.split("@")[0],
      status: "active",
    })
    .returning({ id: schema.networkUsers.id, email: schema.networkUsers.email });

  console.log(`[intake] Created network user ${created.id.slice(0, 8)} for ${email}`);
  return created;
}

export interface IntakeResult {
  success: boolean;
  recognised: boolean;
  personId?: string;
  /** The network user ID (networkUsers.id) — canonical user identity for processes */
  networkUserId?: string;
  personaName?: string;
  message: string;
}

/**
 * Start the conversational intake for a new visitor.
 * If the visitor's email is already in the network (a participant),
 * recognise them and reference past interactions.
 *
 * Creates a person record (or finds existing) and sends the welcome
 * email via AgentMail.
 */
export async function startIntake(
  email: string,
  name?: string,
  need?: string,
  _userId?: string, // Deprecated: networkUsers.id is now auto-created from email
  forcePersona?: "alex" | "mira",
  skipEmail?: boolean,
  sessionId?: string,
): Promise<IntakeResult> {
  if (!email || !email.includes("@")) {
    return { success: false, recognised: false, message: "A valid email is required." };
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Ensure a networkUsers record exists for this visitor.
  // networkUsers.id is the canonical user identity for processes, interactions,
  // and status composition. people.userId references this.
  const networkUser = await ensureNetworkUser(normalizedEmail, name);
  const ownerUserId = networkUser.id;

  // Check if this person is already in the network
  const existing = await getPersonByEmail(normalizedEmail, ownerUserId);

  if (existing) {
    // Recognised! This is a network participant becoming an active user
    const personaId = (existing.personaAssignment === "mira" ? "mira" : "alex") as "alex" | "mira";
    const personaName = personaId === "mira" ? "Mira" : "Alex";

    // Find their last interaction for context
    const recentInteractions = await db
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.personId, existing.id))
      .orderBy(desc(schema.interactions.createdAt))
      .limit(1);

    const lastSubject = recentInteractions[0]?.subject;
    const contextNote = lastSubject
      ? ` We exchanged emails about "${lastSubject}" — I remember.`
      : "";

    // Send welcome-back email (unless caller will send later)
    if (!skipEmail) {
      await sendWelcomeEmail(normalizedEmail, personaId, existing.name, need, true, contextNote, existing.id, ownerUserId, sessionId);
    }

    return {
      success: true,
      recognised: true,
      personId: existing.id,
      networkUserId: ownerUserId,
      personaName,
      message: `Hey, I think we've met — I'm ${personaName}.${contextNote} Great to hear you'd like to work together. I'll send you an email to get started.`,
    };
  }

  // New person — create record and assign persona
  // people.userId = networkUsers.id (the canonical owner identity)
  const person = await createPerson({
    userId: ownerUserId,
    name: name ?? normalizedEmail.split("@")[0],
    email: normalizedEmail,
    source: "manual",
    journeyLayer: "active",
    visibility: "internal",
  });

  // Link the networkUsers record to this person
  await db
    .update(schema.networkUsers)
    .set({ personId: person.id, updatedAt: new Date() })
    .where(eq(schema.networkUsers.id, ownerUserId));

  // Assign persona — use override if provided (e.g. front door is always Alex)
  let personaId: "alex" | "mira";
  if (forcePersona) {
    personaId = forcePersona;
    // Persist the forced assignment so admin views and future queries see it
    await db
      .update(schema.people)
      .set({ personaAssignment: forcePersona, updatedAt: new Date() })
      .where(eq(schema.people.id, person.id));
  } else {
    const { assignPersona } = await import("../persona");
    personaId = await assignPersona(person.id);
  }
  const personaName = personaId === "mira" ? "Mira" : "Alex";

  // Send welcome email (unless caller will send later with richer context)
  if (!skipEmail) {
    await sendWelcomeEmail(normalizedEmail, personaId, name, need, false, undefined, person.id, ownerUserId, sessionId);
  }

  const needAck = need ? ` You mentioned you're looking for help with "${need}" — I'll keep that in mind.` : "";

  return {
    success: true,
    recognised: false,
    personId: person.id,
    networkUserId: ownerUserId,
    personaName,
    message: `Hi, I'm ${personaName} from Ditto. I help people find the right connections and grow their business through relationships, not cold outreach.${needAck} I'll send you an email — that's how we'll work together. You don't need to come back to this website unless you want to.`,
  };
}

// ============================================================
// Welcome Email
// ============================================================

/**
 * Send a quick intro email — just so the visitor has Alex's email address
 * and can reply at any time. Sent immediately on email capture.
 *
 * Uses sendAndRecord() so the email is atomically tracked as an interaction.
 */
async function sendIntroEmail(
  email: string,
  personaId: "alex" | "mira",
  name?: string,
  recognised?: boolean,
  contextNote?: string,
  personId?: string,
  userId?: string,
  sessionId?: string,
): Promise<void> {
  const { sendAndRecord } = await import("../channel");

  const personaName = personaId === "mira" ? "Mira" : "Alex";
  const greeting = name ? `Hey ${name}` : "Hey";

  let body: string;
  if (recognised) {
    body = [
      `${greeting},`,
      "",
      `It's ${personaName} from Ditto.${contextNote || ""} Good to reconnect.`,
      "",
      "Just making sure you have my email — this is where the real work happens. If we got cut off on the site, no worries. Reply here and we'll pick up where we left off.",
    ].join("\n");
  } else {
    body = [
      `${greeting},`,
      "",
      `${personaName} here from Ditto. Just making sure you have my email — this is where the real work happens.`,
      "",
      "If we got cut off on the site, no worries. Reply here with what you're working on and I'll get started. Otherwise, I'll follow up shortly with a plan.",
    ].join("\n");
  }

  if (!personId) {
    console.error("[intake] No personId for intro email — cannot send untracked email to", email);
    return;
  }

  try {
    const result = await sendAndRecord({
      to: email,
      subject: `${personaName} from Ditto`,
      body,
      personaId,
      mode: "nurture",
      personId,
      userId: userId || "founder",
      includeOptOut: true,
      // Brief 126 AC4: sessionId in DB metadata (never in email headers/body — AC18)
      // so replies to the intro email can be traced to the user's session
      ...(sessionId ? { metadata: { sessionId, chatContext: true } } : {}),
    });

    if (result.success) {
      console.log(`[intake] Intro email sent to ${email} from ${personaName} (interaction: ${result.interactionId})`);
    } else {
      console.error(`[intake] Intro email failed for ${email}:`, result.error);
    }
  } catch (err) {
    console.error(`[intake] Intro email error for ${email}:`, err);
  }
}

/**
 * Send the action email — detailed follow-up with what Alex learned
 * and what happens next. Sent after ACTIVATE when Alex has gathered
 * enough info from the conversation.
 *
 * Uses sendAndRecord() so the email is atomically tracked as an interaction.
 */
export async function sendActionEmail(
  email: string,
  personaId: "alex" | "mira",
  name?: string,
  conversationContext?: string,
  personId?: string,
  outreachMode: "connector" | "sales" = "connector",
): Promise<void> {
  const { sendAndRecord } = await import("../channel");

  const personaName = personaId === "mira" ? "Mira" : "Alex";
  const greeting = name ? `Hey ${name}` : "Hey";

  const contextLine = conversationContext
    ? `\nHere's what I've got from our conversation:\n${conversationContext}`
    : "";

  // Generate the action email using LLM with full conversation context.
  // This ensures Alex never asks for information already provided.
  const { createCompletion, extractText } = await import("../llm");

  let body: string;
  try {
    const emailResponse = await createCompletion({
      system: [
        `You are ${personaName} from Ditto, writing a follow-up email to ${name || "the visitor"} after a front door conversation.`,
        `Mode: ${outreachMode}. Write as ${personaName} — warm, direct, Australian.`,
        "",
        "RULES:",
        "- NEVER ask for information already in the conversation summary below (website, business name, target, location, etc.)",
        "- Reference specific things from the conversation to show continuity",
        "- Explain what you're going to do next — be specific",
        "- If you already have their website, reference it: 'I've already had a look at your site'",
        "- Keep it concise — 5-8 sentences max",
        "- End with what you need from them (if anything) or what happens next",
        outreachMode === "sales"
          ? "- You're reaching out AS their company. Ask about tone/voice if not discussed. Ask for any info you're ACTUALLY missing."
          : "- You're reaching out as yourself (connector mode). You introduce, they decide.",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `Write the follow-up email based on this conversation:\n\n${conversationContext || "No conversation context available."}`,
        },
      ],
      maxTokens: 400,
      purpose: "writing",
    });
    body = extractText(emailResponse.content).trim();
  } catch (err) {
    // Fallback to a safe generic email if LLM fails
    console.warn("[intake] LLM email generation failed, using fallback:", (err as Error).message);
    body = [
      `${greeting},`,
      "",
      `${personaName} again. Good chat — I'm already working on this.`,
      contextLine,
      "",
      "Here's what's happening:",
      outreachMode === "sales"
        ? "- I'm researching prospects who'd be a great fit for your service"
        : "- I'm researching the right people to connect you with",
      "- You'll get a full report on who I've reached out to and what's coming back",
      "",
      "I'll be in touch soon with an update. Reply here anytime if something changes.",
    ].join("\n");
  }

  if (!personId) {
    // No person record yet (race condition with startIntake) — send directly via AgentMail
    // so the user still gets the email, even if we can't track the interaction.
    console.warn("[intake] No personId for action email — sending untracked via AgentMail to", email);
    try {
      const { AgentMailClient } = await import("agentmail");
      const apiKey = process.env.AGENTMAIL_API_KEY;
      const alexInbox = process.env.AGENTMAIL_ALEX_INBOX;
      if (apiKey && alexInbox) {
        const client = new AgentMailClient({ apiKey });
        const { textToHtml } = await import("../channel");
        await client.inboxes.messages.send(alexInbox, {
          to: [email],
          subject: "Here's the plan",
          text: body,
          html: textToHtml(body),
        });
        console.log(`[intake] Untracked action email sent to ${email} from ${personaName}`);
      } else {
        console.error("[intake] AGENTMAIL_API_KEY or AGENTMAIL_ALEX_INBOX not set");
      }
    } catch (err) {
      console.error("[intake] Untracked action email error:", err);
    }
    return;
  }

  // Look up the person's owning userId (networkUsers.id)
  const person = await getPersonById(personId);
  const ownerUserId = person?.userId || "founder";

  try {
    const result = await sendAndRecord({
      to: email,
      subject: "Here's the plan",
      body,
      personaId,
      mode: "nurture",
      personId,
      userId: ownerUserId,
      includeOptOut: false,
    });

    if (result.success) {
      console.log(`[intake] Action email sent to ${email} from ${personaName} (interaction: ${result.interactionId})`);
    } else {
      console.error(`[intake] Action email failed for ${email}:`, result.error);
    }
  } catch (err) {
    console.error(`[intake] Action email error for ${email}:`, err);
  }
}

/**
 * Send the CoS action email — confirms the briefing plan and what happens next.
 * Sent after ACTIVATE when Alex detects a Chief of Staff need.
 *
 * Uses sendAndRecord() so the email is atomically tracked as an interaction.
 */
export async function sendCosActionEmail(
  email: string,
  personaId: "alex" | "mira",
  name?: string,
  conversationContext?: string,
  personId?: string,
): Promise<void> {
  const { sendAndRecord } = await import("../channel");

  const personaName = personaId === "mira" ? "Mira" : "Alex";
  const greeting = name ? `Hey ${name}` : "Hey";

  const contextLine = conversationContext
    ? `\nFrom our conversation, here's what I've picked up:\n${conversationContext}`
    : "";

  const { createCompletion, extractText } = await import("../llm");

  let body: string;
  try {
    const emailResponse = await createCompletion({
      system: [
        `You are ${personaName} from Ditto, writing a follow-up email to ${name || "the visitor"} after a front door conversation about Chief of Staff / operational support.`,
        `Write as ${personaName} — warm, direct, Australian.`,
        "",
        "RULES:",
        "- NEVER ask for information already in the conversation summary below",
        "- Reference specific things they told you — priorities, pain points, tools they mentioned",
        "- Explain the CoS setup: weekly priorities briefings, decision tracking, you control the pace",
        "- Be specific about what their first briefing will cover based on what you learned",
        "- Keep it concise — 5-8 sentences max",
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: `Write the follow-up email based on this conversation:\n\n${conversationContext || "No conversation context available."}`,
        },
      ],
      maxTokens: 400,
      purpose: "writing",
    });
    body = extractText(emailResponse.content).trim();
  } catch (err) {
    console.warn("[intake] LLM CoS email generation failed, using fallback:", (err as Error).message);
    body = [
      `${greeting},`,
      "",
      `${personaName} again. Good chat — I've got a clear picture of what you need.`,
      contextLine,
      "",
      "Here's what I'll do:",
      "1. Send you a priorities briefing every Monday — what to focus on, decisions pending, anything I've flagged",
      "2. You reply when something needs adjusting — we work through email",
      "3. As we build trust, I'll start handling more proactively — but you control the pace",
      "",
      "Your first briefing will arrive by Monday. I only act when you've approved — nothing happens without your say-so.",
      "",
      "Reply here anytime to update me on what's changed or what's on your mind.",
    ].join("\n");
  }

  if (!personId) {
    console.warn("[intake] No personId for CoS action email — sending untracked via AgentMail to", email);
    try {
      const { AgentMailClient } = await import("agentmail");
      const apiKey = process.env.AGENTMAIL_API_KEY;
      const alexInbox = process.env.AGENTMAIL_ALEX_INBOX;
      if (apiKey && alexInbox) {
        const client = new AgentMailClient({ apiKey });
        const { textToHtml } = await import("../channel");
        await client.inboxes.messages.send(alexInbox, {
          to: [email],
          subject: "Your priorities briefing starts this week",
          text: body,
          html: textToHtml(body),
        });
        console.log(`[intake] Untracked CoS action email sent to ${email} from ${personaName}`);
      }
    } catch (err) {
      console.error("[intake] Untracked CoS action email error:", err);
    }
    return;
  }

  // Look up the person's owning userId (networkUsers.id)
  const person = await getPersonById(personId);
  const ownerUserId = person?.userId || "founder";

  try {
    const result = await sendAndRecord({
      to: email,
      subject: "Your priorities briefing starts this week",
      body,
      personaId,
      mode: "nurture",
      personId,
      userId: ownerUserId,
      includeOptOut: false,
    });

    if (result.success) {
      console.log(`[intake] CoS action email sent to ${email} from ${personaName} (interaction: ${result.interactionId})`);
    } else {
      console.error(`[intake] CoS action email failed for ${email}:`, result.error);
    }
  } catch (err) {
    console.error(`[intake] CoS action email error for ${email}:`, err);
  }
}

// Keep backward compat for sendWelcomeEmail (used by resend flow)
async function sendWelcomeEmail(
  email: string,
  personaId: "alex" | "mira",
  name?: string,
  _need?: string,
  recognised?: boolean,
  contextNote?: string,
  personId?: string,
  userId?: string,
  sessionId?: string,
): Promise<void> {
  return sendIntroEmail(email, personaId, name, recognised, contextNote, personId, userId, sessionId);
}
