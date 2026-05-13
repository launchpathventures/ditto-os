import type { NetworkProfileCardBlock } from "./content-blocks";
import type { LlmCompletionResponse } from "./llm";
import { createCompletion, extractText } from "./llm";
import { requireNetworkStepRunId } from "./network-step-run";

export const GENERATE_SHARE_VARIANTS_TOOL_NAME = "generate_share_variants";

export interface ShareKbFact {
  factMd: string;
  visibility?: "public" | "on-request" | "off";
  status?: "active" | "archived";
  sourceLabel?: string;
}

export interface ShareVariants {
  quiet: string;
  loud: string;
  ask: string;
}

export interface GenerateShareVariantsInput {
  stepRunId?: string | null;
  card: NetworkProfileCardBlock;
  kb?: ShareKbFact[] | null;
  completion?: typeof createCompletion;
}

export const SHARE_BUDGET_LANGUAGE_PATTERN =
  /(\$\d|hourly|monthly|hr rate|budget|\bk\/(month|hour|hr|year)|\b(rate|rates)\b)/i;

function canonicalShareUrl(card: NetworkProfileCardBlock): string {
  if (/^https?:\/\//i.test(card.shareUrl)) return card.shareUrl;
  return `https://ditto.partners${card.shareUrl.startsWith("/") ? "" : "/"}${card.shareUrl}`;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function publicFacts(kb: ShareKbFact[] | null | undefined): ShareKbFact[] {
  return (kb ?? []).filter(
    (fact) =>
      fact.status !== "archived" &&
      fact.visibility === "public" &&
      clean(fact.factMd).length > 0,
  );
}

function stripBudgetLanguage(text: string): string {
  return clean(
    text
      .replace(/\$\d[\w,./ -]*/g, "")
      .replace(/\b(hourly|monthly|hr rate|budget|rate|rates)\b/gi, "")
      .replace(/\bk\/(month|hour|hr|year)\b/gi, ""),
  );
}

function ensureSuffix(text: string, url: string): string {
  const suffixPattern = new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return clean(`${text.replace(suffixPattern, "").trim()} ${url}`);
}

function fallbackVariants(card: NetworkProfileCardBlock, kb: ShareKbFact[]): ShareVariants {
  const url = canonicalShareUrl(card);
  const fact = kb[0]?.factMd ? ` ${clean(kb[0].factMd)}` : "";
  const role = clean(card.oneLineRole);
  const anti = card.antiPersonaMd ? ` Not for ${clean(card.antiPersonaMd).toLowerCase()}.` : "";
  return {
    quiet: `${card.name} is ${role}.${fact}${anti} Ask ${card.greeterCuratedBy === "mira" ? "Mira" : "Alex"} where they fit. ${url}`,
    loud: `If you need ${role.toLowerCase()}, start with ${card.name}.${fact}${anti} ${url}`,
    ask: `Who should meet ${card.name}? ${role}.${fact}${anti} ${url}`,
  };
}

function parseJsonVariants(text: string): Partial<ShareVariants> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    const parsed = JSON.parse(candidate) as Partial<ShareVariants>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeVariants(raw: Partial<ShareVariants> | null, card: NetworkProfileCardBlock, kb: ShareKbFact[]): ShareVariants {
  const url = canonicalShareUrl(card);
  const fallback = fallbackVariants(card, kb);
  return {
    quiet: ensureSuffix(stripBudgetLanguage(raw?.quiet || fallback.quiet), url),
    loud: ensureSuffix(stripBudgetLanguage(raw?.loud || fallback.loud), url),
    ask: ensureSuffix(stripBudgetLanguage(raw?.ask || fallback.ask), url),
  };
}

async function runCompletion(input: GenerateShareVariantsInput, facts: ShareKbFact[]): Promise<LlmCompletionResponse | null> {
  const completion = input.completion ?? createCompletion;
  try {
    return await completion({
      purpose: "writing",
      maxTokens: 900,
      system: [
        "You write concise social sharing copy for Ditto network profile cards.",
        "Return JSON only with keys quiet, loud, ask.",
        "Each value must be a complete shareable string ending with the canonical URL supplied by the user.",
        "Use only public KB facts. Never mention budget, rates, hourly, monthly, price, salary, or commercial terms.",
      ].join("\n"),
      messages: [{
        role: "user",
        content: JSON.stringify({
          canonicalUrl: canonicalShareUrl(input.card),
          card: {
            name: input.card.name,
            role: input.card.oneLineRole,
            narrative: input.card.narrativeMd,
            antiPersona: input.card.antiPersonaMd,
            badges: input.card.badges.map((badge) => badge.label),
          },
          publicFacts: facts.map((fact) => ({
            fact: fact.factMd,
            source: fact.sourceLabel ?? "Public source",
          })),
        }),
      }],
    });
  } catch {
    return null;
  }
}

export async function generateShareVariants(input: GenerateShareVariantsInput): Promise<ShareVariants> {
  requireNetworkStepRunId(input.stepRunId, GENERATE_SHARE_VARIANTS_TOOL_NAME, {
    rejectWebDirect: true,
  });
  const facts = publicFacts(input.kb);
  const response = await runCompletion(input, facts);
  const raw = response ? parseJsonVariants(extractText(response.content)) : null;
  const variants = sanitizeVariants(raw, input.card, facts);
  if (SHARE_BUDGET_LANGUAGE_PATTERN.test(Object.values(variants).join("\n"))) {
    throw new Error("generate_share_variants produced budget language");
  }
  return variants;
}
