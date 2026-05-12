import { createHash } from "crypto";
import type { JobRequestCardBlock, SuggestedCandidate, ReviewCardBlock } from "./content-blocks";
import { webSearch } from "./web-search";
import { requireNetworkStepRunId } from "./network-step-run";

export interface ScoutOffNetworkInput {
  jobRequestCard: JobRequestCardBlock;
  seedCandidate?: SuggestedCandidate | null;
  stepRunId?: string | null;
  now?: Date;
  search?: (query: string) => Promise<string | null>;
}

export interface ScoutOffNetworkResult {
  review: ReviewCardBlock;
  candidates: SuggestedCandidate[];
  query: string;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function scrubScoutVisibleText(text: string, card: JobRequestCardBlock): string {
  let scrubbed = text;
  const values = [
    card.budgetShape.ballpark,
    card.antiPersonaMd,
  ].filter((value) => value.trim().length > 0);
  for (const value of values) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    scrubbed = scrubbed.replace(new RegExp(escaped, "gi"), "[private]");
  }
  return clean(scrubbed);
}

function scrubScoutQueryFragment(text: string, card: JobRequestCardBlock): string {
  return scrubScoutVisibleText(text, card).replace(/\[private\]/g, "private requirement");
}

export function buildScoutQuery(
  card: JobRequestCardBlock,
  seedCandidate?: SuggestedCandidate | null,
): string {
  const seedHint = seedCandidate
    ? ` Use ${scrubScoutQueryFragment(seedCandidate.name, card)} / ${scrubScoutQueryFragment(seedCandidate.oneLineRole, card)} as a loose pattern only.`
    : "";
  return clean([
    "Find publicly sourceable people or small firms who match this need.",
    `Need: ${scrubScoutQueryFragment(card.jtbd, card)}.`,
    `Reference shape: ${scrubScoutQueryFragment(card.referenceShape, card)}.`,
    `Success criteria: ${scrubScoutQueryFragment(card.successCriteria, card)}.`,
    seedHint,
    "Return names, roles, organizations, public URLs, and one concise source-backed reason for each. Do not mention budget or private disqualification filters.",
  ].join(" "));
}

function sourceLabelFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Public source";
  }
}

function candidateId(name: string, url: string): string {
  return `scouted:${createHash("sha256").update(`${name}|${url}`).digest("hex").slice(0, 12)}`;
}

function parseLine(line: string, card: JobRequestCardBlock, computedAt: string): SuggestedCandidate | null {
  const url = line.match(/https?:\/\/[^\s)\]]+/)?.[0]?.replace(/[),.;]+$/, "");
  if (!url) return null;
  const withoutBullet = line.replace(/^[-*•\d.)\s]+/, "").trim();
  const beforeUrl = withoutBullet.split(url)[0]?.replace(/[–—|-]\s*$/, "").trim() || "";
  const [rawName, ...roleParts] = beforeUrl.split(/\s+[–—|-]\s+/);
  const name = scrubScoutVisibleText(clean(rawName || "Public lead"), card).slice(0, 80);
  const oneLineRole = scrubScoutVisibleText(
    clean(roleParts.join(" - ") || "Publicly sourced lead"),
    card,
  ).slice(0, 120);
  if (name.includes("[private]") || oneLineRole.includes("[private]")) return null;
  const snippet = scrubScoutVisibleText(withoutBullet.replace(url, "").trim(), card).slice(0, 220);
  if (!name || /^https?:/i.test(name)) return null;
  return {
    handle: candidateId(name, url),
    name,
    oneLineRole,
    rationaleMd: snippet || `${name} has a public source matching this search.`,
    fitConfidence: "medium",
    source: "scouted",
    sourceUrl: url,
    sourceLabel: sourceLabelFromUrl(url),
    sourceSnippet: snippet,
    computedAt,
  };
}

export function parseScoutedCandidatesFromSearch(
  text: string,
  card: JobRequestCardBlock,
  now = new Date(),
): SuggestedCandidate[] {
  const computedAt = now.toISOString();
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .flatMap((line) => {
      const candidate = parseLine(line, card, computedAt);
      if (!candidate || seen.has(candidate.sourceUrl ?? candidate.handle)) return [];
      seen.add(candidate.sourceUrl ?? candidate.handle);
      return [candidate];
    })
    .slice(0, 5);
}

export async function scoutOffNetwork(
  input: ScoutOffNetworkInput,
): Promise<ScoutOffNetworkResult> {
  const stepRunId = requireNetworkStepRunId(
    input.stepRunId,
    "scout_off_network",
    { rejectWebDirect: true },
  );
  const now = input.now ?? new Date();
  const query = buildScoutQuery(input.jobRequestCard, input.seedCandidate);
  const search = input.search ?? webSearch;
  const searchText = await search(query);
  if (!searchText) {
    return {
      query,
      candidates: [],
      review: {
        type: "review_card",
        processRunId: stepRunId,
        stepName: "scout_off_network",
        outputText: "Off-network scout is unavailable because web search is not configured.",
        confidence: "low",
        actions: [],
        knowledgeUsed: ["Job request card"],
      },
    };
  }

  const candidates = parseScoutedCandidatesFromSearch(searchText, input.jobRequestCard, now);
  return {
    query,
    candidates,
    review: {
      type: "review_card",
      processRunId: stepRunId,
      stepName: "scout_off_network",
      outputText:
        candidates.length > 0
          ? `Found ${candidates.length} source-backed off-network lead${candidates.length === 1 ? "" : "s"}.`
          : "No source-backed off-network candidates were returned. I discarded entries without public URLs.",
      confidence: candidates.length > 0 ? "medium" : "low",
      actions: [],
      knowledgeUsed: ["Job request card", "Public web search"],
    },
  };
}
