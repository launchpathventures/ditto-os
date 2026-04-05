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
 * Provenance: P00 workspace shell prototype, P13 prototype (converged design),
 * workspace-layout-redesign-ux.md
 */

import { useState, useCallback } from "react";
import { useProcessDetail } from "@/lib/process-query";
import { ProcessBuilderPanel } from "./process-builder-panel";
import { ArtifactViewerPanel } from "./artifact-viewer-panel";
import type { ContentBlock } from "@/lib/engine";
import { BlockList } from "../blocks/block-registry";
import { DotParticles } from "@/app/setup/dot-particles";

// Context types that the panel reacts to
export type PanelContext =
  | { type: "feed" }
  | { type: "process"; processId: string }
  | { type: "process-builder"; yaml: string; slug?: string }
  | { type: "process_run"; runId: string; processSlug: string }
  | { type: "artifact-review"; runId: string; processId: string }
  | { type: "briefing"; data: Record<string, unknown> }
  | { type: "blocks"; blocks: ContentBlock[]; title?: string }
  | { type: "empty" };

interface RightPanelProps {
  context?: PanelContext;
  panelOverride?: PanelContext | null;
  defaultCollapsed?: boolean;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

export function RightPanel({
  context = { type: "feed" },
  panelOverride,
  defaultCollapsed = false,
  onAction,
}: RightPanelProps) {
  // Tool-driven override takes priority over centre-view-reactive context
  const activeContext = panelOverride ?? context;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  if (collapsed) {
    return (
      <div
        className="flex-shrink-0 border-l border-border bg-surface flex flex-col items-center py-4"
        style={{ width: 56 }}
      >
        <button
          onClick={toggle}
          className="w-7 h-7 rounded-sm flex items-center justify-center hover:bg-surface-raised transition-colors"
          title="Show Ditto's thinking"
        >
          <DotParticles size={24} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-80 flex-shrink-0 border-l border-border bg-surface flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: "20px 20px 12px" }}
      >
        <div className="flex items-center gap-2">
          <DotParticles size={24} />
          <span style={{ fontSize: 14, fontWeight: 600 }} className="text-text-primary">
            Ditto
          </span>
        </div>
        <button
          onClick={toggle}
          className="flex items-center justify-center text-text-muted hover:bg-surface-raised transition-colors rounded-sm"
          style={{ width: 28, height: 28, background: "transparent" }}
          title="Collapse"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Scroll area */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: "0 20px 20px" }}
      >
        <div className="space-y-5">
          {activeContext.type === "feed" && <FeedContext />}
          {activeContext.type === "process" && (
            <ProcessContext processId={activeContext.processId} />
          )}
          {activeContext.type === "process-builder" && (
            <ProcessBuilderPanel yaml={activeContext.yaml} slug={activeContext.slug} />
          )}
          {activeContext.type === "process_run" && (
            <ProcessRunContext runId={activeContext.runId} processSlug={activeContext.processSlug} />
          )}
          {activeContext.type === "artifact-review" && (
            <ArtifactViewerPanel runId={activeContext.runId} processId={activeContext.processId} />
          )}
          {activeContext.type === "briefing" && (
            <BriefingContext data={activeContext.data} onAction={onAction} />
          )}
          {activeContext.type === "blocks" && (
            <BlocksContext blocks={activeContext.blocks} title={activeContext.title} onAction={onAction} />
          )}
          {activeContext.type === "empty" && <DefaultContext />}
        </div>
      </div>
    </div>
  );
}

/** Feed view context — morning thoughts + general suggestions */
function FeedContext() {
  return (
    <div
      className="flex items-center justify-center text-text-muted text-center"
      style={{ marginTop: 40 }}
    >
      <p style={{ fontSize: 14, maxWidth: 240, lineHeight: "1.5" }}>
        Contextual analysis, suggestions, and process intelligence appear here as you work.
      </p>
    </div>
  );
}

/** Process detail context — trust evidence, what Ditto checked, confidence */
function ProcessContext({ processId }: { processId: string }) {
  const { data: process, isLoading } = useProcessDetail(processId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-4 bg-surface-raised animate-pulse rounded w-3/4" />
        <div className="h-4 bg-surface-raised animate-pulse rounded w-1/2" />
        <div className="h-20 bg-surface-raised animate-pulse rounded" />
      </div>
    );
  }

  if (!process) return <DefaultContext />;

  const { trustState } = process;
  const approvalPct = Math.round(trustState.approvalRate * 100);

  return (
    <>
      {/* Ditto's analysis */}
      <div className="text-text-secondary leading-relaxed" style={{ fontSize: 14 }}>
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
          <SectionTitle>Track record</SectionTitle>
          <div className="space-y-1.5 mt-2">
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
        <SectionTitle>My confidence</SectionTitle>
        <div className="h-2 bg-surface-raised rounded-full overflow-hidden mt-2">
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
        <p className="text-text-muted mt-1" style={{ fontSize: 12 }}>
          Based on {trustState.runsInWindow} recent runs
        </p>
      </div>

      {/* Steps */}
      {process.steps.length > 0 && (
        <div>
          <SectionTitle>How it works</SectionTitle>
          <div className="space-y-1 mt-2">
            {process.steps.slice(0, 5).map((step, i) => (
              <p key={step.id} className="text-text-muted" style={{ fontSize: 12 }}>
                {i + 1}. {step.name}
              </p>
            ))}
            {process.steps.length > 5 && (
              <p className="text-text-muted" style={{ fontSize: 12 }}>
                +{process.steps.length - 5} more steps
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Process run context — shows pipeline run detail in the right panel (Brief 053) */
function ProcessRunContext({ runId, processSlug }: { runId: string; processSlug: string }) {
  return (
    <>
      <SectionTitle>Pipeline Run</SectionTitle>
      <div className="space-y-3 mt-2">
        <div className="text-text-secondary" style={{ fontSize: 14 }}>
          <p className="font-medium text-text-primary">{processSlug}</p>
          <p className="text-text-muted mt-1" style={{ fontSize: 12 }}>Run: {runId.slice(0, 8)}...</p>
          <p className="mt-2">
            Pipeline is running. Progress updates appear in the conversation and Today view.
          </p>
        </div>
      </div>
    </>
  );
}

/** Blocks context — renders ContentBlock[] from the Self's composition logic */
function BlocksContext({
  blocks,
  title,
  onAction,
}: {
  blocks: ContentBlock[];
  title?: string;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}) {
  return (
    <>
      {title && <SectionHeading>{title}</SectionHeading>}
      <BlockList blocks={blocks} onAction={onAction} />
    </>
  );
}

/** Default/empty context */
function DefaultContext() {
  return (
    <div
      className="flex items-center justify-center text-text-muted text-center"
      style={{ marginTop: 40 }}
    >
      <p style={{ fontSize: 14, maxWidth: 240, lineHeight: "1.5" }}>
        Contextual analysis, suggestions, and process intelligence appear here as you work.
      </p>
    </div>
  );
}

/** Briefing context — renders proactive engine briefing data (Brief 043) */
function BriefingContext({
  data,
  onAction,
}: {
  data: Record<string, unknown>;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}) {
  const focus = data.focus as string | undefined;
  const attention = data.attention as string[] | undefined;
  const upcoming = data.upcoming as string[] | undefined;
  const risks = data.risks as string[] | undefined;
  const suggestions = data.suggestions as string[] | undefined;

  return (
    <>
      {focus && (
        <div className="text-text-secondary leading-relaxed" style={{ fontSize: 14 }}>
          <p>{focus}</p>
        </div>
      )}

      {attention && attention.length > 0 && (
        <div>
          <SectionTitle>Needs attention</SectionTitle>
          <div className="space-y-1.5 mt-2">
            {attention.map((item, i) => (
              <div key={i} className="flex items-start gap-2" style={{ fontSize: 14 }}>
                <span className="text-caution flex-shrink-0 mt-0.5">!</span>
                <span className="text-text-secondary">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {upcoming && upcoming.length > 0 && (
        <div>
          <SectionTitle>Coming up</SectionTitle>
          <div className="space-y-1.5 mt-2">
            {upcoming.map((item, i) => (
              <div key={i} className="text-text-secondary" style={{ fontSize: 14 }}>{item}</div>
            ))}
          </div>
        </div>
      )}

      {risks && risks.length > 0 && (
        <div>
          <SectionTitle>Worth knowing</SectionTitle>
          <div className="space-y-2 mt-2">
            {risks.map((item, i) => (
              <SuggestionItem key={i} text={item} />
            ))}
          </div>
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div>
          <SectionTitle>Suggestions</SectionTitle>
          <div className="space-y-2 mt-2">
            {suggestions.map((item, i) => (
              <SuggestionItem key={i} text={item} onAction={onAction} index={i} />
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

// ── Shared primitives ──────────────────────────────────────────────────────────

/** Section heading: 14px, font-weight 600, text-text-primary */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-text-primary" style={{ fontSize: 14, fontWeight: 600 }}>
      {children}
    </p>
  );
}

/** Section title (uppercase label): 12px, font-weight 600, uppercase, letter-spacing, text-text-muted, border-bottom */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-text-muted border-b border-border pb-1"
      style={{
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </p>
  );
}

function CheckItem({ passed, label }: { passed: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 14 }}>
      <span
        className={`flex-shrink-0 text-xs ${passed ? "text-positive" : "text-caution"}`}
      >
        {passed ? "✓" : "!"}
      </span>
      <span className="text-text-secondary">{label}</span>
    </div>
  );
}

/** Suggestion block: bg-vivid-subtle, rounded-lg, with optional Accept/Dismiss buttons */
function SuggestionItem({
  text,
  onAction,
  index,
}: {
  text: string;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
  index?: number;
}) {
  const ts = Date.now();
  const idx = index ?? 0;
  return (
    <div
      className="bg-vivid-subtle rounded-lg"
      style={{ padding: "12px 16px" }}
    >
      <p
        className="text-vivid-deep uppercase mb-1"
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em" }}
      >
        Suggestion
      </p>
      <p className="text-text-secondary" style={{ fontSize: 13, lineHeight: "1.5" }}>
        {text}
      </p>
      {onAction && (
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onAction(`suggest-accept-${idx}-${ts}`, { suggestionType: "Briefing", content: text })}
            className="text-xs font-medium px-3 py-1 rounded-full bg-vivid text-white hover:bg-vivid/90 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => onAction(`suggest-dismiss-${idx}-${ts}`, { suggestionType: "Briefing", content: text })}
            className="text-xs font-medium px-3 py-1 rounded-full text-text-secondary hover:bg-surface-secondary transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
