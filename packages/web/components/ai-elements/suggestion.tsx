"use client";

/**
 * Suggestion — Adopted from AI Elements
 *
 * Horizontal chip row for new-user starter suggestions.
 * Clicking a chip sends its text as a user message.
 *
 * AC7: Renders 2-3 starter suggestions when conversation is empty.
 *
 * Provenance: vercel/ai-elements suggestion.tsx, adapted for Ditto design tokens.
 */

import { cn } from "@/lib/utils";

interface SuggestionProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  className?: string;
}

export function Suggestions({ suggestions, onSelect, className }: SuggestionProps) {
  if (suggestions.length === 0) return null;

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
