"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Eye,
  Loader2,
  Lock,
  Pause,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveActiveRequest,
  type ActiveRequestDraft,
  type ActiveRequestMode,
} from "./request-review";
import {
  RequestIdentityCard,
  isIdentityCompleteEnough,
  type RequestIdentity,
} from "./request-identity-card";
import type { TrackedField } from "./request-diff";

type FieldKey = Exclude<
  keyof ActiveRequestDraft,
  "missingFields" | "sourcesAllowed" | "contactPolicy" | "mode" | "rawNeed" | "outcomeValueHint"
> | "outcomeValueHint";

interface FieldSpec {
  key: FieldKey;
  label: string;
  hint?: string;
  rows?: number;
  private?: boolean;
  placeholder?: string;
}

const LOOKING_FOR: FieldSpec[] = [
  { key: "outcomeNeeded", label: "Outcome", hint: "What needs to become true.", rows: 2 },
  { key: "idealPerson", label: "Ideal person", hint: "Who could change it.", rows: 2 },
  { key: "proofRequired", label: "Proof", hint: "Evidence they've done this.", rows: 2 },
  { key: "successOutcome", label: "Success", hint: "How you'll know it worked.", rows: 2 },
];

const CONTEXT: FieldSpec[] = [
  { key: "commercialShape", label: "Commercial shape", hint: "Paid, advisory, partnership…" },
  { key: "geography", label: "Geography", hint: "Where they should sit." },
  { key: "urgency", label: "Urgency", hint: "When this matters." },
  { key: "badFit", label: "Avoid", hint: "Anti-persona, hard nos." },
];

const PRIVATE_FIELDS: FieldSpec[] = [
  {
    key: "budgetPrivate",
    label: "Private budget",
    hint: "Never shared without your shareable label.",
    private: true,
    rows: 2,
  },
  {
    key: "outcomeValueHint",
    label: "Outcome value",
    hint: "What success would be worth.",
    private: true,
    rows: 2,
  },
  {
    key: "privateNotes",
    label: "Private notes",
    hint: "Anything Mira should know but never share.",
    private: true,
    rows: 3,
  },
];

const SHARING_FIELDS: FieldSpec[] = [
  {
    key: "budgetShareableLabel",
    label: "Shareable budget label",
    hint: 'Optional. e.g. "competitive day rate".',
  },
  {
    key: "shareableSummary",
    label: "Shareable summary",
    hint: "What recipients see when Mira reaches out.",
    rows: 3,
  },
];

const MODE_OPTIONS: Array<{
  value: ActiveRequestMode;
  label: string;
  copy: string;
  icon: typeof Search;
}> = [
  {
    value: "manual-search",
    label: "Search now",
    copy: "Mira runs the search this session and brings back people with sources.",
    icon: Search,
  },
  {
    value: "background-watch",
    label: "Keep watch",
    copy: "Save the request. Mira pings you only when there's something worth surfacing.",
    icon: Eye,
  },
  {
    value: "both",
    label: "Do both",
    copy: "Search now, and keep the request active in the background.",
    icon: Pause,
  },
];

function textValue(value: ActiveRequestDraft[keyof ActiveRequestDraft]): string {
  return typeof value === "string" ? value : "";
}

function scrubPreview(value: string, draft: ActiveRequestDraft): string {
  let next = value;
  for (const privateValue of [
    draft.budgetPrivate,
    draft.privateNotes,
    draft.outcomeValueHint ?? "",
  ]) {
    if (!privateValue.trim()) continue;
    const escaped = privateValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(escaped, "gi"), "[private]");
  }
  return next;
}

function briefBadges(draft: ActiveRequestDraft): string[] {
  return [draft.commercialShape, draft.geography, draft.urgency]
    .map((value) => value.trim())
    .filter((value): value is string => Boolean(value));
}

function FieldEditor({
  field,
  value,
  onChange,
  highlighted,
  pulse,
  active,
}: {
  field: FieldSpec;
  value: string;
  onChange: (next: string) => void;
  highlighted: boolean;
  pulse: boolean;
  active: boolean;
}) {
  return (
    <label
      className={cn(
        "relative block rounded-xl border bg-background p-3 transition focus-within:border-text-primary",
        "border-border",
        highlighted ? "ring-1 ring-accent/15" : "",
        active ? "border-accent ring-2 ring-accent/20" : "",
        pulse ? "animate-in fade-in-0 zoom-in-95 border-accent bg-surface-raised duration-300" : "",
      )}
    >
      <span className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
        <span className="flex items-center gap-1.5">
          {field.private ? (
            <Lock className="h-3 w-3 text-text-muted" aria-hidden="true" />
          ) : null}
          {field.label}
        </span>
        {active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-accent-foreground">
            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
            Mira asking
          </span>
        ) : field.private ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            private
          </span>
        ) : null}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={field.rows ?? 2}
        placeholder={field.placeholder ?? field.hint}
        className="mt-1.5 w-full resize-none bg-transparent text-sm leading-5 text-text-primary outline-none placeholder:text-text-muted"
      />
    </label>
  );
}

function SectionHeading({
  kicker,
  title,
  hint,
}: {
  kicker: string;
  title: string;
  hint?: string;
}) {
  return (
    <header>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
        {kicker}
      </p>
      <h2 className="mt-1 text-xl font-semibold leading-tight text-text-primary">{title}</h2>
      {hint ? <p className="mt-1 text-sm leading-5 text-text-secondary">{hint}</p> : null}
    </header>
  );
}

export function RequestCanvas({
  draft,
  onDraftChange,
  visitorSessionId,
  identity,
  onIdentityChange,
  highlightedFields = [],
  currentStepField = null,
  className,
}: {
  draft: ActiveRequestDraft;
  onDraftChange: (next: ActiveRequestDraft) => void;
  visitorSessionId: string;
  identity: RequestIdentity;
  onIdentityChange: (next: RequestIdentity) => void;
  highlightedFields?: TrackedField[];
  currentStepField?: TrackedField | null;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [savedRequestId, setSavedRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const badges = useMemo(() => briefBadges(draft), [draft]);
  const publicPreview = useMemo(() => scrubPreview(draft.shareableSummary, draft), [draft]);
  const missingSet = useMemo(() => new Set(draft.missingFields), [draft.missingFields]);
  const pulseSet = useMemo(() => new Set<string>(highlightedFields), [highlightedFields]);
  const identityReady = isIdentityCompleteEnough(identity);

  function setField(key: FieldKey, value: string) {
    onDraftChange({
      ...draft,
      [key]: value,
      missingFields: draft.missingFields.filter((field) => field !== key),
    });
  }

  function setMode(mode: ActiveRequestMode) {
    onDraftChange({ ...draft, mode });
  }

  async function handleSave(publish: boolean) {
    if (publish && !identityReady && draft.mode !== "manual-search") {
      // Save still allowed for search-only, but a published intro-eligible request asks for identity.
    }
    setSaving(true);
    setError(null);
    try {
      const request = await saveActiveRequest({
        draft,
        visitorSessionId,
        requestId: savedRequestId,
        identity,
        publish,
      });
      setSavedRequestId(request.id);
      setSavedStatus(request.status);
    } catch {
      setError("I couldn't save that request. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Brief header card */}
      <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-medium">
        <div className="relative bg-white px-5 pb-5 pt-5 md:px-7 md:pb-6 md:pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent-foreground">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Active Request
            </span>
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-text-primary"
              >
                {badge}
              </span>
            ))}
            {draft.missingFields.length > 0 ? (
              <span className="rounded-full bg-accent-subtle px-2.5 py-1 text-[11px] font-semibold text-text-primary">
                {draft.missingFields.length} to clarify
              </span>
            ) : null}
          </div>
          <h1 className="mt-4 text-2xl font-semibold leading-tight text-text-primary md:text-[28px]">
            {draft.outcomeNeeded || draft.rawNeed.slice(0, 140)}
          </h1>
          {draft.idealPerson ? (
            <p className="mt-2 max-w-[640px] text-[15px] leading-6 text-text-secondary">
              Looking for {draft.idealPerson.toLowerCase()}.
              {draft.proofRequired ? ` Proof: ${draft.proofRequired.toLowerCase()}.` : ""}
            </p>
          ) : null}
        </div>
      </section>

      {/* Looking for */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-subtle md:p-6">
        <SectionHeading
          kicker="What you want"
          title="Edit before Mira works from it."
          hint="Every line is editable. Or tell Mira in the chat to rewrite it."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {LOOKING_FOR.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              value={textValue(draft[field.key])}
              onChange={(value) => setField(field.key, value)}
              highlighted={missingSet.has(field.key as never)}
              pulse={pulseSet.has(field.key)}
              active={currentStepField === field.key}
            />
          ))}
        </div>
      </section>

      {/* Context */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-subtle md:p-6">
        <SectionHeading kicker="Context" title="Where, when, and how." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {CONTEXT.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              value={textValue(draft[field.key])}
              onChange={(value) => setField(field.key, value)}
              highlighted={missingSet.has(field.key as never)}
              pulse={pulseSet.has(field.key)}
              active={currentStepField === field.key}
            />
          ))}
        </div>
      </section>

      {/* Private filters */}
      <section className="rounded-2xl border border-border bg-surface-raised p-5 shadow-subtle md:p-6">
        <SectionHeading
          kicker="Private filters"
          title="Stays between you and Mira."
          hint="Never appears in matches, member-facing copy, or shared summaries unless you mark a label."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRIVATE_FIELDS.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              value={textValue(draft[field.key])}
              onChange={(value) => setField(field.key, value)}
              highlighted={false}
              pulse={pulseSet.has(field.key)}
              active={currentStepField === field.key}
            />
          ))}
        </div>
      </section>

      {/* Sharing */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-subtle md:p-6">
        <SectionHeading
          kicker="What others see"
          title="Match-facing copy."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {SHARING_FIELDS.map((field) => (
            <FieldEditor
              key={field.key}
              field={field}
              value={textValue(draft[field.key])}
              onChange={(value) => setField(field.key, value)}
              highlighted={missingSet.has(field.key as never)}
              pulse={pulseSet.has(field.key)}
              active={currentStepField === field.key}
            />
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-surface-raised p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Preview
          </p>
          <p className="mt-1.5 text-sm leading-6 text-text-secondary">
            {publicPreview || "Add a shareable summary so recipients know why Mira is reaching out."}
          </p>
        </div>
      </section>

      {/* Next move */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-subtle md:p-6">
        <SectionHeading
          kicker="Next move"
          title="Pick how Mira should work."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = draft.mode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={selected}
                className={cn(
                  "group relative flex h-full flex-col items-start gap-2 rounded-xl border p-4 text-left transition",
                  selected
                    ? "border-text-primary bg-surface-raised shadow-medium"
                    : "border-border bg-background hover:border-text-primary/60 hover:bg-surface-raised",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      selected
                        ? "bg-text-primary text-accent-foreground"
                        : "bg-surface-raised text-text-primary",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {selected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-primary">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      Picked
                    </span>
                  ) : null}
                </div>
                <span className="text-[15px] font-semibold leading-tight text-text-primary">
                  {option.label}
                </span>
                <span className="text-[13px] leading-5 text-text-secondary">{option.copy}</span>
              </button>
            );
          })}
        </div>
      </section>

      <RequestIdentityCard identity={identity} onChange={onIdentityChange} />

      {/* Sticky action bar */}
      <div className="sticky bottom-3 z-10 rounded-2xl border border-border bg-white p-3 shadow-large md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              {savedStatus ? "Saved" : "Ready to publish?"}
            </p>
            <p className="mt-0.5 text-sm leading-5 text-text-secondary">
              {savedStatus
                ? `Status: ${savedStatus}. Keep editing or close this tab — Mira has it.`
                : draft.mode === "manual-search"
                  ? "Search-only — identity can wait. Mira will ask before any outreach."
                  : identityReady
                    ? "Identity is set. You can publish."
                    : "Add your details below before publishing if you might send an intro."}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-text-primary disabled:cursor-wait disabled:opacity-50"
            >
              Save draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
              Publish active request
            </button>
          </div>
        </div>
        {error ? <p className="mt-2 text-sm font-medium text-negative">{error}</p> : null}
      </div>
    </div>
  );
}
