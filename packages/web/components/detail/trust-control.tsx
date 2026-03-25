"use client";

/**
 * Ditto — Trust Control Component
 *
 * Natural language trust slider: "Check everything" ↔ "Let it run".
 * Shows evidence data as narrative. Changes require confirmation.
 *
 * AC9: Natural language slider.
 * AC10: Evidence data as narrative.
 * AC11: Changes go through engine, require confirmation.
 * Constraint: MUST NOT show trust tier names.
 *
 * Provenance: Brief 042 (Navigation & Detail), Original to Ditto.
 */

import { useState, useCallback } from "react";
import { useUpdateTrust } from "@/lib/process-query";

interface TrustControlProps {
  processId: string;
  processName: string;
  currentTier: string;
  trustState: {
    approvalRate: number;
    runsInWindow: number;
    consecutiveCleanRuns: number;
    trend: "improving" | "stable" | "declining";
    approvals: number;
    edits: number;
    rejections: number;
  };
}

/** Map internal tier names to user-facing labels and slider positions. */
const TIER_CONFIG = [
  {
    tier: "supervised",
    label: "Check everything",
    description: "You review every piece of work before it goes out",
    position: 0,
  },
  {
    tier: "spot_checked",
    label: "Check a sample",
    description: "You review about 1 in 5 — the rest go through if they look good",
    position: 1,
  },
  {
    tier: "autonomous",
    label: "Let it run",
    description: "Work goes out on its own — you only see exceptions",
    position: 2,
  },
] as const;

// Critical tier is never shown in the slider — it's set by the system
function getTierPosition(tier: string): number {
  if (tier === "critical") return 0; // Treated as supervised in UI
  const config = TIER_CONFIG.find((t) => t.tier === tier);
  return config?.position ?? 0;
}

function getTierFromPosition(position: number): string {
  return TIER_CONFIG[position]?.tier ?? "supervised";
}

function buildEvidenceNarrative(
  trustState: TrustControlProps["trustState"],
): string {
  const { approvalRate, runsInWindow, approvals, edits, rejections, trend } =
    trustState;

  if (runsInWindow === 0) return "No work completed yet.";

  const parts: string[] = [];

  if (approvals > 0) {
    const pct = Math.round(approvalRate * 100);
    parts.push(`${approvals} approved without changes (${pct}%)`);
  }
  if (edits > 0) {
    parts.push(`${edits} needed changes`);
  }
  if (rejections > 0) {
    parts.push(`${rejections} sent back`);
  }

  let narrative = parts.join(", ") + ".";

  if (trend === "improving") {
    narrative += " Quality is getting better.";
  } else if (trend === "declining") {
    narrative += " Quality has been dipping recently.";
  }

  return narrative;
}

export function TrustControl({
  processId,
  processName,
  currentTier,
  trustState,
}: TrustControlProps) {
  const currentPosition = getTierPosition(currentTier);
  const [pendingPosition, setPendingPosition] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const updateTrust = useUpdateTrust();

  const isCritical = currentTier === "critical";
  const displayPosition = pendingPosition ?? currentPosition;
  const displayConfig = TIER_CONFIG[displayPosition];

  const handleSliderChange = useCallback(
    (newPosition: number) => {
      if (isCritical) return; // Critical can't be changed
      if (newPosition === currentPosition) {
        setPendingPosition(null);
        setConfirming(false);
        return;
      }
      setPendingPosition(newPosition);
      setConfirming(true);
    },
    [currentPosition, isCritical],
  );

  const handleConfirm = useCallback(async () => {
    if (pendingPosition === null) return;
    const newTier = getTierFromPosition(pendingPosition);
    const reason = `Changed to "${TIER_CONFIG[pendingPosition].label}" via dashboard`;

    await updateTrust.mutateAsync({ processId, newTier, reason });
    setPendingPosition(null);
    setConfirming(false);
  }, [pendingPosition, processId, updateTrust]);

  const handleCancel = useCallback(() => {
    setPendingPosition(null);
    setConfirming(false);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-1">
          How closely do you watch this?
        </h3>
        <p className="text-xs text-text-muted">
          {displayConfig?.description}
        </p>
      </div>

      {/* Natural language slider */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-text-muted">
          <span>Check everything</span>
          <span>Let it run</span>
        </div>
        <div className="relative">
          <input
            type="range"
            min={0}
            max={2}
            step={1}
            value={displayPosition}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            disabled={isCritical || updateTrust.isPending}
            className="w-full h-2 bg-surface rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-accent
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:shadow-[var(--shadow-medium)]
              [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-accent
              [&::-moz-range-thumb]:cursor-pointer
              [&::-moz-range-thumb]:border-none
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {/* Step markers */}
          <div className="flex justify-between px-1 mt-1">
            {TIER_CONFIG.map((config) => (
              <div
                key={config.position}
                className={`w-2 h-2 rounded-full ${
                  displayPosition >= config.position
                    ? "bg-accent"
                    : "bg-border-strong"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Current label */}
        <p className="text-sm font-medium text-text-primary text-center">
          {displayConfig?.label}
        </p>
      </div>

      {/* Evidence narrative */}
      <div className="bg-surface rounded-lg px-4 py-3">
        <p className="text-sm text-text-secondary">
          {buildEvidenceNarrative(trustState)}
        </p>
        {isCritical && (
          <p className="text-xs text-caution mt-2">
            This is always checked — it can&apos;t be changed.
          </p>
        )}
      </div>

      {/* Confirmation */}
      {confirming && !isCritical && (
        <div className="flex items-center gap-2 bg-accent-subtle rounded-lg px-4 py-3">
          <p className="text-sm text-text-primary flex-1">
            Change to &ldquo;{TIER_CONFIG[pendingPosition!]?.label}&rdquo;?
          </p>
          <button
            onClick={handleCancel}
            className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={updateTrust.isPending}
            className="px-3 py-1 text-sm bg-accent text-accent-text rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {updateTrust.isPending ? "Saving..." : "Confirm"}
          </button>
        </div>
      )}
    </div>
  );
}
