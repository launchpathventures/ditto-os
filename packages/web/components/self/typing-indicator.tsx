"use client";

/**
 * Ditto Typing Indicator
 *
 * Three subtle dots pulsing in accent colour.
 * "Not bouncing — gently fading in and out. Calm, not anxious."
 *
 * Visual spec: docs/research/visual-identity-design-system-ux.md §4.4
 */

interface TypingIndicatorProps {
  status?: string;
}

export function TypingIndicator({ status }: TypingIndicatorProps) {
  return (
    <div className="flex gap-3 px-4 py-3 max-w-3xl mx-auto">
      {/* Self indicator dot */}
      <div className="flex-shrink-0 mt-1.5">
        <div className="w-2 h-2 rounded-full bg-accent" />
      </div>

      <div className="flex flex-col gap-1">
        {/* Pulsing dots */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full bg-accent"
            style={{ animation: "pulse-dot 1.4s ease-in-out infinite" }}
          />
          <div
            className="w-1.5 h-1.5 rounded-full bg-accent"
            style={{
              animation: "pulse-dot 1.4s ease-in-out infinite",
              animationDelay: "0.2s",
            }}
          />
          <div
            className="w-1.5 h-1.5 rounded-full bg-accent"
            style={{
              animation: "pulse-dot 1.4s ease-in-out infinite",
              animationDelay: "0.4s",
            }}
          />
        </div>

        {/* Status text (e.g., "Delegating to researcher...") */}
        {status && (
          <span className="text-sm text-text-muted">{status}</span>
        )}
      </div>
    </div>
  );
}
