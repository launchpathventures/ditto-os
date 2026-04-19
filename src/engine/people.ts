/**
 * People & Interactions — Relationship graph for the Network Agent.
 *
 * Two audiences:
 * - "internal": Ditto's working graph (prospects, enrichment targets). Invisible to user.
 * - "connection": User's visible relationships. Promoted on meaningful two-way interaction.
 *
 * Visibility promotion rules:
 * - reply_received → connection
 * - meeting_booked → connection
 * - introduction_received (accepted) → connection
 * - manual add → connection
 *
 * Person-scoped memory isolation: memories.scopeId → people.id → people.userId
 *
 * Provenance: Brief 079/080, Insight-146, Insight-149, Insight-151.
 */

import { db, schema } from "../db";
import { eq, and, desc, gte, count, inArray } from "drizzle-orm";
import { writeMemory } from "./legibility/write-memory";
import type {
  PersonVisibility,
  JourneyLayer,
  PersonTrustLevel,
  PersonaId,
  PersonSource,
  InteractionType,
  InteractionChannel,
  InteractionMode,
  InteractionOutcome,
} from "../db/schema";

// ============================================================
// People CRUD
// ============================================================

export interface CreatePersonInput {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
  role?: string;
  source?: PersonSource;
  journeyLayer?: JourneyLayer;
  visibility?: PersonVisibility;
  personaAssignment?: PersonaId;
}

export async function createPerson(input: CreatePersonInput) {
  const [person] = await db
    .insert(schema.people)
    .values({
      userId: input.userId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      organization: input.organization,
      role: input.role,
      source: input.source ?? "manual",
      journeyLayer: input.journeyLayer ?? "participant",
      visibility: input.visibility ?? "internal",
      personaAssignment: input.personaAssignment,
    })
    .returning();
  return person;
}

export async function getPersonById(id: string) {
  const [person] = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.id, id));
  return person ?? null;
}

export async function getPersonByEmail(email: string, userId: string) {
  const [person] = await db
    .select()
    .from(schema.people)
    .where(
      and(
        eq(schema.people.email, email),
        eq(schema.people.userId, userId),
      ),
    );
  return person ?? null;
}

/**
 * Find a person by email across ALL users (global lookup).
 * Used by the centralized network service when the owning user is unknown
 * (e.g., inbound emails, ACTIVATE flow before person → networkUser mapping).
 */
export async function findPersonByEmailGlobal(email: string) {
  const [person] = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.email, email.toLowerCase()))
    .limit(1);
  return person ?? null;
}

export async function listConnections(userId: string) {
  return db
    .select()
    .from(schema.people)
    .where(
      and(
        eq(schema.people.userId, userId),
        eq(schema.people.visibility, "connection"),
      ),
    )
    .orderBy(desc(schema.people.lastInteractionAt));
}

export async function listPeople(userId: string) {
  return db
    .select()
    .from(schema.people)
    .where(eq(schema.people.userId, userId))
    .orderBy(desc(schema.people.lastInteractionAt));
}

export async function updatePersonVisibility(
  personId: string,
  visibility: PersonVisibility,
) {
  await db
    .update(schema.people)
    .set({ visibility, updatedAt: new Date() })
    .where(eq(schema.people.id, personId));
}

/**
 * Update a person record with arbitrary safe fields.
 * Returns the updated person.
 */
export async function updatePerson(
  personId: string,
  updates: Partial<Pick<typeof schema.people.$inferSelect, "name" | "organization" | "role" | "email" | "phone">>,
) {
  await db
    .update(schema.people)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(schema.people.id, personId));

  return getPersonById(personId);
}

export async function optOutPerson(personId: string) {
  await db
    .update(schema.people)
    .set({ optedOut: true, updatedAt: new Date() })
    .where(eq(schema.people.id, personId));
}

// ============================================================
// Interactions CRUD + Visibility Promotion
// ============================================================

/** Interaction types that trigger promotion to "connection" */
const PROMOTION_TRIGGERS: ReadonlySet<InteractionType> = new Set([
  "reply_received",
  "meeting_booked",
  "introduction_received",
]);

export interface RecordInteractionInput {
  personId: string;
  userId: string;
  type: InteractionType;
  channel?: InteractionChannel;
  mode: InteractionMode;
  subject?: string;
  summary?: string;
  outcome?: InteractionOutcome;
  processRunId?: string;
  metadata?: Record<string, unknown>;
}

export async function recordInteraction(input: RecordInteractionInput) {
  const [interaction] = await db
    .insert(schema.interactions)
    .values({
      personId: input.personId,
      userId: input.userId,
      type: input.type,
      channel: input.channel ?? "email",
      mode: input.mode,
      subject: input.subject,
      summary: input.summary,
      outcome: input.outcome,
      processRunId: input.processRunId,
      metadata: input.metadata,
    })
    .returning();

  // Update lastInteractionAt on the person
  await db
    .update(schema.people)
    .set({
      lastInteractionAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.people.id, input.personId));

  // Auto-promote visibility if this is a promotion trigger
  if (PROMOTION_TRIGGERS.has(input.type)) {
    const person = await getPersonById(input.personId);
    if (person && person.visibility === "internal") {
      await updatePersonVisibility(input.personId, "connection");
    }
  }

  // Auto-update trust level based on outcome
  if (input.outcome === "positive") {
    const person = await getPersonById(input.personId);
    if (person && person.trustLevel === "cold") {
      await db
        .update(schema.people)
        .set({ trustLevel: "familiar" as PersonTrustLevel, updatedAt: new Date() })
        .where(eq(schema.people.id, input.personId));
    }
  }

  return interaction;
}

export async function listInteractions(personId: string) {
  return db
    .select()
    .from(schema.interactions)
    .where(eq(schema.interactions.personId, personId))
    .orderBy(desc(schema.interactions.createdAt));
}

/**
 * Check if a person has an interaction of a given type since a given date.
 * Used by the gate primitive to evaluate engagement conditions (Brief 121).
 *
 * @param personId - The person to check
 * @param type - Interaction type to look for (e.g. "reply_received")
 * @param since - Only count interactions after this date
 * @returns true if at least one matching interaction exists
 */
export async function hasInteractionSince(
  personId: string,
  type: InteractionType,
  since: Date,
): Promise<boolean> {
  const [match] = await db
    .select({ id: schema.interactions.id })
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.personId, personId),
        eq(schema.interactions.type, type),
        gte(schema.interactions.createdAt, since),
      ),
    )
    .limit(1);

  return !!match;
}

/**
 * Check if a person has ANY interaction since a given date (regardless of type).
 * Used by the gate primitive's "any" engagement mode (Brief 121).
 */
export async function hasAnyInteractionSince(
  personId: string,
  since: Date,
): Promise<boolean> {
  const [match] = await db
    .select({ id: schema.interactions.id })
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.personId, personId),
        gte(schema.interactions.createdAt, since),
      ),
    )
    .limit(1);

  return !!match;
}

/**
 * Get recent interactions for a person, optionally filtered by type.
 * Returns full interaction records with person name context.
 * Used by outreach dedup (Brief 151) and cycle auto-restart context injection.
 *
 * @param personId - The person to query
 * @param type - Interaction type filter (e.g. "outreach_sent")
 * @param since - Only return interactions after this date
 * @param processRunId - Optional: filter to a specific process run
 */
export async function getRecentInteractionsForPerson(
  personId: string,
  type: InteractionType,
  since: Date,
  processRunId?: string,
): Promise<Array<{
  id: string;
  personId: string;
  personName: string | null;
  channel: string;
  sentAt: Date;
  subject: string | null;
  processRunId: string | null;
}>> {
  const conditions = [
    eq(schema.interactions.personId, personId),
    eq(schema.interactions.type, type),
    gte(schema.interactions.createdAt, since),
  ];

  if (processRunId) {
    conditions.push(eq(schema.interactions.processRunId, processRunId));
  }

  const rows = await db
    .select({
      id: schema.interactions.id,
      personId: schema.interactions.personId,
      personName: schema.people.name,
      channel: schema.interactions.channel,
      sentAt: schema.interactions.createdAt,
      subject: schema.interactions.subject,
      processRunId: schema.interactions.processRunId,
    })
    .from(schema.interactions)
    .leftJoin(schema.people, eq(schema.interactions.personId, schema.people.id))
    .where(and(...conditions))
    .orderBy(desc(schema.interactions.createdAt));

  return rows;
}

export async function listInteractionsByUser(userId: string) {
  return db
    .select()
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId))
    .orderBy(desc(schema.interactions.createdAt));
}

/**
 * List all people with interaction stats for pipeline overview.
 * Returns people + last interaction date + interaction count.
 */
export async function listPeopleWithStats(userId: string) {
  const people = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.userId, userId))
    .orderBy(desc(schema.people.createdAt));

  if (people.length === 0) return [];

  const personIds = people.map((p) => p.id);
  const interactions = await db
    .select()
    .from(schema.interactions)
    .where(inArray(schema.interactions.personId, personIds))
    .orderBy(desc(schema.interactions.createdAt));

  // Group interactions by personId
  const interactionsByPerson = new Map<string, typeof interactions>();
  for (const i of interactions) {
    const existing = interactionsByPerson.get(i.personId) ?? [];
    existing.push(i);
    interactionsByPerson.set(i.personId, existing);
  }

  return people.map((p) => {
    const personInteractions = interactionsByPerson.get(p.id) ?? [];
    const lastInteraction = personInteractions[0];
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      organization: p.organization,
      role: p.role,
      source: p.source,
      interactionCount: personInteractions.length,
      lastInteractionDate: lastInteraction?.createdAt?.toISOString() ?? null,
      lastInteractionType: lastInteraction?.type ?? null,
      lastOutcome: lastInteraction?.outcome ?? null,
    };
  });
}

// ============================================================
// Person-Scoped Memory Helpers
// ============================================================

export async function getPersonMemories(personId: string) {
  return db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "person"),
        eq(schema.memories.scopeId, personId),
        eq(schema.memories.active, true),
      ),
    )
    .orderBy(
      desc(schema.memories.reinforcementCount),
      desc(schema.memories.confidence),
    );
}

export async function addPersonMemory(input: {
  personId: string;
  type: schema.MemoryType;
  content: string;
  source?: schema.MemorySource;
  metadata?: Record<string, unknown>;
}) {
  const memory = await writeMemory(db, {
    scopeType: "person",
    scopeId: input.personId,
    type: input.type,
    content: input.content,
    source: input.source ?? "system",
    metadata: input.metadata,
  });
  return memory;
}

// ============================================================
// Voice Model Readiness (Brief 124 — Ghost Mode)
// ============================================================

/** Minimum voice model samples required before ghost mode is available */
const VOICE_MODEL_MIN_SAMPLES = 5;

/**
 * Check if a user has enough voice model samples for ghost mode.
 * Voice model memories are scoped to "self" with scopeId = userId
 * and type = "voice_model". Ghost mode requires minimum 5 samples.
 */
export async function getVoiceModelReadiness(userId: string): Promise<{
  ready: boolean;
  sampleCount: number;
}> {
  const [result] = await db
    .select({ count: count() })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.type, "voice_model"),
        eq(schema.memories.active, true),
      ),
    );

  const sampleCount = result?.count ?? 0;
  return {
    ready: sampleCount >= VOICE_MODEL_MIN_SAMPLES,
    sampleCount,
  };
}

/**
 * Load voice model samples for a user — used by the voiceModelLoader callback
 * injected into the harness pipeline for ghost mode.
 *
 * Returns formatted raw email samples for LLM voice matching, or null
 * if insufficient samples.
 */
export async function loadVoiceModelSamples(userId: string): Promise<string | null> {
  // Single query: load up to 10 most recent samples. If fewer than 5 exist,
  // voice model isn't ready — return null without a separate COUNT query.
  const samples = await db
    .select({
      content: schema.memories.content,
      metadata: schema.memories.metadata,
    })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.type, "voice_model"),
        eq(schema.memories.active, true),
      ),
    )
    .orderBy(desc(schema.memories.createdAt))
    .limit(10);

  if (samples.length < VOICE_MODEL_MIN_SAMPLES) return null;

  return samples
    .map((s, i) => {
      const meta = s.metadata as Record<string, unknown> | null;
      const subject = meta?.subject ? ` (Re: ${meta.subject})` : "";
      return `--- Sample ${i + 1}${subject} ---\n${s.content}`;
    })
    .join("\n\n");
}

/**
 * Check person-scoped memory isolation: only return memories for people
 * owned by the specified user. Uses join path: memories.scopeId → people.id → people.userId.
 */
export async function getPersonMemoriesForUser(personId: string, userId: string) {
  const person = await getPersonById(personId);
  if (!person || person.userId !== userId) {
    return []; // Isolation: user can't access other users' person memories
  }
  return getPersonMemories(personId);
}
