"use client";

/**
 * Ditto — Block Registry (ADR-021 Surface Protocol)
 *
 * Unified component registry: maps ContentBlock.type → React component.
 * Handles all 22 block types. Unknown types fall back to text rendering.
 *
 * Provenance: Brief 045, ADR-021, existing item-registry.tsx pattern.
 */

import type { ContentBlock } from "@/lib/engine";
import { TextBlockComponent } from "./text-block";
import { ReviewCardBlockComponent } from "./review-card-block";
import { StatusCardBlockComponent } from "./status-card-block";
import { ActionBlockComponent } from "./action-block";
import { InputRequestBlockComponent } from "./input-request-block";
import { KnowledgeCitationBlockComponent } from "./knowledge-citation-block";
import { ProgressBlockComponent } from "./progress-block";
import { DataBlockComponent } from "./data-block";
import { ImageBlockComponent } from "./image-block";
import { CodeBlockComponent } from "./code-block";
import { ReasoningTraceBlockComponent } from "./reasoning-trace-block";
import { SuggestionBlockComponent } from "./suggestion-block";
import { AlertBlockComponent } from "./alert-block";
import { KnowledgeSynthesisBlockComponent } from "./knowledge-synthesis-block";
import { ProcessProposalBlockComponent } from "./process-proposal-block";
import { GatheringIndicatorBlockComponent } from "./gathering-indicator-block";
import { ChecklistBlockComponent } from "./checklist-block";
import { ChartBlockComponent } from "./chart-block";
import { MetricBlockComponent } from "./metric-block";
import { RecordBlockComponent } from "./record-block";
import { InteractiveTableBlockComponent } from "./interactive-table-block";
import { ArtifactBlockComponent } from "./artifact-block";
import { WorkItemFormBlockComponent } from "./work-item-form-block";
import { ConnectionSetupBlockComponent } from "./connection-setup-block";

interface BlockRendererProps {
  block: ContentBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function BlockRenderer({ block, onAction }: BlockRendererProps) {
  switch (block.type) {
    case "text":
      return <TextBlockComponent block={block} />;
    case "review_card":
      return <ReviewCardBlockComponent block={block} onAction={onAction} />;
    case "status_card":
      return <StatusCardBlockComponent block={block} />;
    case "actions":
      return <ActionBlockComponent block={block} onAction={onAction} />;
    case "input_request":
      return <InputRequestBlockComponent block={block} onAction={onAction} />;
    case "knowledge_citation":
      return <KnowledgeCitationBlockComponent block={block} />;
    case "progress":
      return <ProgressBlockComponent block={block} />;
    case "data":
      return <DataBlockComponent block={block} />;
    case "image":
      return <ImageBlockComponent block={block} />;
    case "code":
      return <CodeBlockComponent block={block} />;
    case "reasoning_trace":
      return <ReasoningTraceBlockComponent block={block} />;
    case "suggestion":
      return <SuggestionBlockComponent block={block} onAction={onAction} />;
    case "alert":
      return <AlertBlockComponent block={block} onAction={onAction} />;
    case "knowledge_synthesis":
      return <KnowledgeSynthesisBlockComponent block={block} onAction={onAction} />;
    case "process_proposal":
      return <ProcessProposalBlockComponent block={block} onAction={onAction} />;
    case "gathering_indicator":
      return <GatheringIndicatorBlockComponent block={block} />;
    case "checklist":
      return <ChecklistBlockComponent block={block} />;
    case "chart":
      return <ChartBlockComponent block={block} />;
    case "metric":
      return <MetricBlockComponent block={block} />;
    case "record":
      return <RecordBlockComponent block={block} onAction={onAction} />;
    case "interactive_table":
      return <InteractiveTableBlockComponent block={block} onAction={onAction} />;
    case "artifact":
      return <ArtifactBlockComponent block={block} onAction={onAction} />;
    case "work_item_form":
      return <WorkItemFormBlockComponent block={block} onAction={onAction} />;
    case "connection_setup":
      return <ConnectionSetupBlockComponent block={block} onAction={onAction} />;
    default: {
      // Exhaustiveness check — TypeScript will error if a type is missing (AC15)
      const _exhaustive: never = block;
      // Graceful fallback — render any text-like field (AC6)
      const fallback = (_exhaustive as Record<string, unknown>);
      return (
        <div className="text-sm text-text-secondary whitespace-pre-wrap">
          {typeof fallback.text === "string" ? fallback.text : JSON.stringify(fallback)}
        </div>
      );
    }
  }
}

/** Render an array of content blocks */
export function BlockList({
  blocks,
  onAction,
}: {
  blocks: ContentBlock[];
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <BlockRenderer key={`${block.type}-${i}`} block={block} onAction={onAction} />
      ))}
    </div>
  );
}
