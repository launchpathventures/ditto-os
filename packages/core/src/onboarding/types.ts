/**
 * @ditto/core — Project Onboarding analyser type definitions (Brief 226).
 *
 * Intermediate detection shapes consumed by the analyser handlers in the
 * Ditto product layer (`src/engine/onboarding/`). These types are portable —
 * any consumer running a read-only repo analyser would produce the same
 * shape, so they live in core.
 *
 * The richer user-facing report shape (`AnalyserReportBlock`) lives next
 * to the rest of the ContentBlock taxonomy in `content-blocks.ts`; this
 * module covers the pre-render intermediate shapes.
 */

// ============================================================
// Build system detection
// ============================================================

/** Build-system flavours the detector knows about. Multi-stack repos
 *  return more than one entry (e.g. `node` + `python` for a polyglot). */
export type BuildSystemKind =
  | "node"
  | "python"
  | "ruby"
  | "rust"
  | "go"
  | "php"
  | "java"
  | "unknown";

export interface BuildSystemDetection {
  kind: BuildSystemKind;
  /** Lockfile / config file that backed the detection (relative to repo root). */
  evidence: string;
  /** For node: pnpm | npm | yarn | bun. For python: poetry | pip | uv. */
  packageManager?: string;
}

// ============================================================
// Test framework detection
// ============================================================

export type TestFrameworkKind =
  | "vitest"
  | "jest"
  | "playwright"
  | "pytest"
  | "rspec"
  | "cargo-test"
  | "go-test"
  | "phpunit"
  | "junit"
  | "unknown";

export interface TestFrameworkDetection {
  framework: TestFrameworkKind;
  evidence: string;
  /** Approximate count of test files when cheaply discoverable. */
  approxFileCount?: number;
}

// ============================================================
// CI detection
// ============================================================

export type CIProvider =
  | "github-actions"
  | "gitlab-ci"
  | "circleci"
  | "azure-pipelines"
  | "jenkins"
  | "none";

export interface CIDetection {
  provider: CIProvider;
  /** Workflow / config file paths that backed the detection. */
  workflowPaths: string[];
  /** Optional last-known status when accessible (GitHub Actions API).
   *  Brief 226 §Constraints — depth=1 limit is explicit; commit-history-aware
   *  detectors are out of scope for this brief. */
  lastKnownStatus?: "passing" | "failing" | "unknown";
}

// ============================================================
// Existing-harness detection
// ============================================================

export type HarnessFlavour =
  | "claude-code"
  | "cursor"
  | "agents-md"
  | "catalyst"
  | "ditto"
  | "claude-md"
  | "none";

export interface HarnessDetection {
  /** All harness flavours present (a repo can have multiple at once). */
  flavours: HarnessFlavour[];
  /** Marker files / dirs that backed the detection. */
  markers: string[];
}

// ============================================================
// Aggregate stack signals — passed to scoring + recommendation
// ============================================================

export interface StackSignals {
  buildSystems: BuildSystemDetection[];
  testFrameworks: TestFrameworkDetection[];
  ci: CIDetection;
  harness: HarnessDetection;
  /** Approximate file count + total bytes from clone-and-scan. */
  fileCount?: number;
  totalBytes?: number;
  /** Cheap repo properties from clone-and-scan. */
  defaultBranch?: string;
}

// ============================================================
// Retrofit types (Brief 228 — sub-brief #3a of Brief 224)
// ============================================================

/** Action determined by the plan generator for each `.ditto/` file.
 *  - `'create'`: file is new (not yet in the target repo's `.ditto/`).
 *  - `'update'`: file exists with different content; Ditto would overwrite.
 *  - `'unchanged'`: file's current content matches the plan exactly; skipped from dispatch.
 */
export type RetrofitFileAction = "create" | "update" | "unchanged";

/** A single file in a retrofit plan. */
export interface RetrofitFile {
  /** Stable identifier for this file in the plan (uuid). Used for per-file
   *  approval set in Brief 229's supervised tier. */
  id: string;
  /** Repo-relative path, e.g. `.ditto/role-contracts/dev-builder.md`. */
  path: string;
  /** Full file content the runner will write. */
  content: string;
  /** sha256 hex of `content` — Brief 228 §Constraints "Re-runnable retrofit"
   *  uses this to detect user-touched files between retrofits. */
  contentHash: string;
  /** First N bytes of content for the renderer's preview row. */
  contentPreview: string;
  /** Total byte size of `content`. */
  byteSize: number;
  /** What this file does relative to the prior retrofit's state. */
  action: RetrofitFileAction;
}

/** A retrofit plan — produced by `generate-plan`, consumed by `surface-plan`,
 *  `dispatch-write`, `verify-commit`. */
export interface RetrofitPlan {
  /** Stable identifier for this plan (uuid). Mirrors `RetrofitPlanBlock.planId`. */
  planId: string;
  /** FK to projects.id. */
  projectId: string;
  /** The processRunId that produced this plan (for cross-reference). */
  processRunId: string;
  /** All planned files. `unchanged` entries are kept here for legibility but
   *  are excluded from the dispatch payload. */
  files: RetrofitFile[];
  /** ISO-8601 timestamp when the plan was generated. */
  generatedAt: string;
  /** Schema version of the `.ditto/` directory shape; written into
   *  `.ditto/version.txt`. ADR-043 finalises this. */
  ditoSchemaVersion: number;
  /** Default branch the runner will commit to (from `projects.defaultBranch`
   *  or analyser report fallback). */
  branch: string;
}

/** The structured payload sent to a runner via the workItem `context` field.
 *  The runner-side agent reads this from its workItem context, performs the
 *  writes through its native git tooling, and returns
 *  `{ commitSha, actuallyChangedFiles, skippedFiles? }`.
 *
 *  Brief 228 §Constraints "Retrofit prompt template" — the prompt itself
 *  references this payload BY NAME (does NOT inline the file contents). */
export interface RetrofitDispatchPayload {
  /** `chore(ditto): retrofit substrate v<version> (run <processRunId>)`. */
  commitMessage: string;
  /** The files to write (only `'create'` + `'update'` + non-skipped — the
   *  `dispatch-write` handler filters before composing the payload). */
  files: Array<{
    path: string;
    content: string;
    contentHash: string;
    action: RetrofitFileAction;
  }>;
  /** Default branch to commit + push to. */
  branch: string;
  /** One-paragraph user-facing instruction the runner shows in its log. */
  instructions: string;
  /** The processRunId for cross-reference back to harness_decisions. */
  processRunId: string;
}
