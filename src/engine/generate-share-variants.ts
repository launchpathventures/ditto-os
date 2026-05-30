import type { NetworkProfileCardBlock } from "./content-blocks";
import type { LlmCompletionResponse } from "./llm";
import { createCompletion, extractText } from "./llm";
import { requireServerMintedNetworkLaneStepRunId } from "./network-step-run";
import { scrubForSurface } from "./network-privacy-scrubber";

export const GENERATE_SHARE_VARIANTS_TOOL_NAME = "generate_share_variants";

/**
 * Brief 290 (parent Q1 = Shape A): channels are genuinely different in voice
 * and length, so the system prompt + token budget + output shaping branch per
 * channel inside this one guarded tool. `website-badge` short-circuits with
 * fixed, content-free text (no LLM call) so the badge snippet stays
 * byte-identical regardless of card content (AC 9).
 */
export type ShareChannel =
  | "linkedin"
  | "x"
  | "instagram"
  | "email-signature"
  | "website-badge";

export const SHARE_CHANNELS: readonly ShareChannel[] = [
  "linkedin",
  "x",
  "instagram",
  "email-signature",
  "website-badge",
] as const;

const SHARE_CHANNEL_SET = new Set<string>(SHARE_CHANNELS);

export function isShareChannel(value: unknown): value is ShareChannel {
  return typeof value === "string" && SHARE_CHANNEL_SET.has(value);
}

/** X hard limit including the trailing canonical URL. */
const X_MAX_CHARS = 280;
/** One-line ambient channels stay short enough to read at a glance. */
const INSTAGRAM_MAX_CHARS = 200;
const EMAIL_SIG_MAX_CHARS = 160;

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
  rootDir?: string;
  stepRunId?: string | null;
  card: NetworkProfileCardBlock;
  /** Defaults to "linkedin" for backward compatibility with Brief 260 callers. */
  channel?: ShareChannel;
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

/** Truncate so the full string (body + space + url) fits `max` characters. */
function capWithUrl(text: string, url: string, max: number): string {
  if (text.length <= max) return text;
  const withoutUrl = text.replace(new RegExp(`\\s*${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "").trim();
  const room = Math.max(0, max - url.length - 1);
  const trimmedBody = withoutUrl.slice(0, room).trim();
  return clean(`${trimmedBody} ${url}`).slice(0, max);
}

interface ChannelSpec {
  /** Skip the LLM and the scrubber entirely; return fixed, content-free text. */
  static?: boolean;
  maxTokens: number;
  /** Channel-specific system-prompt addendum composed onto the shared base. */
  promptAddendum: string;
  /** Final per-variant shaping applied after budget-strip + URL suffix. */
  shape: (text: string, url: string) => string;
}

const BASE_SYSTEM_PROMPT = [
  "You write concise social sharing copy for Ditto network profile cards.",
  "Return JSON only with keys quiet, loud, ask.",
  "Each value must be a complete shareable string ending with the canonical URL supplied by the user.",
  "Use only public KB facts. Never mention budget, rates, hourly, monthly, price, salary, or commercial terms.",
];

// Per-channel prompt registry (parent Q1 = Shape A). Pattern reference:
// github.com/langchain-ai/social-media-agent POST_STRUCTURE_INSTRUCTIONS —
// studied, not imported.
const CHANNEL_SPECS: Record<ShareChannel, ChannelSpec> = {
  linkedin: {
    maxTokens: 900,
    promptAddendum:
      "Channel: LinkedIn. Long-form professional voice (a few sentences). Specific about the signal, third-person, no hashtags spam.",
    shape: (text, url) => ensureSuffix(text, url),
  },
  x: {
    maxTokens: 400,
    promptAddendum:
      "Channel: X (Twitter). Punchy single-claim post. The entire post including the URL must be 280 characters or fewer.",
    shape: (text, url) => capWithUrl(ensureSuffix(clean(text), url), url, X_MAX_CHARS),
  },
  instagram: {
    maxTokens: 300,
    promptAddendum:
      "Channel: Instagram story. The card image is the message; this is a single short one-line caption. No line breaks.",
    shape: (text, url) =>
      capWithUrl(ensureSuffix(clean(text), url), url, INSTAGRAM_MAX_CHARS),
  },
  "email-signature": {
    maxTokens: 200,
    promptAddendum:
      "Channel: email signature. One quiet, ambient, professional line. No line breaks, no exclamation.",
    shape: (text, url) =>
      capWithUrl(ensureSuffix(clean(text), url), url, EMAIL_SIG_MAX_CHARS),
  },
  "website-badge": {
    static: true,
    maxTokens: 0,
    promptAddendum: "",
    shape: (_text, url) => clean(`Available through Ditto ${url}`),
  },
};

function resolveChannel(channel: ShareChannel | undefined): ShareChannel {
  return channel && isShareChannel(channel) ? channel : "linkedin";
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

function badgeVariants(card: NetworkProfileCardBlock): ShareVariants {
  const text = CHANNEL_SPECS["website-badge"].shape("", canonicalShareUrl(card));
  return { quiet: text, loud: text, ask: text };
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

function sanitizeVariants(
  raw: Partial<ShareVariants> | null,
  card: NetworkProfileCardBlock,
  kb: ShareKbFact[],
  channel: ShareChannel,
): ShareVariants {
  const url = canonicalShareUrl(card);
  const fallback = fallbackVariants(card, kb);
  const { shape } = CHANNEL_SPECS[channel];
  const finalize = (value: string | undefined, fb: string): string =>
    shape(stripBudgetLanguage(value || fb), url);
  return {
    quiet: finalize(raw?.quiet, fallback.quiet),
    loud: finalize(raw?.loud, fallback.loud),
    ask: finalize(raw?.ask, fallback.ask),
  };
}

async function runCompletion(
  input: GenerateShareVariantsInput,
  facts: ShareKbFact[],
  channel: ShareChannel,
): Promise<LlmCompletionResponse | null> {
  const completion = input.completion ?? createCompletion;
  try {
    return await completion({
      purpose: "writing",
      maxTokens: CHANNEL_SPECS[channel].maxTokens,
      system: [...BASE_SYSTEM_PROMPT, CHANNEL_SPECS[channel].promptAddendum].join("\n"),
      messages: [{
        role: "user",
        content: JSON.stringify({
          channel,
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
  await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    GENERATE_SHARE_VARIANTS_TOOL_NAME,
    { rootDir: input.rootDir },
  );
  const channel = resolveChannel(input.channel);

  // Website badge is fixed, content-free text — no LLM call, no card content.
  if (CHANNEL_SPECS[channel].static) {
    const variants = badgeVariants(input.card);
    if (SHARE_BUDGET_LANGUAGE_PATTERN.test(Object.values(variants).join("\n"))) {
      throw new Error("generate_share_variants produced budget language");
    }
    return variants;
  }

  const scrubbed = scrubForSurface(input.card, {
    surface: "share",
    viewerContext: { viewerType: "visitor" },
  }).payload ?? { ...input.card, antiPersonaMd: null };
  const safeInput = { ...input, card: scrubbed };
  const facts = publicFacts(input.kb);
  const response = await runCompletion(safeInput, facts, channel);
  const raw = response ? parseJsonVariants(extractText(response.content)) : null;
  const variants = sanitizeVariants(raw, safeInput.card, facts, channel);
  if (SHARE_BUDGET_LANGUAGE_PATTERN.test(Object.values(variants).join("\n"))) {
    throw new Error("generate_share_variants produced budget language");
  }
  return variants;
}
