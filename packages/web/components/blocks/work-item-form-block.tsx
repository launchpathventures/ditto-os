"use client";

/**
 * Block renderer for WorkItemFormBlock (Brief 072).
 *
 * Form with type selector (task/goal/exception), content textarea,
 * and optional goalContext. Local React state — no server round-trip
 * on edit. "Create" submits via onAction("form-submit", { blockType: "work_item_form", values }).
 *
 * Provenance: Brief 072, ADR-021 block registry.
 */

import { useState, useCallback } from "react";
import type { WorkItemFormBlock } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  block: WorkItemFormBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function WorkItemFormBlockComponent({ block, onAction }: Props) {
  // Initialize from block defaults and field values
  const initialValues: Record<string, string | number | boolean> = {};
  for (const field of block.fields) {
    if (field.value !== undefined) {
      initialValues[field.name] = field.value;
    } else if (block.defaults && field.name in block.defaults) {
      initialValues[field.name] = block.defaults[field.name] as string | number | boolean;
    } else {
      initialValues[field.name] = "";
    }
  }

  const [values, setValues] = useState<Record<string, string | number | boolean>>(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = useCallback((name: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    setIsSubmitting(true);
    onAction?.("form-submit", {
      blockType: "work_item_form",
      values: { ...values },
    });
  }, [values, onAction]);

  return (
    <div className="my-4 border-l-2 border-l-vivid rounded-xl border border-border bg-surface-primary shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-surface-secondary/50">
        <h3 className="text-sm font-medium text-text-primary">
          Create Work Item
        </h3>
      </div>

      {/* Fields */}
      <div className="px-4 py-3 space-y-3">
        {block.fields.map((field) => (
          <div key={field.name} className="space-y-1">
            <label className="text-sm text-text-secondary">
              {field.label}{field.required ? " *" : ""}
            </label>
            {field.type === "select" ? (
              <select
                value={String(values[field.name] ?? "")}
                onChange={(e) => updateField(field.name, e.target.value)}
                className="w-full rounded-md border border-border bg-surface-primary px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === "number" ? (
              <Input
                type="number"
                value={String(values[field.name] ?? "")}
                onChange={(e) => updateField(field.name, e.target.valueAsNumber || 0)}
                placeholder={field.placeholder}
              />
            ) : field.type === "toggle" ? (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(e) => updateField(field.name, e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm text-text-secondary">{field.placeholder}</span>
              </div>
            ) : (
              // text — render as textarea if name suggests long content
              field.name === "content" || field.name === "description" ? (
                <textarea
                  value={String(values[field.name] ?? "")}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-md border border-border bg-surface-primary px-3 py-2 text-sm min-h-[80px]"
                />
              ) : (
                <Input
                  value={String(values[field.name] ?? "")}
                  onChange={(e) => updateField(field.name, e.target.value)}
                  placeholder={field.placeholder}
                />
              )
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-border">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          size="sm"
        >
          {isSubmitting ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );
}
