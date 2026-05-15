import type {
  NetworkRequestContactPolicy,
  NetworkRequestMode,
  NetworkRequestSourcesAllowed,
} from "@ditto/core/db/network";
import { buildJobRequestCard } from "./network-client-intake";
import type { JobRequestCardBlock } from "./content-blocks";
import {
  createCompletion,
  extractText,
  type LlmCompletionResponse,
} from "./llm";

export interface NeedRequestIdentity {
  name?: string | null;
  email?: string | null;
  orgSite?: string | null;
  credibility?: string | null;
}

export interface NeedRequestDraft {
  rawNeed: string;
  outcomeNeeded: string;
  idealPerson: string;
  proofRequired: string;
  badFit: string;
  urgency: string;
  geography: string;
  commercialShape: string;
  successOutcome: string;
  outcomeValueHint: string | null;
  budgetPrivate: string;
  budgetShareableLabel: string;
  shareableSummary: string;
  privateNotes: string;
  sourcesAllowed: NetworkRequestSourcesAllowed;
  contactPolicy: NetworkRequestContactPolicy;
  mode: NetworkRequestMode;
  identity: NeedRequestIdentity;
  missingFields: NeedRequestMissingField[];
  jobRequestCard: JobRequestCardBlock;
}

export type NeedRequestMissingField =
  | "outcomeNeeded"
  | "idealPerson"
  | "proofRequired"
  | "commercialShape"
  | "successOutcome"
  | "shareableSummary";

const VALUE_HINT_RE = /(?:\$|£|€|revenue|arr|mrr|funding|investment|contract|deal|hire|client|customer|paid|budget)[^.;\n]*/i;
const BUDGET_RE = /(?:budget|paid|rate|retainer|hourly|monthly|project|£|\$|€)[^.;\n]*/i;
const GEOGRAPHY_RE = /\b(?:uk|u\.k\.|united kingdom|europe|eu|london|us|u\.s\.|united states|north america|australia|new zealand|remote|global)\b/i;
const PROOF_RE = /\b(?:proof|case stud(?:y|ies)|built|scaled|grew|shipped|ran|led|operator|ex-[\w-]+|b2b|saas|marketplace|founder|cmo|cto|cfo|investor|advisor)\b/i;
const COMMERCIAL_RE = /\b(?:paid|advisory|advisor|hire|hiring|fractional|consultant|contractor|employee|partnership|partner|investor|investment|client|customer|exploratory)\b/i;
const URGENCY_RE = /\b(?:asap|urgent|this week|next week|this month|quarter|q[1-4]|soon|now|immediately)\b/i;
const BAD_FIT_RE = /\b(?:avoid|not|no |don't want|bad fit|exclude|without)\b([^.;\n]*)/i;

type NeedRequestCompletion = typeof createCompletion;

interface NeedRequestLlmDraft {
  outcomeNeeded?: unknown;
  idealPerson?: unknown;
  proofRequired?: unknown;
  badFit?: unknown;
  urgency?: unknown;
  geography?: unknown;
  commercialShape?: unknown;
  successOutcome?: unknown;
  outcomeValueHint?: unknown;
  budgetPrivate?: unknown;
  budgetShareableLabel?: unknown;
  shareableSummary?: unknown;
  privateNotes?: unknown;
  sourcesAllowed?: unknown;
  contactPolicy?: unknown;
  mode?: unknown;
}

function clean(value: string | null | undefined, fallback = ""): string {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text || fallback;
}

function cleanUnknown(value: unknown, max = 900): string {
  return typeof value === "string" ? clean(value).slice(0, max) : "";
}

function excerpt(raw: string, re: RegExp): string {
  return clean(raw.match(re)?.[0] ?? "");
}

function firstSentence(raw: string): string {
  return clean(raw.split(/[.\n]/)[0], raw);
}

function inferIdealPerson(raw: string): string {
  const match = raw.match(/\b(?:need|find|looking for|seeking|want)\s+(?:an?\s+|the\s+)?([^,.;\n]+)/i);
  return clean(match?.[1] ?? "", firstSentence(raw));
}

function inferOutcome(raw: string): string {
  const value = raw.match(/\b(?:for|to help|who can|so we can)\s+([^.;\n]+)/i)?.[1];
  return clean(value ?? "", firstSentence(raw));
}

function inferCommercialShape(raw: string): string {
  const paidAdvisory = raw.match(/\bpaid\s+advisory\b/i)?.[0];
  if (paidAdvisory) return paidAdvisory;
  const fractional = raw.match(/\bfractional\b(?:\s+\w+)?/i)?.[0];
  if (fractional) return fractional;
  const value = excerpt(raw, COMMERCIAL_RE);
  if (value) return value;
  return "";
}

function inferMode(raw: string): NetworkRequestMode {
  const wantsWatch = /\b(?:watch|monitor|keep an eye|ongoing|quietly)\b/i.test(raw);
  const wantsSearch = /\b(?:search|find|now|today|manual)\b/i.test(raw);
  if (wantsWatch && wantsSearch) return "both";
  if (wantsWatch) return "background-watch";
  return "manual-search";
}

function inferSources(raw: string): NetworkRequestSourcesAllowed {
  if (/\b(?:members only|ditto members|inside ditto|on-network only)\b/i.test(raw)) return "ditto-members";
  if (/\b(?:public web|outside|off-network|broader web)\b/i.test(raw)) return "public-web";
  return "both";
}

function safeMode(value: unknown, fallback: NetworkRequestMode): NetworkRequestMode {
  return value === "manual-search" || value === "background-watch" || value === "both"
    ? value
    : fallback;
}

function safeSources(value: unknown, fallback: NetworkRequestSourcesAllowed): NetworkRequestSourcesAllowed {
  return value === "ditto-members" || value === "public-web" || value === "both"
    ? value
    : fallback;
}

function safeContactPolicy(value: unknown, fallback: NetworkRequestContactPolicy): NetworkRequestContactPolicy {
  return value === "ask-before-contact" ||
    value === "ask-before-intro" ||
    value === "never-contact-without-approval"
    ? value
    : fallback;
}

export function buildNeedRequestShareableSummary(draft: Pick<NeedRequestDraft,
  "outcomeNeeded" | "idealPerson" | "proofRequired" | "geography" | "commercialShape"
>): string {
  return [
    draft.outcomeNeeded,
    draft.idealPerson ? `Ideal person: ${draft.idealPerson}` : "",
    draft.proofRequired ? `Proof: ${draft.proofRequired}` : "",
    draft.geography ? `Geography: ${draft.geography}` : "",
    draft.commercialShape ? `Shape: ${draft.commercialShape}` : "",
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 900);
}

export function determineNeedRequestMissingFields(
  draft: Pick<NeedRequestDraft,
    "outcomeNeeded" | "idealPerson" | "proofRequired" | "commercialShape" | "successOutcome" | "shareableSummary"
  >,
): NeedRequestMissingField[] {
  const missing: NeedRequestMissingField[] = [];
  if (!draft.outcomeNeeded) missing.push("outcomeNeeded");
  if (!draft.idealPerson) missing.push("idealPerson");
  if (!draft.proofRequired) missing.push("proofRequired");
  if (!draft.commercialShape) missing.push("commercialShape");
  if (!draft.successOutcome) missing.push("successOutcome");
  if (!draft.shareableSummary) missing.push("shareableSummary");
  return missing;
}

export function nextNeedRequestQuestions(missing: NeedRequestMissingField[]): string[] {
  const questionByField: Record<NeedRequestMissingField, string> = {
    outcomeNeeded: "What outcome would make this a success?",
    idealPerson: "What kind of person would change the outcome?",
    proofRequired: "What proof would make someone credible?",
    commercialShape: "Is this paid, advisory, hiring, partnership, or exploratory?",
    successOutcome: "What would make this connection worth it?",
    shareableSummary: "What can be shared with potential matches?",
  };
  return missing.slice(0, 3).map((field) => questionByField[field]);
}

export function draftNeedRequestFromText({
  rawNeed,
  requesterContext,
  now = new Date(),
}: {
  rawNeed: string;
  requesterContext?: NeedRequestIdentity | null;
  now?: Date;
}): NeedRequestDraft {
  const raw = clean(rawNeed);
  if (!raw) throw new Error("rawNeed is required");

  const geography = excerpt(raw, GEOGRAPHY_RE);
  const budgetPrivate = excerpt(raw, BUDGET_RE);
  const outcomeValueHint = excerpt(raw, VALUE_HINT_RE) || null;
  const idealPerson = inferIdealPerson(raw);
  const outcomeNeeded = inferOutcome(raw);
  const proofRequired = PROOF_RE.test(raw) ? firstSentence(raw) : "";
  const commercialShape = inferCommercialShape(raw);
  const badFit = clean(raw.match(BAD_FIT_RE)?.[0] ?? "");
  const urgency = excerpt(raw, URGENCY_RE);
  const successOutcome = outcomeValueHint
    ? `A connection that helps produce ${outcomeValueHint}.`
    : outcomeNeeded;
  const shell = {
    outcomeNeeded,
    idealPerson,
    proofRequired,
    geography,
    commercialShape,
  };
  const shareableSummary = buildNeedRequestShareableSummary(shell);
  const missingFields = determineNeedRequestMissingFields({
    outcomeNeeded,
    idealPerson,
    proofRequired,
    commercialShape,
    successOutcome,
    shareableSummary,
  });
  const jobRequestCard = buildJobRequestCard({
    answers: {
      jtbd: outcomeNeeded || raw,
      referenceShape: proofRequired || "Proof still being clarified",
      antiPersonaMd: badFit || "Bad fit still being clarified",
      successCriteria: successOutcome || "Success criteria still being clarified",
      budgetShape: budgetPrivate || "private budget not provided",
      scoutOptIn: inferSources(raw) === "ditto-members" ? "stick with people already in" : "scan outside too",
    },
    greeter: "mira",
    now,
  });

  return {
    rawNeed: raw,
    outcomeNeeded,
    idealPerson,
    proofRequired,
    badFit,
    urgency,
    geography,
    commercialShape,
    successOutcome,
    outcomeValueHint,
    budgetPrivate,
    budgetShareableLabel: "",
    shareableSummary,
    privateNotes: budgetPrivate || outcomeValueHint ? "Budget/outcome value kept private by default." : "",
    sourcesAllowed: inferSources(raw),
    contactPolicy: "ask-before-contact",
    mode: inferMode(raw),
    identity: requesterContext ?? {},
    missingFields,
    jobRequestCard,
  };
}

function extractJsonObject(value: string): Record<string, unknown> | null {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? value.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function rebuildDraftFromFields({
  base,
  parsed,
  now,
}: {
  base: NeedRequestDraft;
  parsed: NeedRequestLlmDraft;
  now: Date;
}): NeedRequestDraft {
  const next: NeedRequestDraft = {
    ...base,
    outcomeNeeded: cleanUnknown(parsed.outcomeNeeded) || base.outcomeNeeded,
    idealPerson: cleanUnknown(parsed.idealPerson) || base.idealPerson,
    proofRequired: cleanUnknown(parsed.proofRequired) || base.proofRequired,
    badFit: cleanUnknown(parsed.badFit) || base.badFit,
    urgency: cleanUnknown(parsed.urgency) || base.urgency,
    geography: cleanUnknown(parsed.geography) || base.geography,
    commercialShape: cleanUnknown(parsed.commercialShape) || base.commercialShape,
    successOutcome: cleanUnknown(parsed.successOutcome) || base.successOutcome,
    outcomeValueHint: cleanUnknown(parsed.outcomeValueHint, 500) || base.outcomeValueHint,
    budgetPrivate: cleanUnknown(parsed.budgetPrivate, 500) || base.budgetPrivate,
    budgetShareableLabel: cleanUnknown(parsed.budgetShareableLabel, 280),
    shareableSummary: cleanUnknown(parsed.shareableSummary) || base.shareableSummary,
    privateNotes: cleanUnknown(parsed.privateNotes) || base.privateNotes,
    sourcesAllowed: safeSources(parsed.sourcesAllowed, base.sourcesAllowed),
    contactPolicy: safeContactPolicy(parsed.contactPolicy, base.contactPolicy),
    mode: safeMode(parsed.mode, base.mode),
  };
  if (!next.shareableSummary) {
    next.shareableSummary = buildNeedRequestShareableSummary(next);
  }
  next.missingFields = determineNeedRequestMissingFields(next);
  next.jobRequestCard = buildJobRequestCard({
    answers: {
      jtbd: next.outcomeNeeded || next.rawNeed,
      referenceShape: next.proofRequired || "Proof still being clarified",
      antiPersonaMd: next.badFit || "Bad fit still being clarified",
      successCriteria: next.successOutcome || "Success criteria still being clarified",
      budgetShape: next.budgetPrivate || "private budget not provided",
      scoutOptIn: next.sourcesAllowed === "ditto-members" ? "stick with people already in" : "scan outside too",
    },
    greeter: "mira",
    now,
  });
  return next;
}

export async function draftNeedRequestWithLlm({
  rawNeed,
  requesterContext,
  now = new Date(),
  completion = createCompletion,
}: {
  rawNeed: string;
  requesterContext?: NeedRequestIdentity | null;
  now?: Date;
  completion?: NeedRequestCompletion;
}): Promise<NeedRequestDraft> {
  const base = draftNeedRequestFromText({ rawNeed, requesterContext, now });
  let response: LlmCompletionResponse;
  try {
    response = await completion({
      purpose: "extraction",
      maxTokens: 1400,
      system: [
        "You turn a user's people/company research need into a structured Ditto Network request brief.",
        "Extract only what is supported by the user's text. Do not invent private budget, geography, proof, or urgency.",
        "Use plain user-facing language. Avoid jargon such as lead, candidate, marketplace, funnel, or signal unless the user used it.",
        "Return JSON only, with these keys: outcomeNeeded, idealPerson, proofRequired, badFit, urgency, geography, commercialShape, successOutcome, outcomeValueHint, budgetPrivate, budgetShareableLabel, shareableSummary, privateNotes, sourcesAllowed, contactPolicy, mode.",
        'Allowed sourcesAllowed: "ditto-members", "public-web", "both".',
        'Allowed contactPolicy: "ask-before-contact", "ask-before-intro", "never-contact-without-approval".',
        'Allowed mode: "manual-search", "background-watch", "both".',
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: [
            `Raw need: ${base.rawNeed}`,
            `Requester context: ${JSON.stringify(requesterContext ?? {})}`,
          ].join("\n"),
        },
      ],
    });
  } catch {
    return base;
  }

  const parsed = extractJsonObject(extractText(response.content));
  if (!parsed) return base;
  return rebuildDraftFromFields({
    base,
    parsed,
    now,
  });
}
