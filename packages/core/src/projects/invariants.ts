/**
 * Projects — pure state-transition invariants.
 *
 * Brief 215 §"What Changes" / file `projects/invariants.ts`. Brief 223's
 * `PATCH /api/v1/projects/:slug` handler calls `validateStatusTransition`
 * before persisting.
 *
 * Engine-core only — pure, no DB calls. Brief 223 (the CRUD layer) supplies
 * snapshots of the project + its enabled project_runners.
 */

import { type RunnerKind } from "../runner/index.js";

export const projectStatusValues = [
  "analysing",
  "active",
  "paused",
  "archived",
] as const;
export type ProjectStatus = (typeof projectStatusValues)[number];

export interface ProjectInvariantSnapshot {
  defaultRunnerKind: RunnerKind | null;
  /**
   * Set of `(kind)` for project_runners rows where `enabled = true`.
   * The caller should grep their project_runners table for the project and
   * pass through the kinds that are enabled.
   */
  enabledRunnerKinds: ReadonlySet<RunnerKind>;
}

export type InvariantErrorCode =
  | "needs-default-runner"
  | "default-runner-not-enabled"
  | "archive-is-one-way"
  | "no-such-transition";

export interface InvariantError {
  code: InvariantErrorCode;
  message: string;
  from: ProjectStatus;
  to: ProjectStatus;
}

export type InvariantResult =
  | { ok: true }
  | { ok: false; error: InvariantError };

/**
 * Validate `current → next` for a project. Pure — receives snapshots, no DB.
 *
 * Rules:
 * - `analysing → active` requires `defaultRunnerKind` set AND that kind has
 *   an enabled project_runners row.
 * - `archived → *` is rejected (archive is one-way).
 * - `active → paused`, `paused → active`, `active → archived`, etc. are
 *   permitted (subject to the above rules).
 * - Any transition to the same state is allowed (no-op).
 */
export function validateStatusTransition(
  current: ProjectStatus,
  next: ProjectStatus,
  snapshot: ProjectInvariantSnapshot
): InvariantResult {
  if (current === next) return { ok: true };

  // Archive is one-way. No transition out of archived is permitted.
  if (current === "archived") {
    return {
      ok: false,
      error: {
        code: "archive-is-one-way",
        message:
          "Cannot transition out of `archived`. Create a new project to resume work.",
        from: current,
        to: next,
      },
    };
  }

  // Going to active requires: defaultRunnerKind set + that kind enabled.
  if (next === "active") {
    if (!snapshot.defaultRunnerKind) {
      return {
        ok: false,
        error: {
          code: "needs-default-runner",
          message:
            "Cannot transition to `active` without a `defaultRunnerKind`. Pick a runner first.",
          from: current,
          to: next,
        },
      };
    }
    if (!snapshot.enabledRunnerKinds.has(snapshot.defaultRunnerKind)) {
      return {
        ok: false,
        error: {
          code: "default-runner-not-enabled",
          message:
            `Default runner '${snapshot.defaultRunnerKind}' has no enabled project_runners row. Configure and enable the runner before activating.`,
          from: current,
          to: next,
        },
      };
    }
  }

  // analysing → paused is unusual — `paused` implies the project was active.
  // We permit it (the user may pause an in-flight onboarding) but no other
  // transitions besides those above and the implicit allow-all default.
  return { ok: true };
}
