"use client";

/**
 * IntroChatClient — interactive wrapper for the intro chat refinement
 * surface (Brief 288 AC #14).
 *
 * Per-party affordances:
 *   - requester: approve / decline / not-now / edit-and-approve
 *   - recipient: approve / decline / not-now
 *
 * Posts to /api/v1/network/intros/[id]/approve with { token, party,
 * action, edit?, declineCategory? }. The server route mints the
 * stepRunId; the client never sends one (rejected by Insight-232 guard).
 *
 * The "Notes for Ditto to consider" textarea (D11) feeds the `edit` field
 * for the requester's edit-and-approve action. Send-time scrub on the
 * server-side will reject drafts that leak private-claim data.
 */

import { useEffect, useState } from "react";
import type {
  IntroProposalCardBlock,
  IntroProposalCardState,
} from "@engine/content-blocks";
import { IntroProposalCard } from "@/components/network/intro-proposal-card";

type Party = "requester" | "recipient";

type RequesterAction = "approve" | "decline" | "not-now" | "edit-and-approve";
type RecipientAction = "approve" | "decline" | "not-now";
type AnyAction = RequesterAction | RecipientAction;
type OutcomeCategory =
  | "outcome:useful"
  | "outcome:not-useful"
  | "outcome:no-outcome-yet";
type FeedbackCategory =
  | OutcomeCategory
  | "decline:not-relevant"
  | "decline:too-junior"
  | "decline:too-senior"
  | "decline:wrong-domain"
  | "decline:too-salesy"
  | "decline:already-know-them"
  | "decline:other"
  | "ambiguous";
type OutcomeClass =
  | "advisory"
  | "hire"
  | "client"
  | "funding"
  | "partnership"
  | "collaboration"
  | "no-outcome";

const REQUESTER_BUTTONS: { action: RequesterAction; label: string; primary?: boolean }[] = [
  { action: "approve", label: "Approve", primary: true },
  { action: "edit-and-approve", label: "Edit & approve" },
  { action: "not-now", label: "Not now" },
  { action: "decline", label: "Decline" },
];

const RECIPIENT_BUTTONS: { action: RecipientAction; label: string; primary?: boolean }[] = [
  { action: "approve", label: "Approve", primary: true },
  { action: "not-now", label: "Not now" },
  { action: "decline", label: "Decline" },
];

const OUTCOME_BUTTONS: { category: OutcomeCategory; label: string; primary?: boolean }[] = [
  { category: "outcome:useful", label: "Useful", primary: true },
  { category: "outcome:not-useful", label: "Not useful" },
  { category: "outcome:no-outcome-yet", label: "No outcome yet" },
];

const DECLINE_CATEGORIES: { category: FeedbackCategory; label: string }[] = [
  { category: "decline:not-relevant", label: "Not relevant" },
  { category: "decline:too-junior", label: "Too junior" },
  { category: "decline:too-senior", label: "Too senior" },
  { category: "decline:wrong-domain", label: "Wrong domain" },
  { category: "decline:too-salesy", label: "Too salesy" },
  { category: "decline:already-know-them", label: "Already know them" },
  { category: "decline:other", label: "Other" },
];

const OUTCOME_CLASSES: { value: OutcomeClass; label: string }[] = [
  { value: "advisory", label: "Advisory" },
  { value: "hire", label: "Hire" },
  { value: "client", label: "Client" },
  { value: "funding", label: "Funding" },
  { value: "partnership", label: "Partnership" },
  { value: "collaboration", label: "Collaboration" },
  { value: "no-outcome", label: "No outcome" },
];

interface StateLogEntry {
  state: IntroProposalCardState;
  at: string;
  byParty: Party | null;
}

export function IntroChatClient({
  introId,
  token,
  party,
  initialAction,
  initialFeedback,
  block,
  stateLog,
  initialState,
  priorFeedback,
}: {
  introId: string;
  token: string;
  party: Party;
  initialAction: AnyAction | null;
  initialFeedback: OutcomeCategory | null;
  block: IntroProposalCardBlock;
  stateLog: StateLogEntry[];
  initialState: IntroProposalCardState;
  priorFeedback: {
    id: string;
    party: Party;
    classifiedCategory: FeedbackCategory;
    outcomeClass: OutcomeClass | null;
    freeText: string | null;
    createdAt: string;
  }[];
}) {
  const [editDraft, setEditDraft] = useState("");
  const [declineCategory, setDeclineCategory] = useState("");
  const [feedbackCategory, setFeedbackCategory] =
    useState<FeedbackCategory>("decline:other");
  const [outcomeClass, setOutcomeClass] = useState<OutcomeClass | "">("");
  const [feedbackText, setFeedbackText] = useState("");
  const [busyAction, setBusyAction] = useState<AnyAction | null>(null);
  const [busyFeedback, setBusyFeedback] = useState<FeedbackCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState<IntroProposalCardState>(initialState);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoFiredOnce, setAutoFiredOnce] = useState(false);

  async function submit(action: AnyAction) {
    setBusyAction(action);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        token,
        party,
        action,
      };
      if (action === "edit-and-approve" && editDraft.trim()) {
        body.edit = editDraft.trim();
      }
      if ((action === "decline" || action === "not-now") && declineCategory.trim()) {
        body.declineCategory = declineCategory.trim();
      }
      const res = await fetch(`/api/v1/network/intros/${introId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as {
        success?: boolean;
        state?: IntroProposalCardState | null;
        blockedReason?: string | null;
        error?: string | null;
      };
      if (!res.ok || !payload.success) {
        setError(
          payload.blockedReason ?? payload.error ?? `${action}_failed`,
        );
        return;
      }
      if (payload.state) setCurrentState(payload.state);
      setSuccess(`Recorded: ${action}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "request_failed");
    } finally {
      setBusyAction(null);
    }
  }

  async function submitFeedback(category: FeedbackCategory) {
    setBusyFeedback(category);
    setError(null);
    setSuccess(null);
    try {
      const selectedOutcomeClass =
        category === "outcome:useful"
          ? outcomeClass || null
          : category === "outcome:no-outcome-yet"
            ? "no-outcome"
            : null;
      const res = await fetch(`/api/v1/network/intros/${introId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          party,
          eventType: initialFeedback ? "button-click" : "chat-disambiguator-submit",
          classifiedCategory: category,
          outcomeClass: selectedOutcomeClass,
          freeText: feedbackText.trim() || null,
        }),
      });
      const payload = (await res.json()) as {
        success?: boolean;
        state?: IntroProposalCardState | null;
        action?: string;
        error?: string | null;
      };
      if (!res.ok || !payload.success) {
        setError(payload.error ?? payload.action ?? "feedback_failed");
        return;
      }
      if (payload.state) setCurrentState(payload.state);
      setSuccess("Feedback recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "feedback_failed");
    } finally {
      setBusyFeedback(null);
    }
  }

  // One-click ratification: if the email magic-link carried `action=approve`,
  // fire it once on mount. The state-machine guard on the server will reject
  // a stale re-click cleanly with 409 + blockedReason.
  useEffect(() => {
    if (autoFiredOnce) return;
    if (initialAction === "approve" || initialAction === "decline") {
      setAutoFiredOnce(true);
      void submit(initialAction);
    } else if (initialFeedback) {
      setAutoFiredOnce(true);
      void submitFeedback(initialFeedback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buttons = party === "requester" ? REQUESTER_BUTTONS : RECIPIENT_BUTTONS;
  const isTerminal =
    currentState === "thread-sent" ||
    currentState === "declined" ||
    currentState === "not-now" ||
    currentState === "feedback-collected";
  const canRecordOutcome =
    currentState === "thread-sent" || currentState === "feedback-collected";

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950 sm:px-8">
      <section className="mx-auto max-w-3xl space-y-5">
        <div className="border-b border-neutral-200 pb-5">
          <p className="text-sm font-medium text-neutral-500">Ditto Network</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-normal">
            Review this introduction
          </h1>
          <p className="mt-2 text-sm text-neutral-600">
            {party === "requester"
              ? "You're approving on your side. Once the other person also approves, Mira will send the warm intro."
              : "Mira sent this with your context in mind. Approve to receive the warm intro thread."}
          </p>
        </div>

        <IntroProposalCard block={{ ...block, state: currentState }} />

        {stateLog.length > 0 ? (
          <section
            aria-label="State log"
            className="rounded-2xl border border-border bg-white p-4"
          >
            <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">
              History
            </p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-text-secondary">
              {stateLog.map((entry, index) => (
                <li key={`${introId}-log-${index}`}>
                  <span className="font-semibold text-text-primary">
                    {entry.state}
                  </span>
                  {entry.byParty ? ` by ${entry.byParty}` : ""}{" "}
                  <span className="text-text-muted">· {entry.at}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {canRecordOutcome ? (
          <section
            aria-label="Intro outcome"
            className="space-y-4 rounded-2xl border border-border bg-white p-5"
          >
            <div>
              <p className="text-[11px] uppercase tracking-normal text-text-muted">
                Outcome
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal text-text-primary">
                Was this intro useful?
              </h2>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {OUTCOME_BUTTONS.map(({ category, label, primary }) => {
                const busy = busyFeedback === category;
                return (
                  <button
                    key={category}
                    type="button"
                    disabled={busyFeedback !== null}
                    onClick={() => void submitFeedback(category)}
                    className={
                      "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 " +
                      (primary
                        ? "bg-accent text-accent-foreground hover:opacity-90"
                        : "border border-border bg-white text-text-primary hover:bg-surface-raised")
                    }
                  >
                    {busy ? "…" : label}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-text-muted">
                  Outcome class
                </span>
                <select
                  className="mt-2 block w-full rounded-full border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                  value={outcomeClass}
                  onChange={(e) => setOutcomeClass(e.target.value as OutcomeClass | "")}
                >
                  <option value="">Select if known</option>
                  {OUTCOME_CLASSES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-text-muted">
                  What did not fit?
                </span>
                <select
                  className="mt-2 block w-full rounded-full border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                  value={feedbackCategory}
                  onChange={(e) => setFeedbackCategory(e.target.value as FeedbackCategory)}
                >
                  {DECLINE_CATEGORIES.map((item) => (
                    <option key={item.category} value={item.category}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-normal text-text-muted">
                Note
              </span>
              <textarea
                className="mt-2 block w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                rows={3}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
              />
            </label>

            <button
              type="button"
              disabled={busyFeedback !== null}
              onClick={() => void submitFeedback(feedbackCategory)}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary transition hover:bg-surface-raised disabled:cursor-wait disabled:opacity-60"
            >
              {busyFeedback ? "Recording…" : "Record detail"}
            </button>
          </section>
        ) : null}

        {priorFeedback.length > 0 ? (
          <section
            aria-label="Prior feedback"
            className="rounded-2xl border border-border bg-white p-4"
          >
            <p className="text-[11px] uppercase tracking-normal text-text-muted">
              Feedback
            </p>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-text-secondary">
              {priorFeedback.map((feedback) => (
                <li key={feedback.id}>
                  <span className="font-semibold text-text-primary">
                    {feedback.classifiedCategory}
                  </span>
                  {feedback.outcomeClass ? ` · ${feedback.outcomeClass}` : ""}
                  {feedback.freeText ? ` · ${feedback.freeText}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!isTerminal ? (
          <section
            aria-label="Your decision"
            className="space-y-4 rounded-2xl border border-border bg-white p-5"
          >
            {party === "requester" ? (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
                  Notes for Ditto to consider
                </span>
                <textarea
                  className="mt-2 block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                  rows={4}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  placeholder="Optional. Keep it brief; private claims about either party will be scrubbed before send."
                />
              </label>
            ) : null}

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
                If declining or deferring, optional reason
              </span>
              <input
                className="mt-2 block w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
                value={declineCategory}
                onChange={(e) => setDeclineCategory(e.target.value)}
                placeholder="e.g. not-relevant, wrong-time, already-connected"
              />
            </label>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {buttons.map(({ action, label, primary }) => {
                const busy = busyAction === action;
                return (
                  <button
                    key={action}
                    type="button"
                    disabled={busy || busyAction !== null}
                    onClick={() => void submit(action)}
                    className={
                      "inline-flex min-h-10 items-center justify-center rounded-md px-3 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-60 " +
                      (primary
                        ? "bg-accent text-accent-foreground hover:opacity-90"
                        : "border border-border bg-white text-text-primary hover:bg-surface-raised")
                    }
                  >
                    {busy ? "…" : label}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {success ? (
          <p
            role="status"
            className="rounded-xl border border-[#bfe3c8] bg-[#eef8f0] px-3 py-2 text-sm text-[#1f6b34]"
          >
            {success}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-[#f0d4d4] bg-[#fdf1f1] px-3 py-2 text-sm text-[#8a3030]"
          >
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
