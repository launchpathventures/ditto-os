/**
 * Runner — module barrel.
 *
 * Brief 215 §"What Changes" / file `runner/index.ts`. Exports kinds, state
 * machine, interface, resolver, webhook schema. The top-level
 * `packages/core/src/index.ts` re-exports from here.
 */

export {
  runnerKindValues,
  runnerModeValues,
  runnerModeRequiredValues,
  runnerDispatchStatusValues,
  runnerHealthStatusValues,
  RunnerKindSchema,
  RunnerModeSchema,
  kindToMode,
  isCloudKind,
  isLocalKind,
  type RunnerKind,
  type RunnerMode,
  type RunnerModeRequired,
  type RunnerDispatchStatus,
  type RunnerHealthStatus,
} from "./kinds.js";

export {
  runnerDispatchEventValues,
  isTerminalDispatchStatus,
  transitionDispatch,
  type RunnerDispatchEvent,
  type DispatchTransitionOk,
  type DispatchTransitionError,
  type DispatchTransitionResult,
} from "./state-machine.js";

export {
  type WorkItemRef,
  type ProjectRunnerRef,
  type ProjectRef,
  type DispatchResult,
  type DispatchStatusSnapshot,
  type CancelResult,
  type HealthCheckResult,
  type RunnerAdapter,
  type DispatchExecuteContext,
  type DispatchTrustContext,
} from "./interface.js";

export {
  resolveChain,
  type WorkItemResolutionRef,
  type ProjectResolutionRef,
  type ProjectRunnerResolutionRef,
  type ResolutionError,
  type ResolutionErrorCode,
  type ResolutionOk,
  type ResolutionResult,
} from "./resolution.js";

export {
  runnerWebhookSchema,
  localMacMiniStatusPayload,
  claudeCodeRoutineStatusPayload,
  claudeManagedAgentStatusPayload,
  githubActionStatusPayload,
  cloudRunnerCallbackStateValues,
  routineCallbackStateValues,
  workflowRunConclusionValues,
  cloudRunnerStateToDispatchStatus,
  routineStateToDispatchStatus,
  isKnownRunnerKind,
  type RunnerWebhookPayload,
  type CloudRunnerCallbackState,
  type RoutineCallbackState,
  type WorkflowRunConclusion,
  type ClaudeCodeRoutineStatusPayload,
  type ClaudeManagedAgentStatusPayload,
  type GithubActionStatusPayload,
} from "./webhook-schema.js";

export {
  pollCadenceMs,
  getPollCadenceMs,
  pollableKinds,
} from "./poll-cadences.js";

export {
  mintRunnerDispatchPause,
  parseKindOption,
  type MintRunnerDispatchPauseInput,
  type PauseWorkItemRef,
  type PauseProjectRef,
  type PauseRunnerOption,
  type PauseCopy,
} from "./mint-pause-payload.js";
