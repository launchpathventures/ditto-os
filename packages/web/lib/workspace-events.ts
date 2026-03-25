/**
 * Ditto — Workspace Events
 *
 * Lightweight custom event bus for workspace-level transitions.
 * Used by conversation components to signal the entry point
 * when the Self creates a process (triggering conversation → workspace switch).
 *
 * AC13: Auto-switch from conversation-only to workspace when first process created.
 *
 * Provenance: Brief 046.
 */

const PROCESS_CREATED_EVENT = "ditto:process-created";

export function emitProcessCreated(processId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PROCESS_CREATED_EVENT, { detail: { processId } }),
  );
}

export function onProcessCreated(
  callback: (processId: string) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ processId: string }>).detail;
    callback(detail.processId);
  };

  window.addEventListener(PROCESS_CREATED_EVENT, handler);
  return () => window.removeEventListener(PROCESS_CREATED_EVENT, handler);
}
