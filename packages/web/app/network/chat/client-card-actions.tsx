"use client";

import { useState } from "react";
import { Loader2, Search, Send, Wrench } from "lucide-react";
import type { JobRequestCardBlock, ReviewCardBlock, SuggestedCandidate } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  CLIENT_LANE_UPSELL_ACCEPT_LABEL,
  CLIENT_LANE_UPSELL_COPY,
  CLIENT_LANE_UPSELL_DECLINE_LABEL,
  emitWorkspaceUpsell,
  type WorkspaceUpsellMode,
} from "./workspace-upsell";

export type ClientActionNotice = "intro" | "scout";
export type ScoutStatus = "idle" | "loading" | "success" | "empty" | "error" | "cached";

export interface ScoutResponsePayload {
  status: "success" | "empty" | "cached";
  review: ReviewCardBlock;
  candidates: SuggestedCandidate[];
}

export function introStubCopy(candidateName: string): string {
  return `Coming in sub-brief 261 — the intro flow drops here. For now, your selection — ${candidateName} — is captured.`;
}

export async function scanOffNetwork({
  jobRequestCard,
  sessionId,
  seedCandidate,
  fetchImpl = fetch,
}: {
  jobRequestCard: JobRequestCardBlock;
  sessionId?: string | null;
  seedCandidate?: SuggestedCandidate | null;
  fetchImpl?: typeof fetch;
}): Promise<ScoutResponsePayload> {
  const response = await fetchImpl("/api/v1/network/scout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      jobRequestCard,
      sessionId,
      seedCandidate,
    }),
  });
  const payload = (await response.json()) as ScoutResponsePayload & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Scout failed: ${response.status}`);
  }
  return payload;
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

function IntroStubNotice({
  selectedCandidate,
  mode,
  sessionId,
  onUpsell,
}: {
  selectedCandidate: SuggestedCandidate | null;
  mode: WorkspaceUpsellMode;
  sessionId?: string | null;
  onUpsell: (copy: string) => void;
}) {
  const copy = selectedCandidate
    ? introStubCopy(selectedCandidate.name)
    : "Pick someone from the suggestions first.";
  // TODO: remove when sub-brief 261 lands
  const debugLabel = "[ Pretend it sent ]";

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

function ScoutNotice({
  status,
  payload,
}: {
  status: ScoutStatus;
  payload: ScoutResponsePayload | null;
}) {
  if (status === "idle") return null;
  const copy =
    status === "loading"
      ? "Scanning public sources and keeping budget/private filters out of the query..."
      : status === "error"
        ? "I couldn't complete the off-network scan. Try again in a moment."
        : status === "empty"
          ? payload?.review.outputText || "No source-backed off-network candidates came back."
          : status === "cached"
            ? `Cached scout report: ${payload?.review.outputText || "source-backed leads ready to review."}`
            : payload?.review.outputText || "Source-backed leads ready to review.";

  return (
    <div className="mt-3 rounded-2xl bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
      <div className="flex items-start gap-2">
        {status === "loading" ? (
          <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-text-muted" aria-hidden="true" />
        ) : (
          <Search className="mt-1 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        )}
        <p>
          <span className="font-semibold text-text-primary">
            {status === "cached" ? "Scout cache:" : "Scout:"}
          </span>{" "}
          {copy}
        </p>
      </div>
    </div>
  );
}

export function ClientCardActions({
  selectedCandidate,
  isRefreshInFlight,
  mode = "client",
  sessionId,
  jobRequestCard,
  onScoutComplete,
  initialNotice = null,
  initialUpsellCopy = null,
  initialScoutStatus = "idle",
  className,
}: {
  selectedCandidate: SuggestedCandidate | null;
  isRefreshInFlight: boolean;
  mode?: WorkspaceUpsellMode;
  sessionId?: string | null;
  jobRequestCard?: JobRequestCardBlock | null;
  onScoutComplete?: (payload: ScoutResponsePayload) => void;
  initialNotice?: ClientActionNotice | null;
  initialUpsellCopy?: string | null;
  initialScoutStatus?: ScoutStatus;
  className?: string;
}) {
  const [notice, setNotice] = useState<ClientActionNotice | null>(initialNotice);
  const [upsellCopy, setUpsellCopy] = useState<string | null>(initialUpsellCopy);
  const [scoutStatus, setScoutStatus] = useState<ScoutStatus>(initialScoutStatus);
  const [scoutPayload, setScoutPayload] = useState<ScoutResponsePayload | null>(null);
  const introDisabled = !selectedCandidate || isRefreshInFlight;
  const introLabel = selectedCandidate ? `Introduce ${firstName(selectedCandidate)}` : "Get an introduction";
  const scoutDisabled = !jobRequestCard || scoutStatus === "loading";

  async function handleScout() {
    if (!jobRequestCard || scoutStatus === "loading") return;
    setNotice("scout");
    setScoutStatus("loading");
    setScoutPayload(null);
    try {
      const payload = await scanOffNetwork({
        jobRequestCard,
        sessionId,
      });
      setScoutPayload(payload);
      setScoutStatus(payload.status);
      onScoutComplete?.(payload);
    } catch {
      setScoutStatus("error");
    }
  }

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
          disabled={scoutDisabled}
          onClick={() => void handleScout()}
          title={!jobRequestCard ? "Finish the opportunity brief first." : undefined}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45"
        >
          {scoutStatus === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          {scoutStatus === "loading" ? "Scanning..." : "Scan on + off network and report back"}
        </button>
      </div>

      {notice === "intro" ? (
        <IntroStubNotice
          selectedCandidate={selectedCandidate}
          mode={mode}
          sessionId={sessionId}
          onUpsell={(copy) => setUpsellCopy(copy)}
        />
      ) : null}
      {notice === "scout" ? <ScoutNotice status={scoutStatus} payload={scoutPayload} /> : null}

      {upsellCopy ? <WorkspaceUpsellTurn copy={upsellCopy} /> : null}
    </div>
  );
}

export { CLIENT_LANE_UPSELL_COPY };
