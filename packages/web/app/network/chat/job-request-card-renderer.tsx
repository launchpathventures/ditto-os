"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, LockKeyhole, MoreHorizontal, PencilLine, Search } from "lucide-react";
import type { JobRequestCardBlock } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { JobRequestCardInspectorModal } from "./job-request-card-inspector-modal";

export type JobRequestCardAudience = "operator" | "candidate";

export type JobRequestEditableField =
  | "outcome"
  | "reference"
  | "bad fit"
  | "success criteria"
  | "budget"
  | "scout preference";

export type JobRequestRendererProps = {
  card: JobRequestCardBlock;
  audience?: JobRequestCardAudience;
  className?: string;
  editable?: boolean;
  onEditField?: (field: JobRequestEditableField) => void;
};

const VERB_CANDIDATES = [
  "ramp",
  "rewrite",
  "build",
  "fix",
  "find",
  "hire",
  "scale",
  "launch",
  "set",
  "turn",
  "grow",
  "sell",
  "ship",
];

export function greeterName(card: JobRequestCardBlock): string {
  return card.greeterCuratedBy === "mira" ? "Mira" : "Alex";
}

export function updatedLabel(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "Updated today";
  const days = Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated 1d ago";
  return `Updated ${days}d ago`;
}

function renderItalicOnce(markdown: string) {
  const explicit = markdown.match(/\*([^*]+)\*/);
  if (explicit && explicit.index != null) {
    const before = markdown.slice(0, explicit.index);
    const after = markdown.slice(explicit.index + explicit[0].length);
    return (
      <>
        {before}
        <span className="font-instrument-serif italic">{explicit[1]}</span>
        {after}
      </>
    );
  }

  const verb = VERB_CANDIDATES.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(markdown));
  if (!verb) return markdown;
  const match = markdown.match(new RegExp(`\\b${verb}\\b`, "i"));
  if (!match || match.index == null) return markdown;
  const before = markdown.slice(0, match.index);
  const after = markdown.slice(match.index + match[0].length);
  return (
    <>
      {before}
      <span className="font-instrument-serif italic">{match[0]}</span>
      {after}
    </>
  );
}

function successChips(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return ["Success criteria still being clarified"];
  const byMatch = trimmed.match(/(.+?)\s+by\s+(.+)/i);
  if (byMatch) {
    return [byMatch[1].trim(), `by ${byMatch[2].trim()}`].filter(Boolean).slice(0, 3);
  }
  return trimmed
    .split(/\s*(?:,|;|\||\/|\band\b)\s*/i)
    .map((chip) => chip.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function EditableChip({
  field,
  onEditField,
}: {
  field: JobRequestEditableField;
  onEditField?: (field: JobRequestEditableField) => void;
}) {
  if (!onEditField) return null;
  return (
    <button
      type="button"
      onClick={() => onEditField(field)}
      className="absolute right-2 top-2 inline-flex min-h-11 items-center gap-1 rounded-md border border-border bg-white/95 px-2.5 text-[11px] font-semibold text-text-secondary shadow-subtle transition hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary/25"
    >
      <PencilLine className="h-3 w-3" aria-hidden="true" />
      Edit {field}
    </button>
  );
}

function TooltipButton({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "group relative inline-flex items-center justify-center rounded-md outline-none",
        "focus-visible:ring-2 focus-visible:ring-text-primary/25 focus-visible:ring-offset-2",
        className,
      )}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-6 z-20 w-max max-w-[220px] -translate-x-1/2 rounded-md bg-text-primary px-2 py-1 text-center text-[11px] font-medium leading-snug text-white opacity-0 shadow-medium transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </button>
  );
}

function ScoutToggle({ enabled }: { enabled: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-primary">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <span className="truncate">Scan off-network too</span>
      </div>
      <span
        aria-label={enabled ? "Scout opt-in enabled" : "Scout opt-in disabled"}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full border transition-colors",
          enabled ? "border-text-primary bg-text-primary" : "border-border bg-white",
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-4 w-4 rounded-full bg-white transition-transform",
            enabled ? "translate-x-5" : "translate-x-1 bg-text-muted/35",
          )}
        />
      </span>
    </div>
  );
}

export function JobRequestCardSurface({
  card,
  audience,
  className,
  editable = false,
  onEditField,
  inspectorSlot,
}: {
  card: JobRequestCardBlock;
  audience: JobRequestCardAudience;
  className?: string;
  editable?: boolean;
  onEditField?: (field: JobRequestEditableField) => void;
  inspectorSlot?: ReactNode;
}) {
  const operator = audience === "operator";
  const greeter = greeterName(card);
  const chips = successChips(card.successCriteria);

  return (
    <article
      data-testid="job-request-card"
      className={cn(
        "w-full max-w-full rounded-[24px] border border-white/80 bg-white p-5 text-text-primary shadow-large sm:max-w-[480px]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.04em] text-text-primary">
            Opportunity brief
          </p>
          <p className="mt-0.5 text-xs font-medium text-text-muted">
            Client lane
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-text-muted">
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <section className="relative mt-6">
        {editable ? <EditableChip field="outcome" onEditField={onEditField} /> : null}
        <h3 className="pr-16 text-[24px] leading-[1.18] text-text-primary">
          Hunting: {renderItalicOnce(card.jtbd)}
        </h3>
      </section>

      <section className="relative mt-5 rounded-lg bg-surface-raised px-3 py-3">
        {editable ? <EditableChip field="reference" onEditField={onEditField} /> : null}
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          Last time this looked like
        </p>
        <p className="mt-2 pr-16 text-sm italic leading-snug text-text-primary">
          {card.referenceShape}
        </p>
      </section>

      {operator ? (
        <section className="relative mt-4 rounded-lg bg-white px-3 py-2.5 shadow-subtle">
          {editable ? <EditableChip field="bad fit" onEditField={onEditField} /> : null}
          <p className="pr-16 text-sm leading-snug text-text-secondary">
            Allergic to:{" "}
            <span className="font-medium text-text-primary">{card.antiPersonaMd}</span>
          </p>
        </section>
      ) : null}

      <section className="relative mt-5">
        {editable ? <EditableChip field="success criteria" onEditField={onEditField} /> : null}
        <div className="flex flex-wrap gap-2 pr-16">
          {chips.map((chip, index) => (
            <span
              key={`${chip}-${index}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-text-secondary"
            >
              <span aria-hidden="true">▶</span>
              <span className="truncate">{chip}</span>
            </span>
          ))}
        </div>
      </section>

      {operator ? (
        <section className="relative mt-5 rounded-lg border border-dashed border-border bg-white px-3 py-3">
          {editable ? <EditableChip field="budget" onEditField={onEditField} /> : null}
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            <span aria-hidden="true">⌧</span>
            <span>Internal</span>
            <TooltipButton
              label="Visible only to you — candidates see ballpark match: yes/no."
              className="h-5 w-5 text-text-muted"
            >
              <LockKeyhole className="h-3 w-3" aria-hidden="true" />
            </TooltipButton>
          </div>
          <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-surface-raised px-3 py-2 text-sm font-semibold text-text-primary">
            <LockKeyhole className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              Budget: {card.budgetShape.ballpark} · {card.budgetShape.cadence}
            </span>
          </div>
          {inspectorSlot}
        </section>
      ) : null}

      {operator ? (
        <section className="relative mt-5">
          {editable ? <EditableChip field="scout preference" onEditField={onEditField} /> : null}
          <ScoutToggle enabled={card.scoutOptIn} />
        </section>
      ) : null}

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-xs font-medium text-text-muted">
          Curated by <span className="font-instrument-serif italic">{greeter}</span> · {updatedLabel(card.lastUpdatedAt)}
        </p>
      </div>
    </article>
  );
}

export function JobRequestCardRenderer({
  card,
  audience = "operator",
  className,
  editable = false,
  onEditField,
}: JobRequestRendererProps) {
  const operatorPreview = (
    <JobRequestCardSurface
      card={card}
      audience="operator"
      className="sm:max-w-full"
    />
  );
  const candidatePreview = (
    <JobRequestCardSurface
      card={card}
      audience="candidate"
      className="sm:max-w-full"
    />
  );

  return (
    <JobRequestCardSurface
      card={card}
      audience={audience}
      className={className}
      editable={editable}
      onEditField={onEditField}
      inspectorSlot={
        audience === "operator" ? (
          <JobRequestCardInspectorModal
            operatorPreview={operatorPreview}
            candidatePreview={candidatePreview}
          />
        ) : null
      }
    />
  );
}
