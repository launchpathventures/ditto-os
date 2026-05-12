import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import {
  insertKbFact,
  loadKbDocument,
  readKbDocumentSource,
  updateKbFactMirror,
  type FactVisibility,
  type NetworkDbLike,
} from "./network-kb-storage";
import { recordNetworkKbFeedback } from "./network-kb-feedback";

export interface FactCandidate {
  factMd: string;
  sourceLocator: string;
}

export interface ExtractKbFactsInput {
  db?: NetworkDbLike;
  rootDir?: string;
  documentId: string;
  userId: string;
  stepRunId?: string | null;
  actorId?: string | null;
  sessionId?: string | null;
  now?: Date;
  limit?: number;
}

export interface ManualAddKbFactInput {
  db?: NetworkDbLike;
  rootDir?: string;
  userId: string;
  factMd: string;
  sourceLabel?: string;
  visibility?: FactVisibility;
  stepRunId?: string | null;
  actorId?: string | null;
  sessionId?: string | null;
  now?: Date;
}

export interface UpdateKbFactWithAuditInput {
  db?: NetworkDbLike;
  rootDir?: string;
  userId: string;
  factId: string;
  factMd?: string;
  visibility?: FactVisibility;
  status?: networkSchema.NetworkKbFactStatus;
  eventType?: "fact_edited" | "fact_visibility_changed" | "fact_archived";
  stepRunId?: string | null;
  actorId?: string | null;
  sessionId?: string | null;
  now?: Date;
}

const MAX_FACTS_PER_DOCUMENT = 20;

function cleanCandidateText(value: string): string {
  return value
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulFact(value: string): boolean {
  if (value.length < 16 || value.length > 260) return false;
  if (/^(thanks|hello|hi|okay|sure)\b/i.test(value)) return false;
  return /[a-zA-Z]/.test(value);
}

export function extractFactCandidatesFromText(
  text: string,
  limit = MAX_FACTS_PER_DOCUMENT,
): FactCandidate[] {
  const lines = text
    .split(/\r?\n/)
    .map((line, index) => ({ line: cleanCandidateText(line), index: index + 1 }))
    .filter((item) => isUsefulFact(item.line));

  const paragraphFacts = text
    .split(/\n{2,}/)
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map(cleanCandidateText)
    .filter(isUsefulFact)
    .map((line, index) => ({ line, index: index + 1 }));

  const seen = new Set<string>();
  return [...lines, ...paragraphFacts].flatMap((item) => {
    if (seen.size >= limit) return [];
    const key = item.line.toLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ factMd: item.line, sourceLocator: `line ${item.index}` }];
  });
}

export async function extractKbFacts(input: ExtractKbFactsInput) {
  const db = input.db ?? networkDb;
  const stepRunId = requireNetworkStepRunId(input.stepRunId, "extract_kb_facts");
  const document = await loadKbDocument(input.documentId, { db });
  if (!document || document.userId !== input.userId) {
    throw new Error("Knowledge document not found for user");
  }

  await db
    .update(networkSchema.networkUserKbDocuments)
    .set({ status: "processing", updatedAt: input.now ?? new Date() })
    .where(eq(networkSchema.networkUserKbDocuments.id, input.documentId));

  try {
    const source = await readKbDocumentSource(document, { rootDir: input.rootDir });
    const candidates = extractFactCandidatesFromText(source, input.limit);
    const facts = [];
    for (const candidate of candidates) {
      const fact = await insertKbFact({
        db,
        rootDir: input.rootDir,
        userId: input.userId,
        documentId: document.id,
        sourceLabel: document.sourceLabel,
        sourceLocator: candidate.sourceLocator,
        factMd: candidate.factMd,
        visibility: document.visibilityDefault,
        metadata: { extractedBy: "heuristic-v1" },
        now: input.now,
      });
      facts.push(fact);
      await recordNetworkKbFeedback({
        type: "fact_extracted",
        userId: input.userId,
        targetId: fact.id,
        actorId: input.actorId,
        sessionId: input.sessionId,
        stepRunId,
        after: {
          factMd: fact.factMd,
          visibility: fact.visibility,
          documentId: document.id,
        },
        createdAt: input.now,
        rootDir: input.rootDir,
      });
    }
    await db
      .update(networkSchema.networkUserKbDocuments)
      .set({ status: "ready", updatedAt: input.now ?? new Date() })
      .where(eq(networkSchema.networkUserKbDocuments.id, input.documentId));
    return facts;
  } catch (error) {
    await db
      .update(networkSchema.networkUserKbDocuments)
      .set({ status: "failed", updatedAt: input.now ?? new Date() })
      .where(eq(networkSchema.networkUserKbDocuments.id, input.documentId));
    throw error;
  }
}

export async function manualAddKbFact(input: ManualAddKbFactInput) {
  const db = input.db ?? networkDb;
  const stepRunId = requireNetworkStepRunId(input.stepRunId, "manual_add_kb_fact");
  const fact = await insertKbFact({
    db,
    rootDir: input.rootDir,
    userId: input.userId,
    documentId: null,
    sourceLabel: input.sourceLabel?.trim() || "Manual fact",
    sourceLocator: "manual",
    factMd: input.factMd,
    visibility: input.visibility ?? "on-request",
    metadata: { source: "manual" },
    now: input.now,
  });
  await recordNetworkKbFeedback({
    type: "fact_manual_added",
    userId: input.userId,
    targetId: fact.id,
    actorId: input.actorId,
    sessionId: input.sessionId,
    stepRunId,
    after: { factMd: fact.factMd, visibility: fact.visibility },
    createdAt: input.now,
    rootDir: input.rootDir,
  });
  return fact;
}

export async function updateKbFactWithAudit(input: UpdateKbFactWithAuditInput) {
  const db = input.db ?? networkDb;
  const operation = input.eventType ?? (input.status === "archived" ? "fact_archived" : "fact_edited");
  const stepRunId = requireNetworkStepRunId(input.stepRunId, operation);
  const [before] = await db
    .select()
    .from(networkSchema.networkUserKbFacts)
    .where(eq(networkSchema.networkUserKbFacts.id, input.factId))
    .limit(1);
  if (!before || before.userId !== input.userId) return null;

  const updated = await updateKbFactMirror({
    db,
    rootDir: input.rootDir,
    factId: input.factId,
    userId: input.userId,
    factMd: input.factMd,
    visibility: input.visibility,
    status: input.status,
    now: input.now,
  });
  if (!updated) return null;

  await recordNetworkKbFeedback({
    type: operation,
    userId: input.userId,
    targetId: input.factId,
    actorId: input.actorId,
    sessionId: input.sessionId,
    stepRunId,
    before: {
      factMd: before.factMd,
      visibility: before.visibility,
      status: before.status,
    },
    after: {
      factMd: updated.factMd,
      visibility: updated.visibility,
      status: updated.status,
    },
    createdAt: input.now,
    rootDir: input.rootDir,
  });
  return updated;
}
