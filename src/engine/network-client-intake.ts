import type { JobRequestCardBlock } from "./content-blocks";
import type { PersonaId } from "@ditto/core/db/network";

export const CLIENT_LANE_QUESTIONS = [
  "What's the thing you're hiring for? Not the job title — the outcome.",
  "Who *did* this for you well before, even if it was a side-of-desk thing?",
  "What kind of person do you NOT want? Bad fits to filter out?",
  "What does 'good' look like in 30 days?",
  "Budget shape — ballpark, not exact. Hourly, monthly, project?",
  "Want me to scan off-network too, or stick with people already in?",
] as const;

export interface ClientIntakeAnswers {
  jtbd?: string;
  referenceShape?: string;
  antiPersonaMd?: string;
  successCriteria?: string;
  budgetShape?: string;
  scoutOptIn?: string;
}

export interface ClientLaneConversationTurn {
  role: "assistant";
  content: string;
  block?: JobRequestCardBlock;
}

export function parseBudgetCadence(value: string): JobRequestCardBlock["budgetShape"]["cadence"] {
  if (/\b(hour|hourly|day|daily|rate)\b/i.test(value)) return "hourly";
  if (/\b(project|fixed|one[- ]?off|milestone)\b/i.test(value)) return "project";
  return "monthly";
}

export function wantsOffNetworkScout(value: string): boolean {
  if (/\b(stick|already in|on-network only|network only)\b/i.test(value)) {
    return false;
  }
  if (/\bnot (?:just|only)\b/i.test(value) && /\b(scan|scout|search|outside|off[- ]?network|broader|wider|further)\b/i.test(value)) {
    return true;
  }
  if (/\b(no|nope|don't|do not|not)\b.{0,40}\b(scan|scout|search|look|go|widen|broaden|outside|off[- ]?network|further)\b/i.test(value)) {
    return false;
  }
  if (/\b(scan|scout|search|look|go)\b.{0,40}\b(off[- ]?network|outside|broader|further|wider)\b/i.test(value)) {
    return true;
  }
  if (/\b(not just|beyond|outside|off[- ]?network|broader|wider|widen|scan further)\b/i.test(value)) {
    return true;
  }
  return /\b(yes|yeah|yep|sure)\b/i.test(value);
}

function requiredAnswer(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function buildJobRequestCard({
  answers,
  greeter,
  suggestedCandidates = [],
  now = new Date(),
}: {
  answers: ClientIntakeAnswers;
  greeter: PersonaId;
  suggestedCandidates?: JobRequestCardBlock["suggestedCandidates"];
  now?: Date;
}): JobRequestCardBlock {
  const budgetAnswer = requiredAnswer(answers.budgetShape, "ballpark not provided");
  return {
    type: "job-request-card",
    jtbd: requiredAnswer(answers.jtbd, "Need the right person"),
    referenceShape: requiredAnswer(answers.referenceShape, "No reference shape yet"),
    antiPersonaMd: requiredAnswer(answers.antiPersonaMd, "Bad fit still being clarified"),
    successCriteria: requiredAnswer(answers.successCriteria, "Success criteria still being clarified"),
    budgetShape: {
      ballpark: budgetAnswer,
      cadence: parseBudgetCadence(budgetAnswer),
    },
    scoutOptIn: wantsOffNetworkScout(answers.scoutOptIn ?? ""),
    suggestedCandidates,
    greeterCuratedBy: greeter,
    matchCuratedBy: greeter,
    lastUpdatedAt: now.toISOString(),
  };
}

export function buildClientLaneResolutionTurns({
  card,
  framingSentence,
}: {
  card: JobRequestCardBlock;
  framingSentence: string;
}): ClientLaneConversationTurn[] {
  // Existing lane sessions persist assistant/user turns as an ordered messages
  // array. A client-lane handler can append both entries from one invocation:
  // first the card-bearing turn, then the separate Greeter framing sentence.
  return [
    {
      role: "assistant",
      content: "I wrote that into an opportunity brief.",
      block: card,
    },
    {
      role: "assistant",
      content: framingSentence,
    },
  ];
}
