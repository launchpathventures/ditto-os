/**
 * @ditto/core — Harness Event Emitter
 *
 * Simple typed event emitter for harness lifecycle events.
 * External surfaces subscribe to events instead of custom callbacks.
 *
 * Provenance: Trigger.dev event pattern
 */

export type HarnessEvent =
  | { type: "step-start"; processRunId: string; stepId: string; roleName: string; processName: string }
  | { type: "step-complete"; processRunId: string; stepId: string; summary: string; confidence?: string; duration: number }
  | { type: "gate-pause"; processRunId: string; stepId: string; reason: string; output: string }
  | { type: "gate-advance"; processRunId: string; stepId: string; confidence?: string }
  | { type: "routing-decision"; processRunId: string; from: string; to: string; reasoning: string; mode: string }
  | { type: "retry"; processRunId: string; stepId: string; attempt: number; maxRetries: number }
  | { type: "step-skipped"; processRunId: string; stepId: string; reason: string }
  | { type: "run-complete"; processRunId: string; processName: string; stepsExecuted: number }
  | { type: "run-failed"; processRunId: string; processName: string; error: string }
  // Orchestrator goal decomposition progress (Brief 155 MP-1.4)
  | { type: "orchestrator-decomposition-start"; goalWorkItemId: string; goalContent: string }
  | { type: "orchestrator-subtask-identified"; goalWorkItemId: string; subtaskId: string; subtaskDescription: string; index: number; total: number }
  | { type: "orchestrator-subtask-dispatched"; goalWorkItemId: string; subtaskId: string; routingPath: string; processSlug: string | null }
  | { type: "orchestrator-decomposition-complete"; goalWorkItemId: string; totalTasks: number; reasoning: string }
  | { type: "orchestrator-decomposition-failed"; goalWorkItemId: string; reason: string }
  // Build notification (Brief 155 MP-1.5)
  | { type: "build-process-created"; goalWorkItemId: string; processSlug: string; processName: string; processDescription: string };

type EventListener = (event: HarnessEvent) => void;

export class HarnessEventEmitter {
  private listeners: EventListener[] = [];

  on(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  onType<T extends HarnessEvent["type"]>(
    type: T,
    listener: (event: Extract<HarnessEvent, { type: T }>) => void,
  ): () => void {
    const wrappedListener: EventListener = (event) => {
      if (event.type === type) {
        listener(event as Extract<HarnessEvent, { type: T }>);
      }
    };
    this.listeners.push(wrappedListener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== wrappedListener);
    };
  }

  emit(event: HarnessEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error(`Event listener error:`, error);
      }
    }
  }
}

/** Singleton harness event emitter */
export const harnessEvents = new HarnessEventEmitter();
