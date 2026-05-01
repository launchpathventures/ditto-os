"use client";

/**
 * Quick-reply pills — tappable conversation starters.
 * Horizontal scroll on mobile. Tap sends as user message.
 * Treatment: quiet white-on-hairline pills with neutral lift hover. The
 * voice-CTA black button is the only emphatic surface above the composer.
 * Provenance: Drift/Qualified pattern + Jace AI hover idiom (refero May 2026).
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
    <div className="flex gap-2 pb-1 animate-fade-in overflow-x-auto md:flex-wrap md:overflow-x-visible scrollbar-hidden">
      {pills.map((pill) => (
        <button
          key={pill}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(pill)}
          className="shrink-0 rounded-full border border-border bg-white px-3.5 py-1.5 md:px-4 md:py-2 text-sm font-medium text-text-primary transition-all duration-150 ease-out hover:-translate-y-px hover:border-text-primary/30 hover:bg-surface-raised active:translate-y-0 active:bg-surface-subtle disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:bg-white"
        >
          {pill}
        </button>
      ))}
    </div>
  );
}
