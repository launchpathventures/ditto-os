"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveRequestDraft } from "./request-review";
import { RequestAnalysisTransition } from "./request-analysis";

const FRONT_DOOR_ANALYSIS_MS = 45_000;

const EXAMPLES = [
  "Need a fractional CMO for a climate startup, B2B SaaS, UK or Europe, paid advisory.",
  "Looking for marketplace ops leaders who have fixed supply quality in a two-sided network.",
  "Find angel investors who understand developer tools and can make useful customer intros.",
] as const;

const STEPS = [
  { label: "Describe", copy: "One line is enough." },
  { label: "Refine", copy: "Mira asks only what's missing." },
  { label: "Act", copy: "Search now or keep watch." },
] as const;

export function getOrCreateVisitorSessionId(): string {
  if (typeof window === "undefined") return "server";
  const key = "ditto-network-request-visitor";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const id = `request-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, id);
  return id;
}

export async function draftActiveRequest({
  rawNeed,
  visitorSessionId,
  fetchImpl = fetch,
}: {
  rawNeed: string;
  visitorSessionId: string;
  fetchImpl?: typeof fetch;
}): Promise<ActiveRequestDraft> {
  const response = await fetchImpl("/api/v1/network/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "draft",
      rawNeed,
      visitorSessionId,
    }),
  });
  const payload = (await response.json()) as { draft?: ActiveRequestDraft; error?: string };
  if (!response.ok || !payload.draft) {
    throw new Error(payload.error || `Request draft failed: ${response.status}`);
  }
  return payload.draft;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function RequestIntake({
  initialNeed,
  onDraft,
  className,
}: {
  initialNeed?: string;
  onDraft: (draft: ActiveRequestDraft, visitorSessionId: string) => void;
  className?: string;
}) {
  const [rawNeed, setRawNeed] = useState(initialNeed ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisDraft, setAnalysisDraft] = useState<ActiveRequestDraft | null>(null);
  const initialNeedSubmittedRef = useRef(false);
  const cleanInitialNeed = initialNeed?.trim() ?? "";
  const showInitialAnalysis =
    cleanInitialNeed.length >= 12 &&
    !error &&
    (loading || !initialNeedSubmittedRef.current);
  const canSubmit = rawNeed.trim().length >= 12 && !loading;

  async function submitNeed(need: string, options: { minimumAnalysisMs?: number } = {}) {
    const cleanNeed = need.trim();
    if (cleanNeed.length < 12 || loading) return;
    setRawNeed(cleanNeed);
    setLoading(true);
    setError(null);
    setAnalysisDraft(null);
    const visitorSessionId = getOrCreateVisitorSessionId();
    const startedAt = Date.now();
    try {
      const draft = await draftActiveRequest({ rawNeed: cleanNeed, visitorSessionId });
      setAnalysisDraft(draft);
      const remaining = Math.max(0, (options.minimumAnalysisMs ?? 0) - (Date.now() - startedAt));
      if (remaining > 0) await wait(remaining);
      onDraft(draft, visitorSessionId);
    } catch {
      setError("I couldn't draft that request. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialNeed || initialNeedSubmittedRef.current) return;
    initialNeedSubmittedRef.current = true;
    void submitNeed(initialNeed, { minimumAnalysisMs: FRONT_DOOR_ANALYSIS_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNeed]);

  async function handleSubmit() {
    if (!canSubmit) return;
    await submitNeed(rawNeed);
  }

  if (showInitialAnalysis) {
    return <RequestAnalysisTransition rawNeed={rawNeed} draft={analysisDraft} className={className} />;
  }

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-white shadow-medium",
        className,
      )}
    >
      {/* Decorative wash — Phoenix gradient as restrained corner accent, never chrome */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 h-[320px] w-[320px] rounded-full opacity-[0.18] blur-3xl"
        style={{ background: "var(--gradient-phoenix-orange)" }}
      />

      <div className="relative px-6 pb-8 pt-7 md:px-10 md:pb-10 md:pt-9">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-primary">
            <Sparkles className="h-3 w-3 text-text-primary" aria-hidden="true" />
            Active Request
          </span>
          <span className="text-[11px] font-medium text-text-muted">
            Need-first · Account later
          </span>
        </div>

        <h1 className="mt-6 max-w-[680px] text-4xl font-semibold leading-[1.02] tracking-tight text-text-primary md:text-[52px]">
          Start with the{" "}
          <span className="font-instrument-serif italic font-normal">outcome.</span>
        </h1>
        <p className="mt-3 max-w-[560px] text-[15px] leading-6 text-text-secondary md:text-base">
          Describe the person, opportunity, or outcome you need. Mira drafts a brief, asks only
          what's missing, then searches now or keeps watch — your call.
        </p>

        <div className="mt-7 rounded-2xl border border-border bg-background p-2 shadow-subtle transition focus-within:border-text-primary">
          <textarea
            value={rawNeed}
            onChange={(event) => setRawNeed(event.target.value)}
            placeholder="e.g. Need a fractional CMO for a climate startup, B2B SaaS, UK or Europe, paid advisory."
            rows={4}
            className="block w-full resize-none rounded-xl bg-transparent px-3 py-3 text-base leading-6 text-text-primary outline-none placeholder:text-text-muted"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 pb-2 pt-3">
            <span className="text-xs font-medium text-text-muted">
              Budget and private filters stay private unless you mark a shareable label.
            </span>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Draft request
              {!loading ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
            </button>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Try a starter
          </p>
          <div className="mt-2 flex flex-col items-start gap-0.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setRawNeed(example)}
                className="group inline-flex max-w-full items-baseline gap-2 rounded px-0 py-1 text-left text-xs font-medium leading-5 text-text-secondary transition hover:text-text-primary"
              >
                <span className="text-text-muted transition group-hover:text-text-primary">→</span>
                <span className="truncate underline decoration-border decoration-1 underline-offset-4 transition group-hover:decoration-text-primary">
                  {example}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.label} className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-text-primary">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-tight text-text-primary">
                  {step.label}
                </p>
                <p className="mt-0.5 text-[12px] leading-4 text-text-secondary">{step.copy}</p>
              </div>
            </div>
          ))}
        </div>

        {error ? <p className="mt-4 text-sm font-medium text-negative">{error}</p> : null}
      </div>
    </section>
  );
}
