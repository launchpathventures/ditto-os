/**
 * Persona Runtime — presentation layer for the Network Agent.
 *
 * Two layers:
 * 1. Structured config — machine-readable traits for assignment, formatting, consistency checks.
 * 2. Character bible prompt artifact — the full docs/ditto-character.md loaded as supplementary
 *    prompt content at agent harness assembly time (same pattern as cognitive framework files).
 *
 * Personas are faces Self wears, not separate agents. One Self, one memory, one judgment system.
 * Personas control: name, voice, accent, signature phrases, personality dials.
 * Self controls: what to say, when to say it, what to remember, when to refuse.
 *
 * Provenance: Brief 079/082, ADR-016 (Conversational Self), docs/ditto-character.md.
 */

import type { PersonaId } from "../db/schema";
import { db, schema } from "../db";
import { eq, and, isNull, count } from "drizzle-orm";
import fs from "fs";
import path from "path";

// ============================================================
// Persona Configuration
// ============================================================

export interface VoiceTraits {
  formality: number;    // 1-10 (1 = casual, 10 = formal)
  warmth: number;       // 1-10
  directness: number;   // 1-10
  humor: number;        // 1-10
}

export interface PersonaConfig {
  id: PersonaId;
  name: string;
  tagline: string;
  voiceTraits: VoiceTraits;
  signaturePatterns: string[];
  signOff: string;
  accent: string;
}

/**
 * Alex — warm, direct, a bit dry. Think Aussie advisor.
 * From character bible: formality 3/10, warmth 8/10, directness 9/10, humor 6/10.
 */
const ALEX_CONFIG: PersonaConfig = {
  id: "alex",
  name: "Alex",
  tagline: "Warm, direct, a bit dry. Think Aussie advisor who's been around.",
  voiceTraits: {
    formality: 3,
    warmth: 8,
    directness: 9,
    humor: 6,
  },
  signaturePatterns: [
    "G'day",
    "Shall we get started?",
    "Let me be straight with you",
    "Here's what I think",
  ],
  signOff: "Alex\nDitto",
  accent: "Australian English — warm, understated, no excessive slang",
};

/**
 * Mira — precise, thoughtful, quietly confident. Think London strategist.
 * From character bible: formality 6/10, warmth 6/10, directness 7/10, humor 3/10.
 */
const MIRA_CONFIG: PersonaConfig = {
  id: "mira",
  name: "Mira",
  tagline: "Precise, thoughtful, quietly confident. Think London strategist.",
  voiceTraits: {
    formality: 6,
    warmth: 6,
    directness: 7,
    humor: 3,
  },
  signaturePatterns: [
    "Hello",
    "Ready when you are",
    "I think the right approach here is",
    "Let me walk you through what I've found",
  ],
  signOff: "Mira\nDitto",
  accent: "British English — measured, precise, no excessive formality",
};

const PERSONA_CONFIGS: Record<PersonaId, PersonaConfig> = {
  alex: ALEX_CONFIG,
  mira: MIRA_CONFIG,
};

// ============================================================
// Public API
// ============================================================

export function getPersonaConfig(id: PersonaId): PersonaConfig {
  return PERSONA_CONFIGS[id];
}

export function getAllPersonaConfigs(): PersonaConfig[] {
  return Object.values(PERSONA_CONFIGS);
}

/**
 * Assign a persona to a person who doesn't have one yet.
 * Uses round-robin: counts existing assignments and alternates.
 */
export async function assignPersona(personId: string): Promise<PersonaId> {
  // Check if already assigned
  const [person] = await db
    .select({ personaAssignment: schema.people.personaAssignment })
    .from(schema.people)
    .where(eq(schema.people.id, personId));

  if (person?.personaAssignment) {
    return person.personaAssignment;
  }

  // Count existing assignments to alternate
  const [alexResult] = await db
    .select({ count: count() })
    .from(schema.people)
    .where(eq(schema.people.personaAssignment, "alex"));

  const [miraResult] = await db
    .select({ count: count() })
    .from(schema.people)
    .where(eq(schema.people.personaAssignment, "mira"));

  // Assign to the persona with fewer assignments (Alex on tie)
  const alexN = alexResult?.count ?? 0;
  const miraN = miraResult?.count ?? 0;
  const assignment: PersonaId = alexN <= miraN ? "alex" : "mira";

  await db
    .update(schema.people)
    .set({ personaAssignment: assignment, updatedAt: new Date() })
    .where(eq(schema.people.id, personId));

  return assignment;
}

/**
 * Get the persona assigned to a specific person, assigning one if needed.
 */
export async function getPersonaForPerson(personId: string): Promise<PersonaConfig> {
  const id = await assignPersona(personId);
  return getPersonaConfig(id);
}

// ============================================================
// Character Bible Prompt Artifact
// ============================================================

let characterBibleCache: string | null = null;

/**
 * Load the character bible as a prompt artifact.
 * Same pattern as cognitive framework files (cognitive/self.md).
 * The character bible is the authoritative source for Ditto's behaviour —
 * house values, mode spectrum, refusal patterns, mode-specific instructions.
 */
export function loadCharacterBible(): string {
  if (characterBibleCache) return characterBibleCache;

  const biblePath = path.resolve(process.cwd(), "docs/ditto-character.md");
  try {
    characterBibleCache = fs.readFileSync(biblePath, "utf-8");
    return characterBibleCache;
  } catch {
    // Fallback: minimal character instructions if file not found
    return [
      "# Ditto Character",
      "",
      "You are Ditto — a trusted advisor and super-connector.",
      "House values: candour over comfort, reputation is the product, earned trust, memory is continuity, silence is a feature, no spam ever, the human decides.",
      "Never lie about being AI. Never send outreach you wouldn't want to receive.",
    ].join("\n");
  }
}

/**
 * Build the persona-specific prompt section for injection into the agent harness.
 * Combines character bible + persona config + mode instructions.
 */
export function buildPersonaPrompt(
  personaId: PersonaId,
  mode: "self" | "selling" | "connecting",
): string {
  const config = getPersonaConfig(personaId);
  const bible = loadCharacterBible();

  const modeInstructions: Record<string, string> = {
    self: `You are operating in Self mode as ${config.name}. You are the user's chief of staff — advisor, planner, truth-teller. User directs, you advise.`,
    selling: `You are operating in Selling mode as ${config.name}. You act like the user's internal sales & marketing person. Take initiative within the agreed plan. Be bold in outreach. Still consider network health but be user-biased.`,
    connecting: `You are operating in Connecting mode as ${config.name}. You act as a researcher and advisor. Find people, report back, present options. The user always decides on introductions. Network health is your primary filter.`,
  };

  return [
    `## Your Identity: ${config.name} from Ditto`,
    "",
    config.tagline,
    "",
    `Voice: ${config.accent}`,
    `Signature patterns: ${config.signaturePatterns.join(", ")}`,
    `Sign-off: ${config.signOff.replace("\n", " — ")}`,
    "",
    `## Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
    "",
    modeInstructions[mode],
    "",
    "## Character Bible (authoritative)",
    "",
    bible,
  ].join("\n");
}

/**
 * Clear the character bible cache (for testing).
 */
export function clearCharacterBibleCache(): void {
  characterBibleCache = null;
}
