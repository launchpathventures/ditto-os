import type { NetworkProfileCardBlock } from "./content-blocks";
import { normalizeHandle } from "./handle-claim";

export const EXPERT_LANE_QUESTIONS = [
  "When somebody hires you, what's the actual thing they're paying you for?",
  "Who's the worst fit for you? I'd rather know that first.",
  "Tell me about a client you'd want more of. What were they like before they hired you?",
  "Three things you're better at than most people in your field. Just three.",
  "What's the line about you that would make somebody say 'oh, I should talk to them'?",
  "Are you actually open for new work right now? It's fine to say no — I won't promote you if you're not.",
] as const;

export const NETWORK_ANTI_PERSONA_OPTIONS = [
  "people who want a slide deck, not a pipeline",
  "teams shopping for free advice",
  "leaders who want strategy without implementation",
] as const;

export const NETWORK_PROFILE_SIGNAL_COLORS: NetworkProfileCardBlock["signalDots"][number]["color"][] = [
  "petal",
  "mint",
  "canary",
  "lavender",
];

export interface ExpertIntakeAnswers {
  uvp?: string;
  antiPersona?: string | null;
  idealClient?: string;
  skills?: string;
  hook?: string;
  visibility?: string;
}

export function simpleNetworkHandle(value: string): string {
  return normalizeHandle(value) || "expert";
}

export function isVagueNetworkAntiPersona(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length < 16 ||
    /^(not sure|idk|i don't know|dont know|anyone|everyone|no idea|skip|none|no one)$/i.test(normalized)
  );
}

export function wantsNetworkVisibility(value: string): boolean {
  if (/\b(no|nope|not|closed|unavailable|paused)\b/i.test(value)) {
    return false;
  }
  return /\b(yes|yeah|yep|open|available|sure|new work|taking)\b/i.test(value);
}

export function networkProfileSkillsFrom(answer?: string): string[] {
  if (!answer) return ["positioning", "introductions", "follow-through"];

  const parts = answer
    .split(/[,;\n]|\b\d[.)]\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts.length > 0 ? parts : [answer]).slice(0, 3);
}

export function buildNetworkProfileCard({
  answers,
  displayName,
  greeterName,
  handle,
  visible,
}: {
  answers: ExpertIntakeAnswers;
  displayName: string;
  greeterName: string;
  handle: string;
  visible: boolean;
}): NetworkProfileCardBlock {
  const name = displayName.trim() || "Expert";
  const handleSlug = simpleNetworkHandle(handle || name);
  const signals = [
    { id: "uvp", label: "Value", filled: Boolean(answers.uvp) },
    { id: "fit", label: "Fit", filled: typeof answers.antiPersona !== "undefined" },
    { id: "client", label: "Client", filled: Boolean(answers.idealClient) },
    { id: "edge", label: "Edge", filled: Boolean(answers.skills) },
    { id: "hook", label: "Hook", filled: Boolean(answers.hook) },
    { id: "open", label: "Open", filled: Boolean(answers.visibility) },
  ];
  const skillBadges = networkProfileSkillsFrom(answers.skills).map((label, index) => ({
    label,
    color: NETWORK_PROFILE_SIGNAL_COLORS[index % NETWORK_PROFILE_SIGNAL_COLORS.length],
  }));
  const oneLineRole =
    answers.hook?.trim() ||
    answers.uvp?.trim() ||
    "I help good work find the right people.";

  return {
    type: "network-profile-card",
    handle: handleSlug,
    name,
    portraitUrl: null,
    cityLabel: null,
    oneLineRole,
    signalDots: signals.map((signal, index) => ({
      ...signal,
      color: NETWORK_PROFILE_SIGNAL_COLORS[index % NETWORK_PROFILE_SIGNAL_COLORS.length],
    })),
    badges: skillBadges,
    narrativeMd: answers.uvp?.trim() || oneLineRole,
    antiPersonaMd: answers.antiPersona === undefined ? null : answers.antiPersona,
    greeterCuratedBy: greeterName.toLowerCase() === "mira" ? "mira" : "alex",
    lastUpdatedAt: new Date().toISOString(),
    visibility: visible ? "public" : "on-request",
    shareUrl: `/people/${handleSlug}`,
    ogImageUrl: `/api/v1/network/og/${handleSlug}`,
  };
}
