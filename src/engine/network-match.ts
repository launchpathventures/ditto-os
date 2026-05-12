import { readFileSync } from "fs";
import path from "path";
import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as networkSchema from "@ditto/core/db/network";
import type { NetworkProfileCardBlock } from "@ditto/core";
import type { JobRequestCardBlock, SuggestedCandidate } from "./content-blocks";
import { networkDb } from "../db/network-db";
import { PROJECT_ROOT } from "../paths";
import {
  createCompletion,
  extractText,
  extractToolUse,
  type LlmToolDefinition,
} from "./llm";

type NetworkDbLike = PostgresJsDatabase<typeof networkSchema>;

const MAX_LISTED_SELF_SAMPLE = 200;
const MAX_MATCHES = 5;

export const NETWORK_MATCH_RESULT_TOOL: LlmToolDefinition = {
  name: "network_match_result",
  description:
    "Return the selected on-network candidates for a client opportunity brief.",
  input_schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            handle: { type: "string" },
            rationaleMd: { type: "string" },
            fitConfidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
          },
          required: ["handle", "rationaleMd", "fitConfidence"],
        },
      },
    },
    required: ["candidates"],
  },
};

interface ListedSelf {
  handle: string;
  name: string;
  oneLineRole: string;
  card: NetworkProfileCardBlock;
}

interface MatchOptions {
  sampleLimit: number;
  db?: NetworkDbLike;
  now?: () => Date;
}

function promptTemplate(): string {
  return readFileSync(
    path.join(PROJECT_ROOT, "src", "engine", "network-match-prompt.md"),
    "utf-8",
  );
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function antiPersonaTerms(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((term) => term.length >= 4)
    .filter((term) => !["want", "person", "people", "kind", "with", "that", "this"].includes(term));
}

function profileText(card: NetworkProfileCardBlock): string {
  return normalizeText([
    card.name,
    card.oneLineRole,
    card.narrativeMd,
    card.antiPersonaMd ?? "",
    ...card.badges.map((badge) => badge.label),
  ].join(" "));
}

function matchesAntiPersona(
  jobRequest: JobRequestCardBlock,
  card: NetworkProfileCardBlock,
): boolean {
  const terms = antiPersonaTerms(jobRequest.antiPersonaMd);
  if (terms.length === 0) return false;
  const haystack = profileText(card);
  const phrase = normalizeText(jobRequest.antiPersonaMd);
  if (phrase.length >= 8 && haystack.includes(phrase)) return true;
  return terms.filter((term) => haystack.includes(term)).length >= Math.min(2, terms.length);
}

function isProfileCard(value: unknown): value is NetworkProfileCardBlock {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<NetworkProfileCardBlock>;
  return (
    card.type === "network-profile-card" &&
    typeof card.handle === "string" &&
    typeof card.name === "string" &&
    typeof card.oneLineRole === "string"
  );
}

function candidatePayload(candidate: ListedSelf): Record<string, unknown> {
  return {
    handle: candidate.handle,
    name: candidate.name,
    oneLineRole: candidate.oneLineRole,
    narrativeMd: candidate.card.narrativeMd,
    antiPersonaMd: candidate.card.antiPersonaMd,
    badges: candidate.card.badges.map((badge) => badge.label),
    greeterCuratedBy: candidate.card.greeterCuratedBy,
    lastUpdatedAt: candidate.card.lastUpdatedAt,
  };
}

function jobRequestPayload(jobRequest: JobRequestCardBlock): Record<string, unknown> {
  return {
    jtbd: jobRequest.jtbd,
    referenceShape: jobRequest.referenceShape,
    antiPersonaMd: jobRequest.antiPersonaMd,
    successCriteria: jobRequest.successCriteria,
    budgetShape: {
      cadence: jobRequest.budgetShape.cadence,
      ballparkProvided: Boolean(jobRequest.budgetShape.ballpark),
    },
    scoutOptIn: jobRequest.scoutOptIn,
    greeterCuratedBy: jobRequest.greeterCuratedBy,
  };
}

function parseCandidatesFromTool(input: Record<string, unknown>): Array<{
  handle: string;
  rationaleMd: string;
  fitConfidence: SuggestedCandidate["fitConfidence"];
}> {
  const raw = input.candidates;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const handle = typeof candidate.handle === "string" ? candidate.handle.trim() : "";
    const rationaleMd =
      typeof candidate.rationaleMd === "string" ? candidate.rationaleMd.trim() : "";
    const rawConfidence =
      typeof candidate.fitConfidence === "string"
        ? candidate.fitConfidence.trim().toLowerCase()
        : "";
    const fitConfidence =
      rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low"
        ? rawConfidence
        : "medium";
    if (!handle || !rationaleMd) return [];
    return [{ handle, rationaleMd, fitConfidence }];
  });
}

function parseCandidatesFromText(text: string): ReturnType<typeof parseCandidatesFromTool> {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parseCandidatesFromTool(parsed);
  } catch {
    return [];
  }
}

export async function matchOnNetwork(
  jobRequest: JobRequestCardBlock,
  opts: MatchOptions,
): Promise<SuggestedCandidate[]> {
  const db = opts.db ?? networkDb;
  const limit = Math.max(1, Math.min(opts.sampleLimit, MAX_LISTED_SELF_SAMPLE));
  const computedAt = (opts.now?.() ?? new Date()).toISOString();

  const rows = await db
    .select({
      handle: networkSchema.networkUsers.handle,
      name: networkSchema.networkUsers.name,
      card: networkSchema.networkUsers.card,
    })
    .from(networkSchema.networkUsers)
    .where(eq(networkSchema.networkUsers.wantsVisibility, true))
    .orderBy(desc(networkSchema.networkUsers.updatedAt))
    .limit(limit);

  const listedSelfs: ListedSelf[] = rows.flatMap((row) => {
    if (!row.handle || !isProfileCard(row.card)) return [];
    const candidate = {
      handle: row.handle,
      name: row.name?.trim() || row.card.name,
      oneLineRole: row.card.oneLineRole,
      card: row.card,
    };
    return matchesAntiPersona(jobRequest, candidate.card) ? [] : [candidate];
  });

  if (listedSelfs.length === 0) return [];

  const response = await createCompletion({
    purpose: "analysis",
    system: promptTemplate(),
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          jobRequest: jobRequestPayload(jobRequest),
          candidates: listedSelfs.map(candidatePayload),
        }),
      },
    ],
    tools: [NETWORK_MATCH_RESULT_TOOL],
    maxTokens: 1200,
  });

  const toolCall = extractToolUse(response.content).find(
    (call) => call.name === NETWORK_MATCH_RESULT_TOOL.name,
  );
  const parsed = toolCall
    ? parseCandidatesFromTool(toolCall.input)
    : parseCandidatesFromText(extractText(response.content));

  const byHandle = new Map(listedSelfs.map((candidate) => [candidate.handle, candidate]));
  const seen = new Set<string>();

  return parsed.flatMap((candidate): SuggestedCandidate[] => {
    if (seen.size >= MAX_MATCHES) return [];
    if (seen.has(candidate.handle)) return [];
    const source = byHandle.get(candidate.handle);
    if (!source) return [];
    seen.add(candidate.handle);
    return [{
      handle: source.handle,
      name: source.name,
      oneLineRole: source.oneLineRole,
      rationaleMd: candidate.rationaleMd,
      fitConfidence: candidate.fitConfidence,
      source: "on-network",
      computedAt,
    }];
  });
}
