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

/** StatusCardBlock — Process or work item status */
export interface StatusCardBlock {
  type: "status_card";
  entityType: "process_run" | "work_item";
  entityId: string;
  title: string;
  status: string;
  details: Record<string, string>;
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

/** KnowledgeCitationBlock — Provenance strip */
export interface KnowledgeCitationBlock {
  type: "knowledge_citation";
  label: string;
  sources: { name: string; type: string; excerpt?: string }[];
}

/** ProgressBlock — Execution progress */
export interface ProgressBlock {
  type: "progress";
  processRunId: string;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  status: "running" | "paused" | "complete";
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

/** ProcessProposalBlock — Onboarding: proposed process in plain language (Brief 044) */
export interface ProcessProposalBlock {
  type: "process_proposal";
  name: string;
  description?: string;
  steps: Array<{ name: string; description?: string; status: "done" | "current" | "pending" }>;
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
    variant: "positive" | "caution" | "negative" | "neutral" | "info";
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
  | ArtifactBlock;

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

    case "knowledge_citation":
      return `${block.label}: ${block.sources.map((s) => s.name).join(", ")}`;

    case "progress": {
      const pct = block.totalSteps > 0
        ? Math.round((block.completedSteps / block.totalSteps) * 100)
        : 0;
      return `${block.currentStep} (${block.completedSteps}/${block.totalSteps} — ${pct}%) [${block.status}]`;
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

    default: {
      // Exhaustiveness check
      const _exhaustive: never = block;
      return String(_exhaustive);
    }
  }
}
