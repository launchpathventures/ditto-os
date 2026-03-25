/**
 * Ditto Web — Layout State Management
 *
 * Manages surface mode (conversation-only vs workspace) and user preferences.
 * Persisted in data/config.json alongside LLM connection config.
 *
 * AC15: Progressive reveal — new users see conversation-only.
 * AC17: User preference persisted.
 *
 * Provenance: Brief 042 (Navigation & Detail).
 */

export type SurfaceMode = "conversation" | "workspace";

const STORAGE_KEY = "ditto-surface-mode";

/**
 * Get the user's preferred surface mode from localStorage.
 * Returns null if no preference set (new user).
 */
export function getSurfaceMode(): SurfaceMode | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "conversation" || stored === "workspace") return stored;
  return null;
}

/**
 * Persist the user's surface mode preference.
 */
export function setSurfaceMode(mode: SurfaceMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, mode);
}

/**
 * Determine the initial surface mode based on user state.
 *
 * Rules (from UX spec section 5):
 * - User preference overrides everything
 * - No processes → conversation (new user)
 * - 1+ active processes → workspace
 */
export function determineInitialMode(
  processCount: number,
  userPreference: SurfaceMode | null,
): SurfaceMode {
  if (userPreference) return userPreference;
  if (processCount === 0) return "conversation";
  return "workspace";
}
