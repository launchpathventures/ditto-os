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
