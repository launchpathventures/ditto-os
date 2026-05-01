/**
 * Ditto — Frontdoor-to-Workspace Memory Bridge (Brief 148)
 *
 * Persists frontdoor learned context as person-scoped memories
 * so the workspace Self can greet returning users with full context.
 *
 * Provenance: createMemoryFromFeedback() pattern from feedback-recorder.ts
 */

import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import { findPersonByEmailGlobal } from "./people";
import type { LearnedContext } from "./network-chat";
import { writeMemory, updateMemory } from "./legibility/write-memory";

/** Map learned field keys to human-readable labels for memory content */
const LEARNED_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  business: "Business",
  role: "Role",
  industry: "Industry",
  location: "Location",
  target: "Looking for",
  problem: "Problem",
  channel: "Preferred channel",
  phone: "Phone",
};

/**
 * Persist frontdoor learned context as person-scoped memories.
 * Called once at magic link generation time — one write per transition.
 *
 * Each non-null learned field becomes a separate memory with:
 * - scopeType: "person", scopeId: personId
 * - type: "user_model", source: "conversation"
 * - Human-readable content: "Business: Sarah's Plumbing"
 *
 * Deduplication: checks existing person memories by content prefix (e.g. "Business:").
 * Updates if changed, skips if identical.
 */
export async function persistLearnedContext(sessionId: string): Promise<void> {
  // Load the chat session
  const [session] = await db
    .select({
      learned: schema.chatSessions.learned,
      authenticatedEmail: schema.chatSessions.authenticatedEmail,
    })
    .from(schema.chatSessions)
    .where(eq(schema.chatSessions.sessionId, sessionId));

  if (!session) {
    console.warn(`[memory-bridge] No chat session found for sessionId=${sessionId}`);
    return;
  }

  const learned = session.learned as LearnedContext | null;
  if (!learned) {
    return; // No learned context to persist
  }

  const email = session.authenticatedEmail;
  if (!email) {
    console.warn(`[memory-bridge] No authenticated email on session ${sessionId}`);
    return;
  }

  // Find the person record — use global lookup since we don't know the userId
  const person = await findPersonByEmailGlobal(email);
  if (!person) {
    console.warn(`[memory-bridge] No person record for ${email} — skipping memory persistence`);
    return;
  }

  // Load existing person-scoped user_model memories for dedup
  const existingMemories = await db
    .select({
      id: schema.memories.id,
      content: schema.memories.content,
    })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "person"),
        eq(schema.memories.scopeId, person.id),
        eq(schema.memories.type, "user_model"),
        eq(schema.memories.source, "conversation"),
        eq(schema.memories.active, true),
      ),
    );

  // Index existing memories by their label prefix (e.g. "Business:")
  const existingByPrefix = new Map<string, { id: string; content: string }>();
  for (const mem of existingMemories) {
    const colonIdx = mem.content.indexOf(":");
    if (colonIdx > 0) {
      const prefix = mem.content.slice(0, colonIdx + 1);
      existingByPrefix.set(prefix, mem);
    }
  }

  // Batch writes: collect updates and inserts, then execute in parallel
  const writes: Promise<unknown>[] = [];

  for (const [field, value] of Object.entries(learned)) {
    if (!value) continue;

    const label = LEARNED_FIELD_LABELS[field] || field;
    const content = `${label}: ${value}`;
    const prefix = `${label}:`;

    const existing = existingByPrefix.get(prefix);

    if (existing) {
      if (existing.content === content) {
        continue; // Identical — skip
      }
      // Update existing memory with new content
      writes.push(updateMemory(db, existing.id, { content }));
    } else {
      // Create new memory
      writes.push(
        writeMemory(db, {
          scopeType: "person",
          scopeId: person.id,
          type: "user_model",
          content,
          source: "conversation",
          confidence: 0.7,
          active: true,
        }),
      );
    }
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }
}
