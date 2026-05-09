"use client";

import { PencilLine, Radio, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpertCardActionsProps {
  wantsVisibility: boolean;
  onTweak: () => void;
  onOpenForOpportunities: () => void;
  onFindClients: () => void;
  className?: string;
}

export function ExpertCardActions({
  wantsVisibility,
  onTweak,
  onOpenForOpportunities,
  onFindClients,
  className,
}: ExpertCardActionsProps) {
  return (
    <div
      data-testid="expert-card-actions"
      className={cn("mt-4 grid gap-2 sm:grid-cols-3", className)}
    >
      <button
        type="button"
        onClick={onTweak}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised"
      >
        <PencilLine className="h-4 w-4" aria-hidden="true" />
        Tweak this with me
      </button>
      <button
        type="button"
        onClick={onOpenForOpportunities}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors",
          wantsVisibility
            ? "border-text-primary bg-accent text-accent-foreground"
            : "border-border bg-white text-text-primary hover:bg-surface-raised",
        )}
      >
        <Radio className="h-4 w-4" aria-hidden="true" />
        Open for opportunities
      </button>
      <button
        type="button"
        onClick={onFindClients}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        Find me clients
      </button>
    </div>
  );
}
