/**
 * Ditto — Roadmap Composition
 *
 * "What's the project roadmap?" — Phase progress, brief status, scope selection.
 *
 * Produces: MetricBlock (brief counts), RecordBlock per active phase,
 * InteractiveTableBlock (briefs with select action), ChecklistBlock (completed phases).
 *
 * Provenance: Brief 055 (Scope Selection + Roadmap Visualization).
 */

import type { ContentBlock } from "@/lib/engine";
import type { CompositionContext, Phase, BriefSummary } from "./types";

/**
 * Compose the Roadmap view — project phases, briefs, and scope selection.
 */
export function composeRoadmap(context: CompositionContext): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const { roadmap } = context;

  if (!roadmap || (roadmap.briefs.length === 0 && roadmap.phases.length === 0)) {
    blocks.push({
      type: "text",
      text: "No briefs found. Start a planning conversation to create your first brief.",
    });
    return blocks;
  }

  const phases: Phase[] = roadmap.phases;
  const briefs: BriefSummary[] = roadmap.briefs;
  const { stats } = roadmap;

  // 1. MetricBlock — brief counts by status
  blocks.push({
    type: "metric",
    metrics: [
      { label: "Ready", value: String(stats.ready) },
      { label: "In progress", value: String(stats.inProgress) },
      { label: "Complete", value: String(stats.complete) },
      { label: "Draft", value: String(stats.draft) },
    ],
  });

  // 2. Active phases as RecordBlocks
  const activePhases = phases.filter((p) => p.status === "in-progress");
  const notStartedPhases = phases.filter((p) => p.status === "not-started");

  for (const phase of activePhases) {
    blocks.push({
      type: "record",
      title: `Phase ${phase.number}: ${phase.name}`,
      status: { label: "In progress", variant: "info" },
      fields: [
        { label: "Status", value: "Active" },
      ],
    });
  }

  for (const phase of notStartedPhases) {
    blocks.push({
      type: "record",
      title: `Phase ${phase.number}: ${phase.name}`,
      status: { label: "Not started", variant: "neutral" },
    });
  }

  // 3. InteractiveTableBlock — actionable briefs (ready + in-progress + draft)
  const actionableBriefs = briefs.filter((b) => b.status !== "complete");
  if (actionableBriefs.length > 0) {
    blocks.push({
      type: "interactive_table",
      title: "Available briefs",
      summary: `${actionableBriefs.length} briefs`,
      columns: [
        { key: "number", label: "#", format: "text" },
        { key: "name", label: "Name", format: "text" },
        { key: "status", label: "Status", format: "badge" },
        { key: "dependsOn", label: "Depends on", format: "text" },
      ],
      rows: actionableBriefs.map((brief) => ({
        id: `brief-${brief.number}`,
        cells: {
          number: brief.number,
          name: brief.name,
          status: brief.status,
          dependsOn: brief.dependsOn
            ? brief.dependsOn.replace(/\s*\(.*?\)/g, "").slice(0, 40)
            : "—",
        },
        status: brief.status === "ready"
          ? ("approved" as const)
          : brief.status === "in-progress"
            ? ("pending" as const)
            : undefined,
        actions: [
          {
            id: `select-brief-${brief.number}`,
            label: brief.status === "draft" ? "Plan" : "Build",
            style: brief.status === "ready" ? ("primary" as const) : ("secondary" as const),
            payload: {
              briefNumber: brief.number,
              briefName: brief.name,
              briefStatus: brief.status,
            },
          },
        ],
      })),
    });
  }

  // 4. ChecklistBlock — completed phases
  const completedPhases = phases.filter((p) => p.status === "done");
  if (completedPhases.length > 0) {
    blocks.push({
      type: "checklist",
      title: "Completed phases",
      items: completedPhases.map((phase) => ({
        label: `Phase ${phase.number}: ${phase.name}`,
        status: "done" as const,
      })),
    });
  }

  // 5. Recently completed briefs (last 10)
  const completedBriefs = briefs
    .filter((b) => b.status === "complete")
    .slice(-10)
    .reverse();

  if (completedBriefs.length > 0) {
    blocks.push({
      type: "checklist",
      title: "Recently completed briefs",
      items: completedBriefs.map((b) => ({
        label: `Brief ${String(b.number).padStart(3, "0")}: ${b.name}`,
        status: "done" as const,
      })),
    });
  }

  return blocks;
}
