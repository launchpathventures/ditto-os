/**
 * Library Manager — Process Model Library CRUD + Lifecycle (Brief 104)
 *
 * Manages the lifecycle of process models through the curation pipeline:
 * nominated → testing → standardised → review → published → archived
 *
 * Key functions:
 * - nominateForLibrary() — create entry, start curation pipeline
 * - getLibraryModels() — query with filtering by industry/function/complexity
 * - publishToLibrary() — requires admin approval (cannot be bypassed)
 * - archiveModel() — deprecate without breaking existing adoptions
 *
 * Also updates findProcessModel() from Brief 103 to query the DB table
 * instead of the filesystem.
 *
 * Provenance: npm registry (check registry before building from source)
 *
 * Brief 104
 */

import { db, schema } from "../db";
import { eq, and, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ValidationReport } from "./system-agents/process-validator";
import type { ProcessModelMatch } from "./system-agents/process-model-lookup";

// ============================================================
// Types
// ============================================================

export interface NominateOptions {
  slug: string;
  name: string;
  description: string;
  processDefinition: Record<string, unknown>;
  industryTags?: string[];
  functionTags?: string[];
  complexity?: "simple" | "moderate" | "complex";
  source?: "template" | "built" | "community";
  qualityCriteria?: string[];
  nominatedBy?: string;
}

export interface LibraryFilter {
  industry?: string;
  function?: string;
  complexity?: "simple" | "moderate" | "complex";
  status?: string;
}

export interface PublishOptions {
  processModelId: string;
  approvedBy: string;
}

// ============================================================
// nominateForLibrary
// ============================================================

/**
 * Create a new library entry in "nominated" status and start the
 * curation pipeline process run.
 */
export async function nominateForLibrary(
  opts: NominateOptions,
): Promise<{ id: string; slug: string; processRunId?: string }> {
  const [model] = await db
    .insert(schema.processModels)
    .values({
      id: randomUUID(),
      slug: opts.slug,
      name: opts.name,
      description: opts.description,
      processDefinition: opts.processDefinition,
      industryTags: opts.industryTags || [],
      functionTags: opts.functionTags || [],
      complexity: opts.complexity || "moderate",
      source: opts.source || "template",
      qualityCriteria: opts.qualityCriteria || [],
      nominatedBy: opts.nominatedBy || "system",
      status: "nominated",
      version: 1,
    })
    .returning({ id: schema.processModels.id, slug: schema.processModels.slug });

  // Start the curation pipeline process run (AC5)
  let processRunId: string | undefined;
  try {
    const { startProcessRun } = await import("./heartbeat");
    processRunId = await startProcessRun("library-curation", {
      processModelId: model.id,
      nominatedBy: opts.nominatedBy || "system",
    });
  } catch {
    // Curation process may not be synced yet (e.g., fresh install).
    // The model is still nominated — curation can be triggered manually.
  }

  return { ...model, processRunId };
}

// ============================================================
// getLibraryModels
// ============================================================

/**
 * Query the Process Model Library with optional filtering.
 * Returns published models by default; pass status to query other states.
 */
export async function getLibraryModels(
  filter?: LibraryFilter,
): Promise<Array<typeof schema.processModels.$inferSelect>> {
  const conditions = [];

  // Default to published if no status filter
  const statusFilter = filter?.status || "published";
  conditions.push(eq(schema.processModels.status, statusFilter as never));

  if (filter?.complexity) {
    conditions.push(eq(schema.processModels.complexity, filter.complexity));
  }

  const models = await db
    .select()
    .from(schema.processModels)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions));

  // Post-filter by industry and function tags (JSON array containment)
  let filtered = models;
  if (filter?.industry) {
    const tag = filter.industry.toLowerCase();
    filtered = filtered.filter((m) =>
      (m.industryTags as string[] || []).some((t) => t.toLowerCase() === tag),
    );
  }
  if (filter?.function) {
    const tag = filter.function.toLowerCase();
    filtered = filtered.filter((m) =>
      (m.functionTags as string[] || []).some((t) => t.toLowerCase() === tag),
    );
  }

  return filtered;
}

// ============================================================
// publishToLibrary
// ============================================================

/**
 * Publish a model to the library. Requires admin approval — cannot be bypassed.
 *
 * Updates create new versions; existing adoptions reference specific versions.
 * If a published model with the same slug exists, the version is bumped.
 */
export async function publishToLibrary(
  opts: PublishOptions,
): Promise<{ id: string; version: number }> {
  if (!opts.approvedBy) {
    throw new Error("Admin approval required: approvedBy must be provided");
  }

  const [model] = await db
    .select()
    .from(schema.processModels)
    .where(eq(schema.processModels.id, opts.processModelId))
    .limit(1);

  if (!model) {
    throw new Error(`Process model ${opts.processModelId} not found`);
  }

  if (model.status !== "review" && model.status !== "standardised") {
    throw new Error(
      `Cannot publish model in "${model.status}" status — must be in "review" or "standardised" status`,
    );
  }

  // Check if there's already a different published version with this slug
  const [existingPublished] = await db
    .select({ id: schema.processModels.id, version: schema.processModels.version })
    .from(schema.processModels)
    .where(
      and(
        eq(schema.processModels.slug, model.slug),
        eq(schema.processModels.status, "published"),
        ne(schema.processModels.id, opts.processModelId),
      ),
    )
    .limit(1);

  const newVersion = existingPublished ? existingPublished.version + 1 : model.version;

  // If there's an existing published version (different row), archive it
  if (existingPublished) {
    await db
      .update(schema.processModels)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(schema.processModels.id, existingPublished.id));
  }

  // Publish the new version
  await db
    .update(schema.processModels)
    .set({
      status: "published",
      version: newVersion,
      approvedBy: opts.approvedBy,
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.processModels.id, opts.processModelId));

  return { id: opts.processModelId, version: newVersion };
}

// ============================================================
// archiveModel
// ============================================================

/**
 * Archive a model (soft delete). Does not remove — existing references preserved.
 */
export async function archiveModel(processModelId: string): Promise<void> {
  await db
    .update(schema.processModels)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(schema.processModels.id, processModelId));
}

// ============================================================
// findProcessModel (DB-backed, replaces Brief 103 filesystem version)
// ============================================================

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can",
  "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "and",
  "but", "or", "nor", "not", "so", "yet", "both", "either",
  "neither", "each", "every", "all", "any", "few", "more",
  "most", "other", "some", "such", "no", "only", "own", "same",
  "than", "too", "very", "just", "because", "this", "that",
  "these", "those", "it", "its", "if", "then", "else",
]);

function tokenize(text: string): string[] {
  return text
    .split(/[^a-z0-9-]+/)
    .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

/**
 * Search the Process Model Library (DB) for a matching published process.
 *
 * Same matching algorithm as Brief 103's filesystem version:
 * 1. Keyword overlap between description and model name/description
 * 2. Industry context keywords boost matches
 * 3. Slug containment bonus
 *
 * Returns the best match above the confidence threshold, or null.
 */
export function findProcessModelFromDb(
  models: Array<{ slug: string; name: string; description: string | null }>,
  subGoalDescription: string,
  opts?: {
    industryKeywords?: string[];
    confidenceThreshold?: number;
  },
): ProcessModelMatch | null {
  if (models.length === 0) return null;

  const threshold = opts?.confidenceThreshold ?? 0.3;
  const descLower = subGoalDescription.toLowerCase();
  const descTokens = tokenize(descLower);
  const industryTokens = (opts?.industryKeywords || []).map((k) => k.toLowerCase());

  let bestMatch: ProcessModelMatch | null = null;
  let bestScore = 0;

  for (const model of models) {
    const modelText = `${model.name} ${model.description || ""}`.toLowerCase();
    const modelTokens = tokenize(modelText);

    if (modelTokens.length === 0) continue;

    const matchedTokens = modelTokens.filter((t) => descTokens.includes(t));
    let score = matchedTokens.length / modelTokens.length;

    if (industryTokens.length > 0) {
      const industryMatches = industryTokens.filter((k) => modelText.includes(k));
      score += industryMatches.length * 0.1;
    }

    const slugTokens = model.slug.split("-");
    const slugMatches = slugTokens.filter((t) => descLower.includes(t));
    if (slugMatches.length > 0) {
      score += slugMatches.length * 0.15;
    }

    score = Math.min(score, 1.0);

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = {
        slug: model.slug,
        name: model.name,
        description: model.description || "",
        confidence: Math.round(score * 100) / 100,
        reasoning: `Library match: ${matchedTokens.length} keyword overlaps with "${model.name}"`,
        templatePath: "", // DB-backed models don't have file paths
      };
    }
  }

  return bestMatch;
}

/**
 * Query DB for published models and find the best match.
 * Drop-in replacement for the filesystem-based findProcessModel().
 */
export async function findProcessModelInLibrary(
  subGoalDescription: string,
  opts?: {
    industryKeywords?: string[];
    confidenceThreshold?: number;
  },
): Promise<ProcessModelMatch | null> {
  const publishedModels = await db
    .select({
      slug: schema.processModels.slug,
      name: schema.processModels.name,
      description: schema.processModels.description,
    })
    .from(schema.processModels)
    .where(eq(schema.processModels.status, "published"));

  return findProcessModelFromDb(publishedModels, subGoalDescription, opts);
}
