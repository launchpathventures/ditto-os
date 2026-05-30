"use client";

/**
 * Possible Connection card (Brief 274)
 *
 * Renders ONE reasoned Possible Connection — a superconnector's "here's
 * why this person might be worth considering," never a marketplace
 * candidate row. Always shows the why, evidence with provenance, visible
 * risks/gaps, honest confidence, and a clear next action. Manual Search
 * never contacts anyone; "ask if open" degrades to "save proposal" until
 * the consent foundation exists.
 */

import { AlertTriangle, ExternalLink, ShieldAlert } from "lucide-react";
import type {
  PersistedPossibleConnection,
  PossibleConnectionNextAction,
} from "@/lib/engine";
import { cn } from "@/lib/utils";

export type PossibleConnectionFeedbackKind =
  | "refine"
  | "not-a-fit"
  | "save"
  | "intro-request"
  | "hide"
  | "watch"
  | "invitation-candidate";

const CONFIDENCE_TONE: Record<string, string> = {
  high: "border-[#bfe3c8] bg-[#eef8f0] text-[#1f6b34]",
  medium: "border-[#f1e3b8] bg-[#fdf7e6] text-[#77510b]",
  low: "border-border bg-surface-raised text-text-secondary",
};

function firstInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function actionLabel(kind: PossibleConnectionFeedbackKind): string {
  switch (kind) {
    case "save":
      return "Save to request";
    case "watch":
      return "Keep watching";
    case "not-a-fit":
      return "Not a fit";
    case "refine":
      return "Refine";
    case "intro-request":
      return "Save proposal";
    case "invitation-candidate":
      return "Flag to invite later";
    case "hide":
      return "Hide";
  }
}

/**
 * The recommended next action maps to the consent-safe button set. "ask
 * if open" is never a direct-contact button — when intro is eligible it
 * is still a save-proposal handoff (Brief 276 owns facilitation).
 */
function actionsFor(
  connection: PersistedPossibleConnection,
): PossibleConnectionFeedbackKind[] {
  const actions: PossibleConnectionFeedbackKind[] = [];
  const next: PossibleConnectionNextAction = connection.nextAction;
  if (next === "not-a-fit" || !connection.recommended) {
    actions.push("not-a-fit");
  }
  actions.push("save");
  if (next !== "watch") actions.push("watch");
  if (!connection.isDittoMember) actions.push("invitation-candidate");
  if (next !== "not-a-fit") actions.push("not-a-fit");
  actions.push("refine");
  // Dedupe while preserving order.
  return actions.filter((kind, index) => actions.indexOf(kind) === index);
}

export function PossibleConnectionCard({
  connection,
  onAction,
  busyKind,
  className,
}: {
  connection: PersistedPossibleConnection;
  onAction?: (
    kind: PossibleConnectionFeedbackKind,
    connection: PersistedPossibleConnection,
  ) => void;
  busyKind?: PossibleConnectionFeedbackKind | null;
  className?: string;
}) {
  const confidenceTone =
    CONFIDENCE_TONE[connection.confidence] ?? CONFIDENCE_TONE.low;
  const sourceLabel = connection.isDittoMember
    ? "Ditto member"
    : "Publicly sourced";

  return (
    <article
      aria-label={`Possible connection: ${connection.displayName}, ${connection.headline}, confidence ${connection.confidence}`}
      data-testid="possible-connection-card"
      className={cn(
        "rounded-2xl border border-border bg-white p-4 shadow-subtle",
        !connection.recommended ? "opacity-90" : "",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-semibold text-text-primary">
            {firstInitial(connection.displayName)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold leading-5 text-text-primary">
              {connection.displayName}
            </h3>
            <p className="truncate text-xs leading-4 text-text-secondary">
              {connection.headline}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.08em] text-text-muted">
              {sourceLabel}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold leading-none",
            confidenceTone,
          )}
        >
          {connection.confidence} confidence
        </span>
      </div>

      <p className="mt-3 text-[13px] leading-5 text-text-primary">
        <span className="font-semibold">Why this fits: </span>
        {connection.whyThisFits}
      </p>
      {connection.whyNow ? (
        <p className="mt-1 text-[13px] leading-5 text-text-secondary">
          {connection.whyNow}
        </p>
      ) : null}

      {connection.evidence.length > 0 ? (
        <ul className="mt-3 space-y-2" aria-label="Evidence">
          {connection.evidence.map((item, index) => (
            <li
              key={`${connection.id}-evidence-${index}`}
              className="rounded-xl bg-surface-raised px-3 py-2 text-xs leading-5 text-text-secondary"
            >
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 font-semibold text-text-primary underline-offset-4 hover:underline"
                >
                  <span className="truncate">{item.sourceLabel}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span className="font-semibold text-text-primary">
                  {item.sourceLabel}
                  {item.claimId ? (
                    <span className="ml-1 font-normal text-text-muted">
                      · {item.claimId}
                    </span>
                  ) : null}
                </span>
              )}
              {item.snippet ? (
                <p className="mt-1 line-clamp-3">{item.snippet}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-surface-raised px-3 py-2 text-xs leading-5 text-text-secondary">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          No public proof yet — ask me to dig deeper before you act.
        </p>
      )}

      {connection.risks.length > 0 ? (
        <ul className="mt-3 space-y-1" aria-label="Risks and gaps">
          {connection.risks.map((risk, index) => (
            <li
              key={`${connection.id}-risk-${index}`}
              className="flex items-start gap-1.5 text-xs leading-5 text-text-secondary"
            >
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#a06a12]"
                aria-hidden="true"
              />
              {risk}
            </li>
          ))}
        </ul>
      ) : null}

      {connection.notRecommendedReason ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-[#f0d4d4] bg-[#fdf1f1] px-3 py-2 text-xs leading-5 text-[#8a3030]">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {connection.notRecommendedReason}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        {actionsFor(connection).map((kind) => {
          const primary = kind === "save";
          const busy = busyKind === kind;
          return (
            <button
              key={kind}
              type="button"
              disabled={busy}
              onClick={() => onAction?.(kind, connection)}
              className={cn(
                "inline-flex min-h-10 items-center justify-center rounded-md px-3 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60",
                primary
                  ? "bg-accent text-accent-foreground hover:opacity-90"
                  : "border border-border bg-white text-text-primary hover:bg-surface-raised",
              )}
            >
              {actionLabel(kind)}
            </button>
          );
        })}
      </div>
    </article>
  );
}
