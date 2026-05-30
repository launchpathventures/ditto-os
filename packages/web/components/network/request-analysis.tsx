"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveRequestDraft } from "./request-review";

interface RequestAnalysisRow {
  id: string;
  label: string;
  detail: string;
  state: "active" | "done" | "queued";
}

const TRANSITION_STAGE_MS = 6_500;
const FINAL_TRANSITION_STAGE = 6;

function compact(value: string | null | undefined, fallback: string): string {
  const clean = value?.replace(/\s+/g, " ").trim() ?? "";
  return clean || fallback;
}

function normalizeDisplayText(value: string): string {
  return compact(value, "")
    .replace(/\b(?:engieenr|engineerr|enginerr|enginer)\b/gi, "engineer")
    .replace(/\bcrms\b/g, "CRMs")
    .replace(/\bcrm\b/g, "CRM")
    .replace(/\bai\b/g, "AI");
}

function formatMode(mode: ActiveRequestDraft["mode"]): string {
  if (mode === "manual-search") return "search now";
  if (mode === "background-watch") return "keep watch";
  return "search now and keep watch";
}

function formatSources(sources: ActiveRequestDraft["sourcesAllowed"]): string {
  if (sources === "both") return "Ditto members and public web";
  if (sources === "ditto-members") return "Ditto members first";
  return "public web";
}

function formatContactPolicy(policy: ActiveRequestDraft["contactPolicy"]): string {
  if (policy === "never-contact-without-approval") return "no contact without approval";
  if (policy === "ask-before-contact") return "ask before any contact";
  return "ask before any introduction";
}

function sentence(value: string, fallback: string): string {
  const clean = compact(value, fallback);
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function frontendRequestShape(rawNeed: string): { target: string; outcome: string } {
  const clean = normalizeDisplayText(rawNeed);
  const helpMatch = clean.match(
    /\b(?:looking for|need|seeking|find|want)\s+(?:an?\s+|the\s+)?(.+?)\s+(?:to help(?:\s+(?:me|us|my team|our team))?|who can|that can)\s+(.+?)(?:[.;\n]|$)/i,
  );
  if (helpMatch) {
    return {
      target: compact(helpMatch[1], "the right person"),
      outcome: compact(helpMatch[2], clean).replace(
        /^(?:me|us|my team|our team|my agency|our agency|my company|our company|my business|our business)\s+/i,
        "",
      ),
    };
  }
  const directHelpMatch = clean.match(
    /^(.+?)\s+(?:to help(?:\s+(?:me|us|my team|our team))?|who can|that can)\s+(.+?)(?:[.;\n]|$)/i,
  );
  if (directHelpMatch) {
    return {
      target: compact(directHelpMatch[1], "the right person"),
      outcome: compact(directHelpMatch[2], clean).replace(
        /^(?:me|us|my team|our team|my agency|our agency|my company|our company|my business|our business)\s+/i,
        "",
      ),
    };
  }
  return {
    target: "the person who can change the outcome",
    outcome: clean,
  };
}

function firstMissingGap(draft: ActiveRequestDraft): { label: string; detail: string } {
  const missing = draft.missingFields[0];
  if (missing === "outcomeNeeded") {
    return {
      label: "Outcome",
      detail: "What would have changed if this search worked?",
    };
  }
  if (missing === "idealPerson") {
    return {
      label: "Person",
      detail: "What type of person or company should Mira search for?",
    };
  }
  if (missing === "proofRequired") {
    return {
      label: "Proof",
      detail: "What evidence would convince you they can actually do it?",
    };
  }
  if (missing === "commercialShape") {
    return {
      label: "Commercial shape",
      detail: "Is this a hire, contract, paid advisory, partnership, or exploratory build?",
    };
  }
  if (missing === "successOutcome") {
    return {
      label: "Success",
      detail: "What would make the eventual connection worth it?",
    };
  }
  if (missing === "shareableSummary") {
    return {
      label: "Shareable wording",
      detail: "What can Mira safely say to potential matches?",
    };
  }
  return {
    label: "Ready",
    detail: "No required research gaps remain in the brief.",
  };
}

export function buildRequestAnalysisRows({
  rawNeed,
  draft,
}: {
  rawNeed: string;
  draft?: ActiveRequestDraft | null;
}): RequestAnalysisRow[] {
  if (!draft) {
    return [
      {
        id: "capture",
        label: "Capture the ask",
        detail: compact(rawNeed, "Reading your research request."),
        state: "done",
      },
      {
        id: "extract",
        label: "Extract the working brief",
        detail: "Pulling out outcome, ideal person, proof, geography, urgency, and commercial shape.",
        state: "active",
      },
      {
        id: "privacy",
        label: "Split private from shareable",
        detail: "Budget, sensitive filters, and outcome value stay private unless you mark them shareable.",
        state: "queued",
      },
      {
        id: "questions",
        label: "Choose the next question",
        detail: "Mira will ask only for fields the request still needs.",
        state: "queued",
      },
    ];
  }

  const privateSignals = [
    draft.budgetPrivate ? "budget" : "",
    draft.outcomeValueHint ? "outcome value" : "",
    draft.privateNotes ? "private notes" : "",
  ].filter(Boolean);
  const missing = draft.missingFields.length > 0
    ? `${draft.missingFields.length} field${draft.missingFields.length === 1 ? " still needs" : "s still need"} calibration.`
    : "No required gaps left in the brief.";

  return [
    {
      id: "capture",
      label: "Input received",
      detail: compact(draft.rawNeed || rawNeed, "Original request captured."),
      state: "done",
    },
    {
      id: "extract",
      label: "What Mira extracted",
      detail: [
        compact(draft.outcomeNeeded, "Outcome still unclear"),
        compact(draft.idealPerson, "Ideal person still unclear"),
        draft.proofRequired ? `Proof: ${draft.proofRequired}` : "",
      ].filter(Boolean).join(" | "),
      state: "done",
    },
    {
      id: "privacy",
      label: "Privacy split",
      detail: privateSignals.length > 0
        ? `Kept ${privateSignals.join(", ")} out of the shareable summary.`
        : "No private budget or outcome value detected yet.",
      state: "done",
    },
    {
      id: "route",
      label: "Background task plan",
      detail: `Default route: ${formatMode(draft.mode)}. Sources: ${draft.sourcesAllowed}. Contact rule: ${draft.contactPolicy}.`,
      state: draft.missingFields.length > 0 ? "active" : "done",
    },
    {
      id: "questions",
      label: "Next calibration",
      detail: missing,
      state: draft.missingFields.length > 0 ? "active" : "done",
    },
  ];
}

function StateIcon({ state }: { state: RequestAnalysisRow["state"] }) {
  if (state === "done") {
    return <CheckCircle2 className="h-4 w-4 text-positive" aria-hidden="true" />;
  }
  if (state === "active") {
    return <Loader2 className="h-4 w-4 animate-spin text-text-primary" aria-hidden="true" />;
  }
  return <span className="h-2 w-2 rounded-full bg-text-muted/45" aria-hidden="true" />;
}

function transitionShape(rawNeed: string, draft?: ActiveRequestDraft | null): { target: string; outcome: string } {
  const fallback = frontendRequestShape(rawNeed);
  return {
    target: normalizeDisplayText(draft?.idealPerson ?? "") || fallback.target,
    outcome: normalizeDisplayText(draft?.outcomeNeeded ?? "") || fallback.outcome,
  };
}

function transitionWorkingRead({
  rawNeed,
  draft,
}: {
  rawNeed: string;
  draft?: ActiveRequestDraft | null;
}): string {
  if (draft?.shareableSummary) return normalizeDisplayText(draft.shareableSummary);
  const shape = transitionShape(rawNeed, draft);
  return `Looking for ${shape.target} to ${shape.outcome}.`;
}

function transitionSearchAngleDetail({
  rawNeed,
  draft,
}: {
  rawNeed: string;
  draft?: ActiveRequestDraft | null;
}): string {
  const shape = transitionShape(rawNeed, draft);
  const proof = normalizeDisplayText(draft?.proofRequired ?? "");
  const commercialShape = normalizeDisplayText(draft?.commercialShape ?? "");
  const context = [
    shape.target,
    shape.outcome,
    proof ? `proof: ${proof}` : "",
    commercialShape ? `shape: ${commercialShape}` : "",
  ].filter(Boolean);
  return `Expanding the search across ${context.join("; ")}.`;
}

export function RequestAnalysisTransition({
  rawNeed,
  draft,
  className,
}: {
  rawNeed: string;
  draft?: ActiveRequestDraft | null;
  className?: string;
}) {
  const [stage, setStage] = useState(0);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const shape = useMemo(() => transitionShape(rawNeed, draft), [rawNeed, draft]);
  const workingRead = useMemo(() => transitionWorkingRead({ rawNeed, draft }), [rawNeed, draft]);
  const searchAngleDetail = useMemo(() => transitionSearchAngleDetail({ rawNeed, draft }), [rawNeed, draft]);
  const greeterMessages = [
    {
      speaker: "Mira",
      text: "Hi, I'm Mira, Ditto's network research agent. I turn rough requests into a working brief, a search plan, and one approval-safe next question before anyone is contacted.",
    },
    {
      speaker: "Mira",
      text: `I cleaned the working read to: ${workingRead}`,
    },
    {
      speaker: "Mira",
      text: "If this later moves to outreach, I still ask before any contact or introduction. Nobody is contacted during analysis.",
    },
    {
      speaker: "Mira",
      text: "I'm building search angles, evidence checks, and the one question that will improve the search most.",
    },
    {
      speaker: "Mira",
      text: "I'm also checking visible Ditto member cards and source-backed public web results. This is a search preview, not outreach.",
    },
    {
      speaker: "Mira",
      text: "If anything promising appears, I'll show it as a draft match with sources and still keep contact locked.",
    },
    {
      speaker: "Mira",
      text: "Next screen opens on the brief and one useful question, not another long form.",
    },
  ];
  const rows: RequestAnalysisRow[] = [
    {
      id: "capture",
      label: "Understand the ask",
      detail: `Target: ${shape.target}. Outcome: ${shape.outcome}.`,
      state: stage >= 1 ? "done" : "active",
    },
    {
      id: "angles",
      label: "Build search angles",
      detail: searchAngleDetail,
      state: stage >= 2 ? "done" : stage === 1 ? "active" : "queued",
    },
    {
      id: "evidence",
      label: "Create evidence checklist",
      detail: "Looking for shipped systems, relevant domain work, integration depth, and operator references.",
      state: stage >= 3 ? "done" : stage === 2 ? "active" : "queued",
    },
    {
      id: "privacy",
      label: "Set consent and privacy",
      detail: "No outreach, intro, or private context leaves this request without approval.",
      state: stage >= 4 ? "done" : stage === 3 ? "active" : "queued",
    },
    {
      id: "question",
      label: "Pick the first calibration",
      detail: "Choosing the one question that most improves search quality.",
      state: stage >= 4 ? "done" : "queued",
    },
    {
      id: "matches",
      label: "Run initial match pass",
      detail: "Checking visible Ditto member cards and public sources for role, domain, and proof alignment. No outreach is allowed here.",
      state: stage >= 6 ? "done" : stage === 5 ? "active" : "queued",
    },
  ];

  useEffect(() => {
    if (stage >= FINAL_TRANSITION_STAGE) return;
    const timer = window.setTimeout(() => {
      setStage((current) => Math.min(current + 1, FINAL_TRANSITION_STAGE));
    }, TRANSITION_STAGE_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: "smooth",
    });
  }, [stage, shape.target, shape.outcome]);

  return (
    <section
      aria-label="Network request analysis in progress"
      className={cn(
        "mx-auto flex h-full min-h-0 w-full max-w-[1120px] items-center py-4",
        className,
      )}
    >
      <div className="grid h-[min(760px,calc(100dvh-128px))] min-h-0 w-full overflow-hidden rounded-2xl bg-white/95 shadow-large backdrop-blur-md lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex min-h-0 flex-col border-b border-border bg-background p-5 md:p-7 lg:border-b-0 lg:border-r">
          <div className="shrink-0">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              <Sparkles className="h-3.5 w-3.5 text-text-primary" aria-hidden="true" />
              Ditto Network
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight text-text-primary md:text-[42px]">
              Preparing your research brief.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary md:text-base">
              Ditto is analyzing the request now: cleaning up the wording, extracting the job to
              be done, building search angles, checking evidence needs, and separating private
              context from anything match-facing.
            </p>
          </div>

          <div
            ref={messagesViewportRef}
            className="mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scroll-smooth"
            aria-label="Mira analysis narration"
          >
            {greeterMessages.slice(0, Math.min(stage + 1, greeterMessages.length)).map((message) => (
              <div
                key={`${message.speaker}-${message.text}`}
                className="flex animate-in fade-in-0 slide-in-from-bottom-1 gap-3 duration-300"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    "bg-text-primary text-accent-foreground",
                  )}
                  aria-hidden="true"
                >
                  {message.speaker.charAt(0)}
                </span>
                <div className="min-w-0 rounded-2xl border border-border bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                    {message.speaker}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-text-primary">{message.text}</p>
                </div>
              </div>
            ))}

            <div className="flex items-start gap-2 rounded-2xl bg-accent-subtle px-4 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text-primary" aria-hidden="true" />
              <p className="text-xs leading-5 text-text-secondary">
                This is a visible process trace, not hidden reasoning. Private details stay out of
                match-facing copy, and no one is contacted without approval.
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-5 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Background analysis
              </p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Creating the brief from the original request before opening the workspace.
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Search className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-background px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Original request
            </p>
            <p className="mt-1 text-sm leading-6 text-text-primary">{compact(rawNeed, "Reading request.")}</p>
          </div>

          <div className="mt-3 rounded-2xl border border-border bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Cleaned working read
              </p>
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                {draft ? "Enriched" : "Drafting"}
              </span>
            </div>
            <p className="mt-1 text-sm font-semibold leading-6 text-text-primary">{workingRead}</p>
          </div>

          <div className="mt-5 grid gap-3">
            {rows.map((row) => (
              <div key={row.id} className="flex items-start gap-3 rounded-2xl border border-border bg-background p-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised">
                  <StateIcon state={row.state} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight text-text-primary">{row.label}</p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">{row.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function RequestBriefFocus({
  draft,
  onOpenEditor,
  className,
}: {
  draft: ActiveRequestDraft;
  onOpenEditor: () => void;
  className?: string;
}) {
  const proofGap = draft.proofRequired
    ? draft.proofRequired
    : "Evidence is the open question. Mira needs proof they have shipped agentic systems, CRMs, or real estate workflows before making introductions.";
  const gap = firstMissingGap(draft);
  const interpretedShape = frontendRequestShape(draft.rawNeed);
  const initialMatches = draft.jobRequestCard?.suggestedCandidates?.slice(0, 3) ?? [];

  return (
    <section className={cn("rounded-2xl bg-white p-5 shadow-large md:p-7", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Working research brief
          </p>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight text-text-primary md:text-[42px]">
            {sentence(draft.idealPerson, "The right person")} to{" "}
            <span className="font-instrument-serif font-normal">
              {compact(draft.outcomeNeeded, draft.rawNeed).toLowerCase()}
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary md:text-base">
            Mira split the ask into a target person, job to be done, evidence checklist, and
            approval rules before asking the next question.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenEditor}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-text-primary transition hover:border-text-primary"
        >
          Review full brief
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Search target
            </p>
            <p className="mt-1 text-xl font-semibold leading-snug text-text-primary">
              {sentence(draft.idealPerson, "Person still being clarified")}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Job to be done
            </p>
            <p className="mt-1 text-xl font-semibold leading-snug text-text-primary">
              {sentence(draft.outcomeNeeded, draft.rawNeed)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-surface-raised p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Evidence to verify
          </p>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{proofGap}</p>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            What Mira understood
          </p>
          <span className="rounded-full bg-surface-raised px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Visible process
          </span>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-xs font-semibold text-text-primary">Inferred from your ask</p>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              Interpreted "{compact(interpretedShape.target, draft.idealPerson)} to{" "}
              {compact(interpretedShape.outcome, draft.outcomeNeeded)}" as who to find and what
              they need to make happen.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-xs font-semibold text-text-primary">Defaulted safely</p>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              Search route: {formatMode(draft.mode)}. Sources: {formatSources(draft.sourcesAllowed)}.
              Contact rule: {formatContactPolicy(draft.contactPolicy)}.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-xs font-semibold text-text-primary">Still needs</p>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              <span className="font-semibold text-text-primary">{gap.label}:</span> {gap.detail}
            </p>
          </div>
        </div>
      </div>

      {initialMatches.length > 0 ? (
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Initial match pass
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Mira checked visible Ditto member cards and source-backed public results while the
                brief was being prepared. These are draft matches, not contacted people.
              </p>
            </div>
            <span className="rounded-full bg-surface-raised px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
              {initialMatches.length} found
            </span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {initialMatches.map((candidate) => (
              <article
                key={candidate.handle}
                className="rounded-2xl border border-border bg-background p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs font-semibold text-text-primary">
                    {candidate.name.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold leading-5 text-text-primary">
                      {candidate.name}
                    </h2>
                    <p className="line-clamp-2 text-xs leading-5 text-text-secondary">
                      {candidate.oneLineRole}
                    </p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-3 text-xs leading-5 text-text-secondary">
                  {candidate.rationaleMd.replace(/\s+/g, " ").trim()}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function RequestAnalysisTrace({
  rawNeed,
  draft,
  className,
}: {
  rawNeed: string;
  draft: ActiveRequestDraft;
  className?: string;
}) {
  const rows = buildRequestAnalysisRows({ rawNeed, draft });

  return (
    <section
      aria-label="How Mira analysed this request"
      className={cn("rounded-2xl border border-border bg-background p-4", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Analysis trace
          </p>
          <h2 className="mt-1 text-base font-semibold leading-tight text-text-primary">
            How the request is being worked
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Visible process
        </span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-border bg-white px-3 py-3">
            <div className="flex items-center gap-2">
              <StateIcon state={row.state} />
              <p className="min-w-0 truncate text-[12px] font-semibold text-text-primary">
                {row.label}
              </p>
            </div>
            <p className="mt-2 line-clamp-4 text-[11px] leading-4 text-text-secondary">
              {row.detail}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
