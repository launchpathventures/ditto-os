"use client";

import { useState } from "react";
import { Loader2, Search, Send } from "lucide-react";
import type { AuthorizationRequestBlock, JobRequestCardBlock, ReviewCardBlock, SuggestedCandidate } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { WorkspaceUpsellCta } from "@/components/network/workspace-upsell-cta";
import { CLIENT_LANE_UPSELL_COPY, type WorkspaceUpsellMode } from "./workspace-upsell";

export type ClientActionNotice = "intro" | "scout";
export type ScoutStatus = "idle" | "loading" | "success" | "empty" | "error" | "cached";
export type IntroStatus = "idle" | "loading" | "success" | "refused" | "error";

export interface ScoutResponsePayload {
  status: "success" | "empty" | "cached";
  review: ReviewCardBlock;
  candidates: SuggestedCandidate[];
}

export interface IntroResponsePayload {
  block: AuthorizationRequestBlock;
  introductionId: string;
  state: string;
  deliveryId?: string | null;
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

export async function requestIntroduction({
  jobRequestCard,
  selectedCandidate,
  sessionId,
  fetchImpl = fetch,
}: {
  jobRequestCard: JobRequestCardBlock;
  selectedCandidate: SuggestedCandidate;
  sessionId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<IntroResponsePayload> {
  const response = await fetchImpl("/api/v1/network/intros", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      jobRequestCard,
      selectedCandidate,
      sessionId,
    }),
  });
  const payload = (await response.json()) as IntroResponsePayload & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Intro request failed: ${response.status}`);
  }
  return payload;
}

function firstName(candidate: SuggestedCandidate): string {
  return candidate.name.trim().split(/\s+/)[0] || candidate.name;
}

function WorkspaceUpsellTurn({
  copy,
  sessionId,
  mode,
}: {
  copy: string;
  sessionId?: string | null;
  mode: WorkspaceUpsellMode;
}) {
  return (
    <WorkspaceUpsellCta
      copy={copy}
      declineLabel="Not now, just my brief"
      sessionId={sessionId}
      context={mode}
    />
  );
}

function IntroNotice({
  selectedCandidate,
  status,
  payload,
}: {
  selectedCandidate: SuggestedCandidate | null;
  status: IntroStatus;
  payload: IntroResponsePayload | null;
}) {
  const candidateName = selectedCandidate?.name ?? "that person";
  const reason = payload?.block.executionResult?.reasonForVisitor;
  const costLabel = payload?.block.costLabel;
  const copy =
    status === "loading"
      ? `Preparing an approval request for ${candidateName}...`
      : status === "error"
        ? "I couldn't queue that introduction. Try again in a moment."
        : status === "refused"
          ? reason || "I'm not the right person to introduce on this one."
        : payload
          ? `Intro request sent for review for ${candidateName}.`
          : "Select a candidate first.";

  return (
    <div className="mt-3 rounded-2xl bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
      <div className="flex items-start gap-2">
        {status === "loading" ? (
          <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-text-muted" aria-hidden="true" />
        ) : (
          <Send className="mt-1 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        )}
        <p>
          <span className="font-semibold text-text-primary">
            {status === "refused" ? "Intro held:" : "Intro:"}
          </span>{" "}
          {copy}
          {costLabel ? (
            <span className="mt-1 block text-xs font-medium text-text-muted">
              {costLabel}
            </span>
          ) : null}
        </p>
      </div>
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
  const [introStatus, setIntroStatus] = useState<IntroStatus>("idle");
  const [introPayload, setIntroPayload] = useState<IntroResponsePayload | null>(null);
  const introDisabled = !selectedCandidate || isRefreshInFlight;
  const introLabel = selectedCandidate ? `Request intro to ${firstName(selectedCandidate)}` : "Select a candidate";
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

  async function handleIntro() {
    if (!selectedCandidate || !jobRequestCard || introStatus === "loading") return;
    setNotice("intro");
    setIntroStatus("loading");
    setIntroPayload(null);
    try {
      const payload = await requestIntroduction({
        jobRequestCard,
        selectedCandidate,
        sessionId,
      });
      setIntroPayload(payload);
      setIntroStatus(payload.block.state === "rejected" ? "refused" : "success");
    } catch {
      setIntroStatus("error");
    }
  }

  return (
    <div data-testid="client-card-actions" className={cn("w-full max-w-full", className)}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <button
          type="button"
          disabled={introDisabled}
          onClick={() => void handleIntro()}
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
          {scoutStatus === "loading" ? "Scanning..." : "Scan wider sources"}
        </button>
      </div>

      {notice === "intro" ? (
        <IntroNotice
          selectedCandidate={selectedCandidate}
          status={introStatus}
          payload={introPayload}
        />
      ) : null}
      {notice === "scout" ? <ScoutNotice status={scoutStatus} payload={scoutPayload} /> : null}

      {upsellCopy ? <WorkspaceUpsellTurn copy={upsellCopy} sessionId={sessionId} mode={mode} /> : null}
    </div>
  );
}

export { CLIENT_LANE_UPSELL_COPY };
