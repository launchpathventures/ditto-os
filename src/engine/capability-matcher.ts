/**
 * Ditto — Capability Matcher
 *
 * Deterministic matching engine that scores process templates against
 * the user model to surface unactivated capabilities. No LLM calls,
 * no external API calls — pure function.
 *
 * Scoring: token overlap between user model entries and template metadata
 * (name + description + quality_criteria), weighted by dimension.
 *
 * Provenance: TF-IDF information retrieval (pattern), Insight-193,
 * Brief 167.
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";
import { db, schema } from "../db";
import { eq, or } from "drizzle-orm";
import { getActiveDismissalHashes, hashContent } from "./suggestion-dismissals";

// ============================================================
// Types
// ============================================================

export interface CapabilityMatch {
  templateSlug: string;
  templateName: string;
  relevanceScore: number; // 0-1
  matchReason: string; // Uses user's own words
}

export interface TemplateMetadata {
  slug: string;
  name: string;
  description: string;
  qualityCriteria: string[];
}

export interface MatchCapabilitiesOptions {
  /** Forward-compatible for Phase 12 multi-tenant matching */
  teamId?: string;
}

export interface MatchCapabilitiesResult {
  matches: CapabilityMatch[];
  /** Active processes loaded during matching — avoids redundant DB query in callers */
  activeProcesses: Array<{ name: string; slug: string }>;
}

// ============================================================
// Dimension Weights (AC2)
// ============================================================

const DIMENSION_WEIGHTS: Record<string, number> = {
  problems: 1.0,
  challenges: 0.8,
  tasks: 0.7,
  frustrations: 0.6,
  goals: 0.4,
  vision: 0.3,
};

// ============================================================
// Internal Slugs — excluded from matching
// ============================================================

const INTERNAL_SLUGS = new Set([
  "channel-router",
  "quality-gate",
  "relationship-scoring",
  "opt-out-management",
  "smoke-test-runner",
  "library-curation",
  "front-door-conversation",
  "front-door-intake",
  "front-door-cos-intake",
  "user-nurture-first-week",
  "user-reengagement",
  "person-research",
  "outreach-quality-review",
]);

// ============================================================
// Template Metadata Loader
// ============================================================

/** Cache key for template metadata — one entry per (templateDir, cycleDir) pair */
interface TemplateCacheEntry {
  templates: TemplateMetadata[];
  fingerprint: string;
}
const templateCache = new Map<string, TemplateCacheEntry>();

/**
 * Force-invalidate the template metadata cache.
 * Normally unnecessary — the cache auto-invalidates when the mtimes of
 * template directories change. Exported for tests that mutate template
 * fixtures in-process or need a clean slate.
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

/**
 * Compute a fingerprint based on directory mtimes only.
 *
 * Directory mtime updates on file add/remove/rename on all major filesystems
 * (APFS, ext4, xfs, btrfs, NTFS). This is 2 syscalls total vs N stat calls
 * per file.
 *
 * Limitation: in-place edits (file content changed, filename unchanged) do
 * NOT bump directory mtime and will NOT invalidate the cache. Callers that
 * mutate template file contents in place must invoke clearTemplateCache()
 * explicitly. Normal workflows (git pull, library-curation writing a new
 * YAML, admin tools adding templates) involve add/remove/rename and bump
 * the dir mtime, so auto-invalidation covers them.
 */
function computeTemplateFingerprint(dirs: string[]): string {
  const parts: string[] = [];
  for (const dir of dirs) {
    try {
      const dirStat = fs.statSync(dir);
      parts.push(`${dir}:${dirStat.mtimeMs}`);
    } catch {
      parts.push(`${dir}:missing`);
    }
  }
  return parts.join("|");
}

/**
 * Load template metadata from YAML files including quality_criteria.
 * Cached with mtime-based auto-invalidation — reloads automatically
 * when template directories change (file add/remove/rename).
 *
 * @param templateDir - Template directory (defaults to processes/templates)
 * @param cycleDir - Cycle directory (defaults to processes/cycles)
 */
export function loadTemplateMetadata(
  templateDir: string = path.resolve(process.cwd(), "processes/templates"),
  cycleDir: string = path.resolve(process.cwd(), "processes/cycles"),
): TemplateMetadata[] {
  const cacheKey = `${templateDir}|${cycleDir}`;
  const fingerprint = computeTemplateFingerprint([templateDir, cycleDir]);

  const cached = templateCache.get(cacheKey);
  if (cached && cached.fingerprint === fingerprint) {
    return cached.templates;
  }

  const templates: TemplateMetadata[] = [];

  const loadFromDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        const parsed = YAML.parse(content) as Record<string, unknown> | null;
        if (!parsed) continue;

        const slug = (parsed.id as string) || file.replace(/\.ya?ml$/, "");
        if (INTERNAL_SLUGS.has(slug)) continue;
        // Skip system processes
        if (parsed.system === true) continue;

        const name = (parsed.name as string) || slug;
        const rawDesc = (parsed.description as string) || "";
        const description = rawDesc.replace(/\n/g, " ").trim();
        const qualityCriteria = Array.isArray(parsed.quality_criteria)
          ? (parsed.quality_criteria as string[])
          : [];

        templates.push({ slug, name, description, qualityCriteria });
      } catch {
        // File vanished between readdir and readFile, or YAML parse failed — skip
        continue;
      }
    }
  };

  loadFromDir(templateDir);
  loadFromDir(cycleDir);

  templateCache.set(cacheKey, { templates, fingerprint });
  return templates;
}

// ============================================================
// Matching Engine (AC1, AC2, AC3)
// ============================================================

/**
 * Match user model entries against process templates to find
 * unactivated capabilities relevant to the user.
 *
 * Pure, deterministic function — no LLM calls, no side effects.
 *
 * @param userModelEntries - User model entries with dimension and content
 * @param activeProcessSlugs - Slugs of active/paused processes (for dedup)
 * @param templates - Template metadata to match against
 * @param options - Optional config (teamId for future multi-tenant)
 * @returns Sorted CapabilityMatch[] (highest relevance first)
 */
export function matchCapabilities(
  userModelEntries: Array<{ dimension: string; content: string }>,
  activeProcessSlugs: string[],
  templates: TemplateMetadata[],
  options?: MatchCapabilitiesOptions,
): CapabilityMatch[] {
  // No entries → no matches
  if (userModelEntries.length === 0) return [];

  const activeSlugsSet = new Set(activeProcessSlugs);

  const matches: CapabilityMatch[] = [];

  for (const template of templates) {
    // AC4a: Skip active processes
    if (activeSlugsSet.has(template.slug)) continue;

    // Build template text for matching
    const templateText = buildTemplateText(template);
    const templateTokens = tokenize(templateText);

    // Score each user model entry against this template
    let bestScore = 0;
    let bestEntry: { dimension: string; content: string } | null = null;

    for (const entry of userModelEntries) {
      const weight = DIMENSION_WEIGHTS[entry.dimension] ?? 0.3;
      const entryTokens = tokenize(entry.content);
      const overlap = computeTokenOverlap(entryTokens, templateTokens);
      const weightedScore = overlap * weight;

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestEntry = entry;
      }
    }

    // Only include matches with meaningful overlap
    if (bestScore > 0.05 && bestEntry) {
      matches.push({
        templateSlug: template.slug,
        templateName: template.name,
        relevanceScore: Math.min(1.0, bestScore),
        matchReason: buildMatchReason(bestEntry.content),
      });
    }
  }

  // Sort by relevance descending
  matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return matches;
}

// ============================================================
// Async Matcher — loads data and applies all suppression rules
// ============================================================

/**
 * Full capability matching with DB-backed suppression rules.
 * Loads active processes, paused processes, dismissals, and trust tiers.
 *
 * Returns empty array when:
 * - 5+ active-or-paused processes (AC4)
 * - 2+ active processes at supervised tier (AC5, Insight-142)
 * - No user model entries
 * - No matches found
 */
export async function matchCapabilitiesWithSuppression(
  userId: string,
  userModelEntries: Array<{ dimension: string; content: string }>,
  options?: MatchCapabilitiesOptions,
): Promise<MatchCapabilitiesResult> {
  if (userModelEntries.length === 0) return { matches: [], activeProcesses: [] };

  // Load active and paused processes
  const processes = await db
    .select({
      id: schema.processes.id,
      name: schema.processes.name,
      slug: schema.processes.slug,
      status: schema.processes.status,
      trustTier: schema.processes.trustTier,
    })
    .from(schema.processes)
    .where(
      or(
        eq(schema.processes.status, "active"),
        eq(schema.processes.status, "paused"),
      ),
    );

  const activeOrPausedSlugs = processes.map((p) => p.slug);
  const activeProcesses = processes.filter((p) => p.status === "active");
  const activeProcessInfo = activeProcesses.map((p) => ({ name: p.name, slug: p.slug }));

  // AC4: 5+ active-or-paused → suppress all
  if (processes.length >= 5) return { matches: [], activeProcesses: activeProcessInfo };

  // AC5: 2+ supervised → suppress (Insight-142 review-overload)
  const supervisedCount = activeProcesses.filter(
    (p) => p.trustTier === "supervised",
  ).length;
  if (supervisedCount >= 2) return { matches: [], activeProcesses: activeProcessInfo };

  // Load templates and run matcher
  const templates = loadTemplateMetadata();
  const rawMatches = matchCapabilities(
    userModelEntries,
    activeOrPausedSlugs,
    templates,
    options,
  );

  // AC4c: Filter dismissed suggestions (30-day cooldown)
  const dismissedHashes = await getActiveDismissalHashes(userId);
  const filtered = rawMatches.filter(
    (m) => !dismissedHashes.has(hashContent(m.templateSlug)),
  );

  return { matches: filtered, activeProcesses: activeProcessInfo };
}

// ============================================================
// Scoring Helpers
// ============================================================

/** Build combined text from template metadata for matching */
function buildTemplateText(template: TemplateMetadata): string {
  const parts = [template.name, template.description];
  if (template.qualityCriteria.length > 0) {
    parts.push(template.qualityCriteria.join(" "));
  }
  return parts.join(" ");
}

/** AC3: Build match reason using user's own words */
function buildMatchReason(userContent: string): string {
  // Truncate long content, keep it conversational
  const trimmed = userContent.length > 80
    ? userContent.slice(0, 77) + "..."
    : userContent;
  return `You mentioned ${trimmed.toLowerCase().replace(/^"/, "").replace(/"$/, "")}`;
}

/**
 * Compute token overlap score between two token sets.
 * Returns 0-1 ratio of matching tokens to entry tokens.
 */
function computeTokenOverlap(entryTokens: string[], templateTokens: string[]): number {
  if (entryTokens.length === 0) return 0;

  const templateSet = new Set(templateTokens.map(stem));
  const entryStems = entryTokens.map(stem);

  let hits = 0;
  for (const s of entryStems) {
    if (templateSet.has(s)) hits++;
  }

  return hits / entryStems.length;
}

// ============================================================
// Text Processing
// ============================================================

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "and", "or", "of", "in", "for",
  "to", "with", "on", "at", "by", "from", "as", "into", "that",
  "this", "it", "be", "was", "were", "been", "being", "have",
  "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "not", "no", "but", "if",
  "my", "your", "our", "their", "its", "i", "me", "we", "you",
  "they", "them", "he", "she", "her", "his", "about", "up",
  "out", "so", "just", "also", "very", "too", "much",
]);

/** Tokenize text into meaningful words, lowercased */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/** Simple stemming — strip common suffixes for fuzzy matching */
export function stem(word: string): string {
  return word
    .replace(/ing$/, "")
    .replace(/tion$/, "")
    .replace(/ment$/, "")
    .replace(/ation$/, "")
    .replace(/ness$/, "")
    .replace(/ity$/, "")
    .replace(/ies$/, "y")
    .replace(/es$/, "")
    .replace(/s$/, "")
    .replace(/e$/, "");
}
