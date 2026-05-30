"use client";

import { useRouter } from "next/navigation";
import { Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NetworkChatMode } from "./preview-pane";

export function ModeToggle({ mode }: { mode: NetworkChatMode }) {
  const router = useRouter();

  // Intent is deliberately NOT preserved across mode toggles: `?intent=` is a
  // one-shot signal from the /network landing page that fires
  // `network_entry_selected` exactly once. Re-stamping it on every toggle would
  // pollute the analytics event with non-entry-selection navigations.
  function switchMode(next: NetworkChatMode) {
    if (next === mode) return;
    router.push(`/network/chat?mode=${next}`);
  }

  return (
    <div className="inline-grid grid-cols-2 rounded-lg border border-border bg-white p-1 shadow-subtle">
      <button
        type="button"
        aria-pressed={mode === "expert"}
        onClick={() => switchMode("expert")}
        className={toggleClass(mode === "expert")}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        My signal
      </button>
      <button
        type="button"
        aria-pressed={mode === "client"}
        onClick={() => switchMode("client")}
        className={toggleClass(mode === "client")}
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        Find someone
      </button>
    </div>
  );
}

function toggleClass(active: boolean): string {
  return cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors",
    active
      ? "bg-accent text-accent-foreground"
      : "text-text-secondary hover:bg-surface-raised hover:text-text-primary",
  );
}
