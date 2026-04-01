"use client";

/**
 * Ditto Prompt Input — Composed from AI Elements PromptInput
 *
 * Floating rounded-rectangle input with shadow elevation, DotParticles branding,
 * send-button reveal animation, and contextual placeholder text.
 *
 * Provenance: AI Elements prompt-input (deep adoption), Ditto design tokens.
 * Design spec: docs/research/prompt-input-refinement-ux.md
 */

import { type FormEvent, type ChangeEvent, useCallback } from "react";
import {
  PromptInput as AIPromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { DotParticles } from "@/app/setup/dot-particles";
import { cn } from "@/lib/utils";
import type { ChatStatus } from "ai";

interface DittoPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  hasMessages?: boolean;
}

export function DittoPromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  isStreaming = false,
  placeholder,
  hasMessages = false,
}: DittoPromptInputProps) {
  const status: ChatStatus = isStreaming
    ? "streaming"
    : isLoading
      ? "submitted"
      : "ready";

  // AC5: Contextual placeholder based on state
  const activePlaceholder =
    placeholder ??
    (isStreaming
      ? "Add to conversation..."
      : hasMessages
        ? "Message Ditto..."
        : "What would you like to work on?");

  const handleSubmit = useCallback(
    (_message: PromptInputMessage, _event: FormEvent<HTMLFormElement>) => {
      if (value.trim()) {
        onSubmit();
      }
    },
    [value, onSubmit],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  // AC2: Submit button hidden when input is empty and not generating
  const hasText = value.trim().length > 0;
  const isGenerating = status === "submitted" || status === "streaming";
  const showSubmit = hasText || isGenerating;

  return (
    <div
      className={cn(
        // Visual container: floating rounded rectangle
        "max-w-[720px] mx-auto w-full",
        "rounded-2xl bg-surface-raised",
        // AC1: Shadow elevation instead of border
        "shadow-[var(--shadow-medium)]",
        "focus-within:shadow-[var(--shadow-large)]",
        "transition-shadow duration-200 ease-in-out",
      )}
    >
      <AIPromptInput
        onSubmit={handleSubmit}
        // Strip InputGroup's default border/shadow so our wrapper controls the visual
        className={cn(
          "[&_[data-slot=input-group]]:border-0",
          "[&_[data-slot=input-group]]:shadow-none",
          "[&_[data-slot=input-group]]:bg-transparent",
          "[&_[data-slot=input-group]]:rounded-2xl",
          // Remove focus-within ring from InputGroup (wrapper handles it via shadow)
          "[&_[data-slot=input-group]]:focus-within:ring-0",
          "[&_[data-slot=input-group]]:focus-within:border-transparent",
        )}
        data-testid="prompt-input"
      >
        <PromptInputTextarea
          value={value}
          onChange={handleChange}
          placeholder={activePlaceholder}
          aria-label="Message input"
          // Taller textarea with comfortable padding
          className="min-h-[56px] text-base px-4 pt-3.5 pb-2 transition-[height] duration-150 ease-out"
          data-testid="chat-input"
        />
        <PromptInputFooter className="border-t-0 pt-0 pb-2.5 px-3">
          <PromptInputTools>
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger
                tooltip="Attach"
                className="text-muted-foreground"
              />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
                <PromptInputActionAddScreenshot />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
          </PromptInputTools>
          {/* Dots → Send crossfade: dots are Ditto's presence, they become the action */}
          <div className="relative size-8 flex items-center justify-center">
            {/* DotParticles: visible when idle, fades out when send appears */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                showSubmit ? "opacity-0 pointer-events-none" : "opacity-100",
              )}
            >
              <DotParticles size={24} />
            </div>
            {/* Send/Stop button: fades in when text is entered or generating */}
            <PromptInputSubmit
              status={status}
              onStop={onStop}
              data-testid="send-button"
              className={cn(
                "absolute inset-0 transition-all duration-200 ease-out",
                "bg-vivid hover:bg-vivid/90 text-white",
                showSubmit
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-75 pointer-events-none",
              )}
            />
          </div>
        </PromptInputFooter>
      </AIPromptInput>
    </div>
  );
}

// Re-export for backward compatibility
export { DittoPromptInput as PromptInput };
