"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveRequestDraft } from "./request-review";

const SCAN_STEPS = [
  "Reading the brief…",
  "Scanning Ditto members…",
  "Widening to warm-graph signals…",
  "Cross-checking public web…",
  "Lining up candidates…",
];

interface FilledChip {
  label: string;
  value: string;
}

function buildFilledChips(draft: ActiveRequestDraft): FilledChip[] {
  const entries: FilledChip[] = [
    { label: "Outcome", value: draft.outcomeNeeded.trim() },
    { label: "Ideal", value: draft.idealPerson.trim() },
    { label: "Proof", value: draft.proofRequired.trim() },
    { label: "Geo", value: draft.geography.trim() },
    { label: "Shape", value: draft.commercialShape.trim() },
  ];
  return entries.filter((entry) => entry.value.length > 0);
}

export function RequestFirstLook({
  draft,
  ready = false,
  className,
}: {
  draft: ActiveRequestDraft;
  ready?: boolean;
  className?: string;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const lastSignatureRef = useRef<string>("");

  const signature = useMemo(
    () =>
      [
        draft.outcomeNeeded,
        draft.idealPerson,
        draft.proofRequired,
        draft.geography,
        draft.commercialShape,
      ]
        .map((value) => value.trim())
        .join("|"),
    [draft.outcomeNeeded, draft.idealPerson, draft.proofRequired, draft.geography, draft.commercialShape],
  );

  useEffect(() => {
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    setStepIndex(0);
  }, [signature]);

  useEffect(() => {
    if (stepIndex >= SCAN_STEPS.length - 1) return;
    const timer = window.setTimeout(() => {
      setStepIndex((current) => Math.min(current + 1, SCAN_STEPS.length - 1));
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [stepIndex]);

  const chips = buildFilledChips(draft);
  const scanLine = SCAN_STEPS[stepIndex];

  return (
    <section
      aria-label="Live scanning status"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-background px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised text-text-primary">
          {ready ? (
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            {ready ? "Brief locked" : "Mira is scanning"}
          </p>
          <p className="flex items-center gap-1.5 text-[13px] font-medium leading-tight text-text-primary">
            {!ready ? (
              <Loader2 className="h-3 w-3 animate-spin text-text-muted" aria-hidden="true" />
            ) : null}
            <span>{ready ? "Real candidates with sources arrive after you publish." : scanLine}</span>
          </p>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-text-secondary"
              title={chip.value}
            >
              <span className="font-semibold uppercase tracking-[0.06em] text-text-muted">
                {chip.label}
              </span>
              <span className="max-w-[140px] truncate text-text-primary">{chip.value}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="flex-1 text-right text-[12px] leading-4 text-text-muted">
          The brief fills as you answer Mira. You approve every outreach.
        </p>
      )}
    </section>
  );
}
