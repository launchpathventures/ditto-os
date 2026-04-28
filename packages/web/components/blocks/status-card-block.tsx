"use client";

/**
 * StatusCardBlock renderer — Brief 221 §D6.
 *
 * Discriminator-keyed dispatch table keyed on `metadata.cardKind`. Each
 * subtype registers a single line in `SUBTYPE_RENDERERS`; missing or
 * unknown discriminator falls through to the generic template. Future
 * subtypes (Brief 220 deploy-status, Brief 229 file-write supervised, etc.)
 * register the same way — single-line per subtype, no cascading-if.
 *
 * The runner-dispatch subtype's full visual leaf (`<DispatchCard>` with
 * the runner pill + outcome trail + retry button) is Brief 231's scope;
 * here we ship a compact runner template that renders the kind label +
 * mode chip + status + external-link affordance directly from
 * `metadata.runnerKind` / `metadata.runnerMode` / `metadata.externalUrl`.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StatusCardBlock } from "@/lib/engine";

const STATUS_BADGE_VARIANT: Record<string, string> = {
  running: "bg-positive/10 text-positive",
  complete: "bg-positive/10 text-positive",
  succeeded: "bg-positive/10 text-positive",
  paused: "bg-caution/10 text-caution",
  queued: "bg-caution/10 text-caution",
  dispatched: "bg-info/10 text-info",
  failed: "bg-negative/10 text-negative",
  rate_limited: "bg-negative/10 text-negative",
  timed_out: "bg-negative/10 text-negative",
  cancelled: "bg-surface-secondary text-text-secondary",
  revoked: "bg-negative/10 text-negative",
  draft: "bg-surface-secondary text-text-secondary",
};

const STATUS_BORDER_COLOR: Record<string, string> = {
  running: "border-l-positive",
  complete: "border-l-positive",
  succeeded: "border-l-positive",
  paused: "border-l-caution",
  queued: "border-l-caution",
  dispatched: "border-l-info",
  failed: "border-l-negative",
  rate_limited: "border-l-negative",
  timed_out: "border-l-negative",
  cancelled: "border-l-border-strong",
  revoked: "border-l-negative",
  draft: "border-l-border-strong",
};

function getBadgeVariant(status: string): string {
  return STATUS_BADGE_VARIANT[status.toLowerCase()] ?? "bg-info/10 text-info";
}

function getBorderColor(status: string): string {
  return STATUS_BORDER_COLOR[status.toLowerCase()] ?? "border-l-info";
}

// ============================================================
// Subtype-renderer dispatch table (Brief 221 D6)
// ============================================================

type RendererFn = (block: StatusCardBlock) => ReactNode;

/**
 * Subtype renderers keyed on `metadata.cardKind`. Adding a future subtype
 * (Brief 220, Brief 229, etc.) is a single-line registration here. The
 * generic renderer is the fallback when `cardKind` is missing or unknown.
 */
const SUBTYPE_RENDERERS: Record<string, RendererFn> = {
  runnerDispatch: renderRunnerDispatch,
};

export function StatusCardBlockComponent({
  block,
}: {
  block: StatusCardBlock;
}) {
  const cardKind = (
    block.metadata as { cardKind?: string } | undefined
  )?.cardKind;
  const Renderer =
    cardKind && SUBTYPE_RENDERERS[cardKind]
      ? SUBTYPE_RENDERERS[cardKind]
      : renderGeneric;
  return <>{Renderer(block)}</>;
}

// ============================================================
// Generic template — used when no subtype discriminator is present
// ============================================================

function renderGeneric(block: StatusCardBlock): ReactNode {
  return (
    <div
      className={cn(
        "my-2 border-l-2 pl-3 py-3",
        getBorderColor(block.status),
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text-primary">
          {block.title}
        </span>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full ml-auto",
            getBadgeVariant(block.status),
          )}
        >
          {block.status}
        </span>
      </div>
      <div className="text-xs text-text-muted mt-0.5">{block.entityType}</div>
      {Object.keys(block.details).length > 0 && (
        <div className="mt-2 space-y-0.5">
          {Object.entries(block.details).map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-text-secondary">{key}</span>
              <span className="text-text-primary font-medium">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Runner-dispatch subtype renderer (Brief 221 — minimal; Brief 231
// extends with the full <DispatchCard> + retry button)
// ============================================================

const KIND_LABELS: Record<string, string> = {
  "local-mac-mini": "Mac mini",
  "claude-code-routine": "Routine",
  "claude-managed-agent": "Managed Agent",
  "github-action": "GitHub Action",
  "e2b-sandbox": "E2B Sandbox",
};

function renderRunnerDispatch(block: StatusCardBlock): ReactNode {
  const meta = block.metadata as
    | {
        runnerKind?: string;
        runnerMode?: "local" | "cloud";
        status?: string;
        externalUrl?: string;
        prUrl?: string;
        previewUrl?: string;
        errorReason?: string;
      }
    | undefined;
  const kindLabel = meta?.runnerKind
    ? (KIND_LABELS[meta.runnerKind] ?? meta.runnerKind)
    : "Runner";
  const modeLabel = meta?.runnerMode === "cloud" ? "Cloud" : "Local";
  const status = meta?.status ?? block.status;

  return (
    <div
      className={cn(
        "my-2 border-l-2 pl-3 py-3",
        getBorderColor(status),
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text-primary">
          {block.title}
        </span>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full ml-auto",
            getBadgeVariant(status),
          )}
        >
          {status}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
        <span className="font-medium text-text-primary">{kindLabel}</span>
        <span aria-hidden>·</span>
        <span>{modeLabel}</span>
      </div>
      {(meta?.externalUrl || meta?.prUrl || meta?.previewUrl) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {meta.prUrl && (
            <a
              href={meta.prUrl}
              className="text-info hover:underline"
              data-testid="runner-card-pr-link"
            >
              ↗ Open PR
            </a>
          )}
          {meta.previewUrl && (
            <a
              href={meta.previewUrl}
              className="text-info hover:underline"
              data-testid="runner-card-preview-link"
            >
              ↗ Preview
            </a>
          )}
          {meta.externalUrl && (
            <a
              href={meta.externalUrl}
              className="text-info hover:underline"
              data-testid="runner-card-external-link"
            >
              ↗ Watch live
            </a>
          )}
        </div>
      )}
      {meta?.errorReason && (
        <div className="mt-2 text-xs text-negative">{meta.errorReason}</div>
      )}
    </div>
  );
}
