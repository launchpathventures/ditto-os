/**
 * Ditto — Content Block Types (ADR-021 Surface Protocol)
 *
 * The 22 typed content block types that flow from the Self to surfaces.
 * This is the single source of truth for the block vocabulary.
 *
 * Lives in the engine so the web package imports from engine (one-way
 * dependency per ADR-021 Section 5).
 *
 * Provenance: ADR-021 (Surface Protocol), Brief 045 (Component Protocol).
 */

// ============================================================
// Action definitions (shared across blocks)
// ============================================================

export interface ActionDef {
  id: string;
  label: string;
  style?: "primary" | "secondary" | "danger";
  payload?: Record<string, unknown>;
}

export interface InputFieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "confirm" | "credential";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

// ============================================================
// Content block types (discriminated union on `type`)
// ============================================================

/** TextBlock — Markdown text content */
export interface TextBlock {
  type: "text";
  text: string;
  /** Typography tier — hero-primary for greetings, hero-secondary for section headers */
  variant?: "hero-primary" | "hero-secondary" | "body";
}

/** ReviewCardBlock — Process output for inline review */
export interface ReviewCardBlock {
  type: "review_card";
  processRunId: string;
  stepName: string;
  outputText: string;
  confidence: "high" | "medium" | "low" | null;
  actions: ActionDef[];
  knowledgeUsed?: string[];
}

/** StatusCardBlock — Process or work item status.
 *  Optional `metadata` (Brief 221) carries typed subtype-specific data — e.g.,
 *  runner-dispatch state via `metadata.cardKind = "runnerDispatch"` plus runner
 *  fields. Renderer dispatches via a `Record<cardKind, RendererFn>` table keyed
 *  on `metadata.cardKind`; missing/unknown discriminator falls through to the
 *  generic template. Future subtypes (Brief 220 deploy-status etc.) register
 *  the same way — single-line per subtype, no cascading-if. */
export interface StatusCardBlock {
  type: "status_card";
  entityType: "process_run" | "work_item";
  entityId: string;
  title: string;
  status: string;
  details: Record<string, string>;
  metadata?: Record<string, unknown>;
}

/** ActionBlock — Choices for the user */
export interface ActionBlock {
  type: "actions";
  actions: ActionDef[];
}

/** InputRequestBlock — Structured input collection */
export interface InputRequestBlock {
  type: "input_request";
  requestId: string;
  prompt: string;
  fields: InputFieldDef[];
}

/** KnowledgeCitationBlock — Provenance strip
 *  Two use cases: memory provenance (original) and document citations (Brief 079).
 *  When document citation fields are present, renders with file/page/section detail.
 *  When memory fields are present (Brief 227), renders a project-scope pill.
 */
export interface KnowledgeCitationBlock {
  type: "knowledge_citation";
  label: string;
  sources: Array<{
    name: string;
    type: string;
    excerpt?: string;
    // Document citation fields (Brief 079) — optional, present for knowledge base citations
    page?: number;
    section?: string;
    lineRange?: [number, number];
    verbatimQuote?: string;
    matchConfidence?: number; // 0-1
    // Citation verification fields — progressive disclosure (Layer 1-3)
    chunkId?: string; // enables neighbor fetch (Layer 2)
    fullText?: string; // complete chunk text, not truncated (Layer 1)
    documentHash?: string; // enables document viewer (Layer 3)
    // Memory provenance + scope fields (Brief 227 — project memory scope)
    /** When present, indicates this source is a memory (drives scope-pill rendering). */
    memoryId?: string;
    /** Memory type: correction | preference | user_model | skill | context | solution. */
    memoryType?: string;
    /** Memory scope type — drives which scope pill renders. */
    memoryScopeType?: "process" | "self";
    /** For process-scope memories: the source process's project id (null = pre-project-era). */
    memoryProjectId?: string | null;
    /** Display label for the project pill (project name or slug). */
    memoryProjectSlug?: string | null;
    /**
     * For self-scope memories: list of project ids the memory applies to.
     * null = full self-scope (everywhere). Non-empty array = hybrid (`<N> projects` pill).
     */
    memoryAppliedProjectIds?: string[] | null;
  }>;
}

/** ProgressBlock — Execution progress
 *
 *  Entity-agnostic progress tracking (Brief 155). Follows the same
 *  `entityType` + `entityId` pattern as StatusCardBlock.
 *
 *  Entity types:
 *  - process_run: tracks steps within a single process run
 *  - goal_decomposition: tracks subtask identification + routing during orchestrator decomposition
 */
export interface ProgressBlock {
  type: "progress";
  entityType: "process_run" | "goal_decomposition";
  entityId: string;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  status: "running" | "paused" | "complete" | "waiting";
  /** Present when status is "waiting" — describes what the process is waiting for (Brief 158 MP-3.2) */
  waitFor?: {
    event: string;
    description: string;
    since?: string; // ISO timestamp when the wait began
  };
  /** Present when blocked on another process's output (Brief 162 MP-7.4) */
  blockedBy?: {
    processName: string;
    status: string;
    since?: string; // ISO timestamp when the blockage began
  };
}

/** FieldAnnotation — per-field metadata for data display (provenance, flags, format hints) */
export interface FieldAnnotation {
  provenance?: string;
  flag?: { level: "info" | "warning" | "error"; message: string };
  format?: "currency" | "percentage" | "date" | "confidence" | "badge";
}

/** DataBlock — Structured data display */
export interface DataBlock {
  type: "data";
  format: "key_value" | "table" | "list";
  title?: string;
  data: Record<string, unknown>[] | Record<string, string>;
  headers?: string[];
  /** Per-field annotations keyed by field name or column key */
  annotations?: Record<string, FieldAnnotation>;
}

/** ImageBlock — Visual content */
export interface ImageBlock {
  type: "image";
  url: string;
  alt: string;
  caption?: string;
}

/** CodeBlock — Syntax-highlighted code */
export interface CodeBlock {
  type: "code";
  language: string;
  content: string;
  filename?: string;
  diff?: boolean;
}

/** ReasoningTraceBlock — Decision reasoning */
export interface ReasoningTraceBlock {
  type: "reasoning_trace";
  title: string;
  steps: { label: string; detail: string }[];
  conclusion: string;
  confidence?: "high" | "medium" | "low";
}

/** SuggestionBlock — Proactive suggestion */
export interface SuggestionBlock {
  type: "suggestion";
  content: string;
  reasoning?: string;
  actions?: ActionDef[];
}

/** AlertBlock — Attention needed */
export interface AlertBlock {
  type: "alert";
  severity: "info" | "warning" | "error";
  title: string;
  content: string;
  actions?: ActionDef[];
}

/** KnowledgeSynthesisBlock — Onboarding: what the Self has learned (Brief 044) */
export interface KnowledgeSynthesisBlock {
  type: "knowledge_synthesis";
  entries: Array<{ dimension: string; content: string; confidence: number }>;
  totalDimensions: number;
}

/** InteractiveField — editable field definition for interactive blocks (Brief 072) */
export interface InteractiveField {
  name: string;
  label: string;
  type: "text" | "select" | "number" | "toggle";
  value?: string | number | boolean;
  options?: string[];  // for select type
  required?: boolean;
  placeholder?: string;
}

/** ProcessProposalBlock — Onboarding: proposed process in plain language (Brief 044)
 *  Extended with interactive editing support (Brief 072). */
export interface ProcessProposalBlock {
  type: "process_proposal";
  name: string;
  description?: string;
  steps: Array<{ name: string; description?: string; status: "done" | "current" | "pending" }>;
  interactive?: boolean;
  fields?: InteractiveField[];
  trigger?: string;
}

/** WorkItemFormBlock — structured work item creation form (Brief 072).
 *  Optional `formId` (Brief 221) is a server-stamped namespace identifier used
 *  by approve/reject API routes to discriminate which form-submission contract
 *  applies. Server-stamped at mint time; client cannot forge it because routes
 *  re-read the underlying `review_pages.contentBlocks` to validate. */
export interface WorkItemFormBlock {
  type: "work_item_form";
  fields: InteractiveField[];
  defaults?: Record<string, unknown>;
  formId?: string;
}

/** ConnectionSetupBlock — service connection initiation (Brief 072) */
export interface ConnectionSetupBlock {
  type: "connection_setup";
  serviceName: string;
  serviceDisplayName: string;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  errorMessage?: string;
  fields?: InteractiveField[];  // for credential-based connections
}

/** SendingIdentityChoiceBlock — identity choice for outreach (Brief 152) */
export interface SendingIdentityChoiceBlock {
  type: "sending_identity_choice";
  options: Array<{
    identity: "principal" | "user";
    label: string;
    description: string;
    requiresSetup?: boolean;
  }>;
}

/** TrustMilestoneBlock — Trust tier change celebration or explanation (Brief 160 MP-5.1/5.2)
 *  Provenance: Discourse TL3 milestone notifications (pattern), ADR-007 trust earning.
 *  Upgrades are celebrations with accept/reject actions. Downgrades are warm explanations.
 */
export interface TrustMilestoneBlock {
  type: "trust_milestone";
  milestoneType: "upgrade" | "downgrade";
  processName: string;
  fromTier: string;
  toTier: string;
  /** Evidence narrative: "95% accurate over 25 runs, correction rate dropped to 5%" */
  evidence: string;
  /** Warm explanation for downgrades: "the last few invoices had formatting issues" */
  explanation?: string;
  /** Accept/reject actions for upgrades; override action for downgrades */
  actions?: ActionDef[];
}

// ============================================================
// AnalyserReportBlock — project onboarding analyser surface (Brief 226)
// ============================================================

/** Finding — one row in strengths / watch-outs / missing (Brief 226). */
export interface Finding {
  /** User-facing one-liner. */
  text: string;
  /** Optional one-line citation backing the claim ("47 vitest specs, 82% coverage"). */
  evidence?: string;
  /** Optional default action Ditto would take if the user doesn't override. */
  defaultAction?: string;
}

/** GoldStandardMatch — nearest-neighbour from landscape corpus (Brief 226). */
export interface GoldStandardMatch {
  name: string;
  url: string;
  rationale: string;
}

/** RunnerRecommendation — analyser's pick + alternatives (Brief 226).
 *  The runner kind values mirror @ditto/core's RunnerKind enum but are
 *  carried as plain strings here to keep ContentBlock free of runtime
 *  schema imports — consumers validate against the enum at the seam. */
export interface RunnerRecommendation {
  kind: string;
  rationale: string;
  alternatives: Array<{ kind: string; rationale: string }>;
}

/** TrustTierRecommendation — analyser's pick + alternatives (Brief 226). */
export interface TrustTierRecommendation {
  tier: string;
  rationale: string;
  alternatives: Array<{ tier: string; rationale: string }>;
}

/** AnalyserReportBlock — Stage 3 of project onboarding (Brief 226).
 *  Renders as a sequence of design-package primitives in the chat-col:
 *  at-a-glance card → strengths/watch-outs/missing block.evidence cards →
 *  runner+tier block.decision pickers → CTA row.
 *  Shape per Designer spec docs/research/analyser-report-and-onboarding-flow-ux.md. */
export interface AnalyserReportBlock {
  type: "analyser_report";
  entityType: "work_item";
  /** workItems.id (existing FK convention from StatusCardBlock). */
  entityId: string;
  /** FK to projects.id. */
  projectId: string;
  atAGlance: {
    /** ["TypeScript", "pnpm", "next.js", ...] */
    stack: string[];
    /** ["main branch", "847 files", "12.3 MB"] */
    metadata: string[];
    /** User-facing descriptor — NOT a persona name. */
    looksLike: string;
    nearestNeighbours: GoldStandardMatch[];
  };
  strengths: Finding[];
  watchOuts: Finding[];
  missing: Finding[];
  recommendation: {
    runner: RunnerRecommendation;
    trustTier: TrustTierRecommendation;
  };
  /** Lifecycle of the report itself: draft (analyser still writing),
   *  submitted (ready for user), active (user has confirmed). */
  status: "draft" | "submitted" | "active";
  /** Detectors that failed (partial-success path — Brief 226 §AC #11).
   *  When non-empty, the renderer surfaces an info AlertBlock alongside the
   *  available findings. */
  detectorErrors?: Array<{ detector: string; message: string }>;
}

// ============================================================
// RetrofitPlanBlock — project retrofit substrate writer surface (Brief 228)
// ============================================================

/** Lifecycle status of a retrofit plan. Brief 228 ships 5 surfaceable states
 *  + a supervised-tier placeholder; Brief 229 fills in the per-file approval
 *  surface for `pending-review` + adds `partially-approved`.
 *
 *  - `pending-review` (Brief 228 placeholder; Brief 229 fills in): supervised
 *    tier; per-file approval UI lands in Brief 229. Brief 228 renders an
 *    explainer + escalation CTA.
 *  - `pending-sample-review`: spot_checked tier with sample-required;
 *    user reviews sampled subset via /review/[token]. Dispatch blocked.
 *  - `partially-approved` (Brief 229): user submitted a subset; awaiting
 *    dispatch. Brief 228 does not produce this status.
 *  - `dispatched`: runner is executing.
 *  - `committed`: success; commit SHA + URL displayed.
 *  - `rejected`: critical tier; informative error; user must hand-author.
 *  - `failed`: dispatch error; reason displayed.
 */
export type RetrofitPlanStatus =
  | "pending-review"
  | "pending-sample-review"
  | "partially-approved"
  | "dispatched"
  | "committed"
  | "rejected"
  | "failed";

/** RetrofitPlanBlock — the user-facing surface for a retrofit plan + its
 *  outcome. Renders inline in the chat-col on `/projects/:slug/onboarding`.
 *
 *  Brief 228 produces this block from the `surface-plan` step + updates it
 *  in `verify-commit`. Brief 229 extends with per-file approval rows.
 *
 *  Renderer composition (Brief 228 §Constraints "Renderer composition"):
 *  - block.plan — the planned `.ditto/` files render as a step list.
 *  - block.evidence — runner kind / trust tier / commit SHA / status metadata.
 *  - block.decision — the spot_checked sample yes/no surface (no .dopt.rec
 *    badge — the user is approving, not picking).
 */
export interface RetrofitPlanBlock {
  type: "retrofit_plan";
  /** Stable identifier (uuid) for this plan. */
  planId: string;
  /** FK to projects.id. */
  projectId: string;
  /** The processRunId that produced this plan (for cross-reference). */
  processRunId: string;
  /** All planned files; the renderer shows them as a step list with action icons. */
  files: Array<{
    /** Stable id for per-file approval (Brief 229). */
    id: string;
    /** Repo-relative path, e.g. `.ditto/role-contracts/dev-builder.md`. */
    path: string;
    /** First-N-bytes preview for the renderer (NOT the full content). */
    contentPreview: string;
    /** Total byte size of the full content. */
    byteSize: number;
    /** What this file does relative to the prior retrofit's state. */
    action: "create" | "update" | "unchanged";
  }>;
  /** Picked runner kind (mirrors RunnerKind enum but as plain string per
   *  AnalyserReportBlock convention). */
  runnerKind: string;
  /** Trust tier picked at confirm time (or re-run time). */
  trustTier: string;
  /** Lifecycle status. */
  status: RetrofitPlanStatus;
  /** Set on `committed` — runner-returned commit SHA. */
  commitSha?: string;
  /** Set on `committed` — diff link in the user's git host. */
  commitUrl?: string;
  /** Brief 228 §Constraints "Re-runnable retrofit / user-edit safety":
   *  paths of files that were excluded from the dispatch under autonomous
   *  tier because the user edited them between retrofits. */
  skippedUserTouchedFiles?: string[];
  /** spot_checked sampling: subset of `files[].id` that were sampled.
   *  When `status === 'pending-sample-review'` these are the files the user
   *  reviews on /review/[token]. Empty array when sampling not required. */
  sampledFileIds?: string[];
  /** Failure detail for `failed` / `rejected` statuses. */
  failureReason?: string;
}

/** FormSubmitAction — action type for form submissions (Brief 072) */
export interface FormSubmitAction {
  type: "form-submit";
  blockType: "process_proposal" | "work_item_form" | "connection_setup";
  values: Record<string, unknown>;
}

/** GatheringIndicatorBlock — Onboarding: subtle learning indicator (Brief 044) */
export interface GatheringIndicatorBlock {
  type: "gathering_indicator";
  message?: string;
}

/** ChecklistBlock — Items with done/pending/warning status
 *  Provenance: Hark (document upload checklist), GitHub issue task lists, Linear sub-issues.
 */
export interface ChecklistBlock {
  type: "checklist";
  title?: string;
  items: Array<{ label: string; status: "done" | "pending" | "warning"; detail?: string }>;
}

/** ChartBlock — Visual data: sparklines, donut charts, bar charts
 *  Provenance: Hark (donut charts), Performance Sparkline primitive (#4 in architecture.md),
 *  GitHub contribution graphs.
 */
export interface ChartBlock {
  type: "chart";
  chartType: "sparkline" | "donut" | "bar";
  title?: string;
  /** Sizing hint: inline (default, compact), small, medium, large (full-width) */
  size?: "inline" | "small" | "medium" | "large";
  data: {
    /** sparkline/bar: ordered numeric values */
    values?: number[];
    /** sparkline: overall trend direction */
    trend?: "up" | "down" | "flat";
    /** sparkline: axis label */
    label?: string;
    /** donut/bar: labeled segments with values */
    segments?: Array<{ label: string; value: number; color?: string }>;
  };
}

/** MetricBlock — Large numbers with labels and optional trends
 *  Provenance: Hark (application outcome metrics), Grafana stat panels, Datadog service metrics.
 */
export interface MetricBlock {
  type: "metric";
  metrics: Array<{
    value: string;
    label: string;
    trend?: "up" | "down" | "flat";
    sparkline?: number[];
  }>;
}

/** AnnotatedField — a field in a record with optional provenance and flags */
export interface AnnotatedField {
  label: string;
  value: string;
  provenance?: string;
  flag?: { level: "info" | "warning" | "error"; message: string };
}

/** PreCheck — automated validation result */
export interface PreCheck {
  label: string;
  passed: boolean;
  detail?: string;
}

/** RecordBlock — General structured record (review items, inbox items, tasks, roles, knowledge entries)
 *  Provenance: Hark (field-level validation), P33 (review primitives), P24 (inbox), P25 (tasks).
 *  Renders as typographic flow (no cards): title → subtitle → status → fields → checks → provenance → actions.
 *  Separated by border-top between records, optional border-left accent for process/department color.
 */
export interface RecordBlock {
  type: "record";
  title: string;
  subtitle?: string;
  status?: {
    label: string;
    variant: "positive" | "caution" | "negative" | "neutral" | "info" | "vivid";
  };
  confidence?: "high" | "medium" | "low" | null;
  fields?: AnnotatedField[];
  detail?: string;
  checks?: PreCheck[];
  provenance?: string[];
  actions?: ActionDef[];
  accent?: string;
}

/** TableColumn — column definition with optional format hint */
export interface TableColumn {
  key: string;
  label: string;
  format?: "text" | "currency" | "percentage" | "badge" | "confidence" | "checks";
}

/** TableRow — one row in an interactive table */
export interface TableRow {
  id: string;
  cells: Record<string, string | number>;
  status?: "flagged" | "approved" | "pending" | "error";
  actions?: ActionDef[];
}

/** InteractiveTableBlock — Table with per-row actions, selection, and batch operations.
 *  Provenance: P33 (batch review), P25 (task table), P15 (knowledge table), P26 (agent table).
 *  Distinct from DataBlock: per-row actions, row status, column format hints, batch operations.
 */
export interface InteractiveTableBlock {
  type: "interactive_table";
  title: string;
  summary?: string;
  columns: TableColumn[];
  rows: TableRow[];
  selectable?: boolean;
  batchActions?: ActionDef[];
}

/** ArtifactBlock — Reference card for an artifact (ADR-023 Section 1)
 *  Rendered inline in conversation as a compact card. "Open" action transitions to artifact mode.
 *  Provenance: ADR-023, Brief 050.
 */
export interface ArtifactBlock {
  type: "artifact";
  artifactId: string;
  title: string;
  artifactType: "document" | "spreadsheet" | "image" | "preview" | "email" | "pdf";
  status: {
    label: string;
    variant: "positive" | "caution" | "negative" | "neutral" | "info";
  };
  summary?: string;
  changed?: string;
  version?: number;
  actions?: ActionDef[];
}

// ============================================================
// Response-level metadata types (Insight-129: NOT ContentBlocks)
// ============================================================

/**
 * ConfidenceAssessment — Structured confidence metadata for Self responses.
 *
 * This is response-level metadata, NOT a ContentBlock. It describes
 * the response itself (how much to trust it), not a discrete content unit.
 * Rendered as conversation chrome by the ConfidenceCard component.
 *
 * Provenance: Brief 068, Insight-127/128/129.
 */
export interface ConfidenceCheck {
  label: string;    // "Henderson project history"
  detail: string;   // "2 similar quotes found"
  category: string; // "knowledge" | "files" | "code" | "web" | "processes"
}

export interface ConfidenceUncertainty {
  label: string;    // "Q4 copper pricing unavailable"
  detail: string;   // "Used Q3 estimates — verify before sending"
  severity: "minor" | "major";
}

export interface ConfidenceAssessment {
  level: "high" | "medium" | "low";
  summary: string;  // "Checked pricing, project history, margins"
  checks: ConfidenceCheck[];
  uncertainties: ConfidenceUncertainty[];
}

// ============================================================
// Discriminated union
// ============================================================

export type ContentBlock =
  | TextBlock
  | ReviewCardBlock
  | StatusCardBlock
  | ActionBlock
  | InputRequestBlock
  | KnowledgeCitationBlock
  | ProgressBlock
  | DataBlock
  | ImageBlock
  | CodeBlock
  | ReasoningTraceBlock
  | SuggestionBlock
  | AlertBlock
  | KnowledgeSynthesisBlock
  | ProcessProposalBlock
  | GatheringIndicatorBlock
  | ChecklistBlock
  | ChartBlock
  | MetricBlock
  | RecordBlock
  | InteractiveTableBlock
  | ArtifactBlock
  | WorkItemFormBlock
  | ConnectionSetupBlock
  | SendingIdentityChoiceBlock
  | TrustMilestoneBlock
  | AnalyserReportBlock
  | RetrofitPlanBlock;

/** All possible content block type strings */
export type ContentBlockType = ContentBlock["type"];

// ============================================================
// Text fallback renderer (ADR-021 Section 6)
// ============================================================

/**
 * Render any content block to plain text. Every block type has a
 * deterministic text serialisation — surfaces that don't support a
 * block type fall back to this.
 */
export function renderBlockToText(block: ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;

    case "review_card":
      return [
        `Review: ${block.stepName}`,
        block.confidence ? `Confidence: ${block.confidence}` : "",
        block.outputText,
        block.actions.map((a) => `[${a.label}]`).join(" "),
      ]
        .filter(Boolean)
        .join("\n");

    case "status_card":
      return [
        `${block.title} — ${block.status}`,
        ...Object.entries(block.details).map(([k, v]) => `  ${k}: ${v}`),
      ].join("\n");

    case "actions":
      return block.actions.map((a) => `[${a.label}]`).join(" ");

    case "input_request":
      return [
        block.prompt,
        ...block.fields.map(
          (f) => `  ${f.label}${f.required ? " (required)" : ""}`,
        ),
      ].join("\n");

    case "knowledge_citation": {
      // Document citations (Brief 079) — show page/section/confidence detail
      if (block.sources.some((s) => s.page != null)) {
        const lines = block.sources.map((s) => {
          const loc = [s.page != null ? `p${s.page}` : "", s.section ?? ""].filter(Boolean).join(", ");
          const conf = s.matchConfidence != null ? ` (${Math.round(s.matchConfidence * 100)}%)` : "";
          const quote = s.verbatimQuote ? `\n    "${s.verbatimQuote}"` : "";
          return `  ${s.name} [${loc}]${conf}${quote}`;
        });
        return [`${block.label}:`, ...lines].join("\n");
      }
      // Memory provenance (original)
      return `${block.label}: ${block.sources.map((s) => s.name).join(", ")}`;
    }

    case "progress": {
      const pct = block.totalSteps > 0
        ? Math.round((block.completedSteps / block.totalSteps) * 100)
        : 0;
      const base = `${block.currentStep} (${block.completedSteps}/${block.totalSteps} — ${pct}%) [${block.status}]`;
      if (block.blockedBy) {
        return `${base}\n  Blocked: waiting on ${block.blockedBy.processName} (${block.blockedBy.status})`;
      }
      if (block.status === "waiting" && block.waitFor) {
        return `${base}\n  Waiting: ${block.waitFor.description}`;
      }
      return base;
    }

    case "data": {
      if (block.format === "key_value") {
        const kv = block.data as Record<string, string>;
        return [
          block.title ?? "",
          ...Object.entries(kv).map(([k, v]) => `  ${k}: ${v}`),
        ]
          .filter(Boolean)
          .join("\n");
      }
      if (block.format === "table") {
        const rows = block.data as Record<string, unknown>[];
        if (rows.length === 0) return block.title ?? "(empty table)";
        const headers = block.headers ?? Object.keys(rows[0]);
        const headerLine = headers.join(" | ");
        const dataLines = rows.map((r) =>
          headers.map((h) => String(r[h] ?? "")).join(" | "),
        );
        return [block.title, headerLine, ...dataLines]
          .filter(Boolean)
          .join("\n");
      }
      // list
      const items = block.data as Record<string, unknown>[];
      return [
        block.title ?? "",
        ...items.map((item) => `  - ${JSON.stringify(item)}`),
      ]
        .filter(Boolean)
        .join("\n");
    }

    case "image":
      return `[Image: ${block.alt}]${block.caption ? ` ${block.caption}` : ""}`;

    case "code":
      return [
        block.filename ? `${block.filename}:` : "",
        "```" + block.language,
        block.content,
        "```",
      ]
        .filter(Boolean)
        .join("\n");

    case "reasoning_trace":
      return [
        block.title,
        ...block.steps.map((s, i) => `  ${i + 1}. ${s.label}: ${s.detail}`),
        `Conclusion: ${block.conclusion}`,
      ].join("\n");

    case "suggestion":
      return [
        block.content,
        block.reasoning ? `(${block.reasoning})` : "",
        block.actions
          ? block.actions.map((a) => `[${a.label}]`).join(" ")
          : "",
      ]
        .filter(Boolean)
        .join("\n");

    case "alert":
      return `[${block.severity.toUpperCase()}] ${block.title}: ${block.content}`;

    case "knowledge_synthesis":
      return [
        "What I've learned so far:",
        ...block.entries.map((e) => `  [${e.dimension}] ${e.content}`),
        `(${block.entries.length}/${block.totalDimensions} dimensions)`,
      ].join("\n");

    case "process_proposal":
      return [
        `Proposed: ${block.name}`,
        block.description ?? "",
        ...block.steps.map((s) => {
          const icon = s.status === "done" ? "✓" : s.status === "current" ? "→" : "○";
          return `  ${icon} ${s.name}`;
        }),
      ].filter(Boolean).join("\n");

    case "gathering_indicator":
      return block.message ?? "Getting to know your business...";

    case "checklist": {
      const header = block.title ? `${block.title}\n` : "";
      const rows = block.items.map((item) => {
        const icon = item.status === "done" ? "✓" : item.status === "warning" ? "!" : "○";
        const detail = item.detail ? ` — ${item.detail}` : "";
        return `  ${icon} ${item.label}${detail}`;
      });
      return `${header}${rows.join("\n")}`;
    }

    case "chart": {
      if (block.chartType === "sparkline") {
        const vals = block.data.values ?? [];
        const trend = block.data.trend ? ` (${block.data.trend})` : "";
        const label = block.data.label ?? block.title ?? "Trend";
        return `${label}: ${vals.join(", ")}${trend}`;
      }
      // donut or bar
      const segments = block.data.segments ?? [];
      const title = block.title ?? block.chartType;
      return [
        title,
        ...segments.map((s) => `  ${s.label}: ${s.value}`),
      ].join("\n");
    }

    case "metric":
      return block.metrics
        .map((m) => {
          const trend = m.trend ? ` (${m.trend})` : "";
          return `${m.label}: ${m.value}${trend}`;
        })
        .join(" | ");

    case "record": {
      const parts: string[] = [];
      parts.push(block.title);
      if (block.subtitle) parts.push(block.subtitle);
      if (block.status) parts.push(`[${block.status.label}]`);
      if (block.confidence) parts.push(`Confidence: ${block.confidence}`);
      if (block.detail) parts.push(block.detail);
      if (block.fields) {
        for (const f of block.fields) {
          let line = `  ${f.label}: ${f.value}`;
          if (f.provenance) line += ` (← ${f.provenance})`;
          if (f.flag) line += ` [${f.flag.level}: ${f.flag.message}]`;
          parts.push(line);
        }
      }
      if (block.checks) {
        for (const c of block.checks) {
          const icon = c.passed ? "✓" : "⚠";
          parts.push(`  ${icon} ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
        }
      }
      if (block.provenance) parts.push(`Sources: ${block.provenance.join(", ")}`);
      if (block.actions) parts.push(block.actions.map((a) => `[${a.label}]`).join(" "));
      return parts.filter(Boolean).join("\n");
    }

    case "interactive_table": {
      const parts: string[] = [];
      parts.push(block.title);
      if (block.summary) parts.push(`(${block.summary})`);
      const cols = block.columns.map((c) => c.label).join(" | ");
      parts.push(cols);
      for (const row of block.rows) {
        const cells = block.columns.map((c) => String(row.cells[c.key] ?? "")).join(" | ");
        const status = row.status ? ` [${row.status}]` : "";
        const actions = row.actions ? ` ${row.actions.map((a) => `[${a.label}]`).join(" ")}` : "";
        parts.push(`${cells}${status}${actions}`);
      }
      if (block.batchActions) {
        parts.push(block.batchActions.map((a) => `[${a.label}]`).join(" "));
      }
      return parts.filter(Boolean).join("\n");
    }

    case "artifact": {
      const statusStr = block.status ? ` — ${block.status.label}` : "";
      return `[${block.artifactType}] ${block.title}${statusStr}\n${block.summary ?? ""}`;
    }

    case "work_item_form": {
      const fieldLines = block.fields.map((f) => {
        const val = f.value !== undefined ? ` = ${f.value}` : "";
        return `  ${f.label}${f.required ? " (required)" : ""}${val}`;
      });
      return ["Work Item Form:", ...fieldLines].join("\n");
    }

    case "connection_setup": {
      const parts: string[] = [
        `${block.serviceDisplayName} (${block.serviceName}) — ${block.connectionStatus}`,
      ];
      if (block.errorMessage) parts.push(`Error: ${block.errorMessage}`);
      if (block.fields) {
        for (const f of block.fields) {
          parts.push(`  ${f.label}${f.required ? " (required)" : ""}`);
        }
      }
      return parts.join("\n");
    }

    case "sending_identity_choice": {
      const lines = ["How should outreach go out?"];
      for (const opt of block.options) {
        lines.push(`  [${opt.label}] — ${opt.description}${opt.requiresSetup ? " (requires setup)" : ""}`);
      }
      return lines.join("\n");
    }

    case "trust_milestone": {
      const parts: string[] = [];
      if (block.milestoneType === "upgrade") {
        parts.push(`Trust Milestone: ${block.processName} is ready for ${block.toTier}`);
        parts.push(block.evidence);
      } else {
        parts.push(`Trust Update: ${block.processName} moved from ${block.fromTier} to ${block.toTier}`);
        if (block.explanation) parts.push(block.explanation);
        parts.push(block.evidence);
      }
      if (block.actions) {
        parts.push(block.actions.map((a) => `[${a.label}]`).join(" "));
      }
      return parts.filter(Boolean).join("\n");
    }

    case "analyser_report": {
      const parts: string[] = [];
      parts.push(`Onboarding report (${block.status})`);
      const ag = block.atAGlance;
      if (ag.stack.length) parts.push(`  Stack: ${ag.stack.join(", ")}`);
      if (ag.metadata.length) parts.push(`  ${ag.metadata.join(" · ")}`);
      if (ag.looksLike) parts.push(`  Looks like: ${ag.looksLike}`);
      if (ag.nearestNeighbours.length) {
        parts.push(
          `  Closest matches: ${ag.nearestNeighbours.map((n) => n.name).join(", ")}`,
        );
      }
      const renderFindings = (label: string, items: Finding[]) => {
        if (items.length === 0) return;
        parts.push(`${label}:`);
        for (const f of items) {
          const ev = f.evidence ? ` (${f.evidence})` : "";
          parts.push(`  - ${f.text}${ev}`);
        }
      };
      renderFindings("Strengths", block.strengths);
      renderFindings("Watch-outs", block.watchOuts);
      renderFindings("Missing", block.missing);
      parts.push(
        `Recommended runner: ${block.recommendation.runner.kind} — ${block.recommendation.runner.rationale}`,
      );
      parts.push(
        `Recommended trust tier: ${block.recommendation.trustTier.tier} — ${block.recommendation.trustTier.rationale}`,
      );
      if (block.detectorErrors && block.detectorErrors.length > 0) {
        parts.push(
          `Detector partial failures: ${block.detectorErrors.map((e) => e.detector).join(", ")}`,
        );
      }
      return parts.filter(Boolean).join("\n");
    }

    case "retrofit_plan": {
      const parts: string[] = [];
      parts.push(`Retrofit plan (${block.status})`);
      parts.push(
        `  Runner: ${block.runnerKind} · Trust tier: ${block.trustTier}`,
      );
      const counts = block.files.reduce(
        (acc, f) => {
          acc[f.action] = (acc[f.action] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      const summary = Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ");
      if (summary) parts.push(`  Files: ${summary}`);
      for (const f of block.files) {
        const marker =
          f.action === "unchanged"
            ? "✓"
            : f.action === "create"
              ? "+"
              : f.action === "update"
                ? "~"
                : "·";
        parts.push(`  ${marker} ${f.path} (${f.byteSize} B)`);
      }
      if (block.commitSha) {
        parts.push(`  Commit: ${block.commitSha}`);
      }
      if (block.skippedUserTouchedFiles?.length) {
        parts.push(
          `  Skipped (user-edited): ${block.skippedUserTouchedFiles.join(", ")}`,
        );
      }
      if (block.failureReason) {
        parts.push(`  Reason: ${block.failureReason}`);
      }
      return parts.filter(Boolean).join("\n");
    }

    default: {
      // Exhaustiveness check
      const _exhaustive: never = block;
      return String(_exhaustive);
    }
  }
}
