"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, ShieldOff, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

interface ClaimPreview {
  discoveryProfileId: string;
  displayName: string;
  headline: string;
  canonicalUrl: string | null;
  claims: {
    id: string;
    claimText: string;
    evidenceSnippet: string;
    sourceLabel: string;
    sourceUrl: string | null;
    confidence: string;
  }[];
  status: string;
  expiresAt: string | null;
}

export default function ClaimInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = useMemo(() => decodeURIComponent(params.token), [params.token]);
  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/network/invites/${encodeURIComponent(token)}/claim`)
      .then((res) => res.json())
      .then((payload: { preview?: ClaimPreview; error?: string }) => {
        if (!active) return;
        if (payload.preview) setPreview(payload.preview);
        else setError(payload.error ?? "claim_token_invalid_or_expired");
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "request_failed");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function postAction(action: "claim" | "decline" | "delete") {
    setBusyAction(action);
    setError(null);
    try {
      const res = await fetch(`/api/v1/network/invites/${encodeURIComponent(token)}/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, email, name }),
      });
      const payload = (await res.json()) as { result?: { redirectTo?: string }; error?: string };
      if (!res.ok) {
        setError(payload.error ?? `${action}_failed`);
        return;
      }
      if (action === "claim" && payload.result?.redirectTo) {
        router.push(payload.result.redirectTo);
        return;
      }
      setPreview((prev) => prev ? { ...prev, status: action === "delete" ? "deleted" : "declined" } : prev);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950 sm:px-8">
      <section className="mx-auto max-w-3xl space-y-5">
        <div className="border-b border-neutral-200 pb-5">
          <p className="text-sm font-medium text-neutral-500">Ditto Network</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            Review your profile seed
          </h1>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!preview ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600 shadow-sm">
            Loading...
          </div>
        ) : (
          <div className="space-y-4">
            <article className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-normal">{preview.displayName}</h2>
                  <p className="mt-1 text-sm text-neutral-700">{preview.headline}</p>
                </div>
                <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  {preview.status}
                </span>
              </div>
              {preview.canonicalUrl ? (
                <a
                  href={preview.canonicalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-950"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Source
                </a>
              ) : null}
            </article>

            <div className="space-y-3">
              {preview.claims.map((claim) => (
                <article
                  key={claim.id}
                  className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="text-sm font-semibold text-neutral-950">{claim.claimText}</div>
                  <p className="mt-2 text-sm text-neutral-700">{claim.evidenceSnippet}</p>
                  <div className="mt-2 text-xs text-neutral-500">
                    {claim.sourceLabel}{claim.sourceUrl ? ` · ${claim.sourceUrl}` : ""} · {claim.confidence}
                  </div>
                </article>
              ))}
            </div>

            {preview.status === "internal" ? (
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-medium text-neutral-800">
                    Name
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-10 rounded-md border border-neutral-200 px-3 text-sm font-normal outline-none focus:border-neutral-900"
                      placeholder={preview.displayName}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-neutral-800">
                    Email
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-10 rounded-md border border-neutral-200 px-3 text-sm font-normal outline-none focus:border-neutral-900"
                      placeholder="you@example.com"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => postAction("claim")}
                    disabled={busyAction !== null}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:bg-neutral-300"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={() => postAction("decline")}
                    disabled={busyAction !== null}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <ShieldOff className="h-4 w-4" aria-hidden="true" />
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => postAction("delete")}
                    disabled={busyAction !== null}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
