"use client";

import { cn } from "@/lib/utils";
import type { TrustMilestoneBlock } from "@/lib/engine";

/**
 * TrustMilestoneBlock — Trust tier change celebration or explanation.
 * Provenance: Brief 160 (Trust Milestone UX, MP-5.1/5.2).
 *
 * Upgrades are celebrations with evidence + accept/keep actions.
 * Downgrades are warm explanations with context + override action.
 */
interface Props {
  block: TrustMilestoneBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function TrustMilestoneBlockComponent({ block, onAction }: Props) {
  const isUpgrade = block.milestoneType === "upgrade";

  return (
    <div
      className={cn(
        "my-2 rounded-lg border px-4 py-3",
        isUpgrade
          ? "border-positive/30 bg-positive/5"
          : "border-caution/30 bg-caution/5",
      )}
    >
      {/* Label */}
      <div
        className={cn(
          "text-xs font-semibold tracking-wider uppercase mb-2",
          isUpgrade ? "text-positive" : "text-caution",
        )}
      >
        {isUpgrade ? "Trust milestone" : "Adjusting trust"}
      </div>

      {/* Transition */}
      <div className="flex items-center gap-2 text-sm text-text-primary">
        <span className="font-semibold">{block.processName}</span>
        <span className="text-text-secondary">
          {block.fromTier} → <span className="font-medium text-text-primary">{block.toTier}</span>
        </span>
      </div>

      {/* Evidence narrative */}
      <p className="mt-2 text-sm text-text-secondary leading-relaxed">
        {block.evidence}
      </p>

      {/* Warm explanation for downgrades */}
      {block.explanation && (
        <p className="mt-1 text-sm text-text-secondary leading-relaxed italic">
          {block.explanation}
        </p>
      )}

      {/* Actions */}
      {block.actions && block.actions.length > 0 && (
        <div className="flex gap-2 mt-3">
          {block.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction?.(action.id, action.payload)}
              className={cn(
                "text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
                action.style === "primary"
                  ? isUpgrade
                    ? "bg-positive text-white hover:bg-positive/90"
                    : "bg-accent text-white hover:bg-accent/90"
                  : action.style === "danger"
                    ? "text-negative hover:bg-negative/10"
                    : "text-text-secondary hover:bg-surface-secondary",
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
