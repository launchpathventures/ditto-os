/**
 * AI Elements — Component Library Index (Brief 061)
 *
 * Barrel exports for all adopted AI Elements components.
 * Provenance: vercel/ai-elements, adapted for Ditto design tokens.
 */

// Conversation Chrome
export { Shimmer } from "./shimmer";
export { Reasoning, ReasoningRoot, ReasoningTrigger, ReasoningContent } from "./reasoning";
export {
  Tool,
  ToolRoot,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
  StatusBadge,
} from "./tool";
export {
  Confirmation,
  ConfirmationRoot,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
} from "./confirmation";
export {
  PromptInput,
  PromptInputProvider,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputActions,
} from "./prompt-input";
export { Suggestions } from "./suggestion";
export { Conversation } from "./conversation";
export { Message } from "./message";

// New AI Elements (Brief 061)
export {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  ChainOfThoughtContent,
  ChainOfThoughtSearchResults,
  ChainOfThoughtImage,
} from "./chain-of-thought";
export { Plan, PlanHeader, PlanTitle, PlanDescription, PlanTrigger, PlanContent } from "./plan";
export {
  Queue,
  QueueSection,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  QueueItemActions,
} from "./queue";
export {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCarousel,
  InlineCitationSource,
  InlineCitationQuote,
  SourceTypeIcon,
} from "./inline-citation";
export { DefaultSources, Sources, SourcesTrigger, SourcesContent, Source } from "./sources";
export { getToolDisplayLabel } from "./tool-display-names";
export type { ToolDisplayLabel } from "./tool-display-names";
export { Task, TaskTrigger, TaskContent, TaskItemFile } from "./task";
export { CodeBlock } from "./code-block";

// Hooks
export { useControllableState } from "./use-controllable-state";
