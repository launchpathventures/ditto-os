/**
 * Persona Voice Dispatcher — returns the chat/email voice spec for a given persona.
 *
 * Chat and email paths previously hard-coded `getAlexChatVoice()` / `getAlexEmailPrompt()`.
 * With the Brief 152 persona-selection flow, the session may be committed to either
 * Alex or Mira. This module dispatches to the right single-source-of-truth file
 * (alex-voice.ts or mira-voice.ts) without leaking persona-specific imports into
 * consumers.
 *
 * Provenance: Brief 152 (persona selection), Brief 144 (single-source voice spec).
 */

import type { PersonaId } from "../db/schema";
import { getAlexChatVoice, getAlexEmailPrompt } from "./alex-voice";
import { getMiraChatVoice, getMiraEmailPrompt } from "./mira-voice";

/**
 * Return the chat voice spec (identity + chat rules + anti-patterns) for the
 * given persona. Used by `buildFrontDoorPrompt`.
 */
export function getPersonaChatVoice(personaId: PersonaId): string {
  return personaId === "mira" ? getMiraChatVoice() : getAlexChatVoice();
}

/**
 * Return the email voice spec for the given persona. Used by action/status
 * email composition paths. `personaId` is nullable to tolerate legacy call
 * sites that don't yet thread it through — they fall back to Alex.
 */
export function getPersonaEmailPrompt(personaId: PersonaId | null | undefined): string {
  return personaId === "mira" ? getMiraEmailPrompt() : getAlexEmailPrompt();
}
