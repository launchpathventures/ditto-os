/**
 * Ditto — User Model
 *
 * Structured user understanding across 9 dimensions, stored as
 * self-scoped memories. Populated progressively — most important
 * first (problems, tasks for immediate value), deepened across
 * sessions (vision, goals for strategic guidance).
 *
 * The 9 dimensions (Insight-093):
 * 1. problems — What's not working, what frustrates them
 * 2. tasks — Immediate work that needs doing
 * 3. work — How they work, tools, patterns, team
 * 4. challenges — Recurring difficulties
 * 5. communication — How they prefer to interact
 * 6. frustrations — What they dislike about current tools/processes
 * 7. vision — Where they want to be
 * 8. goals — Specific targets they're working toward
 * 9. concerns — Worries, risks, anxieties about change
 *
 * Provenance: Insight-093 (onboarding is deep intake), Brief 040.
 */

import { db, schema } from "../db";
import { eq, and, like } from "drizzle-orm";
import { writeMemory, updateMemory } from "./legibility/write-memory";

export const USER_MODEL_DIMENSIONS = [
  "problems",
  "tasks",
  "work",
  "challenges",
  "communication",
  "frustrations",
  "vision",
  "goals",
  "concerns",
] as const;

export type UserModelDimension = (typeof USER_MODEL_DIMENSIONS)[number];

/** Priority order: populate these first for immediate value */
export const DIMENSION_PRIORITY: UserModelDimension[] = [
  "problems",
  "tasks",
  "work",
  "challenges",
  "communication",
  "frustrations",
  "vision",
  "goals",
  "concerns",
];

export interface UserModelEntry {
  dimension: UserModelDimension;
  content: string;
  confidence: number;
}

export interface UserModel {
  entries: UserModelEntry[];
  completeness: number; // 0-1, how many dimensions populated
  populatedDimensions: UserModelDimension[];
  missingDimensions: UserModelDimension[];
}

/**
 * Read the current user model from self-scoped memories.
 * User model entries are stored with type "user_model" and content
 * prefixed with the dimension name.
 */
export async function getUserModel(userId: string): Promise<UserModel> {
  const memories = await db
    .select({
      content: schema.memories.content,
      confidence: schema.memories.confidence,
    })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.type, "user_model"),
        eq(schema.memories.active, true),
      ),
    );

  const entries: UserModelEntry[] = [];
  const populated = new Set<UserModelDimension>();

  for (const mem of memories) {
    // Parse dimension from content: "dimension: actual content"
    const colonIdx = mem.content.indexOf(":");
    if (colonIdx === -1) continue;

    const dim = mem.content.slice(0, colonIdx).trim() as UserModelDimension;
    if (!USER_MODEL_DIMENSIONS.includes(dim)) continue;

    const content = mem.content.slice(colonIdx + 1).trim();
    entries.push({ dimension: dim, content, confidence: mem.confidence });
    populated.add(dim);
  }

  const populatedDimensions = USER_MODEL_DIMENSIONS.filter((d) => populated.has(d));
  const missingDimensions = USER_MODEL_DIMENSIONS.filter((d) => !populated.has(d));

  return {
    entries,
    completeness: populatedDimensions.length / USER_MODEL_DIMENSIONS.length,
    populatedDimensions,
    missingDimensions,
  };
}

/**
 * Update a dimension of the user model. Creates or reinforces
 * a self-scoped memory entry.
 */
export async function updateUserModel(
  userId: string,
  dimension: UserModelDimension,
  content: string,
): Promise<void> {
  if (!USER_MODEL_DIMENSIONS.includes(dimension)) {
    throw new Error(`Invalid user model dimension: ${dimension}`);
  }

  const memoryContent = `${dimension}: ${content}`;

  // Check for existing entry for this dimension
  const existing = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.type, "user_model"),
        eq(schema.memories.active, true),
        like(schema.memories.content, `${dimension}:%`),
      ),
    );

  if (existing.length > 0) {
    // Update existing entry — replace content, bump reinforcement
    await updateMemory(db, existing[0].id, {
      content: memoryContent,
      reinforcementCount: existing[0].reinforcementCount + 1,
      lastReinforcedAt: new Date(),
      confidence: Math.min(0.95, existing[0].confidence + 0.1),
      updatedAt: new Date(),
    });
  } else {
    // Create new entry
    await writeMemory(db, {
      scopeType: "self",
      scopeId: userId,
      type: "user_model",
      content: memoryContent,
      source: "conversation",
      confidence: 0.5,
      active: true,
    });
  }
}

// ============================================================
// Behaviour Tracking (Brief 043)
// ============================================================

export interface WorkingPatterns {
  /** Typical login times (hour of day, 0-23) */
  typicalHours: number[];
  /** Average check frequency (sessions per day) */
  checkFrequency: number;
  /** Preferred surface */
  preferredSurface: "cli" | "telegram" | "web" | null;
  /** Total sessions observed */
  sessionsObserved: number;
}

/**
 * Update working patterns from session data.
 * Called on session creation to track when and how the user works.
 */
export async function updateWorkingPatterns(
  userId: string,
  surface: "cli" | "telegram" | "web",
): Promise<void> {
  const currentHour = new Date().getHours();

  // Read existing patterns from a self-scoped memory
  const [existing] = await db
    .select()
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.type, "context"),
        like(schema.memories.content, "working_patterns:%"),
        eq(schema.memories.active, true),
      ),
    )
    .limit(1);

  let patterns: WorkingPatterns;

  if (existing) {
    try {
      const jsonStr = existing.content.slice("working_patterns:".length).trim();
      patterns = JSON.parse(jsonStr);
    } catch {
      patterns = { typicalHours: [], checkFrequency: 0, preferredSurface: null, sessionsObserved: 0 };
    }

    // Update patterns
    if (!patterns.typicalHours.includes(currentHour)) {
      patterns.typicalHours.push(currentHour);
      patterns.typicalHours.sort((a, b) => a - b);
    }
    patterns.sessionsObserved++;
    // Simple frequency: sessions / days since first observed
    const daysSinceFirst = Math.max(
      1,
      (Date.now() - (existing.createdAt instanceof Date
        ? existing.createdAt.getTime()
        : Number(existing.createdAt))) / (24 * 60 * 60 * 1000),
    );
    patterns.checkFrequency = Math.round(patterns.sessionsObserved / daysSinceFirst * 10) / 10;
    // Track most used surface
    patterns.preferredSurface = surface;

    await updateMemory(db, existing.id, {
      content: `working_patterns:${JSON.stringify(patterns)}`,
      reinforcementCount: existing.reinforcementCount + 1,
      lastReinforcedAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    patterns = {
      typicalHours: [currentHour],
      checkFrequency: 1,
      preferredSurface: surface,
      sessionsObserved: 1,
    };

    await writeMemory(db, {
      scopeType: "self",
      scopeId: userId,
      type: "context",
      content: `working_patterns:${JSON.stringify(patterns)}`,
      source: "system",
      confidence: 0.5,
      active: true,
    });
  }
}

/**
 * Get working patterns for a user.
 */
export async function getWorkingPatterns(
  userId: string,
): Promise<WorkingPatterns | null> {
  const [mem] = await db
    .select({ content: schema.memories.content })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.scopeType, "self"),
        eq(schema.memories.scopeId, userId),
        eq(schema.memories.type, "context"),
        like(schema.memories.content, "working_patterns:%"),
        eq(schema.memories.active, true),
      ),
    )
    .limit(1);

  if (!mem) return null;

  try {
    return JSON.parse(mem.content.slice("working_patterns:".length).trim());
  } catch {
    return null;
  }
}

/**
 * Get a formatted summary of the user model for context injection.
 * Returns a concise text block suitable for the Self's system prompt.
 */
export async function getUserModelSummary(userId: string): Promise<string> {
  const model = await getUserModel(userId);

  if (model.entries.length === 0) {
    return "No user model yet. This is a new user — focus on understanding their problems and immediate tasks.";
  }

  const lines = model.entries.map(
    (e) => `[${e.dimension}] ${e.content}`,
  );

  const summary = lines.join("\n");
  const completenessPercent = Math.round(model.completeness * 100);

  return `User understanding (${completenessPercent}% complete):\n${summary}${
    model.missingDimensions.length > 0
      ? `\n\nNot yet explored: ${model.missingDimensions.join(", ")}`
      : ""
  }`;
}
