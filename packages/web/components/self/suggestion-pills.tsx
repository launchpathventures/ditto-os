"use client";

/**
 * Suggestion Pills — tappable conversation starters for the workspace.
 * Horizontal scroll on mobile, flex-wrap on desktop.
 * Tap sends pill text as a user message.
 *
 * Provenance: welcome/quick-reply-pills.tsx, Brief 094.
 */

export function SuggestionPills({
  pills,
  onSelect,
}: {
  pills: string[];
  onSelect: (pill: string) => void;
}) {
  if (pills.length === 0) return null;

  return (
    <div className="flex gap-2 pb-1 animate-fade-in overflow-x-auto md:flex-wrap md:overflow-x-visible scrollbar-hidden">
      {pills.map((pill) => (
        <button
          key={pill}
          type="button"
          onClick={() => onSelect(pill)}
          className="shrink-0 rounded-full border border-border bg-surface-raised px-3 py-1.5 md:px-4 md:py-2 text-sm text-text-primary transition-all duration-150 ease-out hover:-translate-y-px hover:border-text-primary/30 hover:bg-surface-raised"
        >
          {pill}
        </button>
      ))}
    </div>
  );
}
