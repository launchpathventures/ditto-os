"use client";

/**
 * Ditto — Engine View Component
 *
 * Developer-only toggle that shows engine metadata: routing, memory, cost, timing.
 * Hidden by default, enabled via settings or keyboard shortcut (Ctrl+Shift+E).
 *
 * AC12: Engine View toggle, hidden by default.
 * AC13: Feed cards footer + process detail execution trace.
 *
 * Provenance: Brief 042 (Navigation & Detail), Original to Ditto.
 */

import { useState, useEffect, useCallback, createContext, useContext } from "react";

// ============================================================
// Engine View Context
// ============================================================

interface EngineViewContextType {
  enabled: boolean;
  toggle: () => void;
}

const EngineViewContext = createContext<EngineViewContextType>({
  enabled: false,
  toggle: () => {},
});

const ENGINE_VIEW_KEY = "ditto-engine-view";

export function EngineViewProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(ENGINE_VIEW_KEY);
    if (stored === "true") setEnabled(true);
  }, []);

  // Keyboard shortcut: Ctrl+Shift+E
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "E") {
        e.preventDefault();
        setEnabled((prev) => {
          const next = !prev;
          localStorage.setItem(ENGINE_VIEW_KEY, String(next));
          return next;
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(ENGINE_VIEW_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <EngineViewContext.Provider value={{ enabled, toggle }}>
      {children}
    </EngineViewContext.Provider>
  );
}

export function useEngineView() {
  return useContext(EngineViewContext);
}

// ============================================================
// Engine View Components
// ============================================================

interface EngineMetadata {
  model?: string | null;
  costCents?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  confidenceLevel?: string | null;
  executorType?: string;
  integrationService?: string | null;
}

/**
 * Compact engine metadata footer for feed cards.
 * Only renders when Engine View is enabled.
 */
export function EngineFooter({ metadata }: { metadata: EngineMetadata }) {
  const { enabled } = useEngineView();
  if (!enabled) return null;

  const duration =
    metadata.startedAt && metadata.completedAt
      ? Math.round(
          (new Date(metadata.completedAt).getTime() -
            new Date(metadata.startedAt).getTime()) /
            1000,
        )
      : null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-xs text-text-muted font-mono">
      {metadata.executorType && <span>{metadata.executorType}</span>}
      {metadata.model && <span>{metadata.model}</span>}
      {metadata.confidenceLevel && (
        <span className="capitalize">{metadata.confidenceLevel}</span>
      )}
      {duration !== null && <span>{duration}s</span>}
      {metadata.costCents != null && metadata.costCents > 0 && (
        <span>${(metadata.costCents / 100).toFixed(3)}</span>
      )}
      {metadata.integrationService && (
        <span>via {metadata.integrationService}</span>
      )}
    </div>
  );
}

/**
 * Full execution trace for process detail.
 * Only renders when Engine View is enabled.
 */
export function EngineTrace({
  steps,
}: {
  steps: Array<{
    stepId: string;
    status: string;
    executorType: string;
    model: string | null;
    costCents: number | null;
    startedAt: string | null;
    completedAt: string | null;
    confidenceLevel: string | null;
  }>;
}) {
  const { enabled } = useEngineView();
  if (!enabled) return null;

  return (
    <div className="mt-4 border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-surface border-b border-border">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Engine Trace
        </span>
      </div>
      <div className="divide-y divide-border">
        {steps.map((step) => {
          const duration =
            step.startedAt && step.completedAt
              ? Math.round(
                  (new Date(step.completedAt).getTime() -
                    new Date(step.startedAt).getTime()) /
                    1000,
                )
              : null;

          return (
            <div
              key={step.stepId}
              className="px-4 py-2 flex items-center gap-3 text-xs font-mono text-text-muted"
            >
              <span className="text-text-secondary font-sans">
                {step.stepId}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs ${
                  step.status === "approved"
                    ? "bg-positive/10 text-positive"
                    : step.status === "failed"
                      ? "bg-negative/10 text-negative"
                      : step.status === "waiting_review"
                        ? "bg-caution/10 text-caution"
                        : "bg-surface text-text-muted"
                }`}
              >
                {step.status}
              </span>
              <span>{step.executorType}</span>
              {step.model && <span>{step.model}</span>}
              {step.confidenceLevel && (
                <span className="capitalize">{step.confidenceLevel}</span>
              )}
              {duration !== null && <span>{duration}s</span>}
              {step.costCents != null && step.costCents > 0 && (
                <span>${(step.costCents / 100).toFixed(3)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
