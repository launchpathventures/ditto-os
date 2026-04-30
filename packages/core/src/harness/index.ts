/**
 * @ditto/core — Harness Module
 *
 * The chain-of-responsibility pipeline, handler interface,
 * context types, and built-in handlers.
 */

export {
  HarnessPipeline,
  createHarnessContext,
  type HarnessContext,
  type HarnessHandler,
  type StepDefinition,
  type ProcessDefinition,
  type ParallelGroupDefinition,
  type StepEntry,
  type HumanInputField,
  type RoutingDecision,
  type ResolvedTools,
  type ProcessSourceConfig,
  type ProcessOutputDeliveryConfig,
  type ChainDefinition,
  type OutboundQualityRule,
  type OutboundActionRecord,
  type StagedOutboundAction,
} from "./harness.js";

export {
  HarnessEventEmitter,
  harnessEvents,
  type HarnessEvent,
} from "./events.js";

// Built-in handlers
export { routingHandler } from "./handlers/routing.js";
export { trustGateHandler, setSessionTrustResolver, setSamplingSalt } from "./handlers/trust-gate.js";
export { stepExecutionHandler, executeStep, setAdapterRegistry, setSystemAgentResolver } from "./handlers/step-execution.js";
export { parseHarnessConfig, type HarnessConfig } from "./handlers/harness-config.js";

// Shared helper for multi-step pipelines (Brief 228 / Insight-217)
export { readPriorStepOutputs } from "./step-output-reader.js";

// Model purpose resolution (Brief 128)
export { modelPurposeResolverHandler, resolveModelPurpose } from "./handlers/model-purpose-resolver.js";

// Operating Cycle handlers (Brief 116)
export { identityRouterHandler } from "./handlers/identity-router.js";
export { voiceCalibrationHandler } from "./handlers/voice-calibration.js";
export { broadcastDirectClassifierHandler } from "./handlers/broadcast-direct-classifier.js";
export { outboundQualityGateHandler } from "./handlers/outbound-quality-gate.js";
