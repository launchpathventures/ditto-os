/**
 * Ditto — Adaptive Composition Evaluator (Brief 154)
 *
 * Evaluates a CompositionSchema against a CompositionContext to produce
 * ContentBlock[]. Pure, synchronous — same contract as built-in compositions.
 *
 * No eval(), no function execution — templates are declarative data.
 *
 * Provenance: pattern — Notion database views (filter + sort + group as config).
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext } from "./types";
import type { CompositionSchema, BlockTemplate, ContextQuery } from "./composition-schema";

/**
 * Execute a context query against a CompositionContext.
 * Returns the matching items from the specified source.
 */
function executeContextQuery(
  query: ContextQuery,
  context: CompositionContext,
): Array<Record<string, unknown>> {
  // Get the source collection
  let items: Array<Record<string, unknown>>;
  switch (query.source) {
    case "workItems":
      items = context.workItems as unknown as Array<Record<string, unknown>>;
      break;
    case "processes":
      items = context.processes as unknown as Array<Record<string, unknown>>;
      break;
    case "feedItems":
      items = context.feedItems as unknown as Array<Record<string, unknown>>;
      break;
    case "pendingReviews":
      items = context.pendingReviews as unknown as Array<Record<string, unknown>>;
      break;
    case "activeRuns":
      items = context.activeRuns as unknown as Array<Record<string, unknown>>;
      break;
    default:
      return [];
  }

  if (!items || items.length === 0) return [];

  // Apply filter
  let filtered = items;
  if (query.filter) {
    filtered = items.filter((item) => {
      for (const [key, value] of Object.entries(query.filter!)) {
        if (item[key] !== value) return false;
      }
      return true;
    });
  }

  // Apply sort
  if (query.sortBy) {
    const field = query.sortBy;
    const order = query.sortOrder === "desc" ? -1 : 1;
    filtered = [...filtered].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      return aVal < bVal ? -order : order;
    });
  }

  // Apply limit
  if (query.limit && query.limit > 0) {
    filtered = filtered.slice(0, query.limit);
  }

  return filtered;
}

/**
 * Interpolate simple template strings in content values.
 * Replaces {{field}} with the corresponding value from data.
 * No eval() — simple string replacement only.
 */
function interpolateContent(
  content: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (typeof value === "string") {
      result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, field) => {
        const val = data[field];
        return val !== undefined && val !== null ? String(val) : "";
      });
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Evaluate a single block template against context.
 * Returns the ContentBlock(s) to render, or empty array if suppressed.
 */
function evaluateBlockTemplate(
  template: BlockTemplate,
  context: CompositionContext,
): ContentBlock[] {
  const showWhen = template.showWhen ?? "always";

  if (template.contextQuery) {
    const items = executeContextQuery(template.contextQuery, context);

    // Check showWhen condition
    if (showWhen === "has_data" && items.length === 0) {
      return [];
    }

    // For table blocks, embed data into the content
    if (template.blockType === "interactive_table" || template.blockType === "data") {
      const content = { ...template.content };
      // Inject queried data as rows/items
      if (template.blockType === "interactive_table") {
        content.rows = items;
      } else {
        content.data = items;
      }
      return [{ type: template.blockType, ...content } as ContentBlock];
    }

    // For metric blocks with data, compute from first item
    if (template.blockType === "metric" && items.length > 0) {
      const interpolated = interpolateContent(template.content, items[0]);
      return [{ type: template.blockType, ...interpolated } as ContentBlock];
    }

    // For other block types with context data, generate one block per item
    // (e.g., status_card per work item)
    if (items.length > 0) {
      return items.map((item) => {
        const interpolated = interpolateContent(template.content, item);
        return { type: template.blockType, ...interpolated } as ContentBlock;
      });
    }
  }

  // Static block (no context query) — render as-is
  return [{ type: template.blockType, ...template.content } as ContentBlock];
}

/**
 * Evaluate an adaptive composition schema against context.
 * Returns ContentBlock[] ready for BlockList rendering.
 *
 * When no data matches any block template, returns a helpful empty state.
 */
export function evaluateAdaptiveComposition(
  schema: CompositionSchema,
  context: CompositionContext,
  viewLabel?: string,
  sourceProcessSlug?: string,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const template of schema.blocks) {
    const rendered = evaluateBlockTemplate(template, context);
    blocks.push(...rendered);
  }

  // Empty state — helpful message with action to trigger source process
  if (blocks.length === 0) {
    const emptyBlocks: ContentBlock[] = [
      {
        type: "text",
        text: viewLabel
          ? `No data yet — this view will populate as your processes run.`
          : "No data yet for this view.",
      } as ContentBlock,
    ];

    if (sourceProcessSlug) {
      emptyBlocks.push({
        type: "actions",
        actions: [
          {
            id: `empty-adaptive-run-${sourceProcessSlug}`,
            label: `Run ${sourceProcessSlug}`,
            style: "primary",
          },
        ],
      } as ContentBlock);
    }

    return emptyBlocks;
  }

  return blocks;
}
