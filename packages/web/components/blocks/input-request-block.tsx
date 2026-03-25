"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { InputRequestBlock } from "@/lib/engine";

interface Props {
  block: InputRequestBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function InputRequestBlockComponent({ block, onAction }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(() => {
    setIsSubmitting(true);
    onAction?.(`input.submit.${block.requestId}`, { values });
  }, [block.requestId, values, onAction]);

  return (
    <Card className="my-2 p-4 border-accent/30">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-sm font-medium text-text-primary">{block.prompt}</span>
        </div>

        {block.fields.map((field) => (
          <div key={field.name} className="space-y-1">
            <label className="text-sm text-text-secondary">
              {field.label}{field.required && " *"}
            </label>
            {field.type === "select" ? (
              <select
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                className="w-full rounded-md border border-border bg-surface-primary px-3 py-2 text-sm"
              >
                <option value="">Select...</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                placeholder={field.placeholder}
                className="w-full rounded-md border border-border bg-surface-primary px-3 py-2 text-sm min-h-[80px]"
              />
            ) : (
              <Input
                type={field.type === "credential" ? "password" : "text"}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                placeholder={field.placeholder}
                autoComplete={field.type === "credential" ? "off" : undefined}
              />
            )}
          </div>
        ))}

        <Button onClick={handleSubmit} disabled={isSubmitting} size="sm">
          {isSubmitting ? "Submitting..." : "Submit"}
        </Button>
      </div>
    </Card>
  );
}
