/**
 * @ditto/core — Engine Core
 *
 * Reusable engine primitives for process execution, harness governance,
 * trust earning, memory, and LLM abstraction. Consumed by Ditto (web app),
 * ProcessOS, and any other application that needs governed AI processes.
 *
 * Usage:
 *   import { HarnessPipeline, createHarnessContext } from "@ditto/core/harness";
 *   import { type TrustTier, type CoreDatabase } from "@ditto/core/db";
 *   import { getCognitiveCore } from "@ditto/core/cognitive";
 */

// ============================================================
// Database schema and types
// ============================================================
export { type CoreDatabase } from "./db/index.js";
export * from "./db/schema.js";
export * from "./db/schema-process-models.js";

// ============================================================
// Engine interfaces (the contract between core and consumers)
// ============================================================
export * from "./interfaces.js";

// ============================================================
// Harness pipeline
// ============================================================
export {
  HarnessPipeline,
  createHarnessContext,
  type HarnessContext,
  type HarnessHandler,
  type StepDefinition,
  type ProcessDefinition,
  type ParallelGroupDefinition,
  type StepEntry,
  type RoutingDecision,
  type ResolvedTools,
  type HumanInputField,
  type ProcessSourceConfig,
  type ProcessOutputDeliveryConfig,
  type ChainDefinition,
  type OutboundQualityRule,
  type OutboundActionRecord,
  type StagedOutboundAction,
} from "./harness/index.js";

export {
  HarnessEventEmitter,
  harnessEvents,
  type HarnessEvent,
} from "./harness/events.js";

// Built-in handlers
export {
  routingHandler,
  trustGateHandler,
  stepExecutionHandler,
  setAdapterRegistry,
  setSystemAgentResolver,
  setSessionTrustResolver,
  setSamplingSalt,
  parseHarnessConfig,
  type HarnessConfig,
  // Model purpose resolution (Brief 128)
  modelPurposeResolverHandler,
  resolveModelPurpose,
  // Operating Cycle handlers (Brief 116)
  identityRouterHandler,
  voiceCalibrationHandler,
  broadcastDirectClassifierHandler,
  outboundQualityGateHandler,
  // Brief 228 / Insight-217 — shared multi-step pipeline helper
  readPriorStepOutputs,
} from "./harness/index.js";

// ============================================================
// Trust
// ============================================================
export {
  SPOT_CHECK_RATE,
  computeStructuredDiff,
  computeEditRatio,
  classifyEditSeverity,
  classifyEdit,
  type DiffStats,
  type StructuredDiff,
} from "./trust/index.js";

// ============================================================
// LLM types
// ============================================================
export {
  type LlmTextBlock,
  type LlmToolUseBlock,
  type LlmThinkingBlock,
  type LlmContentBlock,
  type LlmToolResultBlock,
  type LlmMessageContent,
  type LlmMessage,
  type LlmToolDefinition,
  type LlmCompletionRequest,
  type LlmCompletionResponse,
  type LlmProvider,
  type StreamEvent,
  type ModelPurpose,
  MODEL_PURPOSES,
  extractText,
  extractToolUse,
} from "./llm/index.js";

// ============================================================
// Cognitive framework
// ============================================================
export {
  getCognitiveCore,
  getCognitiveCoreCompact,
  getCognitiveModeExtension,
  configureCognitivePath,
  clearCognitiveCoreCache,
  extractSections,
} from "./cognitive/index.js";

// ============================================================
// Goal decomposition
// ============================================================
export * from "./goal-decomposition.js";

// ============================================================
// Duration parser
// ============================================================
export { parseDuration, isValidDuration } from "./duration.js";

// ============================================================
// Learning (SLM training data pipeline types — Brief 135/136)
// ============================================================
export {
  type TrainingExample,
  type TrainingDataExport,
  type TrainingDataOptions,
  type SlmReadinessScore,
  type SlmReadinessSignals,
  type SlmReadinessThresholds,
  DEFAULT_READINESS_THRESHOLDS,
  SLM_SUITABLE_PURPOSES,
} from "./learning/index.js";

// ============================================================
// Content blocks
// ============================================================
export * from "./content-blocks.js";

// ============================================================
// Runner — runner kinds, dispatch state machine, adapter contract,
// chain resolution, webhook schema (Brief 215)
// ============================================================
export {
  // kinds
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
  // state machine
  runnerDispatchEventValues,
  isTerminalDispatchStatus,
  transitionDispatch,
  type RunnerDispatchEvent,
  type DispatchTransitionOk,
  type DispatchTransitionError,
  type DispatchTransitionResult,
  // interface
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
  // resolution
  resolveChain,
  type WorkItemResolutionRef,
  type ProjectResolutionRef,
  type ProjectRunnerResolutionRef,
  type ResolutionError,
  type ResolutionErrorCode,
  type ResolutionOk,
  type ResolutionResult,
  // webhook
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
  type ClaudeCodeRoutineStatusPayload,
  type ClaudeManagedAgentStatusPayload,
  type GithubActionStatusPayload,
  type CloudRunnerCallbackState,
  type RoutineCallbackState,
  type WorkflowRunConclusion,
  // poll cadences
  pollCadenceMs,
  getPollCadenceMs,
  pollableKinds,
  // pause-payload helper (Brief 221)
  mintRunnerDispatchPause,
  parseKindOption,
  type MintRunnerDispatchPauseInput,
  type PauseWorkItemRef,
  type PauseProjectRef,
  type PauseRunnerOption,
  type PauseCopy,
  // status-card builder (Brief 221 §D6 + §D12)
  buildRunnerDispatchCard,
  isRunnerDispatchCard,
  RUNNER_DISPATCH_CARD_KIND,
  type BuildRunnerDispatchCardInput,
  type RunnerDispatchCardMetadata,
} from "./runner/index.js";

// ============================================================
// Projects — pure status-transition invariants (Brief 215)
// ============================================================
export {
  projectStatusValues,
  validateStatusTransition,
  type ProjectStatus,
  type ProjectInvariantSnapshot,
  type InvariantErrorCode,
  type InvariantError,
  type InvariantResult,
} from "./projects/invariants.js";

// ============================================================
// Work Items — brief-equivalent layer types + validators (Brief 223)
// ============================================================
export * from "./work-items/index.js";

// ============================================================
// Bridge — Workspace Local Bridge wire types + state machine (Brief 212)
// ============================================================
export {
  // state machine
  bridgeJobStateValues,
  bridgeJobEventValues,
  isTerminalBridgeJobState,
  transitionBridgeJob,
  type BridgeJobState,
  type BridgeJobEvent,
  type BridgeJobTransitionOk,
  type BridgeJobTransitionError,
  type BridgeJobTransitionResult,
  // wire
  BRIDGE_METHODS,
  BRIDGE_NOTIFICATIONS,
  request as bridgeRequest,
  notification as bridgeNotification,
  success as bridgeSuccess,
  errorResponse as bridgeErrorResponse,
  isRequest as isBridgeRequest,
  isNotification as isBridgeNotification,
  isSuccess as isBridgeSuccess,
  isError as isBridgeError,
  type BridgeMethod,
  type BridgeNotification,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type JsonRpcSuccess,
  type JsonRpcError,
  type JsonRpcFrame,
  // types
  type BridgeJob,
  type BridgeJobKind,
  type BridgePayload,
  type BridgeExecPayload,
  type BridgeTmuxSendPayload,
  type BridgeFrame,
  type BridgeStreamFrame,
  type BridgeResultFrame,
  type RegisteredDevice,
  type LocalBridge,
} from "./bridge/index.js";

// ============================================================
// Onboarding analyser intermediate types (Brief 226)
// ============================================================
export * from "./onboarding/types.js";
