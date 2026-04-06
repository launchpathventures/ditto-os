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
import { eq, and, desc, sql } from "drizzle-orm";
import type { DelegationResult } from "../self-delegation";
import { listConnections, listPeople, getPersonByEmail, createPerson } from "../people";

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

  const plan = {
    mode: "selling" as const,
    goal: input.goal.trim(),
    icp: input.icp?.trim() || null,
    messaging: input.messaging?.trim() || null,
    cadence: input.cadence?.trim() || "5 prospects per week",
    createdAt: Date.now(),
  };

  return {
    toolName: "create_sales_plan",
    success: true,
    output: [
      `Sales plan created.`,
      ``,
      `**Goal:** ${plan.goal}`,
      plan.icp ? `**ICP:** ${plan.icp}` : `**ICP:** Not yet defined — I'll ask clarifying questions.`,
      plan.messaging ? `**Messaging:** ${plan.messaging}` : `**Messaging:** I'll draft based on your goal and refine from your feedback.`,
      `**Cadence:** ${plan.cadence}`,
      ``,
      `I'll start researching prospects and come back with candidates for your review.`,
      `Every email gets your approval until you're confident in my voice.`,
    ].join("\n"),
    metadata: { plan },
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

  const plan = {
    mode: "connecting" as const,
    need: input.need.trim(),
    context: input.context?.trim() || null,
    constraints: input.constraints?.trim() || null,
    createdAt: Date.now(),
  };

  return {
    toolName: "create_connection_plan",
    success: true,
    output: [
      `Connection plan created.`,
      ``,
      `**Looking for:** ${plan.need}`,
      plan.context ? `**Context:** ${plan.context}` : "",
      plan.constraints ? `**Constraints:** ${plan.constraints}` : "",
      ``,
      `I'll research candidates and come back with names, context, and my recommendation.`,
      `You decide who you want introduced to.`,
    ].filter(Boolean).join("\n"),
    metadata: { plan },
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

  const connections = await listConnections(input.userId);
  const allPeople = await listPeople(input.userId);

  // Count recent interactions (last 7 days)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentInteractions = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.userId, input.userId),
        sql`${schema.interactions.createdAt} > ${weekAgo}`,
      ),
    );

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

export interface IntakeResult {
  success: boolean;
  recognised: boolean;
  personId?: string;
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
  userId?: string,
  forcePersona?: "alex" | "mira",
  skipEmail?: boolean,
): Promise<IntakeResult> {
  if (!email || !email.includes("@")) {
    return { success: false, recognised: false, message: "A valid email is required." };
  }

  const normalizedEmail = email.toLowerCase().trim();
  // Default userId for MVP (single-user: the founder)
  const ownerUserId = userId ?? "founder";

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
      await sendWelcomeEmail(normalizedEmail, personaId, existing.name, need, true, contextNote);
    }

    return {
      success: true,
      recognised: true,
      personId: existing.id,
      personaName,
      message: `Hey, I think we've met — I'm ${personaName}.${contextNote} Great to hear you'd like to work together. I'll send you an email to get started.`,
    };
  }

  // New person — create record and assign persona
  const person = await createPerson({
    userId: ownerUserId,
    name: name ?? normalizedEmail.split("@")[0],
    email: normalizedEmail,
    source: "manual",
    journeyLayer: "active",
    visibility: "internal",
  });

  // Assign persona — use override if provided (e.g. front door is always Alex)
  const { assignPersona } = await import("../persona");
  const personaId = forcePersona ?? await assignPersona(person.id);
  const personaName = personaId === "mira" ? "Mira" : "Alex";

  // Send welcome email (unless caller will send later with richer context)
  if (!skipEmail) {
    await sendWelcomeEmail(normalizedEmail, personaId, name, need, false);
  }

  const needAck = need ? ` You mentioned you're looking for help with "${need}" — I'll keep that in mind.` : "";

  return {
    success: true,
    recognised: false,
    personId: person.id,
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
 */
async function sendIntroEmail(
  email: string,
  personaId: "alex" | "mira",
  name?: string,
  recognised?: boolean,
  contextNote?: string,
): Promise<void> {
  const { createAgentMailAdapterForPersona } = await import("../channel");

  const adapter = createAgentMailAdapterForPersona(personaId);
  if (!adapter) {
    console.warn("[intake] AgentMail not configured — skipping intro email to", email);
    return;
  }

  const personaName = personaId === "mira" ? "Mira" : "Alex";
  const greeting = name ? `Hey ${name}` : "Hey";

  let body: string;
  if (recognised) {
    body = [
      `${greeting},`,
      "",
      `It's ${personaName} from Ditto.${contextNote || ""} Good to reconnect.`,
      "",
      "I'm just finishing up our chat on the site — I'll follow up shortly with a proper plan. In the meantime, you can always reply here if anything comes to mind.",
    ].join("\n");
  } else {
    body = [
      `${greeting},`,
      "",
      `${personaName} here from Ditto. We're chatting on the site right now — just wanted to make sure you have my email.`,
      "",
      "I'll follow up shortly with a proper plan once we've finished talking. You can always reply here if you think of anything.",
    ].join("\n");
  }

  try {
    const result = await adapter.send({
      to: email,
      subject: `${personaName} from Ditto`,
      body,
      personaId,
      mode: "nurture",
      includeOptOut: true,
    });

    if (result.success) {
      console.log(`[intake] Intro email sent to ${email} from ${personaName} (messageId: ${result.messageId})`);
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
 */
export async function sendActionEmail(
  email: string,
  personaId: "alex" | "mira",
  name?: string,
  conversationContext?: string,
): Promise<void> {
  const { createAgentMailAdapterForPersona } = await import("../channel");

  const adapter = createAgentMailAdapterForPersona(personaId);
  if (!adapter) {
    console.warn("[intake] AgentMail not configured — skipping action email to", email);
    return;
  }

  const personaName = personaId === "mira" ? "Mira" : "Alex";
  const greeting = name ? `Hey ${name}` : "Hey";

  const contextLine = conversationContext
    ? `\nHere's what I've got from our conversation:\n${conversationContext}`
    : "";

  const body = [
    `${greeting},`,
    "",
    `${personaName} again. Good chat — I've got enough to get started.`,
    contextLine,
    "",
    "Here's what happens next:",
    "1. I'll research the right people to connect you with",
    "2. I'll draft introductions — you'll see everything before it goes out",
    "3. Once you approve, I'll reach out on your behalf",
    "",
    "I'll be back in touch within 24 hours with the first batch. If anything changes or you think of something, just reply here.",
  ].join("\n");

  try {
    const result = await adapter.send({
      to: email,
      subject: "Here's the plan",
      body,
      personaId,
      mode: "nurture",
      includeOptOut: false, // They're already engaged, no opt-out on follow-up
    });

    if (result.success) {
      console.log(`[intake] Action email sent to ${email} from ${personaName} (messageId: ${result.messageId})`);
    } else {
      console.error(`[intake] Action email failed for ${email}:`, result.error);
    }
  } catch (err) {
    console.error(`[intake] Action email error for ${email}:`, err);
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
): Promise<void> {
  return sendIntroEmail(email, personaId, name, recognised, contextNote);
}
