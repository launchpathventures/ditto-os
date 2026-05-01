/**
 * Ditto — Network Seed: Export & Import
 *
 * Seed export (Network side): assembles everything Alex knows about a user
 * into a JSON payload matching the stable seed schema (Brief 087).
 *
 * Seed import (Workspace side): ingests the seed JSON on first boot,
 * creating self-scoped memories, people records, and interaction summaries.
 *
 * Provenance: Brief 089, ADR-025 section 6 (workspace seed).
 */

import { db, schema } from "../db";
import type { MemoryType, InteractionType, InteractionMode, InteractionOutcome } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { writeMemory } from "./legibility/write-memory";

// ============================================================
// Seed Schema (stable contract — Brief 087)
// ============================================================

export interface SeedMemory {
  scopeType: "self";
  type: string;
  content: string;
  confidence: number;
  shared: boolean;
}

export interface SeedPerson {
  id: string;
  name: string;
  email?: string;
  organization?: string;
  role?: string;
  visibility: "internal" | "connection";
  trustLevel: "cold" | "familiar" | "trusted";
  personaAssignment?: "alex" | "mira";
}

export interface SeedInteractionSummary {
  personId: string;
  type: string;
  mode: string;
  summary?: string;
  outcome?: string;
  createdAt: string; // ISO8601
}

export interface SeedPlan {
  mode: "selling" | "connecting";
  goal: string;
  status: "active" | "complete";
  createdAt: string; // ISO8601
}

export interface SeedTrustSettings {
  sellingOutreach: "supervised" | "spot_checked" | "autonomous";
  connectingIntroduction: "critical" | "supervised";
}

export interface WorkspaceSeed {
  version: "1";
  userId: string;
  personaAssignment: "alex" | "mira";
  memories: SeedMemory[];
  people: SeedPerson[];
  interactionSummaries: SeedInteractionSummary[];
  plans: SeedPlan[];
  trustSettings: SeedTrustSettings;
}

// ============================================================
// Export (Network side)
// ============================================================

/**
 * Export seed data for a user. Assembles self-scoped memories,
 * people records, interaction summaries, and trust settings.
 */
export async function exportSeed(userId: string): Promise<WorkspaceSeed> {
  // Get the network user
  const [networkUser] = await db
    .select()
    .from(schema.networkUsers)
    .where(eq(schema.networkUsers.id, userId))
    .limit(1);

  // Get self-scoped memories for this user
  const memories = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.active, true),
      ),
    );

  // Get people for this user
  const people = await db
    .select()
    .from(schema.people)
    .where(eq(schema.people.userId, userId));

  // Get interaction summaries for this user
  const interactions = await db
    .select()
    .from(schema.interactions)
    .where(eq(schema.interactions.userId, userId));

  // Build seed
  const seed: WorkspaceSeed = {
    version: "1",
    userId,
    personaAssignment: networkUser?.personaAssignment ?? "alex",
    memories: memories.map((m) => ({
      scopeType: "self" as const,
      type: m.type,
      content: m.content,
      confidence: m.confidence,
      shared: m.shared,
    })),
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email ?? undefined,
      organization: p.organization ?? undefined,
      role: p.role ?? undefined,
      visibility: p.visibility as "internal" | "connection",
      trustLevel: p.trustLevel as "cold" | "familiar" | "trusted",
      personaAssignment: p.personaAssignment ?? undefined,
    })),
    interactionSummaries: interactions.map((i) => ({
      personId: i.personId,
      type: i.type,
      mode: i.mode,
      summary: i.summary ?? undefined,
      outcome: i.outcome ?? undefined,
      createdAt: i.createdAt.toISOString(),
    })),
    plans: [], // Plans are not yet stored in a dedicated table — placeholder for seed schema stability
    trustSettings: {
      sellingOutreach: "supervised",
      connectingIntroduction: "critical",
    },
  };

  return seed;
}

// ============================================================
// Import (Workspace side)
// ============================================================

export interface ImportResult {
  memoriesImported: number;
  peopleImported: number;
  interactionsImported: number;
}

/**
 * Import seed data into a workspace database.
 * Creates self-scoped memories, people records, and interaction summaries.
 */
export async function importSeed(
  seed: WorkspaceSeed,
  targetDb?: typeof db,
): Promise<ImportResult> {
  const database = targetDb ?? db;
  const result: ImportResult = {
    memoriesImported: 0,
    peopleImported: 0,
    interactionsImported: 0,
  };

  // Import memories as self-scoped
  for (const memory of seed.memories) {
    await writeMemory(database, {
      scopeType: "self",
      scopeId: seed.userId,
      type: memory.type as MemoryType,
      content: memory.content,
      confidence: memory.confidence,
      shared: memory.shared,
      source: "system",
      sourceId: "network-seed",
      active: true,
    });
    result.memoriesImported++;
  }

  // Import people — create new records preserving visibility and persona assignment
  // We create new IDs on the workspace side (these are workspace-local records)
  const personIdMap = new Map<string, string>(); // networkId → workspaceId
  for (const person of seed.people) {
    const workspaceId = randomUUID();
    personIdMap.set(person.id, workspaceId);

    await database.insert(schema.people).values({
      id: workspaceId,
      userId: seed.userId,
      name: person.name,
      email: person.email ?? null,
      organization: person.organization ?? null,
      role: person.role ?? null,
      source: "manual",
      visibility: person.visibility,
      trustLevel: person.trustLevel,
      personaAssignment: person.personaAssignment ?? null,
    });
    result.peopleImported++;
  }

  // Import interaction summaries — remap person IDs to workspace IDs
  for (const interaction of seed.interactionSummaries) {
    const workspacePersonId = personIdMap.get(interaction.personId);
    if (!workspacePersonId) continue;

    await database.insert(schema.interactions).values({
      personId: workspacePersonId,
      userId: seed.userId,
      type: interaction.type as InteractionType,
      mode: interaction.mode as InteractionMode,
      summary: interaction.summary ?? null,
      outcome: (interaction.outcome as InteractionOutcome) ?? null,
      createdAt: new Date(interaction.createdAt),
    });
    result.interactionsImported++;
  }

  return result;
}

// ============================================================
// First-boot detection (Workspace side)
// ============================================================

/**
 * Check if this is a first-boot workspace that should import a seed.
 * Conditions: DITTO_NETWORK_URL is set AND no self-scoped memories exist.
 */
export async function isFirstBoot(targetDb?: typeof db): Promise<boolean> {
  if (!process.env.DITTO_NETWORK_URL) {
    return false;
  }

  const database = targetDb ?? db;

  const selfMemories = await database
    .select({ id: schema.memories.id })
    .from(schema.memories)
    .where(eq(schema.memories.scopeType, "self"))
    .limit(1);

  return selfMemories.length === 0;
}

/**
 * Fetch and import seed from the Network Service.
 * Called on first boot when DITTO_NETWORK_URL is configured.
 */
export async function fetchAndImportSeed(): Promise<ImportResult | null> {
  const networkUrl = process.env.DITTO_NETWORK_URL;
  const networkToken = process.env.DITTO_NETWORK_TOKEN;

  if (!networkUrl || !networkToken) {
    return null;
  }

  const response = await fetch(`${networkUrl}/api/v1/network/seed`, {
    headers: {
      Authorization: `Bearer ${networkToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Seed fetch failed: ${response.status} ${response.statusText}`);
  }

  const seed: WorkspaceSeed = await response.json();
  return importSeed(seed);
}
