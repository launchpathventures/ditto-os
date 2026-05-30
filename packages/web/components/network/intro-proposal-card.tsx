/**
 * IntroProposalCard — presentational render of an IntroProposalCardBlock
 * (Brief 288). Used in the chat refinement surface and any in-workspace
 * delivery surface that imports the block locally.
 *
 * Renders: header, state pill, why-this-fits, why-now, evidence list (each
 * citing a network_signal_sources id), risks, what-stays-private, cost
 * label, and a "recipient preview" section showing the exact
 * AuthorizationRequestBlock the recipient will see. Per Brief 288 D2 the
 * state log is composed from RecordBlock rows by the caller — this card
 * renders the proposal, not the timeline.
 *
 * `onAction` is optional. When supplied (the in-workspace inbox delivery
 * surface, AC #18), the card renders the consent affordances and emits
 * `intro-proposal-card:<action>` with `{ introId, consentAction }`. The chat
 * refinement surface uses the card WITHOUT `onAction` because it supplies its
 * own per-party button section — so no buttons render there (no duplication).
 */

import { AlertTriangle, ShieldCheck } from "lucide-react";
import type {
  IntroProposalCardBlock,
  IntroProposalCardState,
} from "@engine/content-blocks";

// AC #18 in-workspace surface emits exactly the terminal consent actions
// (recipient-approved / declined / not-now). Chat-surface affordances
// (edit-draft / open-chat) are not embedded here — they belong to the
// network-side chat refinement surface.
const INBOX_CONSENT_ACTIONS: Record<string, string> = {
  approve: "Approve",
  decline: "Decline",
  "not-now": "Not now",
};

const STATE_TONE: Record<IntroProposalCardState, string> = {
  proposed: "border-[#dbe4f3] bg-[#eef3fb] text-[#1f4380]",
  "requester-approved": "border-[#bfe3c8] bg-[#eef8f0] text-[#1f6b34]",
  "recipient-asked": "border-[#dbe4f3] bg-[#eef3fb] text-[#1f4380]",
  "recipient-approved": "border-[#bfe3c8] bg-[#eef8f0] text-[#1f6b34]",
  "thread-sent": "border-[#bfe3c8] bg-[#eef8f0] text-[#1f6b34]",
  declined: "border-[#f0d4d4] bg-[#fdf1f1] text-[#8a3030]",
  "not-now": "border-border bg-surface-raised text-text-secondary",
  "feedback-collected": "border-[#bfe3c8] bg-[#eef8f0] text-[#1f6b34]",
};

const STATE_LABEL: Record<IntroProposalCardState, string> = {
  proposed: "Proposed",
  "requester-approved": "Requester approved",
  "recipient-asked": "Recipient asked",
  "recipient-approved": "Recipient approved",
  "thread-sent": "Thread sent",
  declined: "Declined",
  "not-now": "Not now",
  "feedback-collected": "Feedback collected",
};

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "High";
  if (confidence >= 0.4) return "Medium";
  return "Low";
}

export function IntroProposalCard({
  block,
  onAction,
}: {
  block: IntroProposalCardBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}) {
  const tone = STATE_TONE[block.state];
  const stateLabel = STATE_LABEL[block.state];
  const isTerminal =
    block.state === "thread-sent" ||
    block.state === "declined" ||
    block.state === "not-now";
  const consentAffordances = onAction
    ? block.affordances.filter((a) => a in INBOX_CONSENT_ACTIONS)
    : [];
  const preview = block.recipientPreview;
  const previewBody = (preview.preview ?? [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n\n");
  const recipientLabel = preview.recipientLabel ?? "the recipient";

  return (
    <article
      data-testid="intro-proposal-card"
      aria-label={`Intro proposal: ${block.header}, ${stateLabel}`}
      className="rounded-2xl border border-border bg-white p-5 shadow-subtle"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">
            Mira proposed
          </p>
          <h2 className="mt-0.5 truncate text-base font-semibold text-text-primary">
            {block.header}
          </h2>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold leading-none ${tone}`}
        >
          {stateLabel}
        </span>
      </div>

      <p className="mt-4 text-[13px] leading-5 text-text-primary">
        <span className="font-semibold">Why this fits: </span>
        {block.whyThisFits}
      </p>
      <p className="mt-1 text-[13px] leading-5 text-text-secondary">
        <span className="font-semibold">Why now: </span>
        {block.whyNow}
      </p>

      {block.evidence.length > 0 ? (
        <ul className="mt-3 space-y-2" aria-label="Evidence">
          {block.evidence.map((item, index) => (
            <li
              key={`${block.introId}-evidence-${index}`}
              className="rounded-xl bg-surface-raised px-3 py-2 text-xs leading-5 text-text-secondary"
            >
              <span className="font-semibold text-text-primary">
                {item.label}
              </span>
              <span className="ml-2 text-text-muted">
                {item.kind} · {item.sourceId}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {block.risks && block.risks.length > 0 ? (
        <ul className="mt-3 space-y-1" aria-label="Risks and gaps">
          {block.risks.map((risk, index) => (
            <li
              key={`${block.introId}-risk-${index}`}
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

      {block.whatStaysPrivate.length > 0 ? (
        <div className="mt-3 rounded-xl border border-[#bfe3c8] bg-[#eef8f0] px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#1f6b34]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            What stays in your workspace
          </p>
          <ul className="mt-1 space-y-0.5 text-xs leading-5 text-[#1f6b34]">
            {block.whatStaysPrivate.map((item, index) => (
              <li key={`${block.introId}-private-${index}`}>· {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3 text-[11px] text-text-muted">
        <span>Confidence: {confidenceLabel(block.confidence)}</span>
        {block.costLabel ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{block.costLabel}</span>
          </>
        ) : null}
      </div>

      <section
        aria-label="Recipient preview"
        className="mt-4 rounded-2xl border border-dashed border-border bg-surface-raised p-4"
      >
        <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">
          Here's what {recipientLabel} will see
        </p>
        <h3 className="mt-1 text-sm font-semibold text-text-primary">
          {preview.header}
        </h3>
        {previewBody ? (
          <p className="mt-2 whitespace-pre-line text-[13px] leading-5 text-text-primary">
            {previewBody}
          </p>
        ) : null}
      </section>

      {onAction && !isTerminal && consentAffordances.length > 0 ? (
        <div
          className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4"
          aria-label="Your decision"
        >
          {consentAffordances.map((affordance) => (
            <button
              key={`${block.introId}-${affordance}`}
              type="button"
              onClick={() =>
                onAction(`intro-proposal-card:${affordance}`, {
                  introId: block.introId,
                  consentAction: affordance,
                })
              }
              className={
                "inline-flex min-h-10 items-center justify-center rounded-md px-3 text-xs font-semibold transition " +
                (affordance === "approve"
                  ? "bg-accent text-accent-foreground hover:opacity-90"
                  : "border border-border bg-white text-text-primary hover:bg-surface-raised")
              }
            >
              {INBOX_CONSENT_ACTIONS[affordance]}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
