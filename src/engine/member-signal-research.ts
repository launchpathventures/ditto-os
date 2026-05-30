import { and, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import {
  normalizeMemberSignalSources,
  type MemberSignalSourceInput,
  type NormalizedMemberSignalSource,
} from "./member-signal-source";
import {
  persistKbDocument,
  type NetworkDbLike,
} from "./network-kb-storage";
import { webSearch as defaultWebSearch } from "./web-search";

export type MemberSignalResearchSource =
  typeof networkSchema.networkSignalSources.$inferSelect;
export type MemberSignalRecord =
  typeof networkSchema.networkMemberSignals.$inferSelect;

export interface MemberSignalResearchBundle {
  memberSignal: MemberSignalRecord;
  sources: MemberSignalResearchSource[];
  webEnrichment: {
    status: "unconfigured" | "found" | "empty" | "failed";
    sourceId?: string | null;
  };
}

export interface ResearchMemberSignalInput {
  db?: NetworkDbLike;
  rootDir?: string;
  userId: string;
  sources: MemberSignalSourceInput[];
  stepRunId?: string | null;
  actorId?: string | null;
  sessionId?: string | null;
  now?: Date;
  webSearchFn?: (query: string) => Promise<string | null>;
  fetchTextFn?: (source: NormalizedMemberSignalSource) => Promise<string | null>;
}

const MAX_SNIPPET_LENGTH = 900;
const MAX_FETCH_SNIPPET_LENGTH = 3_000;

function clip(value: string | null | undefined, max = MAX_SNIPPET_LENGTH): string | null {
  const clean = (value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
}

function titleFromSource(source: NormalizedMemberSignalSource): string {
  return source.sourceLabel || source.sourceUrl || "Member Signal source";
}

function urlFromText(value: string): string | null {
  return value.match(/https?:\/\/[^\s)]+/i)?.[0] ?? null;
}

function sourceQuery(userId: string, sources: NormalizedMemberSignalSource[]): string {
  const parts = sources
    .map((source) => source.sourceUrl ?? source.sourceLabel)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  return `Research public professional profile signals for network user ${userId}. Sources: ${parts}. Return concise source-backed facts with URLs.`;
}

export async function getOrCreateMemberSignal({
  db = networkDb,
  userId,
  now = new Date(),
}: {
  db?: NetworkDbLike;
  userId: string;
  now?: Date;
}): Promise<MemberSignalRecord> {
  const [existing] = await db
    .select()
    .from(networkSchema.networkMemberSignals)
    .where(eq(networkSchema.networkMemberSignals.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(networkSchema.networkMemberSignals)
    .values({
      userId,
      status: "draft",
      calibrationQuestions: [
        "What do people usually come to you for?",
        "What kind of work do you want more of?",
        "What should Ditto avoid introducing you for?",
        "Who would be valuable for you to meet this quarter?",
      ],
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return created;
}

async function persistSource({
  db,
  rootDir,
  userId,
  memberSignalId,
  source,
  snippet,
  status,
  now,
}: {
  db: NetworkDbLike;
  rootDir?: string;
  userId: string;
  memberSignalId: string;
  source: NormalizedMemberSignalSource;
  snippet: string | null;
  status: networkSchema.NetworkSignalSourceStatus;
  now: Date;
}): Promise<MemberSignalResearchSource> {
  let kbDocumentId: string | null = null;
  if (source.text) {
    const document = await persistKbDocument({
      db,
      rootDir,
      userId,
      kind: source.sourceType === "upload" ? "upload" : "manual",
      title: titleFromSource(source),
      sourceLabel: source.sourceLabel,
      originalFilename: source.sourceType === "upload" ? `${source.sourceLabel}.txt` : null,
      mimeType: "text/plain",
      content: source.text,
      visibilityDefault: "on-request",
      metadata: { memberSignalSource: true },
      now,
    });
    kbDocumentId = document.id;
  }

  const [row] = await db
    .insert(networkSchema.networkSignalSources)
    .values({
      memberSignalId,
      userId,
      sourceType: source.sourceType,
      sourceLabel: source.sourceLabel,
      sourceUrl: source.sourceUrl,
      originalInput: source.originalInput,
      kbDocumentId,
      status,
      accessNote: source.accessNote,
      evidenceSnippet: snippet,
      confidence: source.limited ? "low" : "medium",
      metadata: {
        limited: source.limited,
        hasUserProvidedText: Boolean(source.text),
      },
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function researchMemberSignal(
  input: ResearchMemberSignalInput,
): Promise<MemberSignalResearchBundle> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const stepRunId = requireNetworkStepRunId(input.stepRunId, "research_member_signal");
  const normalizedSources = normalizeMemberSignalSources(input.sources);
  if (normalizedSources.length === 0) {
    throw new Error("research_member_signal requires at least one source");
  }

  const memberSignal = await getOrCreateMemberSignal({
    db,
    userId: input.userId,
    now,
  });

  const persistedSources: MemberSignalResearchSource[] = [];
  for (const source of normalizedSources) {
    const fetched = source.limited || !source.sourceUrl
      ? null
      : input.fetchTextFn
        ? await input.fetchTextFn(source)
        : null;
    const snippet =
      source.accessNote ??
      clip(source.text, MAX_FETCH_SNIPPET_LENGTH) ??
      clip(fetched, MAX_FETCH_SNIPPET_LENGTH) ??
      (source.sourceUrl ? `Source recorded from ${source.sourceUrl}` : null);
    const status: networkSchema.NetworkSignalSourceStatus = source.limited
      ? "limited"
      : snippet
        ? "found"
        : "needs_paste";
    const row = await persistSource({
      db,
      rootDir: input.rootDir,
      userId: input.userId,
      memberSignalId: memberSignal.id,
      source,
      snippet,
      status,
      now,
    });
    persistedSources.push(row);
    await db.insert(networkSchema.networkSignalReviewEvents).values({
      memberSignalId: memberSignal.id,
      claimId: null,
      userId: input.userId,
      eventType: "source_added",
      actorId: input.actorId ?? null,
      stepRunId,
      before: null,
      after: {
        sourceId: row.id,
        sourceType: row.sourceType,
        sourceLabel: row.sourceLabel,
        status: row.status,
      },
      createdAt: now,
    });
  }

  let webEnrichment: MemberSignalResearchBundle["webEnrichment"] = { status: "unconfigured" };
  const webSearch = input.webSearchFn ?? defaultWebSearch;
  const webResult = await webSearch(sourceQuery(input.userId, normalizedSources));
  if (webResult) {
    const sourceUrl = urlFromText(webResult);
    const [webSource] = await db
      .insert(networkSchema.networkSignalSources)
      .values({
        memberSignalId: memberSignal.id,
        userId: input.userId,
        sourceType: "web_search",
        sourceLabel: "Perplexity enrichment",
        sourceUrl,
        originalInput: "Perplexity web enrichment",
        kbDocumentId: null,
        status: "found",
        accessNote: null,
        evidenceSnippet: clip(webResult, MAX_FETCH_SNIPPET_LENGTH),
        confidence: sourceUrl ? "medium" : "low",
        metadata: { query: sourceQuery(input.userId, normalizedSources) },
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    persistedSources.push(webSource);
    webEnrichment = { status: "found", sourceId: webSource.id };
  } else {
    webEnrichment = { status: process.env.PERPLEXITY_API_KEY ? "empty" : "unconfigured" };
  }

  const foundCount = persistedSources.filter((source) => source.status === "found").length;
  const limitedCount = persistedSources.filter((source) => source.status === "limited").length;
  await db
    .update(networkSchema.networkMemberSignals)
    .set({
      status: "review",
      sourceSummary: `${foundCount} source${foundCount === 1 ? "" : "s"} found; ${limitedCount} limited source${limitedCount === 1 ? "" : "s"} need paste/upload for deeper context.`,
      updatedAt: now,
    })
    .where(
      and(
        eq(networkSchema.networkMemberSignals.id, memberSignal.id),
        eq(networkSchema.networkMemberSignals.userId, input.userId),
      ),
    );

  const [updatedSignal] = await db
    .select()
    .from(networkSchema.networkMemberSignals)
    .where(eq(networkSchema.networkMemberSignals.id, memberSignal.id))
    .limit(1);

  return {
    memberSignal: updatedSignal ?? memberSignal,
    sources: persistedSources,
    webEnrichment,
  };
}

export const RESEARCH_MEMBER_SIGNAL_TOOL_NAME = "research_member_signal";
