"use client";

import { cn } from "@/lib/utils";
import type { SendingIdentityChoiceBlock } from "@/lib/engine";

/**
 * SendingIdentityChoiceBlock — two/three-card identity choice for outreach.
 * Provenance: Brief 152 (Sending Identity Channel Routing).
 *
 * Cards are tap-to-select. Each card emits an "identity-choice" action
 * with the chosen identity in the payload.
 */
interface Props {
  block: SendingIdentityChoiceBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function SendingIdentityChoiceBlockComponent({ block, onAction }: Props) {
  return (
    <div className="my-2 space-y-2">
      <div className="text-xs font-semibold tracking-wider text-text-secondary uppercase">
        How should outreach go out?
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {block.options.map((option) => (
          <button
            key={option.identity}
            type="button"
            onClick={() =>
              onAction?.("identity-choice", { sendingIdentity: option.identity })
            }
            className={cn(
              "text-left rounded-lg border border-border bg-surface-primary",
              "px-4 py-3 transition-colors hover:border-accent hover:bg-surface-secondary/50",
              "focus:outline-none focus:ring-2 focus:ring-accent/50",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">
                {option.label}
              </span>
              {option.requiresSetup && (
                <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-caution/10 text-caution">
                  Setup needed
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
              {option.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
