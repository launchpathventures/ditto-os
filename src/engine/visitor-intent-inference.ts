export const intentShapeValues = [
  "curious",
  "similar-expertise",
  "helper-seeker",
  "intro-seeker",
] as const;

export type IntentShape = (typeof intentShapeValues)[number];

export interface VisitorChatTurn {
  role: "visitor" | "greeter";
  content: string;
}

export interface IntentInference {
  highlighted: IntentShape[] | null;
  whisper: string | null;
  scores: Record<IntentShape, number>;
}

const EMPTY_SCORES: Record<IntentShape, number> = {
  curious: 0,
  "similar-expertise": 0,
  "helper-seeker": 0,
  "intro-seeker": 0,
};

const WHISPERS: Record<Exclude<IntentShape, "curious">, string> = {
  "similar-expertise": "You seem to be in a similar space - Ditto can build a signal for you too.",
  "helper-seeker": "Sounds like you have something specific in mind - Ditto can keep watch.",
  "intro-seeker": "Here's how the consent-gated intro works.",
};

function clean(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function visitorTurns(turns: VisitorChatTurn[]): VisitorChatTurn[] {
  return turns.filter((turn) => turn.role === "visitor" && turn.content.trim());
}

function phraseScore(text: string, phrases: RegExp[]): number {
  const hits = phrases.filter((phrase) => phrase.test(text)).length;
  if (hits === 0) return 0;
  if (hits === 1) return 0.72;
  return 0.86;
}

function keywordScore(text: string, memberSignalKeywords: string[]): number {
  const keywords = memberSignalKeywords
    .map((keyword) => clean(keyword))
    .filter((keyword) => keyword.length >= 4);
  if (keywords.length === 0) return 0;
  const hits = keywords.filter((keyword) => text.includes(keyword)).length;
  if (hits === 0) return 0;
  return Math.min(0.9, 0.62 + hits * 0.08);
}

function scoreTurn(content: string, memberSignalKeywords: string[]): Record<IntentShape, number> {
  const text = clean(content);
  const scores = { ...EMPTY_SCORES };
  scores.curious = 0.2;
  scores["similar-expertise"] = Math.max(
    keywordScore(text, memberSignalKeywords),
    phraseScore(text, [
      /\bdo you do\b/,
      /\bi also\b/,
      /\bmy work\b/,
      /\bsame space\b/,
      /\bsimilar\b/,
      /\boperator\b/,
      /\bexpertise\b/,
    ]),
  );
  scores["helper-seeker"] = phraseScore(text, [
    /\bcan .* help\b/,
    /\bneed someone\b/,
    /\blooking for someone\b/,
    /\bdo you know someone\b/,
    /\bkeep watch\b/,
    /\bfind someone\b/,
    /\bwho can\b/,
  ]);
  scores["intro-seeker"] = phraseScore(text, [
    /\bintro\b/,
    /\bintroduce\b/,
    /\bintroduction\b/,
    /\bconnect me\b/,
    /\bhow do i reach\b/,
    /\bhow can i reach\b/,
    /\bget in touch\b/,
  ]);
  return scores;
}

function resolveHighlight(scores: Record<IntentShape, number>): IntentShape[] | null {
  const ranked = intentShapeValues
    .filter((shape) => shape !== "curious")
    .map((shape) => ({ shape, score: scores[shape] }))
    .sort((a, b) => b.score - a.score);
  const [first, second, third] = ranked;
  if (!first || first.score < 0.6) return null;
  if (third && third.score >= 0.6 && first.score - third.score < 0.2) return null;
  if (second && second.score >= 0.6 && Math.abs(first.score - second.score) < 0.2) {
    return [first.shape, second.shape].sort();
  }
  if (!second || first.score - second.score >= 0.2) return [first.shape];
  return null;
}

function whisperFor(highlighted: IntentShape[] | null): string | null {
  if (!highlighted?.length) return null;
  if (highlighted.length > 1) {
    return "Sounds like you have a couple of things in mind - pick whichever feels right.";
  }
  const [shape] = highlighted;
  return shape === "curious" ? null : WHISPERS[shape];
}

export function inferVisitorIntent(
  turns: VisitorChatTurn[],
  memberSignalKeywords: string[] = [],
): IntentInference {
  const visitors = visitorTurns(turns);
  if (visitors.length === 0) {
    return {
      highlighted: null,
      whisper: null,
      scores: { ...EMPTY_SCORES, curious: 0.55 },
    };
  }

  const latestScores = scoreTurn(visitors[visitors.length - 1].content, memberSignalKeywords);
  const highlighted = resolveHighlight(latestScores);
  return {
    highlighted,
    whisper: whisperFor(highlighted),
    scores: latestScores,
  };
}

export function extractIntentKeywords(values: string[], max = 12): string[] {
  const stop = new Set([
    "about",
    "after",
    "again",
    "also",
    "because",
    "before",
    "being",
    "could",
    "ditto",
    "from",
    "have",
    "into",
    "that",
    "their",
    "there",
    "these",
    "this",
    "with",
    "work",
    "working",
  ]);
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const value of values) {
    for (const token of clean(value).split(" ")) {
      if (token.length < 4 || stop.has(token) || seen.has(token)) continue;
      seen.add(token);
      keywords.push(token);
      if (keywords.length >= max) return keywords;
    }
  }
  return keywords;
}
