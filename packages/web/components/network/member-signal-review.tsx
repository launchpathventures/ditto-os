"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, EyeOff, Pencil, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { MemberSignalProvenance } from "./member-signal-provenance";

export type MemberSignalClaimVisibility = "public" | "on-request" | "private" | "hidden";
export type MemberSignalClaimApprovalState = "suggested" | "approved" | "edited" | "hidden" | "rejected";

export interface MemberSignalClaimRow {
  id: string;
  section: string;
  claimText: string;
  sourceType: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  sourceId?: string | null;
  evidenceSnippet: string;
  confidence: "high" | "medium" | "low" | string;
  visibility: MemberSignalClaimVisibility;
  approvalState: MemberSignalClaimApprovalState;
}

type ReviewAction = "approve" | "edit" | "hide" | "visibility";

const VISIBILITY_OPTIONS: Array<{ value: MemberSignalClaimVisibility; label: string }> = [
  { value: "public", label: "Public" },
  { value: "on-request", label: "On-request" },
  { value: "private", label: "Private" },
  { value: "hidden", label: "Hidden" },
];

const SECTION_LABELS: Record<string, string> = {
  knownFor: "Known for",
  bestIntroducedFor: "Best introduced for",
  canHelpWith: "Can help with",
  currentFocus: "Current focus",
  openTo: "Open to",
  notAFitFor: "Not a fit for",
  proof: "Proof",
  tasteAndStyle: "Taste and style",
  preferredIntroStyle: "Preferred intro style",
  sourceSummary: "Source summary",
};

export function publicMemberSignalClaims(claims: MemberSignalClaimRow[]): MemberSignalClaimRow[] {
  return claims.filter(
    (claim) =>
      claim.visibility === "public" &&
      (claim.approvalState === "approved" || claim.approvalState === "edited"),
  );
}

function sectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? section;
}

export function MemberSignalReview({
  sessionId,
  userId,
  memberSignalId,
  claims,
  onClaimsChange,
  className,
}: {
  sessionId?: string | null;
  userId?: string | null;
  memberSignalId?: string | null;
  claims: MemberSignalClaimRow[];
  onClaimsChange?: (claims: MemberSignalClaimRow[]) => void;
  className?: string;
}) {
  const [localClaims, setLocalClaims] = useState<MemberSignalClaimRow[]>(claims);
  const localClaimsRef = useRef<MemberSignalClaimRow[]>(claims);
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const approvedPublicCount = useMemo(
    () => publicMemberSignalClaims(localClaims).length,
    [localClaims],
  );

  useEffect(() => {
    localClaimsRef.current = claims;
    setLocalClaims(claims);
  }, [claims]);

  function replaceClaim(nextClaim: MemberSignalClaimRow) {
    const next = localClaimsRef.current.map((item) => item.id === nextClaim.id ? nextClaim : item);
    localClaimsRef.current = next;
    setLocalClaims(next);
    onClaimsChange?.(next);
  }

  async function updateClaim(
    claim: MemberSignalClaimRow,
    action: ReviewAction,
    updates: Partial<MemberSignalClaimRow> = {},
  ) {
    setPendingClaimId(claim.id);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/v1/network/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "update_claim",
          sessionId,
          userId,
          memberSignalId,
          claimId: claim.id,
          claimAction: action,
          claimText: updates.claimText ?? null,
          visibility: updates.visibility ?? claim.visibility,
        }),
      });
      const payload = await response.json() as { claim?: MemberSignalClaimRow; error?: string };
      if (!response.ok || !payload.claim) throw new Error(payload.error || "claim_update_failed");
      replaceClaim(payload.claim);
      setEditingClaimId(null);
      setEditText("");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Claim update failed.");
    } finally {
      setPendingClaimId(null);
    }
  }

  async function approveAllPublicSuggestions() {
    for (const claim of localClaims) {
      if (claim.approvalState !== "suggested") continue;
      await updateClaim(claim, "approve", { visibility: "public" });
    }
  }

  return (
    <section className={cn("rounded-2xl bg-white p-5 shadow-medium", className)} data-testid="member-signal-review">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">Review</p>
          <h2 className="mt-2 text-2xl font-semibold text-text-primary">Approve your profile</h2>
          <p className="mt-2 max-w-xl text-sm leading-5 text-text-secondary">
            Claims stay private until you approve them for public use.
          </p>
        </div>
        <div className="rounded-2xl bg-surface-raised px-4 py-3 text-right">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">Public now</p>
          <p className="mt-1 text-xl font-semibold text-text-primary">{approvedPublicCount}</p>
        </div>
      </div>

      {localClaims.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface-raised p-5 text-sm text-text-secondary">
          Drafted profile details will appear here with source chips, confidence, and visibility controls.
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          {localClaims.map((claim) => {
            const editing = editingClaimId === claim.id;
            const pending = pendingClaimId === claim.id;
            const inferred = claim.sourceType === "inference" || claim.sourceLabel === "inferred by Ditto";
            return (
              <article key={claim.id} className="rounded-2xl border border-border bg-surface-raised p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">
                      {sectionLabel(claim.section)}
                    </p>
                    {editing ? (
                      <textarea
                        value={editText}
                        onChange={(event) => setEditText(event.target.value)}
                        className="mt-3 min-h-24 w-full resize-none rounded-2xl border border-border bg-white px-3 py-2 text-sm leading-5 text-text-primary outline-none focus:border-text-primary"
                      />
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-text-primary">{claim.claimText}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "inline-flex min-h-8 items-center rounded-md px-2 text-xs font-semibold capitalize",
                      claim.approvalState === "approved" || claim.approvalState === "edited"
                        ? "bg-[#eff8f0] text-positive"
                        : claim.approvalState === "hidden"
                          ? "bg-surface-subtle text-text-muted"
                          : "bg-[#fff8ec] text-[#77510b]",
                    )}
                  >
                    {claim.approvalState === "suggested" ? "Needs approval" : claim.approvalState}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <MemberSignalProvenance
                    sourceLabel={claim.sourceLabel}
                    sourceUrl={claim.sourceUrl}
                    confidence={claim.confidence}
                    inferred={inferred}
                  />
                  <span className="inline-flex min-h-7 items-center rounded-md bg-white px-2 text-xs font-semibold text-text-secondary">
                    {claim.visibility}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-xs leading-5 text-text-muted">
                  {claim.evidenceSnippet}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <select
                    value={claim.visibility}
                    onChange={(event) => void updateClaim(claim, "visibility", {
                      visibility: event.target.value as MemberSignalClaimVisibility,
                    })}
                    className="min-h-10 rounded-md border border-border bg-white px-3 text-sm font-semibold text-text-primary outline-none focus:border-text-primary"
                    aria-label={`Visibility for ${sectionLabel(claim.section)}`}
                  >
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {editing ? (
                    <button
                      type="button"
                      disabled={pending || !editText.trim()}
                      onClick={() => void updateClaim(claim, "edit", { claimText: editText.trim() })}
                      className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-45"
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Save edit
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void updateClaim(claim, "approve", {
                          visibility: claim.visibility === "hidden" ? "on-request" : claim.visibility,
                        })}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-45"
                      >
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setEditingClaimId(claim.id);
                          setEditText(claim.claimText);
                        }}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised disabled:opacity-45"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void updateClaim(claim, "hide", { visibility: "hidden" })}
                        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised disabled:opacity-45"
                      >
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                        Hide
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {localClaims.length > 0 ? (
        <button
          type="button"
          onClick={() => void approveAllPublicSuggestions()}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-text-primary bg-white px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Approve all public suggestions
        </button>
      ) : null}

      {statusMessage ? (
        <p className="mt-4 text-sm text-negative">{statusMessage}</p>
      ) : null}
    </section>
  );
}
