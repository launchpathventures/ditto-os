/**
 * Agent OS — Harness Event Emitter
 *
 * Simple typed event emitter for harness lifecycle events.
 * External surfaces (Telegram bot, web dashboard) subscribe to events
 * instead of using custom callbacks.
 *
 * Provenance: Trigger.dev event pattern (triggerdotdev/trigger.dev)
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
  | { type: "run-failed"; processRunId: string; processName: string; error: string };

type EventListener = (event: HarnessEvent) => void;

class HarnessEventEmitter {
  private listeners: EventListener[] = [];

  /**
   * Subscribe to all harness events.
   * Returns an unsubscribe function.
   */
  on(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to events of a specific type.
   * Returns an unsubscribe function.
   */
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

  /**
   * Emit an event to all listeners.
   */
  emit(event: HarnessEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        // Don't let listener errors break the pipeline
        console.error(`Event listener error:`, error);
      }
    }
  }
}

/** Singleton harness event emitter */
export const harnessEvents = new HarnessEventEmitter();
