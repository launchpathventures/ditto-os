"use client";

/**
 * Block renderer for ProcessProposalBlock.
 * Wires onAction callbacks: "proposal-approve" and "proposal-adjust"
 * flow back through the conversation to the Self.
 *
 * Brief 072: When block.interactive is true, renders editable fields
 * with local React state — no server round-trip on edit.
 * "Create" submits via onAction("form-submit", { blockType: "process_proposal", values }).
 *
 * Provenance: Brief 044 (AC9), Brief 072, ADR-021 block registry.
 */

import { useState, useCallback } from "react";
import type { ProcessProposalBlock } from "@/lib/engine";
import { ProcessProposal } from "@/components/self/process-proposal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  block: ProcessProposalBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function ProcessProposalBlockComponent({ block, onAction }: Props) {
  // Non-interactive mode: render exactly as before (backward compatible)
  if (!block.interactive) {
    return (
      <ProcessProposal
        name={block.name}
        description={block.description}
        steps={block.steps}
        onApprove={() => onAction?.("proposal-approve")}
        onAdjust={() => onAction?.("proposal-adjust")}
      />
    );
  }

  // Interactive mode: editable fields with local state
  return <InteractiveProcessProposal block={block} onAction={onAction} />;
}

/** Interactive editable process proposal form */
function InteractiveProcessProposal({
  block,
  onAction,
}: Props) {
  const [name, setName] = useState(block.name ?? "");
  const [trigger, setTrigger] = useState(block.trigger ?? "");
  const [description, setDescription] = useState(block.description ?? "");
  const [steps, setSteps] = useState<string[]>(
    block.steps.map((s) => s.name),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addStep = useCallback(() => {
    setSteps((prev) => [...prev, ""]);
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateStep = useCallback((index: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }, []);

  const handleSubmit = useCallback(() => {
    setIsSubmitting(true);
    onAction?.("form-submit", {
      blockType: "process_proposal",
      values: {
        name,
        trigger,
        description,
        steps: steps.filter((s) => s.trim() !== ""),
      },
    });
  }, [name, trigger, description, steps, onAction]);

  return (
    <div className="my-4 border-l-2 border-l-vivid rounded-xl border border-border bg-surface-primary shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-surface-secondary/50">
        <h3 className="text-sm font-medium text-text-primary">
          Create Process
        </h3>
      </div>

      {/* Editable fields */}
      <div className="px-4 py-3 space-y-3">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-sm text-text-secondary">Name *</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quote Review"
          />
        </div>

        {/* Trigger */}
        <div className="space-y-1">
          <label className="text-sm text-text-secondary">Trigger</label>
          <Input
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="e.g. When a new quote request arrives"
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-sm text-text-secondary">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this process do?"
            className="w-full rounded-md border border-border bg-surface-primary px-3 py-2 text-sm min-h-[60px]"
          />
        </div>

        {/* Steps */}
        <div className="space-y-1">
          <label className="text-sm text-text-secondary">Steps</label>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-text-tertiary w-5 text-right shrink-0">
                  {i + 1}.
                </span>
                <Input
                  value={step}
                  onChange={(e) => updateStep(i, e.target.value)}
                  placeholder={`Step ${i + 1}`}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="text-text-tertiary hover:text-red-500 text-sm px-1 transition-colors"
                  aria-label={`Remove step ${i + 1}`}
                >
                  X
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addStep}
            className="mt-1 text-sm text-accent hover:text-accent/80 transition-colors"
          >
            + Add step
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim()}
          size="sm"
        >
          {isSubmitting ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );
}
