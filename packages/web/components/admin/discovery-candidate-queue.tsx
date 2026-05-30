"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Mail,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface DiscoveryClaimRow {
  id: string;
  claimText: string;
  evidenceSnippet: string;
  sourceLabel: string;
  sourceUrl: string | null;
  confidence: string;
}

interface DiscoveryCandidateRow {
  id: string;
  status: string;
  channel: string;
  sourceClass: string;
  totalScore: number;
  superconnectorFit: number;
  activeOpportunityFit: number;
  activeRequestFit: number;
  sourceConfidence: number;
  inviteRisk: number;
  networkHealth: number;
  riskFlags: string[];
  suppressionReasons: string[];
  inviteReason: string;
  proposedSubject: string | null;
  proposedBody: string | null;
  createdAt: string;
  profile: {
    id: string;
    displayName: string;
    headline: string;
    canonicalUrl: string | null;
    sourceSummary: string;
    status: string;
  } | null;
  claims: DiscoveryClaimRow[];
}

interface ActionLog {
  at: string;
  ok: boolean;
  detail: string;
}

export interface DiscoveryCandidateQueueProps {
  token: string | null;
  initialCandidates?: DiscoveryCandidateRow[];
}

function scoreTone(score: number): string {
  if (score >= 75) return "bg-green-50 text-green-700";
  if (score >= 55) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

function chipTone(value: string): string {
  if (value === "queued" || value === "approved" || value === "sent") {
    return "border-green-200 bg-green-50 text-green-700";
  }
  if (value === "blocked" || value === "suppressed" || value === "deleted") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-neutral-200 bg-neutral-50 text-neutral-700";
}

function fieldValue(value: string[] | string | null | undefined): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  return value?.trim() || "none";
}

export function DiscoveryCandidateQueue({
  token,
  initialCandidates = [],
}: DiscoveryCandidateQueueProps) {
  const [candidates, setCandidates] = useState<DiscoveryCandidateRow[]>(initialCandidates);
  const [query, setQuery] = useState("");
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(Boolean(token) && initialCandidates.length === 0);
  const [log, setLog] = useState<ActionLog[]>([]);

  const headers = useMemo(
    () =>
      token
        ? { authorization: `Bearer ${token}`, "content-type": "application/json" }
        : { "content-type": "application/json" },
    [token],
  );

  const appendLog = useCallback((entry: ActionLog) => {
    setLog((prev) => [entry, ...prev].slice(0, 8));
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/v1/network/discovery", { headers });
      const payload = (await res.json()) as { candidates?: DiscoveryCandidateRow[]; error?: string };
      if (!res.ok) {
        appendLog({ at: new Date().toISOString(), ok: false, detail: payload.error ?? "refresh_failed" });
        return;
      }
      setCandidates(payload.candidates ?? []);
    } finally {
      setLoading(false);
    }
  }, [appendLog, headers, token]);

  useEffect(() => {
    if (initialCandidates.length === 0) void refresh();
  }, [initialCandidates.length, refresh]);

  async function startDiscovery() {
    if (!token) return;
    const userProvidedUrls = urls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);
    const res = await fetch("/api/v1/network/discovery", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, userProvidedUrls }),
    });
    const payload = (await res.json()) as { result?: { candidateCount: number }; error?: string };
    appendLog({
      at: new Date().toISOString(),
      ok: res.ok,
      detail: res.ok ? `Discovery queued ${payload.result?.candidateCount ?? 0} candidates.` : payload.error ?? "discovery_failed",
    });
    if (res.ok) {
      setQuery("");
      setUrls("");
      await refresh();
    }
  }

  async function approve(candidateId: string, sendNow: boolean) {
    if (!token) return;
    const res = await fetch("/api/v1/network/admin/superconnector/approve", {
      method: "POST",
      headers,
      body: JSON.stringify({
        candidateId,
        reason: sendNow ? "operator-approved-and-send" : "operator-approved",
        sendNow,
      }),
    });
    const payload = (await res.json()) as { error?: string };
    appendLog({
      at: new Date().toISOString(),
      ok: res.ok,
      detail: res.ok ? (sendNow ? "Approved and sent." : "Approved.") : payload.error ?? "approve_failed",
    });
    if (res.ok) await refresh();
  }

  async function suppress(candidateId: string) {
    if (!token) return;
    const res = await fetch("/api/v1/network/admin/superconnector/suppress", {
      method: "POST",
      headers,
      body: JSON.stringify({ candidateId, reason: "operator-suppressed" }),
    });
    const payload = (await res.json()) as { error?: string };
    appendLog({
      at: new Date().toISOString(),
      ok: res.ok,
      detail: res.ok ? "Suppressed." : payload.error ?? "suppress_failed",
    });
    if (res.ok) await refresh();
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-neutral-950">
            Discovery Queue
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Review source-backed claim invites before any outbound contact.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1 text-sm font-medium text-neutral-800">
          Query
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 rounded-md border border-neutral-200 px-3 text-sm font-normal outline-none focus:border-neutral-900"
            placeholder="marketplace operator with AI workflow proof"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-neutral-800">
          URLs
          <textarea
            value={urls}
            onChange={(event) => setUrls(event.target.value)}
            className="min-h-10 rounded-md border border-neutral-200 px-3 py-2 text-sm font-normal outline-none focus:border-neutral-900"
            placeholder="https://example.com/person"
          />
        </label>
        <button
          type="button"
          onClick={startDiscovery}
          disabled={!token || (!query.trim() && !urls.trim())}
          className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Discover
        </button>
      </div>

      {!token ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Admin token required.
        </div>
      ) : null}

      {log.length > 0 ? (
        <div className="space-y-2">
          {log.map((entry) => (
            <div
              key={`${entry.at}-${entry.detail}`}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                entry.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              }`}
            >
              {entry.ok ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {entry.detail}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        {loading ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            Loading candidates...
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            No discovery candidates.
          </div>
        ) : (
          candidates.map((candidate) => (
            <article
              key={candidate.id}
              className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tracking-normal text-neutral-950">
                      {candidate.profile?.displayName ?? "Unknown profile"}
                    </h2>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${chipTone(candidate.status)}`}>
                      {candidate.status}
                    </span>
                    <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {candidate.sourceClass}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-700">
                    {candidate.profile?.headline ?? "No headline"}
                  </p>
                  <p className="mt-2 max-w-3xl text-sm text-neutral-600">
                    {candidate.inviteReason}
                  </p>
                </div>
                <div className={`rounded-md px-3 py-2 text-sm font-semibold ${scoreTone(candidate.totalScore)}`}>
                  {candidate.totalScore}
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-neutral-600 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Superconnector", candidate.superconnectorFit],
                  ["Opportunity", candidate.activeOpportunityFit],
                  ["Request", candidate.activeRequestFit],
                  ["Source", candidate.sourceConfidence],
                  ["Risk", candidate.inviteRisk],
                  ["Health", candidate.networkHealth],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-neutral-200 px-3 py-2">
                    <div className="font-medium text-neutral-950">{label}</div>
                    <div>{value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-neutral-200 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-950">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Evidence
                  </div>
                  <div className="space-y-3">
                    {candidate.claims.map((claim) => (
                      <div key={claim.id} className="text-sm text-neutral-700">
                        <div className="font-medium text-neutral-950">{claim.claimText}</div>
                        <div className="mt-1 text-neutral-600">{claim.evidenceSnippet}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {claim.sourceLabel}{claim.sourceUrl ? ` · ${claim.sourceUrl}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-neutral-200 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-950">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    Review Flags
                  </div>
                  <dl className="grid gap-2 text-sm">
                    <div>
                      <dt className="font-medium text-neutral-950">Risks</dt>
                      <dd className="text-neutral-600">{fieldValue(candidate.riskFlags)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-neutral-950">Suppressions</dt>
                      <dd className="text-neutral-600">{fieldValue(candidate.suppressionReasons)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-neutral-950">Draft</dt>
                      <dd className="text-neutral-600">{candidate.proposedSubject ?? "Not composed yet"}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => approve(candidate.id, false)}
                  disabled={candidate.status !== "queued" && candidate.status !== "drafted"}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => approve(candidate.id, true)}
                  disabled={candidate.status !== "queued" && candidate.status !== "drafted" && candidate.status !== "approved"}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Send
                </button>
                <button
                  type="button"
                  onClick={() => suppress(candidate.id)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Suppress
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
