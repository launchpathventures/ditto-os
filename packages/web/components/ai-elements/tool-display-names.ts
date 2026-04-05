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
  /** Past-tense outcome for verification evidence headers (e.g., "Checked knowledge base") */
  outcome: string;
  /** Present-progressive outcome for active state (e.g., "Checking knowledge base...") */
  runningOutcome: string;
  /** Single-word category for deduplication in summary headers (e.g., "knowledge") */
  category: string;
}

const toolDisplayNames: Record<string, ToolDisplayLabel> = {
  // Self tools
  search_knowledge: { running: "Searching knowledge...", complete: "Searched knowledge", action: "search knowledge", outcome: "Checked knowledge base", runningOutcome: "Checking knowledge base...", category: "knowledge" },
  save_process: { running: "Saving process...", complete: "Saved process", action: "save this process", outcome: "Saved process", runningOutcome: "Saving process...", category: "processes" },
  start_pipeline: { running: "Running pipeline...", complete: "Pipeline complete", action: "run the pipeline", outcome: "Ran pipeline", runningOutcome: "Running pipeline...", category: "pipelines" },
  generate_process: { running: "Drafting process...", complete: "Process drafted", action: "draft a process", outcome: "Drafted process", runningOutcome: "Drafting process...", category: "processes" },
  get_briefing: { running: "Preparing briefing...", complete: "Briefing ready", action: "prepare your briefing", outcome: "Prepared briefing", runningOutcome: "Preparing briefing...", category: "briefings" },
  quick_capture: { running: "Capturing...", complete: "Captured", action: "capture this", outcome: "Captured item", runningOutcome: "Capturing...", category: "captures" },
  create_work_item: { running: "Creating work item...", complete: "Work item created", action: "create a work item", outcome: "Created work item", runningOutcome: "Creating work item...", category: "work" },
  approve_review: { running: "Recording approval...", complete: "Approved", action: "record this approval", outcome: "Recorded approval", runningOutcome: "Recording approval...", category: "reviews" },
  suggest_next: { running: "Finding suggestions...", complete: "Suggestions ready", action: "find suggestions", outcome: "Found suggestions", runningOutcome: "Finding suggestions...", category: "suggestions" },
  run_pipeline_step: { running: "Running step...", complete: "Step complete", action: "run this step", outcome: "Completed step", runningOutcome: "Running step...", category: "pipelines" },
  check_status: { running: "Checking status...", complete: "Status checked", action: "check the status", outcome: "Checked status", runningOutcome: "Checking status...", category: "status" },
  update_process: { running: "Updating process...", complete: "Process updated", action: "update this process", outcome: "Updated process", runningOutcome: "Updating process...", category: "processes" },
  delete_process: { running: "Removing process...", complete: "Process removed", action: "remove this process", outcome: "Removed process", runningOutcome: "Removing process...", category: "processes" },
  list_processes: { running: "Loading processes...", complete: "Processes loaded", action: "load your processes", outcome: "Loaded processes", runningOutcome: "Loading processes...", category: "processes" },
  get_process: { running: "Loading process...", complete: "Process loaded", action: "load this process", outcome: "Loaded process", runningOutcome: "Loading process...", category: "processes" },
  assess_confidence: { running: "Assessing confidence...", complete: "Confidence assessed", action: "assess confidence", outcome: "Assessed confidence", runningOutcome: "Assessing confidence...", category: "confidence" },
  start_dev_role: { running: "Working on it...", complete: "Complete", action: "start a dev role", outcome: "Completed work", runningOutcome: "Working on it...", category: "development" },
  plan_with_role: { running: "Planning...", complete: "Plan ready", action: "plan with a role", outcome: "Created plan", runningOutcome: "Planning...", category: "planning" },
  consult_role: { running: "Consulting...", complete: "Consultation complete", action: "consult a role", outcome: "Completed consultation", runningOutcome: "Consulting...", category: "consultation" },
  adjust_trust: { running: "Adjusting trust...", complete: "Trust adjusted", action: "adjust trust level", outcome: "Adjusted trust", runningOutcome: "Adjusting trust...", category: "trust" },
  get_process_detail: { running: "Loading process...", complete: "Process loaded", action: "load process details", outcome: "Loaded process details", runningOutcome: "Loading process...", category: "processes" },
  connect_service: { running: "Connecting service...", complete: "Service connected", action: "connect a service", outcome: "Connected service", runningOutcome: "Connecting service...", category: "services" },
  update_user_model: { running: "Updating preferences...", complete: "Preferences updated", action: "update your preferences", outcome: "Updated preferences", runningOutcome: "Updating preferences...", category: "preferences" },
  detect_risks: { running: "Checking for risks...", complete: "Risk check complete", action: "check for risks", outcome: "Checked for risks", runningOutcome: "Checking for risks...", category: "risks" },
  adapt_process: { running: "Adapting process...", complete: "Process adapted", action: "adapt this process", outcome: "Adapted process", runningOutcome: "Adapting process...", category: "processes" },
  edit_review: { running: "Recording edit...", complete: "Edit recorded", action: "record this edit", outcome: "Recorded edit", runningOutcome: "Recording edit...", category: "reviews" },
  reject_review: { running: "Recording rejection...", complete: "Rejection recorded", action: "record this rejection", outcome: "Recorded rejection", runningOutcome: "Recording rejection...", category: "reviews" },
  pause_goal: { running: "Pausing goal...", complete: "Goal paused", action: "pause this goal", outcome: "Paused goal", runningOutcome: "Pausing goal...", category: "goals" },
  // Claude Code internal tools (surfaced via CLI stream_event)
  Read: { running: "Reading file...", complete: "Read file", action: "read a file", outcome: "Reviewed file", runningOutcome: "Reviewing file...", category: "files" },
  Edit: { running: "Editing file...", complete: "Edited file", action: "edit a file", outcome: "Updated file", runningOutcome: "Updating file...", category: "files" },
  Write: { running: "Writing file...", complete: "Wrote file", action: "write a file", outcome: "Created file", runningOutcome: "Creating file...", category: "files" },
  MultiEdit: { running: "Editing files...", complete: "Edited files", action: "edit files", outcome: "Updated files", runningOutcome: "Updating files...", category: "files" },
  Grep: { running: "Searching code...", complete: "Searched code", action: "search code", outcome: "Searched codebase", runningOutcome: "Searching codebase...", category: "code" },
  Glob: { running: "Finding files...", complete: "Found files", action: "find files", outcome: "Located files", runningOutcome: "Locating files...", category: "files" },
  Bash: { running: "Running command...", complete: "Ran command", action: "run a command", outcome: "Ran command", runningOutcome: "Running command...", category: "commands" },
  WebSearch: { running: "Searching web...", complete: "Searched web", action: "search the web", outcome: "Searched the web", runningOutcome: "Searching the web...", category: "web" },
  WebFetch: { running: "Fetching page...", complete: "Fetched page", action: "fetch a page", outcome: "Retrieved page", runningOutcome: "Retrieving page...", category: "web" },
  Agent: { running: "Running agent...", complete: "Agent complete", action: "run an agent", outcome: "Ran sub-agent", runningOutcome: "Running sub-agent...", category: "agents" },
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
    outcome: humanized,
    runningOutcome: `${humanized}...`,
    category: "activity",
  };
}
