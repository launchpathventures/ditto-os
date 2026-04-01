/**
 * Ditto — Workspace Events
 *
 * Lightweight custom event bus for workspace-level transitions.
 * Used by conversation components to signal when the Self creates a process.
 *
 * Provenance: Brief 046. Updated Brief 057 (removed unused onProcessCreated listener).
 */

const PROCESS_CREATED_EVENT = "ditto:process-created";

export function emitProcessCreated(processId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PROCESS_CREATED_EVENT, { detail: { processId } }),
  );
}
