/**
 * Ditto — Content Block Types (ADR-021 Surface Protocol)
 *
 * Re-exported from @ditto/core. The canonical definitions live in packages/core.
 */

export {
  // Action definitions
  type ActionDef,
  type InputFieldDef,

  // Block types
  type TextBlock,
  type ReviewCardBlock,
  type StatusCardBlock,
  type ActionBlock,
  type InputRequestBlock,
  type KnowledgeCitationBlock,
  type ProgressBlock,
  type FieldAnnotation,
  type DataBlock,
  type ImageBlock,
  type CodeBlock,
  type ReasoningTraceBlock,
  type SuggestionBlock,
  type AlertBlock,
  type KnowledgeSynthesisBlock,
  type InteractiveField,
  type ProcessProposalBlock,
  type WorkItemFormBlock,
  type ConnectionSetupBlock,
  type FormSubmitAction,
  type GatheringIndicatorBlock,
  type ChecklistBlock,
  type ChartBlock,
  type MetricBlock,
  type AnnotatedField,
  type PreCheck,
  type RecordBlock,
  type TableColumn,
  type TableRow,
  type InteractiveTableBlock,
  type ArtifactBlock,
  type SendingIdentityChoiceBlock,
  type TrustMilestoneBlock,

  // Response-level metadata
  type ConfidenceCheck,
  type ConfidenceUncertainty,
  type ConfidenceAssessment,

  // Discriminated union
  type ContentBlock,
  type ContentBlockType,

  // Text fallback renderer
  renderBlockToText,
} from "@ditto/core";
