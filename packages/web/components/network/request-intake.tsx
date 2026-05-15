"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveRequestDraft } from "./request-review";

const EXAMPLES = [
  "Need a fractional CMO for a climate startup, B2B SaaS, UK or Europe, paid advisory.",
  "Looking for marketplace ops leaders who have fixed supply quality in a two-sided network.",
  "Find angel investors who understand developer tools and can make useful customer intros.",
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
  const initialNeedSubmittedRef = useRef(false);
  const canSubmit = rawNeed.trim().length >= 12 && !loading;

  async function submitNeed(need: string) {
    const cleanNeed = need.trim();
    if (cleanNeed.length < 12 || loading) return;
    setRawNeed(cleanNeed);
    setLoading(true);
    setError(null);
    const visitorSessionId = getOrCreateVisitorSessionId();
    try {
      const draft = await draftActiveRequest({ rawNeed: cleanNeed, visitorSessionId });
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
    void submitNeed(initialNeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNeed]);

  async function handleSubmit() {
    if (!canSubmit) return;
    await submitNeed(rawNeed);
  }

  return (
    <section className={cn("rounded-3xl bg-white p-5 shadow-medium md:p-6", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Sparkles className="h-4 w-4 text-vivid" aria-hidden="true" />
        Active Request
      </div>
      <h1 className="mt-4 max-w-[620px] text-3xl font-semibold leading-[1.05] text-text-primary md:text-[42px]">
        Start with the outcome.
      </h1>
      <textarea
        value={rawNeed}
        onChange={(event) => setRawNeed(event.target.value)}
        placeholder="Describe the person, opportunity, or outcome you need..."
        className="mt-6 min-h-[176px] w-full resize-none rounded-2xl border border-border bg-background px-4 py-4 text-base leading-6 text-text-primary outline-none transition focus:border-text-primary"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setRawNeed(example)}
            className="rounded-full border border-border bg-background px-3 py-2 text-left text-xs font-medium leading-4 text-text-secondary transition hover:border-text-primary hover:text-text-primary"
          >
            {example}
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[420px] text-sm leading-5 text-text-secondary">
          Budget and private filters stay private unless you mark a shareable label.
        </p>
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
      {error ? <p className="mt-3 text-sm font-medium text-negative">{error}</p> : null}
    </section>
  );
}
