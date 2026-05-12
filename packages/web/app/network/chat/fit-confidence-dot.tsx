"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { SuggestedCandidate } from "@/lib/engine";

export type FitConfidenceValue = SuggestedCandidate["fitConfidence"];

const FIT_CONFIDENCE_COPY: Record<FitConfidenceValue, string> = {
  high: "Strong fit on shape + availability",
  medium: "Some signal - worth a look",
  low: "Long shot - included for breadth",
};

const FIT_CONFIDENCE_STYLES: Record<FitConfidenceValue, string> = {
  high: "bg-[#b7efb2] shadow-[0_0_0_1px_rgba(183,239,178,0.4)]",
  medium: "bg-[#ffef99] shadow-[0_0_0_1px_rgba(255,239,153,0.45)]",
  low: "border border-border-muted bg-transparent",
};

export function fitConfidenceTooltip(value: FitConfidenceValue): string {
  return FIT_CONFIDENCE_COPY[value];
}

export function FitConfidenceDot({
  value,
  className,
}: {
  value: FitConfidenceValue;
  className?: string;
}) {
  const tooltip = fitConfidenceTooltip(value);
  const tooltipId = `${useId()}-fit-confidence-${value}`;

  return (
    <button
      type="button"
      aria-label={`Fit confidence: ${value}`}
      aria-describedby={tooltipId}
      className={cn(
        "group relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md outline-none",
        "focus-visible:ring-2 focus-visible:ring-text-primary/25 focus-visible:ring-offset-2",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("block h-2 w-2 rounded-full", FIT_CONFIDENCE_STYLES[value])}
      />
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 top-7 z-20 w-max max-w-[180px] -translate-x-1/2 rounded-md",
          "bg-text-primary px-2 py-1 text-center text-[11px] font-medium leading-snug text-white opacity-0 shadow-medium",
          "transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {tooltip}
      </span>
    </button>
  );
}
