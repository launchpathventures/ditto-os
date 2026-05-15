"use client";

import { useMemo, useState } from "react";
import { Check, Eye, Loader2, Pause, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActiveRequestMode = "manual-search" | "background-watch" | "both";
export type ActiveRequestSources = "ditto-members" | "public-web" | "both";
export type ActiveRequestContactPolicy =
  | "ask-before-contact"
  | "ask-before-intro"
  | "never-contact-without-approval";

export interface ActiveRequestDraft {
  rawNeed: string;
  outcomeNeeded: string;
  idealPerson: string;
  proofRequired: string;
  badFit: string;
  urgency: string;
  geography: string;
  commercialShape: string;
  successOutcome: string;
  outcomeValueHint: string | null;
  budgetPrivate: string;
  budgetShareableLabel: string;
  shareableSummary: string;
  privateNotes: string;
  sourcesAllowed: ActiveRequestSources;
  contactPolicy: ActiveRequestContactPolicy;
  mode: ActiveRequestMode;
  missingFields: string[];
}

const MODE_OPTIONS: Array<{
  value: ActiveRequestMode;
  label: string;
  copy: string;
  icon: typeof Search;
}> = [
  {
    value: "manual-search",
    label: "Search now",
    copy: "Start a manual search from this request.",
    icon: Search,
  },
  {
    value: "background-watch",
    label: "Keep watch",
    copy: "Save the request for quiet monitoring.",
    icon: Eye,
  },
  {
    value: "both",
    label: "Do both",
    copy: "Search now and keep the request active.",
    icon: Pause,
  },
];

const FIELDS: Array<{ key: keyof ActiveRequestDraft; label: string; private?: boolean }> = [
  { key: "outcomeNeeded", label: "Outcome" },
  { key: "idealPerson", label: "Ideal person" },
  { key: "proofRequired", label: "Proof required" },
  { key: "badFit", label: "Avoid" },
  { key: "urgency", label: "Urgency" },
  { key: "geography", label: "Geography" },
  { key: "commercialShape", label: "Commercial shape" },
  { key: "successOutcome", label: "Success outcome" },
  { key: "outcomeValueHint", label: "Outcome value", private: true },
  { key: "budgetPrivate", label: "Private budget", private: true },
  { key: "budgetShareableLabel", label: "Shareable budget label" },
  { key: "shareableSummary", label: "Shareable summary" },
  { key: "privateNotes", label: "Private notes", private: true },
];

function textValue(value: ActiveRequestDraft[keyof ActiveRequestDraft]): string {
  return typeof value === "string" ? value : "";
}

function scrubPreview(value: string, draft: ActiveRequestDraft): string {
  let next = value;
  for (const privateValue of [draft.budgetPrivate, draft.privateNotes, draft.outcomeValueHint ?? ""]) {
    if (!privateValue.trim()) continue;
    const escaped = privateValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(escaped, "gi"), "[private]");
  }
  return next;
}

export async function saveActiveRequest({
  draft,
  visitorSessionId,
  publish,
  fetchImpl = fetch,
}: {
  draft: ActiveRequestDraft;
  visitorSessionId: string;
  publish: boolean;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl("/api/v1/network/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "save",
      rawNeed: draft.rawNeed,
      visitorSessionId,
      publish,
      draft,
    }),
  });
  const payload = (await response.json()) as { request?: { id: string; status: string }; error?: string };
  if (!response.ok || !payload.request) {
    throw new Error(payload.error || `Request save failed: ${response.status}`);
  }
  return payload.request;
}

export function RequestReview({
  initialDraft,
  visitorSessionId,
  className,
}: {
  initialDraft: ActiveRequestDraft;
  visitorSessionId: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<ActiveRequestDraft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const publicPreview = useMemo(() => scrubPreview(draft.shareableSummary, draft), [draft]);

  function setField(key: keyof ActiveRequestDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [key]: value,
      missingFields: current.missingFields.filter((field) => field !== key),
    }));
  }

  async function handleSave(publish: boolean) {
    setSaving(true);
    setError(null);
    try {
      const request = await saveActiveRequest({ draft, visitorSessionId, publish });
      setSavedStatus(request.status);
    } catch {
      setError("I couldn't save that request. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={cn("grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]", className)}>
      <div className="rounded-3xl bg-white p-5 shadow-medium md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
              Request brief
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-text-primary">
              Edit before Ditto works from it.
            </h2>
          </div>
          {draft.missingFields.length > 0 ? (
            <span className="rounded-full bg-vivid-subtle px-3 py-1 text-xs font-semibold text-vivid">
              {draft.missingFields.length} field{draft.missingFields.length === 1 ? "" : "s"} to clarify
            </span>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <label
              key={field.key}
              className={cn(
                "block rounded-2xl border bg-background p-3",
                field.key === "shareableSummary" || field.key === "privateNotes" ? "sm:col-span-2" : "",
                field.private ? "border-vivid-subtle" : "border-border",
              )}
            >
              <span className="flex items-center justify-between gap-2 text-xs font-semibold text-text-muted">
                {field.label}
                {field.private ? <span className="text-vivid">private</span> : null}
              </span>
              <textarea
                value={textValue(draft[field.key])}
                onChange={(event) => setField(field.key, event.target.value)}
                rows={field.key === "shareableSummary" || field.key === "privateNotes" ? 3 : 2}
                className="mt-2 w-full resize-none bg-transparent text-sm leading-5 text-text-primary outline-none"
              />
            </label>
          ))}
        </div>
      </div>

      <aside className="rounded-3xl bg-white p-5 shadow-medium md:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
          Next move
        </p>
        <div className="mt-4 grid gap-2">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = draft.mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setDraft((current) => ({ ...current, mode: option.value }))}
                className={cn(
                  "flex min-h-[76px] items-start gap-3 rounded-2xl border p-3 text-left transition",
                  selected ? "border-text-primary bg-surface-raised" : "border-border bg-background hover:border-text-primary/60",
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    {option.label}
                    {selected ? <Check className="h-4 w-4 text-vivid" aria-hidden="true" /> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-text-secondary">
                    {option.copy}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl bg-surface-raised p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            Match-facing copy
          </p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {publicPreview || "Add a shareable summary before publishing."}
          </p>
        </div>

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave(true)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Save active request
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave(false)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-5 py-2 text-sm font-semibold text-text-primary transition hover:border-text-primary disabled:cursor-wait disabled:opacity-50"
          >
            Save draft
          </button>
        </div>
        {savedStatus ? (
          <p className="mt-3 text-sm font-semibold text-text-primary">
            Saved as {savedStatus}.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm font-medium text-negative">{error}</p> : null}
      </aside>
    </section>
  );
}
