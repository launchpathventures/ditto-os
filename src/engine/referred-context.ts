import type { PersonaId } from "@ditto/core/db/network";

export interface ReferredLandingContextInput {
  prospectId?: string | null;
  introducerId?: string | null;
  personaId?: PersonaId | null;
}

export interface ReferredLandingContext {
  status: "resolved" | "fallback";
  prospectId: string | null;
  introducerId: string | null;
  personaId: PersonaId | null;
  introducerFirstName: string;
  learned: Record<string, string>;
}

export function normalizePersonaId(value: unknown): PersonaId | null {
  return value === "alex" || value === "mira" ? value : null;
}

export function buildReferredConversationOpener(introducerFirstName: string): string {
  const name = introducerFirstName.trim() || "someone";
  return `${name} sent you here because they thought I could be useful. Tell me what you're trying to make happen, and I'll help you shape the next move.`;
}

export async function resolveReferredLandingContext({
  prospectId,
  introducerId,
  personaId,
}: ReferredLandingContextInput): Promise<ReferredLandingContext> {
  const cleanProspectId = prospectId?.trim() || null;
  const cleanIntroducerId = introducerId?.trim() || null;
  const cleanPersonaId = normalizePersonaId(personaId);

  return {
    status: "fallback",
    prospectId: cleanProspectId,
    introducerId: cleanIntroducerId,
    personaId: cleanPersonaId,
    introducerFirstName: "Someone",
    learned: {},
  };
}
