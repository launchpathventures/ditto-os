/**
 * Ditto — Library Composition (Process Capability Catalog)
 *
 * "What can Alex do for me?" — Shows all available business capabilities
 * Alex can operate, grouped by function. Active capabilities show status,
 * available ones show "Start this" which triggers a conversational setup
 * with Self.
 *
 * Provenance: P29 (Process Model Library prototype), routines.ts pattern (adopt).
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext, ProcessCapability } from "./types";
import { emptyLibrary } from "@/lib/composition-empty-states";

/** Category display order and labels */
const CATEGORY_ORDER: Array<{ key: ProcessCapability["category"]; label: string; description: string }> = [
  { key: "growth", label: "Growth & Marketing", description: "Grow your audience, publish content, run experiments" },
  { key: "sales", label: "Sales & Pipeline", description: "Find prospects, send outreach, track pipeline" },
  { key: "relationships", label: "Relationships", description: "Build connections, nurture network, warm introductions" },
  { key: "operations", label: "Operations", description: "Inbox triage, meeting prep, weekly briefings" },
  { key: "admin", label: "Admin & Quality", description: "Quality gates, analytics, reporting" },
];

/**
 * Compose the Library view — process capability catalog.
 * Pure, synchronous. All data comes from CompositionContext.
 *
 * Brief 168: "Recommended for your business" section at top when
 * capability matcher returns matches with relevanceScore > 0.5.
 */
export function composeLibrary(context: CompositionContext): ContentBlock[] {
  const { capabilities, recommended } = context;

  if (!capabilities || capabilities.length === 0) {
    return emptyLibrary(context);
  }

  const blocks: ContentBlock[] = [];

  // Summary metrics
  const active = capabilities.filter((c) => c.active);
  const available = capabilities.filter((c) => !c.active);

  blocks.push({
    type: "metric",
    metrics: [
      { label: "Capabilities", value: String(capabilities.length) },
      { label: "Active", value: String(active.length), trend: active.length > 0 ? "up" : "flat" },
      { label: "Available", value: String(available.length) },
    ],
  });

  // Brief 168 AC3/AC4: Recommended section — hidden when empty or 5+ active processes
  if (recommended && recommended.length > 0 && active.length < 5) {
    blocks.push({
      type: "text",
      text: "Recommended for your business",
      variant: "hero-secondary",
    });

    for (const cap of recommended) {
      blocks.push({
        type: "record",
        title: cap.name,
        subtitle: cap.matchReason || cap.description,
        status: { label: "Recommended", variant: "vivid" },
        fields: [
          { label: "Type", value: cap.type === "cycle" ? "Continuous" : "On-demand" },
        ],
        actions: [
          {
            id: `capability.start.${cap.slug}`,
            label: "Start this",
            style: "primary",
            payload: { templateId: cap.slug, templateName: cap.name },
          },
        ],
      });
    }
  }

  // Brief 168: Exclude recommended slugs from category sections to avoid duplicates
  const recommendedSlugs = new Set(
    recommended && recommended.length > 0 && active.length < 5
      ? recommended.map((c) => c.slug)
      : [],
  );

  // Group by category
  for (const cat of CATEGORY_ORDER) {
    const inCategory = capabilities.filter((c) => c.category === cat.key);
    if (inCategory.length === 0) continue;

    const activeInCategory = inCategory.filter((c) => c.active);
    const availableInCategory = inCategory.filter((c) => !c.active && !recommendedSlugs.has(c.slug));

    // Skip empty categories (all items may have moved to recommended section)
    if (activeInCategory.length === 0 && availableInCategory.length === 0) continue;

    blocks.push({
      type: "text",
      text: `${cat.label} — ${cat.description}`,
      variant: "hero-secondary",
    });

    // Active capabilities first
    for (const cap of activeInCategory) {
      blocks.push({
        type: "record",
        title: cap.name,
        subtitle: cap.description,
        status: {
          label: cap.activeCount > 1 ? `${cap.activeCount} active` : "Active",
          variant: "positive",
        },
        fields: [
          { label: "Type", value: cap.type === "cycle" ? "Continuous" : "On-demand" },
        ],
        actions: [
          { id: `capability.view.${cap.slug}`, label: "View" },
        ],
      });
    }

    // Available capabilities
    for (const cap of availableInCategory) {
      blocks.push({
        type: "record",
        title: cap.name,
        subtitle: cap.description,
        status: { label: "Available", variant: "neutral" },
        fields: [
          { label: "Type", value: cap.type === "cycle" ? "Continuous" : "On-demand" },
        ],
        actions: [
          {
            id: `capability.start.${cap.slug}`,
            label: "Start this",
            style: "primary",
            payload: { templateId: cap.slug, templateName: cap.name },
          },
        ],
      });
    }
  }

  return blocks;
}
