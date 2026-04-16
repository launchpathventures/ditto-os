/**
 * Ditto — Adaptive Composition Schema (Brief 154)
 *
 * TypeScript types for data-driven composition schemas.
 * Composition schemas are declarative — block type + content template +
 * context filter + sort order. No eval(), no function execution.
 *
 * Lives in web package (UI concern). Core stores the JSON blob; web interprets it.
 *
 * Provenance: pattern — Notion database views (filter + sort + layout as config).
 */

import type { ContentBlockType } from "@/lib/engine";
import type { CompositionIntent } from "./types";

// ============================================================
// Reserved slugs — built-in intents cannot be used for adaptive views
// ============================================================

const RESERVED_SLUGS: ReadonlySet<string> = new Set<string>([
  "today",
  "inbox",
  "work",
  "projects",
  "growth",
  "library",
  "routines",
  "roadmap",
  "settings",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

// ============================================================
// Valid block types for adaptive compositions
// ============================================================

const VALID_BLOCK_TYPES: ReadonlySet<ContentBlockType> = new Set<ContentBlockType>([
  "text",
  "status_card",
  "actions",
  "data",
  "metric",
  "record",
  "interactive_table",
  "alert",
  "progress",
  "checklist",
  "chart",
  "suggestion",
  "image",
  "code",
  "knowledge_citation",
  "knowledge_synthesis",
  "process_proposal",
  "gathering_indicator",
  "review_card",
  "input_request",
  "reasoning_trace",
  "artifact",
  "work_item_form",
  "connection_setup",
  "sending_identity_choice",
]);

// ============================================================
// Context query — what data to pull from CompositionContext
// ============================================================

export type ContextQuerySource =
  | "workItems"
  | "processes"
  | "feedItems"
  | "pendingReviews"
  | "activeRuns";

export interface ContextQuery {
  /** Which context collection to query */
  source: ContextQuerySource;
  /** Filter conditions — simple key-value equality checks on items */
  filter?: Record<string, string | number | boolean>;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortOrder?: "asc" | "desc";
  /** Maximum items to return */
  limit?: number;
}

// ============================================================
// Block template — how to render a block from context data
// ============================================================

export interface BlockTemplate {
  /** Which block type to render */
  blockType: ContentBlockType;
  /** Static content fields for the block (merged with context data) */
  content: Record<string, unknown>;
  /** Optional context query to populate the block with data */
  contextQuery?: ContextQuery;
  /** Conditional display — block only renders when context query returns results */
  showWhen?: "has_data" | "always";
}

// ============================================================
// Composition schema — the full schema for an adaptive view
// ============================================================

export interface CompositionSchema {
  /** Version for future schema evolution */
  version: 1;
  /** Block templates in display order */
  blocks: BlockTemplate[];
}

// ============================================================
// Validation
// ============================================================

export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validate a composition schema at registration time.
 * Rejects schemas with invalid block types, invalid context queries,
 * empty blocks, or reserved slugs.
 *
 * @returns Array of validation errors (empty = valid)
 */
export function validateCompositionSchema(
  schema: unknown,
  slug?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check reserved slug
  if (slug && isReservedSlug(slug)) {
    errors.push({
      path: "slug",
      message: `"${slug}" is a reserved slug (built-in navigation intent). Choose a different slug.`,
    });
  }

  // Basic shape check
  if (!schema || typeof schema !== "object") {
    errors.push({ path: "schema", message: "Schema must be an object" });
    return errors;
  }

  const s = schema as Record<string, unknown>;

  if (s.version !== 1) {
    errors.push({ path: "schema.version", message: "Schema version must be 1" });
  }

  if (!Array.isArray(s.blocks)) {
    errors.push({ path: "schema.blocks", message: "Schema must have a blocks array" });
    return errors;
  }

  if (s.blocks.length === 0) {
    errors.push({ path: "schema.blocks", message: "Schema must have at least one block template" });
    return errors;
  }

  const validSources: ReadonlySet<string> = new Set([
    "workItems",
    "processes",
    "feedItems",
    "pendingReviews",
    "activeRuns",
  ]);

  for (let i = 0; i < s.blocks.length; i++) {
    const block = s.blocks[i] as Record<string, unknown> | undefined;
    const prefix = `schema.blocks[${i}]`;

    if (!block || typeof block !== "object") {
      errors.push({ path: prefix, message: "Block template must be an object" });
      continue;
    }

    // Check block type
    const blockType = block.blockType as string;
    if (!blockType) {
      errors.push({ path: `${prefix}.blockType`, message: "Block template must have a blockType" });
    } else if (!VALID_BLOCK_TYPES.has(blockType as ContentBlockType)) {
      errors.push({
        path: `${prefix}.blockType`,
        message: `Unknown block type "${blockType}". Valid types: ${[...VALID_BLOCK_TYPES].join(", ")}`,
      });
    }

    // Check content
    if (!block.content || typeof block.content !== "object") {
      errors.push({ path: `${prefix}.content`, message: "Block template must have a content object" });
    }

    // Check context query if present
    if (block.contextQuery) {
      const cq = block.contextQuery as Record<string, unknown>;
      if (!cq.source || typeof cq.source !== "string") {
        errors.push({ path: `${prefix}.contextQuery.source`, message: "Context query must have a source" });
      } else if (!validSources.has(cq.source)) {
        errors.push({
          path: `${prefix}.contextQuery.source`,
          message: `Invalid context query source "${cq.source}". Valid sources: ${[...validSources].join(", ")}`,
        });
      }

      if (cq.sortOrder && cq.sortOrder !== "asc" && cq.sortOrder !== "desc") {
        errors.push({
          path: `${prefix}.contextQuery.sortOrder`,
          message: `sortOrder must be "asc" or "desc"`,
        });
      }

      if (cq.limit !== undefined && (typeof cq.limit !== "number" || cq.limit < 1)) {
        errors.push({
          path: `${prefix}.contextQuery.limit`,
          message: "limit must be a positive number",
        });
      }
    }

    // Check showWhen
    if (block.showWhen && block.showWhen !== "has_data" && block.showWhen !== "always") {
      errors.push({
        path: `${prefix}.showWhen`,
        message: `showWhen must be "has_data" or "always"`,
      });
    }
  }

  return errors;
}
