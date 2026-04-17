/**
 * Ditto — Self specificity probe (Brief 177)
 *
 * Pure, deterministic scoring function used to decide whether a user
 * message has enough specificity signal to trigger a *mutating* Self
 * tool (generate_process(save=true), start_pipeline, create_work_item,
 * orchestrate_work, edit_*, activate_*). Vague asks fall below the
 * threshold and should prompt a single clarifying question first,
 * instead of silently picking a path.
 *
 * Signals (each worth +1, capped at 1 per category):
 *  - action verb: "send|create|schedule|quote|follow up|email|call|draft|..."
 *  - temporal anchor: "today|tomorrow|this week|by Friday|next Tuesday|<date>"
 *  - concrete artefact: "invoice|quote|contract|PR|brief|email|post"
 *  - named person: looks like a capitalised first name not at sentence start
 *  - measurable outcome: numeric with a unit or count ("3 emails", "$500", "10 clients")
 *  - domain: mentions a known integration service from the registry or
 *    a process slug from the user's library (optional signal — passed in)
 *
 * Default threshold: 2. Users with `clarifyBeforeAct: false` bypass the
 * probe entirely (tested via the call site, not here).
 *
 * NO LLM. Runs before every mutating tool call.
 */

export interface SpecificitySignals {
  action: boolean;
  temporal: boolean;
  artefact: boolean;
  named: boolean;
  outcome: boolean;
  domain: boolean;
}

export interface SpecificityScore {
  score: number;
  signals: SpecificitySignals;
  /** Single most-helpful clarification question keyed to the largest gap. */
  clarifyingQuestion: string | null;
}

const ACTION_VERBS = [
  "send",
  "create",
  "schedule",
  "book",
  "quote",
  "invoice",
  "draft",
  "email",
  "call",
  "write",
  "publish",
  "post",
  "reply",
  "follow up",
  "follow-up",
  "follow",
  "chase",
  "remind",
  "check in",
  "reach out",
];

const ARTEFACTS = [
  "invoice",
  "quote",
  "contract",
  "proposal",
  "brief",
  "email",
  "message",
  "post",
  "pr",
  "pull request",
  "ticket",
  "issue",
  "report",
  "summary",
  "update",
  "reminder",
  "meeting",
  "call",
];

const TEMPORAL_PATTERNS = [
  /\btoday\b/i,
  /\btomorrow\b/i,
  /\bthis (?:week|month|quarter)\b/i,
  /\bnext (?:week|month|quarter|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bby (?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|cob)\b/i,
  // Brief 179 P1-2: previously `/\bon \w+(?:day)?\b/i` — matched "on track",
  // "on hold", "on schedule". Tightened to only match weekday names or a
  // day-of-month number.
  /\bon (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?:st|nd|rd|th)?)\b/i,
  /\b\d{1,2}(?:st|nd|rd|th)?\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\bin \d+ (?:minutes?|hours?|days?|weeks?|months?)\b/i,
];

const OUTCOME_PATTERNS = [
  /\b\d+\s+(?:emails?|quotes?|invoices?|people|clients?|leads?|meetings?|messages?|posts?|tickets?|drafts?|replies|responses?)\b/i,
  /\$\d/,
  /\b\d+%/,
  /\btop \d+/i,
];

export function scoreSpecificity(
  message: string,
  context: {
    /** Known process slugs from the user's library (optional). */
    knownProcessSlugs?: string[];
    /** Known integration service names from the registry (optional). */
    knownServices?: string[];
    /** Brief 179 P1-2: the user's last message in the session, if any.
     * Prior context often resolves ambiguity ("send an email" on its own
     * is vague; "send an email" following "quote for Sarah Thompson" is
     * clear). When present, signals from the combined text count. */
    priorTurnText?: string;
  } = {},
): SpecificityScore {
  // Brief 179 P1-2: score against current message + prior turn, so the
  // probe doesn't re-ask when context already answered the question.
  const combined = context.priorTurnText
    ? `${context.priorTurnText}\n${message}`
    : message;
  const lower = combined.toLowerCase();

  const action = ACTION_VERBS.some((v) => lower.includes(v));
  const temporal = TEMPORAL_PATTERNS.some((p) => p.test(combined));
  const artefact = ARTEFACTS.some((a) => new RegExp(`\\b${a}\\b`, "i").test(combined));
  const outcome = OUTCOME_PATTERNS.some((p) => p.test(combined));

  // Named person: capitalised word >= 3 chars that's NOT at a sentence start
  // AND isn't a common domain word. Crude but deterministic; good enough for
  // a specificity gate.
  const named = detectNamedEntity(combined);

  const domain =
    (context.knownProcessSlugs?.some((s) =>
      new RegExp(`\\b${escapeRegExp(s)}\\b`, "i").test(combined),
    ) ?? false) ||
    (context.knownServices?.some((s) =>
      new RegExp(`\\b${escapeRegExp(s)}\\b`, "i").test(combined),
    ) ?? false);

  const signals: SpecificitySignals = {
    action,
    temporal,
    artefact,
    named,
    outcome,
    domain,
  };

  const score =
    (action ? 1 : 0) +
    (temporal ? 1 : 0) +
    (artefact ? 1 : 0) +
    (named ? 1 : 0) +
    (outcome ? 1 : 0) +
    (domain ? 1 : 0);

  const clarifyingQuestion = score < 2 ? buildClarification(signals) : null;

  return { score, signals, clarifyingQuestion };
}

function detectNamedEntity(message: string): boolean {
  // Strip leading whitespace; the first word of a sentence is always
  // capitalised, so we don't count it.
  const parts = message.split(/[.!?]\s+/);
  for (const part of parts) {
    const words = part.trim().split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const w = words[i]!;
      if (/^[A-Z][a-z]{2,}$/.test(w)) {
        return true;
      }
    }
  }
  return false;
}

function buildClarification(signals: SpecificitySignals): string {
  const missing: string[] = [];
  if (!signals.action) missing.push("what you want me to do");
  if (!signals.artefact && !signals.outcome) missing.push("what's being produced or changed");
  if (!signals.named) missing.push("who this is for");
  if (!signals.temporal) missing.push("when this needs to happen");

  if (missing.length === 0) {
    return "Could you give me one more detail so I don't start the wrong thing?";
  }
  const first = missing[0]!;
  const second = missing[1];
  if (second) {
    return `Before I start — can you tell me ${first} and ${second}?`;
  }
  return `Before I start — can you tell me ${first}?`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
