import { and, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import type { NetworkDbLike } from "./network-kb-storage";
import type { MemberSignalResearchBundle } from "./member-signal-research";
import {
  createCompletion,
  extractText,
  type LlmCompletionResponse,
} from "./llm";

export const DRAFT_MEMBER_SIGNAL_TOOL_NAME = "draft_member_signal";

type SignalSection = networkSchema.NetworkSignalClaimSection;
type SignalSource = typeof networkSchema.networkSignalSources.$inferSelect;
type SignalClaim = typeof networkSchema.networkSignalClaims.$inferSelect;

export interface DraftMemberSignalInput {
  db?: NetworkDbLike;
  userId: string;
  memberSignalId?: string | null;
  researchBundle?: MemberSignalResearchBundle | null;
  stepRunId?: string | null;
  actorId?: string | null;
  now?: Date;
  completion?: typeof createCompletion;
}

export interface DraftMemberSignalResult {
  memberSignal: typeof networkSchema.networkMemberSignals.$inferSelect;
  claims: SignalClaim[];
}

const SECTION_LABELS: Record<SignalSection, string> = {
  knownFor: "Known for",
  bestIntroducedFor: "Best introduced for",
  canHelpWith: "Can help with",
  currentFocus: "Current focus",
  openTo: "Open to",
  notAFitFor: "Not a fit for",
  proof: "Proof",
  tasteAndStyle: "Taste and style",
  preferredIntroStyle: "Preferred intro style",
  sourceSummary: "Source summary",
};

const SECTION_ORDER = Object.keys(SECTION_LABELS) as SignalSection[];

interface LlmSignalClaimDraft {
  section?: unknown;
  claimText?: unknown;
  evidenceSnippet?: unknown;
  confidence?: unknown;
}

function sourceText(source: SignalSource): string {
  return (
    source.evidenceSnippet ||
    source.accessNote ||
    source.sourceUrl ||
    source.sourceLabel
  ).replace(/\s+/g, " ").trim();
}

function concise(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function choosePrimarySource(sources: SignalSource[]): SignalSource {
  const found = sources.find((source) => source.status === "found");
  return found ?? sources[0];
}

function evidenceFromSources(sources: SignalSource[]): string {
  return sources
    .slice(0, 3)
    .map((source) => `${source.sourceLabel}: ${concise(sourceText(source), 120)}`)
    .join(" | ");
}

function cleanUnknown(value: unknown, max = 500): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, max)
    : "";
}

function confidenceFrom(value: unknown, fallback: networkSchema.NetworkSignalClaimConfidence): networkSchema.NetworkSignalClaimConfidence {
  return value === "high" || value === "medium" || value === "low" ? value : fallback;
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

function claimForSection(
  section: SignalSection,
  source: SignalSource,
  allSources: SignalSource[],
): {
  claimText: string;
  sourceType: networkSchema.NetworkSignalSourceType;
  sourceLabel: string;
  sourceUrl: string | null;
  evidenceSnippet: string;
  confidence: networkSchema.NetworkSignalClaimConfidence;
  metadata: Record<string, unknown>;
} {
  const text = concise(sourceText(source));
  const sourceCount = allSources.length;
  const isInference = sourceCount > 1 && (
    section === "knownFor" ||
    section === "bestIntroducedFor" ||
    section === "sourceSummary"
  );
  const base = (() => {
    switch (section) {
      case "knownFor":
        return sourceCount > 1
          ? `inferred by Ditto: ${text}`
          : text;
      case "bestIntroducedFor":
        return `Likely intro context to review: ${text}`;
      case "canHelpWith":
        return `Can help with work adjacent to: ${text}`;
      case "currentFocus":
        return `Current public context suggests: ${text}`;
      case "openTo":
        return "Needs review: what kind of opportunity, collaboration, client, hiring, speaking, investing, or advisory work is welcome now?";
      case "notAFitFor":
        return "Needs review: what should Ditto avoid introducing this member for?";
      case "proof":
        return `Proof source to review: ${text}`;
      case "tasteAndStyle":
        return `Working-style signal to review: ${text}`;
      case "preferredIntroStyle":
        return "Needs review: preferred intro style is ask-first until the member says otherwise.";
      case "sourceSummary":
        return `${sourceCount} source${sourceCount === 1 ? "" : "s"} reviewed; limited sources need paste/upload for deeper context.`;
    }
  })();

  return {
    claimText: base,
    sourceType: isInference ? "inference" : source.sourceType,
    sourceLabel: isInference ? "inferred by Ditto" : source.sourceLabel,
    sourceUrl: source.sourceUrl,
    evidenceSnippet: isInference ? evidenceFromSources(allSources) : concise(sourceText(source), 500),
    confidence: source.status === "found" && !source.accessNote ? "medium" : "low",
    metadata: {
      sectionLabel: SECTION_LABELS[section],
      sourceIds: isInference ? allSources.map((item) => item.id) : [source.id],
      requiresMemberReview:
        section === "openTo" ||
        section === "notAFitFor" ||
        section === "preferredIntroStyle",
    },
  };
}

async function draftClaimsWithLlm({
  sources,
  completion = createCompletion,
}: {
  sources: SignalSource[];
  completion?: typeof createCompletion;
}): Promise<Map<SignalSection, LlmSignalClaimDraft> | null> {
  let response: LlmCompletionResponse;
  try {
    response = await completion({
      purpose: "extraction",
      maxTokens: 1800,
      system: [
        "You draft a source-backed Ditto Network profile for someone who wants the right people to find them.",
        "Use only the supplied source snippets. If a section is not supported, write a short 'Needs review:' sentence instead of inventing facts.",
        "Avoid product jargon. Do not use the word signal. Write in plain language a professional would understand.",
        "Return JSON only: {\"claims\":[{\"section\":\"knownFor\",\"claimText\":\"...\",\"evidenceSnippet\":\"...\",\"confidence\":\"high|medium|low\"}]}",
        `Allowed sections: ${SECTION_ORDER.join(", ")}.`,
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: sources
            .slice(0, 10)
            .map((source, index) => [
              `Source ${index + 1}`,
              `Label: ${source.sourceLabel}`,
              `Type: ${source.sourceType}`,
              `URL: ${source.sourceUrl ?? ""}`,
              `Status: ${source.status}`,
              `Evidence: ${sourceText(source)}`,
            ].join("\n"))
            .join("\n\n"),
        },
      ],
    });
  } catch {
    return null;
  }

  const parsed = extractJsonObject(extractText(response.content));
  const claims = Array.isArray(parsed?.claims) ? parsed.claims : [];
  const bySection = new Map<SignalSection, LlmSignalClaimDraft>();
  for (const item of claims) {
    if (!item || typeof item !== "object") continue;
    const draft = item as LlmSignalClaimDraft;
    if (typeof draft.section !== "string") continue;
    if (!SECTION_ORDER.includes(draft.section as SignalSection)) continue;
    bySection.set(draft.section as SignalSection, draft);
  }
  return bySection.size > 0 ? bySection : null;
}

async function loadSignalAndSources({
  db,
  userId,
  memberSignalId,
  bundle,
}: {
  db: NetworkDbLike;
  userId: string;
  memberSignalId?: string | null;
  bundle?: MemberSignalResearchBundle | null;
}): Promise<{
  memberSignal: typeof networkSchema.networkMemberSignals.$inferSelect;
  sources: SignalSource[];
}> {
  if (bundle) {
    return {
      memberSignal: bundle.memberSignal,
      sources: bundle.sources,
    };
  }
  const signalWhere = memberSignalId
    ? and(
        eq(networkSchema.networkMemberSignals.id, memberSignalId),
        eq(networkSchema.networkMemberSignals.userId, userId),
      )
    : eq(networkSchema.networkMemberSignals.userId, userId);
  const [memberSignal] = await db
    .select()
    .from(networkSchema.networkMemberSignals)
    .where(signalWhere)
    .limit(1);
  if (!memberSignal) throw new Error("Member Signal not found");
  const sources = await db
    .select()
    .from(networkSchema.networkSignalSources)
    .where(eq(networkSchema.networkSignalSources.memberSignalId, memberSignal.id));
  return { memberSignal, sources };
}

export async function draftMemberSignal(
  input: DraftMemberSignalInput,
): Promise<DraftMemberSignalResult> {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const stepRunId = requireNetworkStepRunId(input.stepRunId, "draft_member_signal");
  const { memberSignal, sources } = await loadSignalAndSources({
    db,
    userId: input.userId,
    memberSignalId: input.memberSignalId,
    bundle: input.researchBundle,
  });
  if (memberSignal.userId !== input.userId) {
    throw new Error("Member Signal does not belong to user");
  }
  const usableSources = sources.filter((source) => source.status !== "removed");
  if (usableSources.length === 0) {
    throw new Error("draft_member_signal requires at least one reviewed source");
  }

  const primary = choosePrimarySource(usableSources);
  const llmDrafts = await draftClaimsWithLlm({
    sources: usableSources,
    completion: input.completion,
  });
  const draftedClaims: SignalClaim[] = [];
  for (const section of SECTION_ORDER) {
    const source = section === "proof"
      ? usableSources.find((item) => item.sourceUrl) ?? primary
      : primary;
    const fallbackDraft = claimForSection(section, source, usableSources);
    const llmDraft = llmDrafts?.get(section);
    const draft = {
      ...fallbackDraft,
      claimText: cleanUnknown(llmDraft?.claimText) || fallbackDraft.claimText,
      evidenceSnippet: cleanUnknown(llmDraft?.evidenceSnippet, 700) || fallbackDraft.evidenceSnippet,
      confidence: confidenceFrom(llmDraft?.confidence, fallbackDraft.confidence),
    };
    const [claim] = await db
      .insert(networkSchema.networkSignalClaims)
      .values({
        memberSignalId: memberSignal.id,
        userId: input.userId,
        sourceId: source.id,
        kbFactId: null,
        section,
        claimText: draft.claimText,
        sourceType: draft.sourceType,
        sourceLabel: draft.sourceLabel,
        sourceUrl: draft.sourceUrl,
        evidenceSnippet: draft.evidenceSnippet,
        confidence: draft.confidence,
        visibility: "on-request",
        approvalState: "suggested",
        metadata: draft.metadata,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    draftedClaims.push(claim);
    await db.insert(networkSchema.networkSignalReviewEvents).values({
      memberSignalId: memberSignal.id,
      claimId: claim.id,
      userId: input.userId,
      eventType: "claim_drafted",
      actorId: input.actorId ?? null,
      stepRunId,
      before: null,
      after: {
        claimText: claim.claimText,
        section: claim.section,
        sourceLabel: claim.sourceLabel,
        visibility: claim.visibility,
        approvalState: claim.approvalState,
      },
      createdAt: now,
    });
  }

  const [updatedSignal] = await db
    .update(networkSchema.networkMemberSignals)
    .set({
      status: "review",
      updatedAt: now,
    })
    .where(
      and(
        eq(networkSchema.networkMemberSignals.id, memberSignal.id),
        eq(networkSchema.networkMemberSignals.userId, input.userId),
      ),
    )
    .returning();

  return {
    memberSignal: updatedSignal ?? memberSignal,
    claims: draftedClaims,
  };
}

export function memberSignalSections(): SignalSection[] {
  return [...SECTION_ORDER];
}
