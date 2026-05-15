"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, Search, UserRoundPlus } from "lucide-react";
import type { JobRequestCardBlock, SuggestedCandidate } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { FitConfidenceDot } from "./fit-confidence-dot";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function handleCandidateIntroduce(
  handle: string,
  setSelectedCandidateHandle: (handle: string) => void,
) {
  setSelectedCandidateHandle(handle);
}

export function handleCandidatePanelKeyDown(
  event: { key: string; preventDefault?: () => void },
  selectedCandidateHandle: string | null,
  setSelectedCandidateHandle: (handle: string | null) => void,
) {
  if (event.key !== "Escape" || !selectedCandidateHandle) return;
  event.preventDefault?.();
  setSelectedCandidateHandle(null);
}

export function latestCandidateComputedAt(candidates: SuggestedCandidate[]): number | null {
  const timestamps = candidates
    .map((candidate) => new Date(candidate.computedAt).getTime())
    .filter((timestamp) => !Number.isNaN(timestamp));
  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
}

export function staleSuggestionAgeHours(
  candidates: SuggestedCandidate[],
  now = Date.now(),
): number | null {
  const latest = latestCandidateComputedAt(candidates);
  if (latest == null) return null;
  const ageMs = now - latest;
  if (ageMs <= STALE_AFTER_MS) return null;
  return Math.max(1, Math.floor(ageMs / HOUR_MS));
}

export async function refreshSuggestedCandidates({
  jobRequestCard,
  sessionId,
  fetchImpl = fetch,
  onRefreshInFlightChange,
}: {
  jobRequestCard: JobRequestCardBlock;
  sessionId?: string | null;
  fetchImpl?: typeof fetch;
  onRefreshInFlightChange?: (inFlight: boolean) => void;
}): Promise<SuggestedCandidate[]> {
  onRefreshInFlightChange?.(true);
  try {
    const response = await fetchImpl("/api/v1/network/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        jobRequestCard,
        sessionId,
      }),
    });
    if (!response.ok) {
      throw new Error(`Candidate refresh failed: ${response.status}`);
    }
    return (await response.json()) as SuggestedCandidate[];
  } finally {
    onRefreshInFlightChange?.(false);
  }
}

function firstInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function normalizedPrivacyText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*_~"'.,;:!?()[\]{}<>/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function privateValues(jobRequestCard: JobRequestCardBlock): string[] {
  return [jobRequestCard.antiPersonaMd, jobRequestCard.budgetShape.ballpark]
    .map((value) => value.trim())
    .filter(Boolean);
}

function containsPrivateValue(text: string, jobRequestCard: JobRequestCardBlock): boolean {
  const normalizedText = normalizedPrivacyText(text);
  return privateValues(jobRequestCard).some((value) => {
    const normalized = normalizedPrivacyText(value);
    return normalized.length > 0 && normalizedText.includes(normalized);
  });
}

export function scrubCandidateVisibleText(
  text: string,
  jobRequestCard: JobRequestCardBlock,
): string {
  let scrubbed = text;
  for (const value of privateValues(jobRequestCard)) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    scrubbed = scrubbed.replace(new RegExp(escaped, "gi"), "[private]");
  }
  return scrubbed.replace(/\s+/g, " ").trim();
}

export function rationaleText(
  candidate: SuggestedCandidate,
  jobRequestCard: JobRequestCardBlock,
): string {
  const clean = candidate.rationaleMd.replace(/\s+/g, " ").trim();
  if (containsPrivateValue(clean, jobRequestCard)) {
    const greeter = jobRequestCard.matchCuratedBy === "mira" ? "Mira" : "Alex";
    return `"${greeter}: I kept private filters and budget out of this note; ask me to compare fit before you act."`;
  }
  const scrubbed = scrubCandidateVisibleText(clean, jobRequestCard);
  return scrubbed.startsWith("\"") ? scrubbed : `"${scrubbed}"`;
}

function MoreLikeNotice({ candidate }: { candidate: SuggestedCandidate }) {
  return (
    <div className="mt-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-6 text-text-secondary shadow-subtle">
      <span className="font-semibold text-text-primary">Scout hint:</span>{" "}
      I'll use{" "}
      <span className="font-semibold text-text-primary">{candidate.name}</span>{" "}
      as a loose pattern only.
    </div>
  );
}

export function SuggestedCandidatesPanel({
  candidates,
  jobRequestCard,
  selectedCandidateHandle,
  setSelectedCandidateHandle,
  onCandidatesRefresh,
  onRefreshInFlightChange,
  onScoutLike,
  sessionId,
  now,
  className,
}: {
  candidates: SuggestedCandidate[];
  jobRequestCard: JobRequestCardBlock;
  selectedCandidateHandle: string | null;
  setSelectedCandidateHandle: (handle: string | null) => void;
  onCandidatesRefresh?: (candidates: SuggestedCandidate[]) => void;
  onRefreshInFlightChange?: (inFlight: boolean) => void;
  onScoutLike?: (candidate: SuggestedCandidate) => void;
  sessionId?: string | null;
  now?: number;
  className?: string;
}) {
  const visibleCandidates = candidates.slice(0, 5);
  const staleAgeHours = staleSuggestionAgeHours(visibleCandidates, now);
  const [moreLikeCandidate, setMoreLikeCandidate] = useState<SuggestedCandidate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const refreshed = await refreshSuggestedCandidates({
        jobRequestCard,
        sessionId,
        onRefreshInFlightChange,
      });
      onCandidatesRefresh?.(refreshed);
    } catch {
      setRefreshError("I couldn't refresh these suggestions. Try again in a moment.");
    } finally {
      setRefreshing(false);
    }
  }

  if (visibleCandidates.length === 0) return null;

  return (
    <section
      aria-label="Suggested candidates"
      data-testid="suggested-candidates-panel"
      onKeyDown={(event) =>
        handleCandidatePanelKeyDown(event, selectedCandidateHandle, setSelectedCandidateHandle)
      }
      className={cn("w-full max-w-full", className)}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          Candidate suggestions
        </p>
        {staleAgeHours != null ? (
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-xs font-semibold text-text-secondary transition hover:text-text-primary disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing ? "animate-spin" : "")}
              aria-hidden="true"
            />
            Suggestions are {staleAgeHours}h old - refresh
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 md:grid md:grid-cols-2 md:gap-3 md:overflow-visible md:pb-0",
        )}
      >
        {visibleCandidates.map((candidate) => {
          const selected = selectedCandidateHandle === candidate.handle;
          const scouted = candidate.source === "scouted";
          const sourceSnippet = candidate.sourceSnippet
            ? scrubCandidateVisibleText(candidate.sourceSnippet, jobRequestCard)
            : null;
          return (
            <div
              key={candidate.handle}
              className={cn(
                "w-[80vw] max-w-[320px] flex-none snap-start rounded-[18px] border p-[2px] md:w-auto md:max-w-none",
                selected ? "border-vivid bg-vivid-subtle" : "border-transparent bg-transparent",
              )}
            >
              <article
                aria-label={`Candidate: ${candidate.name}, ${candidate.oneLineRole}, fit confidence ${candidate.fitConfidence}`}
                className={cn(
                  "min-h-[148px] rounded-2xl border border-border bg-white p-3 shadow-subtle transition",
                  selected ? "shadow-medium" : "",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs font-semibold text-text-primary">
                      {firstInitial(candidate.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-[13px] font-semibold leading-4 text-text-primary">
                          {candidate.name}
                        </h3>
                        {selected ? (
                          <FitConfidenceDot value={candidate.fitConfidence} className="h-5 w-5" />
                        ) : null}
                      </div>
                      <p className="truncate text-[11px] leading-4 text-text-muted">
                        {scouted ? (candidate.sourceLabel || "Public source") : `@${candidate.handle}`}
                      </p>
                      <p className="truncate text-xs leading-4 text-text-secondary">
                        {candidate.oneLineRole}
                      </p>
                    </div>
                  </div>
                  {selected ? (
                    <span className="shrink-0 rounded-full bg-vivid-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-vivid">
                      selected
                    </span>
                  ) : (
                    <FitConfidenceDot value={candidate.fitConfidence} />
                  )}
                </div>

                <p className="mt-3 line-clamp-2 text-[13px] italic leading-[18px] text-text-secondary">
                  {rationaleText(candidate, jobRequestCard)}
                </p>

                {scouted ? (
                  <div className="mt-3 rounded-xl bg-surface-raised px-3 py-2 text-xs leading-5 text-text-secondary">
                    {candidate.sourceUrl ? (
                      <a
                        href={candidate.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1 font-semibold text-text-primary underline-offset-4 hover:underline"
                      >
                        <span className="truncate">{candidate.sourceLabel || "Public source"}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    ) : null}
                    {sourceSnippet ? (
                      <p className="mt-1 line-clamp-2">{sourceSnippet}</p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 border-t border-border pt-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!scouted) {
                          handleCandidateIntroduce(candidate.handle, setSelectedCandidateHandle);
                          return;
                        }
                        setMoreLikeCandidate(candidate);
                      }}
                      className={cn(
                        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition md:min-h-9",
                        scouted
                          ? "border border-border bg-white text-text-primary hover:bg-surface-raised"
                          : "bg-accent text-accent-foreground hover:opacity-90",
                      )}
                    >
                      <UserRoundPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      {scouted ? "Use as hint" : "Select"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreLikeCandidate(candidate);
                        onScoutLike?.(candidate);
                      }}
                      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-text-primary transition hover:bg-surface-raised md:min-h-9"
                    >
                      <Search className="h-3.5 w-3.5" aria-hidden="true" />
                      More like
                    </button>
                  </div>
                </div>
              </article>
            </div>
          );
        })}
      </div>

      {moreLikeCandidate ? <MoreLikeNotice candidate={moreLikeCandidate} /> : null}
      {refreshError ? (
        <p className="mt-2 rounded-2xl border border-border bg-white px-4 py-3 text-sm text-text-secondary shadow-subtle">
          {refreshError}
        </p>
      ) : null}
    </section>
  );
}
