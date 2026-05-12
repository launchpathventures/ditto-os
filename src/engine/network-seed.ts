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
import { writeMemory, type MemoryDb } from "./legibility/write-memory";

export const NETWORK_SEED_ATTEMPT_SOURCE_ID = "network-seed-attempt";

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

export type SeedAttemptState = "not_attempted" | "attempted" | "imported";

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

  return (await getSeedAttemptState(database)) === "not_attempted";
}

export async function getSeedAttemptState(targetDb?: typeof db): Promise<SeedAttemptState> {
  const database = targetDb ?? db;

  const selfMemories = await database
    .select({
      id: schema.memories.id,
      sourceId: schema.memories.sourceId,
    })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.active, true),
      ),
    );

  if (selfMemories.length === 0) return "not_attempted";
  const onlySentinels = selfMemories.every(
    (memory) => memory.sourceId === NETWORK_SEED_ATTEMPT_SOURCE_ID,
  );
  return onlySentinels ? "attempted" : "imported";
}

export async function writeSeedAttemptSentinel(
  userId: string,
  reason: "empty_seed" | "fetch_failed",
  targetDb?: typeof db,
): Promise<void> {
  const database = targetDb ?? db;

  const existing = await database
    .select({ id: schema.memories.id })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.sourceId, NETWORK_SEED_ATTEMPT_SOURCE_ID),
        eq(schema.memories.active, true),
      ),
    )
    .limit(1);

  if (existing.length > 0) return;

  await writeMemory(database, {
    scopeType: "self",
    scopeId: userId,
    type: "context",
    content:
      reason === "fetch_failed"
        ? "Network seed fetch was attempted during workspace first boot but the Network Service was unavailable."
        : "Network seed import was attempted during workspace first boot and no self memories were returned.",
    confidence: 1,
    shared: false,
    source: "system",
    sourceId: NETWORK_SEED_ATTEMPT_SOURCE_ID,
    active: true,
  });
}

export async function writeSeedFetchFailureSentinelFromEnv(
  targetDb?: typeof db,
): Promise<boolean> {
  const userId = process.env.DITTO_WORKSPACE_USER_ID;
  if (!userId) return false;
  await writeSeedAttemptSentinel(userId, "fetch_failed", targetDb);
  return true;
}

/**
 * Write a sentinel self-scoped memory marking that first-boot seed processing
 * has completed for this user, even if the network had no prior data to import.
 *
 * Without this, a workspace provisioned for a brand-new user (no prior network
 * interactions) remains stuck in first-boot state forever: isFirstBoot keeps
 * returning true and the deep health check (`/healthz?deep=true`) reports
 * `seed: not_imported` and 503s, which fails provisioner waitForDeepHealth.
 */
export async function writeFirstBootSentinel(
  userId: string,
  targetDb?: MemoryDb,
): Promise<void> {
  const database: MemoryDb = targetDb ?? db;
  await writeMemory(database, {
    scopeType: "self",
    scopeId: userId,
    type: "context",
    content: `Workspace provisioned on ${new Date().toISOString().split("T")[0]}. No prior network history — this is a fresh start.`,
    confidence: 1.0,
    shared: false,
    source: "system",
    sourceId: "network-seed-sentinel",
    active: true,
  });
}

/**
 * Fetch and import seed from the Network Service.
 * Called on first boot when DITTO_NETWORK_URL is configured.
 *
 * If the network returns an empty seed (e.g., admin-provisioned user with no
 * prior interactions), writes a sentinel self-memory so the workspace exits
 * the first-boot state and passes the deep health check.
 */
export async function fetchAndImportSeed(
  targetDb?: typeof db,
): Promise<ImportResult | null> {
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
  const result = await importSeed(seed, targetDb);
  if (result.memoriesImported === 0) {
    await writeSeedAttemptSentinel(seed.userId, "empty_seed", targetDb);
  }
  return result;
}
