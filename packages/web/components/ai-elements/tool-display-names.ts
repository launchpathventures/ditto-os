/**
 * Tool Display Names — Static UI-side map (Brief 062)
 *
 * Maps internal toolName identifiers to human-readable action labels.
 * Running state uses present progressive ("Searching...").
 * Complete state uses past tense ("Searched knowledge").
 *
 * Future brief: engine-side contextual descriptions (e.g., "Saving *your quoting process*").
 * This static map handles the 80% case.
 *
 * Provenance: P30 prototype gathering_indicator + status_card patterns.
 */

export interface ToolDisplayLabel {
  running: string;
  complete: string;
  /** Infinitive form for confirmation titles ("save process", "search knowledge") */
  action: string;
}

const toolDisplayNames: Record<string, ToolDisplayLabel> = {
  search_knowledge: { running: "Searching knowledge...", complete: "Searched knowledge", action: "search knowledge" },
  save_process: { running: "Saving process...", complete: "Saved process", action: "save this process" },
  start_pipeline: { running: "Running pipeline...", complete: "Pipeline complete", action: "run the pipeline" },
  generate_process: { running: "Drafting process...", complete: "Process drafted", action: "draft a process" },
  get_briefing: { running: "Preparing briefing...", complete: "Briefing ready", action: "prepare your briefing" },
  quick_capture: { running: "Capturing...", complete: "Captured", action: "capture this" },
  create_work_item: { running: "Creating work item...", complete: "Work item created", action: "create a work item" },
  approve_review: { running: "Recording approval...", complete: "Approved", action: "record this approval" },
  suggest_next: { running: "Finding suggestions...", complete: "Suggestions ready", action: "find suggestions" },
  run_pipeline_step: { running: "Running step...", complete: "Step complete", action: "run this step" },
  check_status: { running: "Checking status...", complete: "Status checked", action: "check the status" },
  update_process: { running: "Updating process...", complete: "Process updated", action: "update this process" },
  delete_process: { running: "Removing process...", complete: "Process removed", action: "remove this process" },
  list_processes: { running: "Loading processes...", complete: "Processes loaded", action: "load your processes" },
  get_process: { running: "Loading process...", complete: "Process loaded", action: "load this process" },
};

/**
 * Humanize a snake_case tool name as fallback for unmapped tools.
 * "search_knowledge" → "Search knowledge"
 */
function humanizeToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Get human-readable labels for a tool invocation.
 * Uses static map first, falls back to humanized snake_case.
 */
export function getToolDisplayLabel(toolName: string): ToolDisplayLabel {
  const mapped = toolDisplayNames[toolName];
  if (mapped) return mapped;

  const humanized = humanizeToolName(toolName);
  return {
    running: `${humanized}...`,
    complete: humanized,
    action: toolName.replace(/_/g, " "),
  };
}
