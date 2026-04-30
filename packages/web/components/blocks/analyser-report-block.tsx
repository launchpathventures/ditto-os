"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type {
  AnalyserReportBlock,
  Finding,
  GoldStandardMatch,
  RunnerRecommendation,
  TrustTierRecommendation,
} from "@/lib/engine";

interface Props {
  block: AnalyserReportBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function AnalyserReportBlockComponent({ block, onAction }: Props) {
  const [runnerKind, setRunnerKind] = useState<string>(block.recommendation.runner.kind);
  const [trustTier, setTrustTier] = useState<string>(block.recommendation.trustTier.tier);
  const [submitting, setSubmitting] = useState(false);

  // Reset the in-flight flag when the parent re-emits the block in a
  // terminal state ('active' = confirm landed, server flipped status). Mirror
  // of connection-setup-block.tsx:82-89 — prevents the CTA from being stuck
  // "Starting..." forever after a transient submit failure or no-op response.
  useEffect(() => {
    if (block.status === "active") {
      setSubmitting(false);
    }
  }, [block.status]);

  const onConfirm = () => {
    setSubmitting(true);
    try {
      onAction?.("analyser-confirm", {
        projectId: block.projectId,
        workItemId: block.entityId,
        runnerKind,
        trustTier,
      });
    } finally {
      // Reset on the next tick so the parent has a chance to re-render with
      // an updated block.status; if onAction is fire-and-forget the user can
      // retry once the click handler returns.
      setTimeout(() => setSubmitting(false), 2000);
    }
  };

  const onEdit = () => {
    onAction?.("analyser-edit", {
      projectId: block.projectId,
      workItemId: block.entityId,
    });
  };

  const onCancel = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Cancel onboarding? The repo wasn't modified — you can re-onboard later.",
      )
    ) {
      return;
    }
    onAction?.("analyser-cancel", {
      projectId: block.projectId,
      workItemId: block.entityId,
    });
  };

  return (
    <article
      className="my-4 rounded-xl border border-border bg-surface-primary shadow-sm overflow-hidden"
      data-block-type="analyser_report"
    >
      <AtAGlanceCard atAGlance={block.atAGlance} />

      {block.detectorErrors && block.detectorErrors.length > 0 && (
        <DetectorErrorsAlert errors={block.detectorErrors} />
      )}

      <FindingsSection
        title="Strengths"
        items={block.strengths}
        kind="positive"
      />
      <FindingsSection
        title="Watch-outs"
        items={block.watchOuts}
        kind="caution"
      />
      <FindingsSection
        title="Missing"
        items={block.missing}
        kind="negative"
      />

      <RunnerPicker
        recommendation={block.recommendation.runner}
        selected={runnerKind}
        onSelect={setRunnerKind}
      />
      <TrustTierPicker
        recommendation={block.recommendation.trustTier}
        selected={trustTier}
        onSelect={setTrustTier}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-secondary/40 px-4 py-3">
        <Button onClick={onConfirm} disabled={submitting} size="sm">
          {submitting ? "Starting…" : "Looks good — start the project"}
        </Button>
        <Button onClick={onEdit} variant="secondary" size="sm">
          Edit before starting
        </Button>
        <Button onClick={onCancel} variant="ghost" size="sm">
          Don&apos;t onboard
        </Button>
      </div>
    </article>
  );
}

// ============================================================
// Sub-components
// ============================================================

function AtAGlanceCard({
  atAGlance,
}: {
  atAGlance: AnalyserReportBlock["atAGlance"];
}) {
  return (
    <header className="px-4 py-4 bg-surface-secondary/50 border-b border-border">
      {atAGlance.stack.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {atAGlance.stack.map((s) => (
            <span
              key={s}
              className="rounded-md bg-surface-primary border border-border px-1.5 py-0.5 text-xs text-text-secondary"
            >
              {s}
            </span>
          ))}
        </div>
      )}
      {atAGlance.metadata.length > 0 && (
        <p className="mt-2 text-xs text-text-muted font-mono">
          {atAGlance.metadata.join(" · ")}
        </p>
      )}
      {atAGlance.looksLike && (
        <p className="mt-2 text-sm italic text-vivid-deep">
          Looks like:{" "}
          <span className="not-italic text-text-primary">
            {atAGlance.looksLike}
          </span>
        </p>
      )}
      {atAGlance.nearestNeighbours.length > 0 && (
        <NearestNeighboursList items={atAGlance.nearestNeighbours} />
      )}
    </header>
  );
}

function NearestNeighboursList({ items }: { items: GoldStandardMatch[] }) {
  return (
    <div className="mt-2 text-xs text-text-secondary">
      <span className="text-text-muted">Closest matches:</span>{" "}
      <ul className="inline-flex flex-wrap gap-x-3">
        {items.map((m) => (
          <li key={m.url}>
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-vivid hover:underline"
              title={m.rationale}
            >
              {m.name}
              <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetectorErrorsAlert({
  errors,
}: {
  errors: NonNullable<AnalyserReportBlock["detectorErrors"]>;
}) {
  return (
    <div
      className="border-b border-info/20 bg-info/5 px-4 py-2 text-xs text-info-deep flex items-start gap-2"
      data-test="analyser-detector-errors"
    >
      <Info
        size={14}
        aria-hidden="true"
        className="mt-0.5 flex-shrink-0 text-info"
      />
      <p>
        Some detectors hit issues — report shows what we could read. Failed:{" "}
        <span className="font-mono">
          {errors.map((e) => e.detector).join(", ")}
        </span>
      </p>
    </div>
  );
}

function FindingsSection({
  title,
  items,
  kind,
}: {
  title: string;
  items: Finding[];
  kind: "positive" | "caution" | "negative";
}) {
  if (items.length === 0) return null;
  const toneByKind = {
    positive: "tone-positive",
    caution: "tone-caution",
    negative: "tone-negative",
  } as const;
  const Icon =
    kind === "positive"
      ? CheckCircle2
      : kind === "caution"
        ? AlertTriangle
        : XCircle;
  return (
    <section
      className={cn(
        "block findings border-b border-border px-4 py-3",
        toneByKind[kind],
      )}
    >
      <h3 className="finding-title">{title}</h3>
      <ul className="finding-list">
        {items.map((f, i) => (
          <li
            key={`${title}-${i}-${f.text.slice(0, 24)}`}
            className="finding-item"
          >
            <Icon
              size={15}
              aria-hidden="true"
              className="finding-icon"
            />
            <div>
              <span className="text-text-primary">{f.text}</span>
              {f.evidence && (
                <span className="ml-1.5 text-xs text-text-muted">
                  ({f.evidence})
                </span>
              )}
              {f.defaultAction && (
                <p className="text-xs italic text-text-muted">
                  → {f.defaultAction}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RunnerPicker({
  recommendation,
  selected,
  onSelect,
}: {
  recommendation: RunnerRecommendation;
  selected: string;
  onSelect: (kind: string) => void;
}) {
  const options = [
    { kind: recommendation.kind, rationale: recommendation.rationale, recommended: true },
    ...recommendation.alternatives.map((a) => ({ ...a, recommended: false })),
  ];
  return (
    <section className="border-b border-border px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Runner
      </h3>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt) => (
          <PickerOption
            key={opt.kind}
            label={opt.kind}
            rationale={opt.rationale}
            selected={selected === opt.kind}
            recommended={opt.recommended}
            onSelect={() => onSelect(opt.kind)}
            testId={`runner-${opt.kind}`}
          />
        ))}
      </div>
    </section>
  );
}

function TrustTierPicker({
  recommendation,
  selected,
  onSelect,
}: {
  recommendation: TrustTierRecommendation;
  selected: string;
  onSelect: (tier: string) => void;
}) {
  const options = [
    { tier: recommendation.tier, rationale: recommendation.rationale, recommended: true },
    ...recommendation.alternatives.map((a) => ({ ...a, recommended: false })),
  ];
  return (
    <section className="border-b border-border px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Trust tier
      </h3>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt) => (
          <PickerOption
            key={opt.tier}
            label={opt.tier}
            rationale={opt.rationale}
            selected={selected === opt.tier}
            recommended={opt.recommended}
            onSelect={() => onSelect(opt.tier)}
            testId={`trust-${opt.tier}`}
          />
        ))}
      </div>
    </section>
  );
}

function PickerOption({
  label,
  rationale,
  selected,
  recommended,
  onSelect,
  testId,
}: {
  label: string;
  rationale: string;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-test={testId}
      data-selected={selected ? "true" : undefined}
      data-recommended={recommended ? "true" : undefined}
      className={cn(
        "dopt",
        recommended && "rec",
        selected && !recommended && "border-vivid bg-vivid-subtle",
      )}
    >
      {recommended && <span className="recbadge">Recommended</span>}
      <div className="dh font-mono">{label}</div>
      <div className="dd">{rationale}</div>
    </button>
  );
}
