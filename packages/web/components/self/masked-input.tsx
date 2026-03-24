"use client";

/**
 * Ditto — Masked Credential Input
 *
 * Secure input field for API keys and tokens. The value is NEVER
 * written to conversation history, activity logs, or stepRuns.
 * Submits directly to /api/credential, bypassing the chat stream.
 *
 * AC12: API keys entered via secure field, never appear in conversation.
 *
 * Provenance: Brief 040, Insight-090 (integration auth is a conversation moment).
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface MaskedCredentialInputProps {
  service: string;
  processSlug: string | null;
  fieldLabel: string;
  placeholder: string;
  onComplete: (success: boolean, message: string) => void;
}

export function MaskedCredentialInput({
  service,
  processSlug,
  fieldLabel,
  placeholder,
  onComplete,
}: MaskedCredentialInputProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!value.trim()) {
      setError("Please enter a value.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/credential", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          processSlug: processSlug ?? undefined,
          value: value.trim(),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to save credential.");
      }

      // Clear the value immediately
      setValue("");
      onComplete(true, `${service} connected successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save credential.");
      onComplete(false, err instanceof Error ? err.message : "Failed to save credential.");
    } finally {
      setIsSubmitting(false);
    }
  }, [value, service, processSlug, onComplete]);

  return (
    <Card className="my-3 p-4 border-accent/30">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-sm font-medium text-text-primary">
            {fieldLabel}
          </span>
        </div>

        <p className="text-sm text-text-secondary">
          This value will be encrypted and stored securely. It will never appear
          in our conversation.
        </p>

        <div className="flex gap-2">
          <Input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="flex-1 font-mono"
            autoComplete="off"
            data-lpignore="true"
            disabled={isSubmitting}
          />
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !value.trim()}
            size="sm"
          >
            {isSubmitting ? "Saving..." : "Connect"}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-negative">{error}</p>
        )}
      </div>
    </Card>
  );
}
