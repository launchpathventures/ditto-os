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
import { eq, and, desc } from "drizzle-orm";
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

export async function listInteractionsByUser(userId: string) {
  return db
    .select()
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId))
    .orderBy(desc(schema.interactions.createdAt));
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
  const [memory] = await db
    .insert(schema.memories)
    .values({
      scopeType: "person",
      scopeId: input.personId,
      type: input.type,
      content: input.content,
      source: input.source ?? "system",
      metadata: input.metadata,
    })
    .returning();
  return memory;
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
