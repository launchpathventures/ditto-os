"use client";

import { useState } from "react";
import { Search, Send, Wrench } from "lucide-react";
import type { SuggestedCandidate } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  CLIENT_LANE_UPSELL_ACCEPT_LABEL,
  CLIENT_LANE_UPSELL_COPY,
  CLIENT_LANE_UPSELL_DECLINE_LABEL,
  emitWorkspaceUpsell,
  type WorkspaceUpsellMode,
} from "./workspace-upsell";

export type ClientActionNotice = "intro" | "scout";

export function introStubCopy(candidateName: string): string {
  return `Coming in sub-brief 261 — the intro flow drops here. For now, your selection — ${candidateName} — is captured.`;
}

export function networkScoutStubCopy(): string {
  return "Coming in sub-brief 258 — the off-network scout drops here. For now, I would scout the network at large.";
}

export function emitDebugWorkspaceUpsell({
  mode,
  sessionId,
  onUpsell,
}: {
  mode: WorkspaceUpsellMode;
  sessionId?: string | null;
  onUpsell?: (copy: string) => void;
}): string {
  const copy = emitWorkspaceUpsell(mode, { sessionId });
  onUpsell?.(copy);
  return copy;
}

function firstName(candidate: SuggestedCandidate): string {
  return candidate.name.trim().split(/\s+/)[0] || candidate.name;
}

function WorkspaceUpsellTurn({ copy }: { copy: string }) {
  return (
    <div
      data-testid="workspace-upsell-turn"
      className="mt-3 rounded-[24px] border border-border bg-white px-4 py-3 text-[15px] leading-6 text-text-primary shadow-subtle"
    >
      <p className="whitespace-pre-line">{copy}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90"
        >
          {CLIENT_LANE_UPSELL_ACCEPT_LABEL}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary transition hover:bg-surface-raised"
        >
          {CLIENT_LANE_UPSELL_DECLINE_LABEL}
        </button>
      </div>
    </div>
  );
}

function StubNotice({
  notice,
  selectedCandidate,
  mode,
  sessionId,
  onUpsell,
}: {
  notice: ClientActionNotice;
  selectedCandidate: SuggestedCandidate | null;
  mode: WorkspaceUpsellMode;
  sessionId?: string | null;
  onUpsell: (copy: string) => void;
}) {
  const copy =
    notice === "intro" && selectedCandidate
      ? introStubCopy(selectedCandidate.name)
      : networkScoutStubCopy();
  // TODO: remove when sub-brief 261 [or 258] lands
  const debugLabel = notice === "intro" ? "[ Pretend it sent ]" : "[ Pretend it scanned ]";

  return (
    <div className="mt-3 rounded-2xl bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
      <div className="flex items-start gap-2">
        <Wrench className="mt-1 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <p>
          <span className="font-semibold text-text-primary">Stub:</span> {copy}
        </p>
      </div>
      <button
        type="button"
        onClick={() => emitDebugWorkspaceUpsell({ mode, sessionId, onUpsell })}
        className="mt-2 inline-flex min-h-9 items-center rounded-full px-1 text-xs font-semibold text-text-muted underline-offset-4 transition hover:text-text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary/25"
      >
        {debugLabel}
      </button>
    </div>
  );
}

export function ClientCardActions({
  selectedCandidate,
  isRefreshInFlight,
  mode = "client",
  sessionId,
  initialNotice = null,
  initialUpsellCopy = null,
  className,
}: {
  selectedCandidate: SuggestedCandidate | null;
  isRefreshInFlight: boolean;
  mode?: WorkspaceUpsellMode;
  sessionId?: string | null;
  initialNotice?: ClientActionNotice | null;
  initialUpsellCopy?: string | null;
  className?: string;
}) {
  const [notice, setNotice] = useState<ClientActionNotice | null>(initialNotice);
  const [upsellCopy, setUpsellCopy] = useState<string | null>(initialUpsellCopy);
  const introDisabled = !selectedCandidate || isRefreshInFlight;
  const introLabel = selectedCandidate ? `Introduce ${firstName(selectedCandidate)}` : "Get an introduction";

  return (
    <div data-testid="client-card-actions" className={cn("w-full max-w-full", className)}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <button
          type="button"
          disabled={introDisabled}
          onClick={() => setNotice("intro")}
          title={!selectedCandidate ? "Pick someone from the suggestions first." : undefined}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-45",
            isRefreshInFlight ? "cursor-wait" : "disabled:cursor-not-allowed",
          )}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {introLabel}
        </button>
        <button
          type="button"
          onClick={() => setNotice("scout")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-raised"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Scan on + off network and report back
        </button>
      </div>

      {notice ? (
        <StubNotice
          notice={notice}
          selectedCandidate={selectedCandidate}
          mode={mode}
          sessionId={sessionId}
          onUpsell={(copy) => setUpsellCopy(copy)}
        />
      ) : null}

      {upsellCopy ? <WorkspaceUpsellTurn copy={upsellCopy} /> : null}
    </div>
  );
}

export { CLIENT_LANE_UPSELL_COPY };
