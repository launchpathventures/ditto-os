"use client";

/**
 * Suggestion — Adopted from AI Elements
 *
 * Starter suggestions for empty conversation state.
 * Supports row (horizontal chips) and grid (2x2) layout variants.
 *
 * AC7 (058): Renders starter suggestions when conversation is empty.
 * AC9 (066): Grid variant with 2x2 layout for empty state redesign.
 *
 * Provenance: vercel/ai-elements suggestion.tsx, adapted for Ditto design tokens.
 */

import { cn } from "@/lib/utils";

interface SuggestionProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  /** Layout variant: "row" (default horizontal chips) or "grid" (2x2 grid) */
  variant?: "row" | "grid";
  className?: string;
}

export function Suggestions({ suggestions, onSelect, variant = "row", className }: SuggestionProps) {
  if (suggestions.length === 0) return null;

  if (variant === "grid") {
    return (
      <div className={cn("grid grid-cols-2 gap-2 max-w-[400px]", className)}>
        {suggestions.map((text) => (
          <button
            key={text}
            onClick={() => onSelect(text)}
            className={cn(
              "px-4 py-3 text-sm text-left rounded-xl transition-colors cursor-pointer",
              "bg-surface-raised hover:bg-surface",
              "text-text-secondary hover:text-text-primary",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-2 justify-center", className)}>
      {suggestions.map((text) => (
        <button
          key={text}
          onClick={() => onSelect(text)}
          className={cn(
            "px-4 py-2 text-sm rounded-full transition-all duration-150",
            "bg-surface-raised border border-border",
            "text-text-secondary hover:text-text-primary",
            "hover:border-border-strong hover:shadow-subtle",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
