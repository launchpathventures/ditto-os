/**
 * Process Model Lookup — Search Process Model Library for matching models
 *
 * First check in the find-or-build routing pipeline. Before building
 * from scratch, check if a library model exists — adopt + adapt is cheap.
 *
 * Brief 104: Now queries the processModels DB table instead of filesystem.
 * The filesystem fallback (loadTemplates) is retained for backward
 * compatibility when the DB is empty (e.g., fresh installs before seeding).
 *
 * Provenance: Package manager pattern (npm registry, apt) — check registry
 * before building from source.
 *
 * Brief 103, Brief 104
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";

// ============================================================
// Types
// ============================================================

export interface ProcessModelMatch {
  /** Template slug (e.g., "person-research") */
  slug: string;
  /** Template name */
  name: string;
  /** Template description */
  description: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Why this template matched */
  reasoning: string;
  /** Path to the template YAML file (empty for DB-backed models) */
  templatePath: string;
}

interface TemplateManifest {
  slug: string;
  name: string;
  description: string;
  filePath: string;
}

// ============================================================
// Template loading (filesystem fallback)
// ============================================================

let cachedTemplates: TemplateManifest[] | null = null;

function loadTemplates(templatesDir?: string): TemplateManifest[] {
  if (cachedTemplates) return cachedTemplates;

  const dir = templatesDir || path.resolve(process.cwd(), "processes/templates");

  if (!fs.existsSync(dir)) {
    cachedTemplates = [];
    return cachedTemplates;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const templates: TemplateManifest[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = YAML.parse(content) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== "object") continue;

      const slug = (parsed.id as string) || file.replace(/\.ya?ml$/, "");
      const name = (parsed.name as string) || slug;
      const description = (parsed.description as string) || "";

      templates.push({ slug, name, description, filePath });
    } catch {
      continue;
    }
  }

  cachedTemplates = templates;
  return cachedTemplates;
}

/** Clear cache (for testing). */
export function clearTemplateCache(): void {
  cachedTemplates = null;
}

// ============================================================
// Matching (shared algorithm)
// ============================================================

/**
 * Search the Process Model Library for a matching process.
 *
 * Brief 104: Queries the processModels DB table first (published models).
 * Falls back to filesystem templates/ if no DB models exist.
 *
 * Matching strategy:
 * 1. Keyword overlap between sub-goal description and model name/description
 * 2. Industry context keywords boost matches in relevant domains
 * 3. Slug containment bonus
 *
 * Returns the best match above the confidence threshold, or null.
 */
export async function findProcessModel(
  subGoalDescription: string,
  opts?: {
    industryKeywords?: string[];
    templatesDir?: string;
    confidenceThreshold?: number;
  },
): Promise<ProcessModelMatch | null> {
  // Try DB first (Brief 104)
  const publishedModels = await db
    .select({
      slug: schema.processModels.slug,
      name: schema.processModels.name,
      description: schema.processModels.description,
    })
    .from(schema.processModels)
    .where(eq(schema.processModels.status, "published"));

  if (publishedModels.length > 0) {
    const models = publishedModels.map((m) => ({
      slug: m.slug,
      name: m.name,
      description: m.description || "",
    }));
    return matchFromList(subGoalDescription, models, opts);
  }

  // Fallback to filesystem (pre-seeding / fresh install)
  const templates = loadTemplates(opts?.templatesDir);
  if (templates.length === 0) return null;

  return matchFromList(
    subGoalDescription,
    templates.map((t) => ({ slug: t.slug, name: t.name, description: t.description })),
    opts,
    templates,
  );
}

/**
 * Synchronous version for use in tests or when models are already loaded.
 */
export function findProcessModelSync(
  subGoalDescription: string,
  opts?: {
    industryKeywords?: string[];
    templatesDir?: string;
    confidenceThreshold?: number;
  },
): ProcessModelMatch | null {
  const templates = loadTemplates(opts?.templatesDir);
  if (templates.length === 0) return null;

  return matchFromList(
    subGoalDescription,
    templates.map((t) => ({ slug: t.slug, name: t.name, description: t.description })),
    opts,
    templates,
  );
}

function matchFromList(
  subGoalDescription: string,
  models: Array<{ slug: string; name: string; description: string }>,
  opts?: { industryKeywords?: string[]; confidenceThreshold?: number },
  templateManifests?: TemplateManifest[],
): ProcessModelMatch | null {
  if (models.length === 0) return null;

  const threshold = opts?.confidenceThreshold ?? 0.3;
  const descLower = subGoalDescription.toLowerCase();
  const descTokens = tokenize(descLower);
  const industryTokens = (opts?.industryKeywords || []).map((k) => k.toLowerCase());

  let bestMatch: ProcessModelMatch | null = null;
  let bestScore = 0;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const templateText = `${model.name} ${model.description}`.toLowerCase();
    const templateTokens = tokenize(templateText);

    if (templateTokens.length === 0) continue;

    const matchedTokens = templateTokens.filter((t) => descTokens.includes(t));
    let score = matchedTokens.length / templateTokens.length;

    if (industryTokens.length > 0) {
      const industryMatches = industryTokens.filter((k) => templateText.includes(k));
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
        description: model.description,
        confidence: Math.round(score * 100) / 100,
        reasoning: `Library match: ${matchedTokens.length} keyword overlaps with "${model.name}"`,
        templatePath: templateManifests?.[i]?.filePath || "",
      };
    }
  }

  return bestMatch;
}

/**
 * Search for a model match from a provided list (testable without filesystem).
 */
export function findProcessModelFromList(
  subGoalDescription: string,
  templates: Array<{ slug: string; name: string; description: string }>,
  opts?: { industryKeywords?: string[]; confidenceThreshold?: number },
): ProcessModelMatch | null {
  if (templates.length === 0) return null;

  const threshold = opts?.confidenceThreshold ?? 0.3;
  const descLower = subGoalDescription.toLowerCase();
  const descTokens = tokenize(descLower);
  const industryTokens = (opts?.industryKeywords || []).map((k) => k.toLowerCase());

  let bestMatch: ProcessModelMatch | null = null;
  let bestScore = 0;

  for (const template of templates) {
    const templateText = `${template.name} ${template.description}`.toLowerCase();
    const templateTokens = tokenize(templateText);

    if (templateTokens.length === 0) continue;

    const matchedTokens = templateTokens.filter((t) => descTokens.includes(t));
    let score = matchedTokens.length / templateTokens.length;

    if (industryTokens.length > 0) {
      const industryMatches = industryTokens.filter((k) => templateText.includes(k));
      score += industryMatches.length * 0.1;
    }

    const slugTokens = template.slug.split("-");
    const slugMatches = slugTokens.filter((t) => descLower.includes(t));
    if (slugMatches.length > 0) {
      score += slugMatches.length * 0.15;
    }

    score = Math.min(score, 1.0);

    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = {
        slug: template.slug,
        name: template.name,
        description: template.description,
        confidence: Math.round(score * 100) / 100,
        reasoning: `Template match: ${matchedTokens.length} keyword overlaps with "${template.name}"`,
        templatePath: "",
      };
    }
  }

  return bestMatch;
}

// ============================================================
// Tokenizer (replicates router.ts pattern)
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
