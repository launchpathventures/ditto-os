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
