/**
 * Engine Schema — re-exports from @ditto/core
 *
 * The engine schema is owned by packages/core/src/db/schema.ts.
 * This file is a thin re-export following the engine-first pattern:
 * "change packages/core/ first, src/engine/ files are thin re-exports."
 *
 * Tables: processes, processDependencies, agents, processRuns, stepRuns,
 * processOutputs, harnessDecisions, trustChanges, trustSuggestions,
 * feedback, memories, improvements, workItems, activities, credentials,
 * outboundActions, schedules, delayedRuns, workspaceViews, processVersions
 */

export {
  // Type unions
  processStatusValues,
  type ProcessStatus,
  trustTierValues,
  type TrustTier,
  runStatusValues,
  type RunStatus,
  stepExecutorValues,
  type StepExecutor,
  feedbackTypeValues,
  type FeedbackType,
  editSeverityValues,
  type EditSeverity,
  trustChangeActorValues,
  type TrustChangeActor,
  trustSuggestionStatusValues,
  type TrustSuggestionStatus,
  agentStatusValues,
  type AgentStatus,
  agentCategoryValues,
  type AgentCategory,
  improvementStatusValues,
  type ImprovementStatus,
  trustActionValues,
  type TrustAction,
  reviewResultValues,
  type ReviewResult,
  memoryScopeTypeValues,
  type MemoryScopeType,
  memoryTypeValues,
  type MemoryType,
  memorySourceValues,
  type MemorySource,
  workItemTypeValues,
  type WorkItemType,
  workItemStatusValues,
  type WorkItemStatus,
  workItemSourceValues,
  type WorkItemSource,
  delayedRunStatusValues,
  type DelayedRunStatus,

  // Tables
  processes,
  processDependencies,
  agents,
  processRuns,
  stepRuns,
  processOutputs,
  harnessDecisions,
  trustChanges,
  trustSuggestions,
  feedback,
  memories,
  improvements,
  workItems,
  activities,
  credentials,
  outboundActions,
  schedules,
  delayedRuns,
  workspaceViews,
  processVersions,
} from "@ditto/core";
