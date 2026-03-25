/**
 * Ditto — Content Block Types (ADR-021 Surface Protocol)
 *
 * The 13 typed content block types that flow from the Self to surfaces.
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

/** DataBlock — Structured data display */
export interface DataBlock {
  type: "data";
  format: "key_value" | "table" | "list";
  title?: string;
  data: Record<string, unknown>[] | Record<string, string>;
  headers?: string[];
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
  | GatheringIndicatorBlock;

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

    default: {
      // Exhaustiveness check
      const _exhaustive: never = block;
      return String(_exhaustive);
    }
  }
}
