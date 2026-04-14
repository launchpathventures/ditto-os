/**
 * Ditto Web — Engine Import Layer
 *
 * Thin import layer for engine functions used by the web app.
 * All engine calls are server-side only (via Server Actions / Route Handlers).
 * This file MUST only be imported in server components or API routes.
 *
 * IMPORTANT: Engine modules open SQLite at import time. Use dynamic import()
 * in route handlers to avoid build-time DB conflicts. This module re-exports
 * types statically but provides async loaders for runtime values.
 */

// Types only (no runtime side effects)
export type { SelfContext, SelfConverseResult, SelfConverseCallbacks } from "../../../src/engine/self";
export type { SelfStreamEvent } from "../../../src/engine/self-stream";
export type { HarnessEvent } from "../../../src/engine/events";
export type {
  ContentBlock,
  ContentBlockType,
  ActionDef,
  InputFieldDef,
  TextBlock,
  ReviewCardBlock,
  StatusCardBlock,
  ActionBlock,
  InputRequestBlock,
  KnowledgeCitationBlock,
  ProgressBlock,
  DataBlock,
  ImageBlock,
  CodeBlock,
  ReasoningTraceBlock,
  SuggestionBlock,
  AlertBlock,
  KnowledgeSynthesisBlock,
  ProcessProposalBlock,
  GatheringIndicatorBlock,
  ChecklistBlock,
  ChartBlock,
  MetricBlock,
  AnnotatedField,
  PreCheck,
  RecordBlock,
  TableColumn,
  TableRow,
  InteractiveTableBlock,
  FieldAnnotation,
  ArtifactBlock,
  InteractiveField,
  WorkItemFormBlock,
  ConnectionSetupBlock,
  FormSubmitAction,
} from "../../../src/engine/content-blocks";
// renderBlockToText is a pure function — import it directly from
// @engine/content-blocks in client components to avoid pulling in
// the server-only getEngine() dynamic imports.

/**
 * Lazy-load engine modules to avoid build-time SQLite initialization.
 * Call this at the start of route handlers, not at module scope.
 *
 * For API key connections (anthropic/openai), initLlm() is called to
 * set up the provider. For CLI subscription connections, initLlm() is
 * skipped — the streaming adapter spawns CLI tools directly.
 */
export async function getEngine() {
  const [selfStream, events, llm, feedAssembler, reviewActions, surfaceActions, feedbackRecorder] = await Promise.all([
    import("../../../src/engine/self-stream"),
    import("../../../src/engine/events"),
    import("../../../src/engine/llm"),
    import("../../../src/engine/feed-assembler"),
    import("../../../src/engine/review-actions"),
    import("../../../src/engine/surface-actions"),
    import("../../../src/engine/harness-handlers/feedback-recorder"),
  ]);

  // Initialize LLM providers. Both streaming and non-streaming paths
  // require initLlm() to have run (streaming uses getActiveProvider()).
  // The catch block handles repeated calls — initLlm() will re-create
  // providers if called again, but validateConfig() may throw.
  if (!llm.isMockLlmMode()) {
    try {
      llm.initLlm();
    } catch {
      // Already initialized, or no API keys configured yet.
    }
  }

  return {
    selfConverseStream: selfStream.selfConverseStream,
    harnessEvents: events.harnessEvents,
    initLlm: llm.initLlm,
    assembleFeed: feedAssembler.assembleFeed,
    approveRun: reviewActions.approveRun,
    editRun: reviewActions.editRun,
    rejectRun: reviewActions.rejectRun,
    handleSurfaceAction: surfaceActions.handleSurfaceAction,
    registerBlockActions: surfaceActions.registerBlockActions,
    acceptCorrectionPattern: feedbackRecorder.acceptCorrectionPattern,
    promoteToQualityCriteria: feedbackRecorder.promoteToQualityCriteria,
    logTeachAction: feedbackRecorder.logTeachAction,
    dismissInsightPattern: feedbackRecorder.dismissInsightPattern,
  };
}
