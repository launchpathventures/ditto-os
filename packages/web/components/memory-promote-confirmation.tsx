"use client";

/**
 * MemoryPromoteConfirmation — the confirmation sheet for promoting a memory
 * to multi-project / self-scope (Brief 227, Designer spec §"The Promote
 * Confirmation Sheet").
 *
 * Composed from `block.evidence` + button rows — NOT a new ContentBlock type
 * per Designer spec + Brief 072 composition-over-invention discipline.
 *
 * States: idle / loading / success / error / restrict-picker-open
 *
 * Mobile: bottom-sheet behaviour is up to the caller (this component renders
 * inline content; bottom-sheet wrapping is the caller's responsibility).
 */

import { useState } from "react";

export type ProjectChoice = {
  id: string;
  slug: string;
  name: string;
};

export type PromoteConfirmationState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; appliedTo: string[] }
  | { kind: "error"; message: string };

export interface MemoryPromoteConfirmationProps {
  /** ID of the memory being promoted (passed back to onConfirm). */
  memoryId: string;
  /** Memory content shown for last-look review. */
  memoryContent: string;
  /** Currently-applicable source project (for the "Currently applies to" row). */
  sourceProjectSlug: string;
  /**
   * All currently-active projects available to apply this memory to.
   * Source project must be present (it will be locked in the picker).
   */
  availableProjects: ProjectChoice[];
  /** Promote action callback. */
  onConfirm: (
    memoryId: string,
    scope: "all" | { projectIds: string[] },
  ) => Promise<void>;
  /** Cancel callback (close the sheet). */
  onCancel?: () => void;
  /** Initial state — defaults to "idle". Tests can pass other states for snapshot rendering. */
  initialState?: PromoteConfirmationState;
  /** When true, render the restrict-picker open from start (test convenience). */
  initialRestrictOpen?: boolean;
}

export function MemoryPromoteConfirmation(props: MemoryPromoteConfirmationProps) {
  const [state, setState] = useState<PromoteConfirmationState>(
    props.initialState ?? { kind: "idle" },
  );
  const [restrictOpen, setRestrictOpen] = useState(props.initialRestrictOpen ?? false);
  const [picked, setPicked] = useState<Set<string>>(() => {
    // source project pre-checked + locked. Guard against empty
    // availableProjects — never seed an empty-string id (would land in
    // appliedProjectIds as a phantom project that no run can match).
    const sourceId =
      props.availableProjects.find((p) => p.slug === props.sourceProjectSlug)?.id
      ?? props.availableProjects[0]?.id;
    return sourceId ? new Set([sourceId]) : new Set();
  });

  const otherProjects = props.availableProjects.filter(
    (p) => p.slug !== props.sourceProjectSlug,
  );
  const sourceProjectId = props.availableProjects.find(
    (p) => p.slug === props.sourceProjectSlug,
  )?.id;

  const allCount = props.availableProjects.length;

  async function handlePromoteAll() {
    setState({ kind: "loading" });
    try {
      await props.onConfirm(props.memoryId, "all");
      setState({
        kind: "success",
        appliedTo: props.availableProjects.map((p) => p.slug),
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handlePromoteRestricted() {
    setState({ kind: "loading" });
    try {
      // Defence-in-depth: filter empty strings + dedupe in case useState seeded
      // a sentinel before availableProjects loaded.
      const projectIds = Array.from(picked).filter((id) => id !== "");
      if (projectIds.length === 0) {
        setState({
          kind: "error",
          message: "Pick at least one project before promoting.",
        });
        return;
      }
      await props.onConfirm(props.memoryId, { projectIds });
      const slugsByPickedId = new Set(picked);
      setState({
        kind: "success",
        appliedTo: props.availableProjects
          .filter((p) => slugsByPickedId.has(p.id))
          .map((p) => p.slug),
      });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function togglePicked(projectId: string) {
    if (projectId === sourceProjectId) return; // locked
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  if (state.kind === "success") {
    return (
      <div
        data-state="success"
        className="rounded-lg border border-[#D1F4E1] bg-vivid-subtle p-4"
      >
        <p className="text-sm text-vivid-deep font-medium">
          Promoted. The memory now applies on {state.appliedTo.join(" + ")}.
        </p>
      </div>
    );
  }

  return (
    <div
      data-state={state.kind}
      className="rounded-lg border border-border bg-surface p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold">Promote this memory to all projects</h3>

      {/* alex-line reversibility note */}
      <p className="text-xs text-text-secondary italic">
        A: This memory will start applying when I work on these other projects too.
        You can demote later.
      </p>

      {/* block.evidence — affected projects list */}
      <div className="rounded border border-border bg-surface-subtle p-3 space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-text-secondary">Currently applies to</span>
          <span className="font-mono">Project · {props.sourceProjectSlug}</span>
        </div>
        {otherProjects.map((p) => (
          <div className="flex justify-between" key={p.id}>
            <span className="text-text-secondary">Will also apply to</span>
            <span className="font-mono">{p.slug}</span>
          </div>
        ))}
      </div>

      {/* memory content (last-look review) */}
      <blockquote className="border-l-2 border-vivid pl-3 text-sm italic">
        {props.memoryContent}
      </blockquote>

      {/* restrict-picker (open state) */}
      {restrictOpen && (
        <div
          data-testid="restrict-picker"
          className="rounded border border-border p-3 space-y-2"
        >
          <p className="text-xs font-medium">Pick projects to apply to</p>
          <ul className="space-y-1">
            {props.availableProjects.map((p) => {
              const isLocked = p.id === sourceProjectId;
              const isChecked = picked.has(p.id);
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={p.slug}
                    checked={isChecked}
                    disabled={isLocked}
                    onChange={() => togglePicked(p.id)}
                  />
                  <span className={isLocked ? "text-text-secondary" : ""}>
                    {p.slug}
                    {isLocked && (
                      <span className="ml-2 text-xs text-text-secondary">
                        (source — locked)
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* error state */}
      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded border border-negative/30 bg-negative/10 p-2 text-xs text-negative"
        >
          Couldn&apos;t promote — {state.message}
        </div>
      )}

      {/* action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!restrictOpen ? (
          <>
            <button
              type="button"
              onClick={handlePromoteAll}
              disabled={state.kind === "loading"}
              className="px-3 py-1.5 rounded bg-vivid text-white text-sm font-medium disabled:opacity-50"
            >
              {state.kind === "loading" ? "Promoting…" : `Promote to all ${allCount}`}
            </button>
            <button
              type="button"
              onClick={props.onCancel}
              className="px-3 py-1.5 rounded border border-border text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setRestrictOpen(true)}
              className="px-3 py-1.5 text-sm text-vivid hover:underline"
            >
              Restrict to specific…
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handlePromoteRestricted}
              disabled={state.kind === "loading" || picked.size === 0}
              className="px-3 py-1.5 rounded bg-vivid text-white text-sm font-medium disabled:opacity-50"
            >
              {state.kind === "loading"
                ? "Promoting…"
                : `Promote to ${picked.size} project${picked.size === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => setRestrictOpen(false)}
              className="px-3 py-1.5 rounded border border-border text-sm"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
