/**
 * Persona — shared front-end types + metadata for Alex / Mira.
 *
 * Mirrors the server-side `PersonaId` union (src/db/schema/network.ts).
 * Keeping a second declaration here avoids dragging server-side DB imports
 * into client components.
 */

export type PersonaId = "alex" | "mira";
export const PERSONA_IDS: PersonaId[] = ["alex", "mira"];

export interface PersonaMeta {
  id: PersonaId;
  name: string;
  tagline: string;
  accent: string;
  signOff: string;
}

export const PERSONAS: Record<PersonaId, PersonaMeta> = {
  alex: {
    id: "alex",
    name: "Alex",
    tagline: "Warm, direct, a bit dry. Aussie advisor who's been around.",
    accent: "Australian English",
    signOff: "— Alex",
  },
  mira: {
    id: "mira",
    name: "Mira",
    tagline: "Precise, thoughtful, quietly confident. London strategist.",
    accent: "British English",
    signOff: "— Mira",
  },
};

export function otherPersona(personaId: PersonaId): PersonaId {
  return personaId === "alex" ? "mira" : "alex";
}
