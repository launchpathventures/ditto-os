"use client";

/**
 * Brief 228 — RetrofitPlanBlock renderer.
 *
 * Renders the retrofit plan + outcome surface inline in the chat-col on
 * `/projects/:slug/onboarding`. Brief 228 ships 5 surfaceable status states
 * (`pending-sample-review` / `dispatched` / `committed` / `rejected` /
 * `failed`) + a supervised-tier MVP placeholder (`pending-review`); Brief 229
 * extends with the per-file approval surface (`pending-review` filled in
 * + `partially-approved`).
 *
 * Composition per Brief 228 §Constraints "Renderer composition":
 * - block.plan        — file list as a step list (icon + path + bytes/action).
 * - block.evidence    — runner kind / trust tier / commit SHA / status pill.
 * - block.decision    — spot_checked sample yes/no surface (deferred to
 *                        /review/[token]; renderer just shows the sample list).
 *
 * Reference-doc drift to flag: the design-package's component CSS layer
 * (`block.plan`, `block.evidence`, `block.decision`, `recbadge`, `.dopt.rec`)
 * is not yet present in `packages/web/app/globals.css`. Tokens
 * (`--color-vivid`, `--color-positive`, `--color-caution`, `--color-negative`,
 * `--color-info`) ARE present. This renderer uses Tailwind utilities mapped
 * to those tokens for now; an Architect/Designer pass can promote to the
 * bundled component classes when the CSS layer is imported (Brief 230).
 */

import { CheckCircle2, AlertTriangle, XCircle, ExternalLink, Info, Plus, RefreshCw, Edit3, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { RetrofitPlanBlock, RetrofitPlanStatus } from "@/lib/engine";

interface Props {
  block: RetrofitPlanBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

/** Status pill: maps each status to a colour token + label + icon. */
function StatusPill({ status }: { status: RetrofitPlanStatus }) {
  const map: Record<
    RetrofitPlanStatus,
    { label: string; tone: "info" | "positive" | "caution" | "negative" }
  > = {
    "pending-review": { label: "Per-file review pending", tone: "caution" },
    "pending-sample-review": { label: "Sample review pending", tone: "caution" },
    "partially-approved": { label: "Partially approved", tone: "info" },
    dispatched: { label: "Dispatching", tone: "info" },
    committed: { label: "Committed", tone: "positive" },
    rejected: { label: "Rejected", tone: "negative" },
    failed: { label: "Failed", tone: "negative" },
  };
  const { label, tone } = map[status];
  const toneClasses = {
    info: "bg-info/10 text-info",
    positive: "bg-positive/10 text-positive",
    caution: "bg-caution/10 text-caution",
    negative: "bg-negative/10 text-negative",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {label}
    </span>
  );
}

/** File row: action-icon + path + bytes/action descriptor. */
function FileRow({
  file,
}: {
  file: RetrofitPlanBlock["files"][number];
}) {
  const iconMap = {
    create: <Plus className="h-3.5 w-3.5 text-positive" aria-label="create" />,
    update: <Edit3 className="h-3.5 w-3.5 text-info" aria-label="update" />,
    unchanged: <CheckCircle2 className="h-3.5 w-3.5 text-text-muted" aria-label="unchanged" />,
  } as const;
  const actionDescriptor = {
    create: "create",
    update: "update",
    unchanged: "unchanged",
  } as const;
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <span className="mt-0.5 flex-shrink-0">{iconMap[file.action]}</span>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xs text-text-primary truncate">
          {file.path}
        </div>
        <div className="text-xs text-text-muted">
          {file.byteSize.toLocaleString()} B · {actionDescriptor[file.action]}
        </div>
      </div>
    </div>
  );
}

/** Evidence card: kv-pair row format mirroring block.evidence semantics. */
function EvidenceLine({ k, v }: { k: string; v: string | React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-text-muted">{k}</span>
      <span className="font-medium text-text-primary truncate">{v}</span>
    </div>
  );
}

export function RetrofitPlanBlockComponent({ block, onAction }: Props) {
  const fileCounts = block.files.reduce(
    (acc, f) => {
      acc[f.action] = (acc[f.action] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Files to display: by default show all; for spot_checked sample-pause
  // status, callout the sampled subset prominently.
  const sampledIds = new Set(block.sampledFileIds ?? []);
  const visibleFiles =
    block.status === "pending-sample-review" && sampledIds.size > 0
      ? block.files.filter((f) => sampledIds.has(f.id))
      : block.files;

  return (
    <div className="rounded-lg border border-border bg-surface-raised">
      {/* block-head: title + status pill */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-vivid-deep" />
          <span className="font-medium text-text-primary">Retrofit plan</span>
        </div>
        <StatusPill status={block.status} />
      </div>

      {/* bbody: evidence card + file list */}
      <div className="px-4 py-3">
        {/* Evidence (block.evidence): runner / tier / commit / file summary */}
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <EvidenceLine k="Runner" v={block.runnerKind} />
          <EvidenceLine k="Trust tier" v={block.trustTier} />
          <EvidenceLine
            k="Files"
            v={Object.entries(fileCounts)
              .map(([k, v]) => `${v} ${k}`)
              .join(" · ") || "(none)"}
          />
          {block.commitSha && (
            <EvidenceLine
              k="Commit"
              v={
                <span className="font-mono text-xs">
                  {block.commitSha.slice(0, 12)}
                </span>
              }
            />
          )}
          {block.skippedUserTouchedFiles && block.skippedUserTouchedFiles.length > 0 && (
            <EvidenceLine
              k="Skipped (user-edited)"
              v={`${block.skippedUserTouchedFiles.length} file(s)`}
            />
          )}
        </div>

        {/* Status-specific surfaces */}
        {block.status === "pending-sample-review" && (
          <div className="mt-3 rounded-md border border-caution/30 bg-caution/5 px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-caution" />
              <div>
                <div className="font-medium text-text-primary">
                  Sample review needed
                </div>
                <div className="text-xs text-text-secondary">
                  Approve this sample (
                  {block.sampledFileIds?.length ?? 0} of{" "}
                  {block.files.filter((f) => f.action !== "unchanged").length}{" "}
                  files) at the review surface; on approval, Ditto will write
                  the rest.
                </div>
              </div>
            </div>
          </div>
        )}

        {block.status === "pending-review" && (
          <div className="mt-3 rounded-md border border-caution/30 bg-caution/5 px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-caution" />
              <div className="flex-1">
                <div className="font-medium text-text-primary">
                  Per-file review pending
                </div>
                <div className="text-xs text-text-secondary">
                  Supervised-tier projects need per-file approval before Ditto
                  writes <code>.ditto/</code>. The approval surface lands in
                  Brief 229. For now, escalate to autonomous tier or hand-author
                  the substrate yourself.
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  onAction?.("escalate-to-autonomous", {
                    projectId: block.projectId,
                    processRunId: block.processRunId,
                  })
                }
              >
                Escalate to autonomous
              </Button>
            </div>
          </div>
        )}

        {block.status === "rejected" && (
          <div className="mt-3 rounded-md border border-negative/30 bg-negative/5 px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-negative" />
              <div className="flex-1">
                <div className="font-medium text-text-primary">
                  Critical-tier projects must hand-author <code>.ditto/</code>
                </div>
                <div className="text-xs text-text-secondary">
                  {block.failureReason ??
                    "Ditto won't auto-write the substrate for critical-tier projects."}
                </div>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={() => onAction?.("read-adr-043", {})}
                >
                  Read about hand-authoring .ditto/
                </Button>
              </div>
            </div>
          </div>
        )}

        {block.status === "failed" && (
          <div className="mt-3 rounded-md border border-negative/30 bg-negative/5 px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-negative" />
              <div className="flex-1">
                <div className="font-medium text-text-primary">Dispatch failed</div>
                <div className="text-xs text-text-secondary">
                  {block.failureReason ?? "Dispatch did not succeed."}
                </div>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onAction?.("rerun-retrofit", { projectId: block.projectId })
                  }
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Re-run retrofit
                </Button>
              </div>
            </div>
          </div>
        )}

        {block.status === "dispatched" && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-sm">
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-info" />
            <div className="text-text-primary">
              Runner is executing — this typically takes 10–120 seconds.
            </div>
          </div>
        )}

        {block.status === "committed" &&
          (block.commitSha ? (
            <div className="mt-3 rounded-md border border-positive/30 bg-positive/5 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-positive" />
                  <div className="text-text-primary">
                    Substrate committed.
                  </div>
                </div>
                {block.commitUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onAction?.("view-commit", { commitUrl: block.commitUrl })
                    }
                  >
                    <ExternalLink className="mr-1 h-3 w-3" />
                    View diff in repo
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-sm">
              <Info className="h-4 w-4 flex-shrink-0 text-info" />
              <div className="text-text-primary">
                No changes to retrofit — re-run found everything up-to-date.
              </div>
            </div>
          ))}

        {/* File list (block.plan) */}
        {visibleFiles.length > 0 && (
          <div className="mt-3 rounded-md border border-border bg-surface px-3 py-2">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
              {block.status === "pending-sample-review"
                ? "Sampled files"
                : "Files"}
            </div>
            <div className="divide-y divide-border">
              {visibleFiles.map((f) => (
                <FileRow key={f.id} file={f} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
