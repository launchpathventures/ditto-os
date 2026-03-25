"use client";

/**
 * Ditto — Right Panel (Contextual Intelligence)
 *
 * NOT a chat window. Shows Ditto's thinking for the current context:
 * - Feed view → morning thoughts, suggestions
 * - Review item → what Ditto checked, confidence, provenance
 * - Process → trust evidence, performance data
 * - Default → general guidance, process health
 *
 * Redesign AC1: Right column shows contextual intelligence, not chat.
 * Redesign AC2: Content is reactive to center panel view.
 * Redesign AC12: Sensible default state.
 * Redesign AC13: Reactive states defined.
 *
 * Provenance: P13 prototype (converged design), workspace-layout-redesign-ux.md
 */

import { useState, useCallback } from "react";
import { useProcessDetail } from "@/lib/process-query";
import { ProcessBuilderPanel } from "./process-builder-panel";
import { ArtifactViewerPanel } from "./artifact-viewer-panel";

// Context types that the panel reacts to
export type PanelContext =
  | { type: "feed" }
  | { type: "process"; processId: string }
  | { type: "process-builder"; yaml: string; slug?: string }
  | { type: "artifact-review"; runId: string; processId: string }
  | { type: "briefing"; data: Record<string, unknown> }
  | { type: "empty" };

interface RightPanelProps {
  context?: PanelContext;
  panelOverride?: PanelContext | null;
  defaultCollapsed?: boolean;
}

export function RightPanel({
  context = { type: "feed" },
  panelOverride,
  defaultCollapsed = false,
}: RightPanelProps) {
  // Tool-driven override takes priority over centre-view-reactive context
  const activeContext = panelOverride ?? context;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  if (collapsed) {
    return (
      <div className="w-12 flex-shrink-0 border-l border-border bg-surface flex flex-col items-center py-4">
        <button
          onClick={toggle}
          className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center hover:bg-accent/20 transition-colors"
          title="Show Ditto's thinking"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-accent" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-72 flex-shrink-0 border-l border-border bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full bg-accent"
            style={{ animation: "pulse-dot 3s ease-in-out infinite" }}
          />
          <span className="text-sm font-medium text-text-primary">Ditto</span>
          <span className="text-xs text-text-muted">Watching your work</span>
        </div>
        <button
          onClick={toggle}
          className="text-text-muted hover:text-text-primary transition-colors text-sm"
          title="Collapse"
        >
          ×
        </button>
      </div>

      {/* Contextual content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {activeContext.type === "feed" && <FeedContext />}
        {activeContext.type === "process" && (
          <ProcessContext processId={activeContext.processId} />
        )}
        {activeContext.type === "process-builder" && (
          <ProcessBuilderPanel yaml={activeContext.yaml} slug={activeContext.slug} />
        )}
        {activeContext.type === "artifact-review" && (
          <ArtifactViewerPanel runId={activeContext.runId} processId={activeContext.processId} />
        )}
        {activeContext.type === "briefing" && (
          <BriefingContext data={activeContext.data} />
        )}
        {activeContext.type === "empty" && <DefaultContext />}
      </div>
    </div>
  );
}

/** Feed view context — morning thoughts + general suggestions */
function FeedContext() {
  return (
    <>
      {/* Ditto's thinking */}
      <div className="text-sm text-text-secondary leading-relaxed">
        <p>
          Everything looks good this morning. No urgent items need your
          attention right now.
        </p>
      </div>

      {/* Suggestions */}
      <div>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Suggestions
        </p>
        <div className="space-y-2">
          <SuggestionItem text="Review any items in your feed that need attention" />
          <SuggestionItem text="Check how your recurring processes are doing" />
        </div>
      </div>
    </>
  );
}

/** Process detail context — trust evidence, what Ditto checked, confidence */
function ProcessContext({ processId }: { processId: string }) {
  const { data: process, isLoading } = useProcessDetail(processId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-4 bg-surface animate-pulse rounded w-3/4" />
        <div className="h-4 bg-surface animate-pulse rounded w-1/2" />
        <div className="h-20 bg-surface animate-pulse rounded" />
      </div>
    );
  }

  if (!process) return <DefaultContext />;

  const { trustState } = process;
  const approvalPct = Math.round(trustState.approvalRate * 100);

  return (
    <>
      {/* Ditto's analysis */}
      <div className="text-sm text-text-secondary leading-relaxed">
        <p>
          {trustState.runsInWindow === 0
            ? `${process.name} hasn't run yet. I'll show you the first output for review.`
            : approvalPct >= 90
              ? `${process.name} is running well — ${approvalPct}% approved clean.`
              : approvalPct >= 70
                ? `${process.name} is mostly good, but I'm still making some mistakes (${approvalPct}% clean).`
                : `${process.name} needs work — only ${approvalPct}% approved clean. Your corrections are helping me improve.`}
        </p>
      </div>

      {/* What I've checked */}
      {trustState.runsInWindow > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Track record
          </p>
          <div className="space-y-1.5">
            <CheckItem
              passed={true}
              label={`${trustState.approvals} approved without changes`}
            />
            {trustState.edits > 0 && (
              <CheckItem
                passed={false}
                label={`${trustState.edits} needed your corrections`}
              />
            )}
            {trustState.rejections > 0 && (
              <CheckItem
                passed={false}
                label={`${trustState.rejections} sent back`}
              />
            )}
            <CheckItem
              passed={trustState.trend !== "declining"}
              label={
                trustState.trend === "improving"
                  ? "Quality improving"
                  : trustState.trend === "stable"
                    ? "Quality steady"
                    : "Quality dipping — watching this"
              }
            />
          </div>
        </div>
      )}

      {/* Confidence */}
      <div>
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          My confidence
        </p>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              approvalPct >= 90
                ? "bg-positive"
                : approvalPct >= 70
                  ? "bg-caution"
                  : "bg-negative"
            }`}
            style={{ width: `${Math.max(approvalPct, 5)}%` }}
          />
        </div>
        <p className="text-xs text-text-muted mt-1">
          Based on {trustState.runsInWindow} recent runs
        </p>
      </div>

      {/* Steps */}
      {process.steps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            How it works
          </p>
          <div className="space-y-1">
            {process.steps.slice(0, 5).map((step, i) => (
              <p key={step.id} className="text-xs text-text-muted">
                {i + 1}. {step.name}
              </p>
            ))}
            {process.steps.length > 5 && (
              <p className="text-xs text-text-muted">
                +{process.steps.length - 5} more steps
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Default/empty context */
function DefaultContext() {
  return (
    <div className="text-sm text-text-secondary leading-relaxed">
      <p>
        I&apos;m here. Ask me anything using the chat bar below, or click on
        something to see what I think about it.
      </p>
    </div>
  );
}

function CheckItem({ passed, label }: { passed: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`flex-shrink-0 text-xs ${passed ? "text-positive" : "text-caution"}`}
      >
        {passed ? "✓" : "!"}
      </span>
      <span className="text-text-secondary">{label}</span>
    </div>
  );
}

function SuggestionItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-accent flex-shrink-0 mt-0.5">→</span>
      <span className="text-text-secondary">{text}</span>
    </div>
  );
}

/** Briefing context — renders proactive engine briefing data (Brief 043) */
function BriefingContext({ data }: { data: Record<string, unknown> }) {
  const focus = data.focus as string | undefined;
  const attention = data.attention as string[] | undefined;
  const upcoming = data.upcoming as string[] | undefined;
  const risks = data.risks as string[] | undefined;
  const suggestions = data.suggestions as string[] | undefined;

  return (
    <>
      {focus && (
        <div className="text-sm text-text-secondary leading-relaxed">
          <p>{focus}</p>
        </div>
      )}

      {attention && attention.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Needs attention
          </p>
          <div className="space-y-1.5">
            {attention.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-caution flex-shrink-0 mt-0.5">!</span>
                <span className="text-text-secondary">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {upcoming && upcoming.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Coming up
          </p>
          <div className="space-y-1.5">
            {upcoming.map((item, i) => (
              <div key={i} className="text-sm text-text-secondary">{item}</div>
            ))}
          </div>
        </div>
      )}

      {risks && risks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Worth knowing
          </p>
          <div className="space-y-1.5">
            {risks.map((item, i) => (
              <SuggestionItem key={i} text={item} />
            ))}
          </div>
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Suggestions
          </p>
          <div className="space-y-2">
            {suggestions.map((item, i) => (
              <SuggestionItem key={i} text={item} />
            ))}
          </div>
        </div>
      )}

      {!focus && (!attention || attention.length === 0) && (
        <DefaultContext />
      )}
    </>
  );
}
