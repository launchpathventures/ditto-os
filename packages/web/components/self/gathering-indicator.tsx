"use client";

/**
 * Ditto — Gathering Indicator
 *
 * Subtle progress indicator during onboarding gathering phase.
 * "Getting to know your business..." — not a progress bar, just
 * a calm signal that Ditto is learning.
 *
 * Provenance: Brief 044 (AC10).
 */

import { cn } from "@/lib/utils";

interface GatheringIndicatorProps {
  message?: string;
  className?: string;
}

export function GatheringIndicator({
  message = "Getting to know your business...",
  className,
}: GatheringIndicatorProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-xs text-text-tertiary",
        className,
      )}
    >
      {/* Pulsing dot — matches typing indicator pattern */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent/40" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-accent/60" />
      </span>
      <span>{message}</span>
    </div>
  );
}
