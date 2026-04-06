"use client";

/**
 * Quick-reply pills — tappable conversation starters.
 * Horizontal scroll on mobile. Tap sends as user message.
 * Provenance: Drift/Qualified chatbot pattern, Brief 094.
 */
export function QuickReplyPills({
  pills,
  onSelect,
  disabled = false,
}: {
  pills: string[];
  onSelect: (pill: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 animate-fade-in">
      {pills.map((pill) => (
        <button
          key={pill}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(pill)}
          className="shrink-0 rounded-full border border-border bg-white px-4 py-2 text-sm text-text-secondary transition-colors hover:border-vivid hover:text-vivid disabled:opacity-40"
        >
          {pill}
        </button>
      ))}
    </div>
  );
}
