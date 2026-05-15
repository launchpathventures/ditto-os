import type { ActiveRequestDraft } from "./request-review";
import type { RequestIdentity } from "./request-identity-card";
import type { TrackedField } from "./request-diff";
import { isIdentityCompleteEnough } from "./request-identity-card";

export type StepKind = "need" | "identity" | "mode" | "ready";

export interface ConversationStep {
  kind: StepKind;
  field?: TrackedField | "identity" | "mode";
  index: number;
  total: number;
  label: string;
  lead: string;
  question: string;
  examples: string[];
  skipLabel?: string;
}

interface NeedStep {
  field: TrackedField;
  label: string;
  lead: string;
  question: string;
  examples: string[];
  skipLabel?: string;
}

const NEED_STEPS: NeedStep[] = [
  {
    field: "outcomeNeeded",
    label: "Outcome",
    lead: "Let's lock the brief together. First — what needs to become true?",
    question: "What outcome would make this a success?",
    examples: ["Hire a fractional CMO", "Close a Series A lead", "Land a flagship customer"],
  },
  {
    field: "idealPerson",
    label: "Ideal person",
    lead: "Got it. Now — who could change that?",
    question: "What kind of person could shift this outcome?",
    examples: ["Fractional CMO, climate background", "Seed-stage operator", "Board-level advisor"],
  },
  {
    field: "proofRequired",
    label: "Proof",
    lead: "What would make someone credible for this?",
    question: "What proof would convince you they can do it?",
    examples: ["Scaled B2B SaaS GTM", "Two prior 0→1 launches", "Network of seed VCs"],
  },
  {
    field: "commercialShape",
    label: "Shape",
    lead: "How are you thinking about the commercial shape?",
    question: "Paid, advisory, hiring, partnership, or exploratory?",
    examples: ["Paid advisory", "Full-time hire", "Equity partnership", "Just exploratory"],
    skipLabel: "Skip — figure it out from context",
  },
  {
    field: "geography",
    label: "Geography",
    lead: "Where should they sit?",
    question: "Any geography that matters?",
    examples: ["UK or Europe", "Remote OK", "Bay Area only", "Doesn't matter"],
    skipLabel: "Skip — geography doesn't matter",
  },
  {
    field: "urgency",
    label: "Urgency",
    lead: "How urgent is this?",
    question: "When does this matter?",
    examples: ["This quarter", "Next 2 weeks", "No rush — keep watch"],
    skipLabel: "Skip — no specific timeline",
  },
  {
    field: "badFit",
    label: "Avoid",
    lead: "Anyone you'd want me to filter out?",
    question: "Any anti-persona or hard nos?",
    examples: ["Big agencies", "Career consultants", "No US-based"],
    skipLabel: "Skip — no anti-persona",
  },
];

const IDENTITY_STEP: Omit<ConversationStep, "index" | "total"> = {
  kind: "identity",
  field: "identity",
  label: "About you",
  lead: "Before any introduction goes out, I need to know who I'm introducing.",
  question: "What's your name, email, and a one-line reason you're credible?",
  examples: [
    "Alex Rivers, alex@launchpath.co, founder raising seed",
    "Ben Tan, ben@kite.io, GTM lead at Series B SaaS",
  ],
  skipLabel: "Skip — search-only for now",
};

const MODE_STEP: Omit<ConversationStep, "index" | "total"> = {
  kind: "mode",
  field: "mode",
  label: "Next move",
  lead: "Last call.",
  question: "Should I search now, keep watch in the background, or do both?",
  examples: ["Search now", "Keep watch", "Do both"],
};

const READY_STEP: Omit<ConversationStep, "index" | "total"> = {
  kind: "ready",
  label: "Ready",
  lead: "Everything's locked.",
  question: "Hit publish below when you're ready, or keep editing the brief.",
  examples: [],
};

export const TOTAL_STEPS = NEED_STEPS.length + 2;

function isFieldEmpty(draft: ActiveRequestDraft, field: TrackedField): boolean {
  const value = draft[field];
  if (typeof value !== "string") return true;
  return value.trim().length === 0;
}

export function deriveCurrentStep(
  draft: ActiveRequestDraft,
  identity: RequestIdentity,
  options: { mode: ActiveRequestDraft["mode"] | null; modeConfirmed: boolean },
): ConversationStep {
  for (let i = 0; i < NEED_STEPS.length; i += 1) {
    const step = NEED_STEPS[i];
    if (isFieldEmpty(draft, step.field)) {
      return {
        kind: "need",
        field: step.field,
        index: i + 1,
        total: TOTAL_STEPS,
        label: step.label,
        lead: step.lead,
        question: step.question,
        examples: step.examples,
        skipLabel: step.skipLabel,
      };
    }
  }
  if (!isIdentityCompleteEnough(identity)) {
    return {
      ...IDENTITY_STEP,
      index: NEED_STEPS.length + 1,
      total: TOTAL_STEPS,
    };
  }
  if (!options.modeConfirmed) {
    return {
      ...MODE_STEP,
      index: NEED_STEPS.length + 2,
      total: TOTAL_STEPS,
    };
  }
  return {
    ...READY_STEP,
    index: TOTAL_STEPS,
    total: TOTAL_STEPS,
  };
}

export function fieldIsNeedStep(field: TrackedField): boolean {
  return NEED_STEPS.some((step) => step.field === field);
}

export function needStepLabel(field: TrackedField): string {
  return NEED_STEPS.find((step) => step.field === field)?.label ?? field;
}
