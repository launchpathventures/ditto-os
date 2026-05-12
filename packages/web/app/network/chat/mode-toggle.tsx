"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NetworkChatMode } from "./preview-pane";

export function ModeToggle({ mode }: { mode: NetworkChatMode }) {
  const router = useRouter();

  function switchMode(next: NetworkChatMode) {
    if (next === mode) return;
    const ok = window.confirm(
      "Switch lanes? Your current draft stays in this browser, but the next questions will follow the new lane.",
    );
    if (!ok) return;
    router.push(`/network/chat?mode=${next}`);
  }

  return (
    <div className="inline-grid grid-cols-2 rounded-lg border border-border bg-white p-1">
      <button
        type="button"
        aria-pressed={mode === "expert"}
        onClick={() => switchMode("expert")}
        className={toggleClass(mode === "expert")}
      >
        Experts
      </button>
      <button
        type="button"
        aria-pressed={mode === "client"}
        onClick={() => switchMode("client")}
        className={toggleClass(mode === "client")}
      >
        Clients
      </button>
    </div>
  );
}

function toggleClass(active: boolean): string {
  return cn(
    "min-h-10 rounded-md px-3 text-sm font-semibold uppercase transition-colors",
    active
      ? "bg-accent text-accent-foreground"
      : "text-text-secondary hover:bg-surface-raised hover:text-text-primary",
  );
}
