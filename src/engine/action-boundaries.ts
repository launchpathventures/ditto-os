/**
 * Action Boundaries — System-Enforced Tool Sets Per Context
 *
 * Determines which tools are available based on the relationship context
 * (front door, workspace, budgeted workspace). Boundaries are enforced
 * at the tool level (harness resolvedTools), not via prompt instructions.
 *
 * This is a Ditto product-layer module — it references workspace and
 * relationship concepts that are Ditto-specific.
 *
 * Provenance:
 * - Capability-based security (RBAC on tools)
 * - Brief 102
 */

// ============================================================
// Types
// ============================================================

/** The contexts in which Alex operates, each with different permissions */
export type ActionContext =
  | "front_door"          // No workspace, no relationship — research only
  | "workspace"           // Authenticated workspace — full tools except budget
  | "workspace_budgeted"; // Workspace with budget allocation

/** The boundary definition: which tools are available and why */
export interface ActionBoundary {
  context: ActionContext;
  allowedTools: string[];
  description: string;
}

// ============================================================
// Tool sets per context
// ============================================================

/**
 * Front door: research-only. The visitor has no workspace and no
 * authenticated relationship. Person research is limited to publicly
 * available information only.
 */
const FRONT_DOOR_TOOLS: string[] = [
  "search_knowledge",     // Search public knowledge base
  "assess_confidence",    // Self-assess decomposition quality
  "web_search",           // Web search for research context
  "person_research",      // Person research — PUBLIC information only, no workspace data
  "draft_plan",           // Present decomposition plan as value demonstration
];

/**
 * Workspace: full workspace tools. The user has an authenticated
 * workspace with processes, work items, and integrations.
 */
const WORKSPACE_TOOLS: string[] = [
  // Research & analysis
  "search_knowledge",
  "assess_confidence",
  "detect_risks",
  "suggest_next",
  // Work management
  "create_work_item",
  "quick_capture",
  "start_pipeline",
  "pause_goal",
  // Process management
  "generate_process",
  "get_process_detail",
  "adapt_process",
  // Trust & configuration
  "adjust_trust",
  "connect_service",
  "update_user_model",
  // Delegation
  "start_dev_role",
  "consult_role",
  "plan_with_role",
  // Reviews
  "approve_review",
  "edit_review",
  "reject_review",
  // Proactive
  "get_briefing",
];

/**
 * Workspace with budget: all workspace tools plus budget allocation.
 * Budget tools allow spending against an allocated budget for
 * process execution and tool provisioning.
 */
const WORKSPACE_BUDGETED_TOOLS: string[] = [
  ...WORKSPACE_TOOLS,
  "allocate_budget",
  "check_budget",
  "approve_spend",
];

// ============================================================
// Boundary definitions
// ============================================================

const BOUNDARIES: Record<ActionContext, ActionBoundary> = {
  front_door: {
    context: "front_door",
    allowedTools: FRONT_DOOR_TOOLS,
    description: "Research-only: no workspace data, no process execution, no budget. Person research limited to public information.",
  },
  workspace: {
    context: "workspace",
    allowedTools: WORKSPACE_TOOLS,
    description: "Full workspace tools: create work items, run processes, manage trust. No budget allocation.",
  },
  workspace_budgeted: {
    context: "workspace_budgeted",
    allowedTools: WORKSPACE_BUDGETED_TOOLS,
    description: "Full workspace tools plus budget allocation: can spend against allocated budget.",
  },
};

// ============================================================
// Public API
// ============================================================

/**
 * Get the tool set available for a given action context.
 *
 * This is the system-enforced boundary — tools not in the returned
 * set MUST NOT be made available to the agent, regardless of what
 * the prompt says.
 */
export function getToolSetForContext(context: ActionContext): ActionBoundary {
  return BOUNDARIES[context];
}

/**
 * Check whether a specific tool is allowed in the given context.
 */
export function isToolAllowed(tool: string, context: ActionContext): boolean {
  return BOUNDARIES[context].allowedTools.includes(tool);
}

/**
 * Filter a list of tool names to only those allowed in the context.
 * Returns the filtered list — tools not allowed are silently dropped.
 */
export function filterToolsForContext(
  tools: string[],
  context: ActionContext,
): string[] {
  const allowed = new Set(BOUNDARIES[context].allowedTools);
  return tools.filter(t => allowed.has(t));
}

/**
 * Determine the action context from workspace/session state.
 *
 * This is the authoritative source — the context is determined by
 * system state, not by prompt instructions.
 */
export function determineActionContext(state: {
  hasWorkspace: boolean;
  hasBudget: boolean;
}): ActionContext {
  if (!state.hasWorkspace) return "front_door";
  if (state.hasBudget) return "workspace_budgeted";
  return "workspace";
}
