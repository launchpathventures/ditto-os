/**
 * Tests for Brief 069 — Rich Block Emission
 *
 * Tests toolResultToContentBlocks for all Self tool block mappings.
 * Each test verifies the correct block types are emitted for
 * representative tool output.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import type { DelegationResult } from "./self-delegation";
import type {
  RecordBlock,
  MetricBlock,
  AlertBlock,
  SuggestionBlock,
  ChecklistBlock,
  StatusCardBlock,
  ProcessProposalBlock,
  ProgressBlock,
  TextBlock,
  KnowledgeCitationBlock,
  KnowledgeSynthesisBlock,
  InteractiveTableBlock,
} from "./content-blocks";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

// Import after mock
const { toolResultToContentBlocks } = await import("./self-stream");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// Helper to create a successful DelegationResult
function ok(output: string, metadata?: Record<string, unknown>): DelegationResult {
  return { toolName: "test", success: true, output, metadata };
}

function fail(output: string): DelegationResult {
  return { toolName: "test", success: false, output };
}

// ============================================================
// AC1: get_process_detail → Record + Metric
// ============================================================

describe("get_process_detail block emission (AC1)", () => {
  it("emits RecordBlock + MetricBlock for process with trust data", async () => {
    const output = JSON.stringify({
      name: "Invoice Follow-up",
      slug: "invoice-follow-up",
      status: "active",
      trustTier: "spot_checked",
      trust: {
        approvalRate: 0.85,
        correctionRate: 0.1,
        runsInWindow: 20,
        trend: "up",
        consecutiveClean: 8,
        summary: "Performing well",
      },
      steps: [
        { id: "step-1", name: "Draft", executor: "ai-agent" },
        { id: "step-2", name: "Review", executor: "human" },
      ],
      recentRuns: [{ id: "run-1", status: "complete" }],
    });

    const blocks = await toolResultToContentBlocks(
      "get_process_detail",
      { processSlug: "invoice-follow-up" },
      ok(output),
    );

    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const record = blocks.find((b) => b.type === "record") as RecordBlock;
    expect(record).toBeDefined();
    expect(record.title).toBe("Invoice Follow-up");
    // Brief 280 AC8: canonical trust tier label (was "spot checked").
    expect(record.status?.label).toBe("Spot-checked");
    expect(record.fields).toBeDefined();
    expect(record.fields!.some((f) => f.label === "Approval rate" && f.value === "85%")).toBe(true);
    expect(record.fields!.some((f) => f.label === "Steps" && f.value === "2")).toBe(true);

    const metric = blocks.find((b) => b.type === "metric") as MetricBlock;
    expect(metric).toBeDefined();
    expect(metric.metrics[0].value).toBe("85%");
    expect(metric.metrics[0].label).toBe("Trust score");
    expect(metric.metrics[0].trend).toBe("up");
  });

  it("returns empty for failed result", async () => {
    const blocks = await toolResultToContentBlocks(
      "get_process_detail",
      { processSlug: "test" },
      fail("not found"),
    );
    expect(blocks).toHaveLength(0);
  });
});

// ============================================================
// AC2: detect_risks → Alert + Suggestion
// ============================================================

describe("detect_risks block emission (AC2)", () => {
  it("emits AlertBlock per risk (up to 3)", async () => {
    const output = `2 signal(s) detected:
[warning] temporal: Invoice Follow-up — No activity in 14 days
[error] correction_pattern: Quote Generation — 40% correction rate`;

    const blocks = await toolResultToContentBlocks(
      "detect_risks",
      {},
      ok(output),
    );

    expect(blocks).toHaveLength(2);
    const alerts = blocks.filter((b) => b.type === "alert") as AlertBlock[];
    expect(alerts).toHaveLength(2);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].title).toBe("Invoice Follow-up");
    expect(alerts[1].severity).toBe("error");
    expect(alerts[1].title).toBe("Quote Generation");
  });

  it("caps at 3 alerts + suggestion when >3 risks", async () => {
    const output = `4 signal(s) detected:
[warning] temporal: Process A — Old
[warning] temporal: Process B — Old
[warning] temporal: Process C — Old
[warning] temporal: Process D — Old`;

    const blocks = await toolResultToContentBlocks(
      "detect_risks",
      {},
      ok(output),
    );

    const alerts = blocks.filter((b) => b.type === "alert");
    expect(alerts).toHaveLength(3);

    const suggestion = blocks.find((b) => b.type === "suggestion") as SuggestionBlock;
    expect(suggestion).toBeDefined();
    expect(suggestion.content).toContain("1 additional");
  });

  it("returns empty for no signals", async () => {
    const blocks = await toolResultToContentBlocks(
      "detect_risks",
      {},
      ok("No signals detected. Everything is running normally."),
    );
    expect(blocks).toHaveLength(0);
  });
});

// ============================================================
// AC3: get_briefing → KnowledgeSynthesis + Checklist + Metric
// ============================================================

describe("get_briefing block emission (AC3)", () => {
  it("emits MetricBlock from stats and Checklist from FOCUS items", async () => {
    const output = `Since your last visit: 5 completed, 2 running, 3 reviews pending, 1 waiting for your input, 0 exceptions.
User familiarity: developing (moderate detail).
FOCUS (what needs attention first):
  [critical] Invoice review: Overdue by 2 days
  [high] Quote follow-up: Client waiting`;

    const blocks = await toolResultToContentBlocks(
      "get_briefing",
      { userId: "test-user" },
      ok(output),
    );

    const metric = blocks.find((b) => b.type === "metric") as MetricBlock;
    expect(metric).toBeDefined();
    expect(metric.metrics.some((m) => m.label === "Reviews pending" && m.value === "3")).toBe(true);
    expect(metric.metrics.some((m) => m.label === "Waiting for input" && m.value === "1")).toBe(true);

    const checklist = blocks.find((b) => b.type === "checklist") as ChecklistBlock;
    expect(checklist).toBeDefined();
    expect(checklist.title).toBe("Focus");
    expect(checklist.items).toHaveLength(2);
    expect(checklist.items[0].status).toBe("warning"); // critical → warning
    expect(checklist.items[1].status).toBe("pending"); // high → pending
  });

  it("returns empty metric when all stats are zero", async () => {
    const output = `Since your last visit: 0 completed, 0 running, 0 reviews pending, 0 waiting for your input, 0 exceptions.
ALL QUIET — nothing needs the user. Say so briefly.`;

    const blocks = await toolResultToContentBlocks(
      "get_briefing",
      { userId: "test-user" },
      ok(output),
    );

    // No metric block since all stats are 0
    const metric = blocks.find((b) => b.type === "metric");
    expect(metric).toBeUndefined();
  });
});

// ============================================================
// AC4: suggest_next → SuggestionBlock
// ============================================================

describe("suggest_next block emission (AC4)", () => {
  it("emits SuggestionBlock per suggestion with actions", async () => {
    const output = `Suggestions (2):
Coverage: Other plumbing businesses find job scheduling useful — automates crew dispatch.
Trust: Invoice Follow-up has been running smoothly (92% approval, 8 clean in a row). You could let it handle more on its own.`;

    const blocks = await toolResultToContentBlocks(
      "suggest_next",
      {},
      ok(output),
    );

    const suggestions = blocks.filter((b) => b.type === "suggestion") as SuggestionBlock[];
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].content).toContain("plumbing businesses");
    expect(suggestions[0].reasoning).toBe("Coverage");
    expect(suggestions[0].actions).toBeDefined();
    expect(suggestions[0].actions!.some((a) => a.label === "Accept")).toBe(true);
    expect(suggestions[1].reasoning).toBe("Trust");
  });

  it("returns empty for no suggestions", async () => {
    const blocks = await toolResultToContentBlocks(
      "suggest_next",
      {},
      ok("No suggestions right now — things are running well."),
    );
    expect(blocks).toHaveLength(0);
  });
});

// ============================================================
// AC5: adjust_trust → Record + Checklist + StatusCard
// ============================================================

describe("adjust_trust block emission (AC5)", () => {
  it("emits Record + Checklist + StatusCard for proposal", async () => {
    const output = JSON.stringify({
      action: "proposal",
      processName: "Invoice Follow-up",
      currentTier: "supervised",
      proposedTier: "spot_checked",
      reason: "Good track record",
      evidence: "20 runs, 90% approval",
      trust: {
        approvalRate: 0.9,
        correctionRate: 0.05,
        runsInWindow: 20,
        trend: "up",
      },
      message: "Proposing trust upgrade",
    });

    const blocks = await toolResultToContentBlocks(
      "adjust_trust",
      { processSlug: "invoice-follow-up" },
      ok(output),
    );

    const record = blocks.find((b) => b.type === "record") as RecordBlock;
    expect(record).toBeDefined();
    expect(record.title).toBe("Invoice Follow-up");
    expect(record.status?.label).toBe("Pending confirmation");
    expect(record.fields!.some((f) => f.label === "Current tier")).toBe(true);
    expect(record.fields!.some((f) => f.label === "Proposed tier")).toBe(true);
    expect(record.fields!.some((f) => f.label === "Approval rate" && f.value === "90%")).toBe(true);

    const checklist = blocks.find((b) => b.type === "checklist") as ChecklistBlock;
    expect(checklist).toBeDefined();
    expect(checklist.title).toBe("Safety Net");
    expect(checklist.items.length).toBeGreaterThanOrEqual(3);

    const statusCard = blocks.find((b) => b.type === "status_card") as StatusCardBlock;
    expect(statusCard).toBeDefined();
    expect(statusCard.status).toBe("proposed");
  });

  it("emits StatusCard for applied change", async () => {
    const output = JSON.stringify({
      action: "applied",
      processName: "Invoice Follow-up",
      fromTier: "supervised",
      toTier: "spot_checked",
      message: "Trust upgraded",
    });

    const blocks = await toolResultToContentBlocks(
      "adjust_trust",
      { processSlug: "invoice-follow-up" },
      ok(output),
    );

    const statusCard = blocks.find((b) => b.type === "status_card") as StatusCardBlock;
    expect(statusCard).toBeDefined();
    expect(statusCard.status).toBe("applied");
    // Brief 280 AC8: canonical trust tier labels (was "supervised" / "spot checked").
    expect(statusCard.details["From"]).toBe("Supervised");
    expect(statusCard.details["To"]).toBe("Spot-checked");

    // No record or checklist for applied (only proposal shows evidence)
    expect(blocks.filter((b) => b.type === "record")).toHaveLength(0);
  });
});

// ============================================================
// AC6: adapt_process → ProcessProposalBlock
// ============================================================

describe("adapt_process block emission (AC6)", () => {
  it("emits ProcessProposalBlock from adapted definition", async () => {
    const blocks = await toolResultToContentBlocks(
      "adapt_process",
      {
        runId: "run-123",
        adaptedDefinition: {
          steps: [
            { id: "gather", name: "Gather Info", description: "Collect client details", executor: "human" },
            { id: "draft", name: "Draft Quote", executor: "ai-agent" },
            { id: "review", name: "Review", executor: "human" },
          ],
        },
        reasoning: "Added review step for quality control",
      },
      ok("Adapted process run run-123... (v2). Steps: gather, draft, review."),
    );

    expect(blocks).toHaveLength(1);
    const proposal = blocks[0] as ProcessProposalBlock;
    expect(proposal.type).toBe("process_proposal");
    expect(proposal.name).toBe("Adapted Process");
    expect(proposal.description).toBe("Added review step for quality control");
    expect(proposal.steps).toHaveLength(3);
    expect(proposal.steps[0].name).toBe("Gather Info");
  });
});

// ============================================================
// AC7: connect_service → StatusCard
// ============================================================

describe("connect_service block emission (AC7)", () => {
  it("emits StatusCard for verification", async () => {
    const output = JSON.stringify({
      action: "verification",
      service: "github",
      connected: true,
      message: "github credentials are stored and ready.",
    });

    const blocks = await toolResultToContentBlocks(
      "connect_service",
      { service: "github", action: "verify" },
      ok(output),
    );

    expect(blocks.length).toBeGreaterThanOrEqual(1);
    const card = blocks[0] as StatusCardBlock;
    expect(card.type).toBe("status_card");
    expect(card.title).toBe("github");
    expect(card.status).toBe("connected");
    // Brief 072: also emits ConnectionSetupBlock
    const connBlock = blocks.find((b) => b.type === "connection_setup");
    expect(connBlock).toBeDefined();
  });

  it("emits StatusCard for setup guide", async () => {
    const output = JSON.stringify({
      action: "setup_guide",
      service: "slack",
      description: "Slack integration",
      authType: "oauth",
      isConnected: false,
      message: "To connect Slack...",
    });

    const blocks = await toolResultToContentBlocks(
      "connect_service",
      { service: "slack", action: "guide" },
      ok(output),
    );

    expect(blocks.length).toBeGreaterThanOrEqual(1);
    const card = blocks[0] as StatusCardBlock;
    expect(card.status).toBe("setup required");
    expect(card.details["Auth"]).toBe("oauth");
    // Brief 072: also emits ConnectionSetupBlock
    const connBlock = blocks.find((b) => b.type === "connection_setup");
    expect(connBlock).toBeDefined();
  });
});

// ============================================================
// AC8: review tools → StatusCard + conditional Alert
// ============================================================

describe("review tools block emission (AC8)", () => {
  it("emits StatusCard for routine approval (no Alert)", async () => {
    const blocks = await toolResultToContentBlocks(
      "approve_review",
      { runId: "run-123" },
      ok("Approved run run-123. Pipeline status: running"),
    );

    expect(blocks).toHaveLength(1);
    const card = blocks[0] as StatusCardBlock;
    expect(card.type).toBe("status_card");
    expect(card.status).toBe("approved");
  });

  it("emits StatusCard + Alert when correction pattern detected", async () => {
    const blocks = await toolResultToContentBlocks(
      "edit_review",
      { runId: "run-123" },
      ok('Edited run run-123. Pipeline status: running (Pattern detected: "pricing format" — 3 times)'),
    );

    expect(blocks).toHaveLength(2);
    const card = blocks[0] as StatusCardBlock;
    expect(card.status).toBe("edited");

    const alert = blocks[1] as AlertBlock;
    expect(alert.type).toBe("alert");
    expect(alert.severity).toBe("info");
    expect(alert.content).toContain("pricing format");
    expect(alert.content).toContain("3 times");
  });

  it("emits StatusCard for rejection", async () => {
    const blocks = await toolResultToContentBlocks(
      "reject_review",
      { runId: "run-123" },
      ok("Rejected run run-123."),
    );

    expect(blocks).toHaveLength(1);
    expect((blocks[0] as StatusCardBlock).status).toBe("rejected");
  });
});

// ============================================================
// AC9: quick_capture → StatusCard + KnowledgeCitation
// ============================================================

describe("quick_capture block emission (AC9)", () => {
  it("emits StatusCard + KnowledgeCitation for classified capture", async () => {
    const output = JSON.stringify({
      id: "item-123",
      type: "task",
      message: "Captured and classified.",
    });

    const blocks = await toolResultToContentBlocks(
      "quick_capture",
      { text: "Review the Henderson quote" },
      ok(output),
    );

    expect(blocks).toHaveLength(2);
    const card = blocks[0] as StatusCardBlock;
    expect(card.type).toBe("status_card");
    expect(card.status).toBe("captured");
    expect(card.details["Classified as"]).toBe("task");

    const citation = blocks[1] as KnowledgeCitationBlock;
    expect(citation.type).toBe("knowledge_citation");
    expect(citation.sources[0].name).toContain("task");
  });

  it("emits StatusCard only for note classification (no citation)", async () => {
    const output = JSON.stringify({
      id: "item-456",
      type: "note",
      message: "Captured and classified.",
    });

    const blocks = await toolResultToContentBlocks(
      "quick_capture",
      { text: "Copper prices went up" },
      ok(output),
    );

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("status_card");
  });
});

// ============================================================
// AC10: consult_role → empty
// ============================================================

describe("consult_role block emission (AC10)", () => {
  it("returns empty block array", async () => {
    const blocks = await toolResultToContentBlocks(
      "consult_role",
      { role: "architect", question: "Should we use React?" },
      ok("The Architect suggests..."),
    );
    expect(blocks).toHaveLength(0);
  });
});

// ============================================================
// AC11: assess_confidence → no blocks (metadata only)
// ============================================================

describe("assess_confidence block emission (AC11)", () => {
  it("returns empty block array (stays metadata per Insight-129)", async () => {
    const blocks = await toolResultToContentBlocks(
      "assess_confidence",
      {},
      ok(JSON.stringify({ level: "high", summary: "Checked 3 sources" }), {
        confidenceAssessment: { level: "high", summary: "Checked 3 sources", checks: [], uncertainties: [] },
      }),
    );
    expect(blocks).toHaveLength(0);
  });
});

// ============================================================
// Regression: failed results emit no blocks
// ============================================================

describe("failed results emit no blocks", () => {
  it("returns empty for any failed tool result", async () => {
    for (const tool of [
      "get_process_detail", "detect_risks", "get_briefing",
      "suggest_next", "adjust_trust", "adapt_process",
      "connect_service", "approve_review", "quick_capture",
    ]) {
      const blocks = await toolResultToContentBlocks(tool, {}, fail("Error"));
      expect(blocks).toHaveLength(0);
    }
  });
});

// ============================================================
// Brief 281: search_workspace → recall block mapping
// ============================================================

describe("search_workspace block emission (Brief 281)", () => {
  function recallMeta(partial: Record<string, unknown>) {
    return {
      recall: {
        results: [],
        counts: {
          project: 0,
          process: 0,
          memory: 0,
          work: 0,
          review: 0,
          activity: 0,
        },
        truncated: false,
        query: null,
        kinds: ["project", "process", "memory", "work", "review", "activity"],
        ...partial,
      },
    };
  }

  it("emits an info AlertBlock (never a dead-end) when nothing matched", async () => {
    const blocks = await toolResultToContentBlocks(
      "search_workspace",
      {},
      ok("No workspace artifacts matched.", recallMeta({ query: "zzz" })),
    );
    expect(blocks).toHaveLength(1);
    const alert = blocks[0] as AlertBlock;
    expect(alert.type).toBe("alert");
    expect(alert.severity).toBe("info");
    expect(alert.title).toContain("zzz");
    expect(alert.content.toLowerCase()).toContain("filter");
  });

  it("maps memory results to a KnowledgeCitationBlock with provenance", async () => {
    const blocks = await toolResultToContentBlocks(
      "search_workspace",
      {},
      ok(
        "1 result",
        recallMeta({
          results: [
            {
              kind: "memory",
              id: "m1",
              title: "Prefer concise Q3 summaries",
              evidence: "Prefer concise Q3 planning summaries.",
              projectSlug: "acme",
              route: "/memories/m1",
              memoryScopeType: "process",
              memoryType: "preference",
            },
          ],
          counts: { project: 0, process: 0, memory: 1, work: 0, review: 0, activity: 0 },
        }),
      ),
    );
    const cite = blocks.find(
      (b) => b.type === "knowledge_citation",
    ) as KnowledgeCitationBlock;
    expect(cite).toBeDefined();
    expect(cite.sources[0].type).toBe("memory");
    expect(cite.sources[0].memoryProjectSlug).toBe("acme");
    // Brief-227 scope pill must reach the citation (review Finding 4).
    expect(cite.sources[0].memoryScopeType).toBe("process");
    expect(cite.sources[0].memoryType).toBe("preference");
  });

  it("maps a single non-memory result to a RecordBlock with an Open action", async () => {
    const blocks = await toolResultToContentBlocks(
      "search_workspace",
      {},
      ok(
        "1 result",
        recallMeta({
          results: [
            {
              kind: "project",
              id: "p1",
              title: "Acme Revamp",
              status: "active",
              projectSlug: "acme",
              route: "/projects/acme",
            },
          ],
          counts: { project: 1, process: 0, memory: 0, work: 0, review: 0, activity: 0 },
        }),
      ),
    );
    const record = blocks.find((b) => b.type === "record") as RecordBlock;
    expect(record).toBeDefined();
    expect(record.title).toBe("Acme Revamp");
    expect(record.actions?.[0]?.payload).toEqual({ href: "/projects/acme" });
  });

  it("maps multiple non-memory results to an InteractiveTableBlock with truncation summary", async () => {
    const blocks = await toolResultToContentBlocks(
      "search_workspace",
      {},
      ok(
        "results",
        recallMeta({
          truncated: true,
          results: [
            { kind: "project", id: "p1", title: "Acme", route: "/projects/acme" },
            { kind: "process", id: "pr1", title: "Quoting", status: "active", route: "/process/pr1" },
          ],
          counts: { project: 1, process: 9, memory: 0, work: 0, review: 0, activity: 0 },
        }),
      ),
    );
    const table = blocks.find(
      (b) => b.type === "interactive_table",
    ) as InteractiveTableBlock;
    expect(table).toBeDefined();
    expect(table.rows).toHaveLength(2);
    expect(table.summary).toContain("of 10");
    expect(table.rows[0].actions?.[0]?.payload).toEqual({
      href: "/projects/acme",
    });
  });

  it("returns no blocks when recall metadata is absent", async () => {
    const blocks = await toolResultToContentBlocks(
      "search_workspace",
      {},
      ok("text only"),
    );
    expect(blocks).toHaveLength(0);
  });
});

// ============================================================
// FLAG 3 fix: metadata-based block emission (no text parsing)
// ============================================================

describe("metadata-based block emission (FLAG 3 fix)", () => {
  it("detect_risks uses metadata.risks when available", async () => {
    const blocks = await toolResultToContentBlocks(
      "detect_risks",
      {},
      ok("2 signal(s) detected:\n...", {
        risks: [
          { severity: "warning", type: "temporal", entityLabel: "Invoice Process", detail: "14 days idle" },
          { severity: "error", type: "correction_pattern", entityLabel: "Quote Gen", detail: "High corrections" },
        ],
      }),
    );

    expect(blocks).toHaveLength(2);
    const alerts = blocks.filter((b) => b.type === "alert") as AlertBlock[];
    expect(alerts[0].title).toBe("Invoice Process");
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[1].title).toBe("Quote Gen");
    expect(alerts[1].severity).toBe("error");
  });

  it("get_briefing uses metadata.stats and metadata.focus when available", async () => {
    const blocks = await toolResultToContentBlocks(
      "get_briefing",
      { userId: "test" },
      ok("briefing text...", {
        stats: { completedSinceLastVisit: 5, activeRuns: 2, pendingReviews: 3, pendingHumanInput: 1, totalExceptions: 0 },
        focus: [
          { priority: "critical", label: "Invoice review", reason: "Overdue" },
          { priority: "high", label: "Quote follow-up", reason: "Client waiting" },
        ],
      }),
    );

    const metric = blocks.find((b) => b.type === "metric") as MetricBlock;
    expect(metric).toBeDefined();
    expect(metric.metrics.some((m) => m.label === "Reviews pending" && m.value === "3")).toBe(true);

    const checklist = blocks.find((b) => b.type === "checklist") as ChecklistBlock;
    expect(checklist).toBeDefined();
    expect(checklist.items).toHaveLength(2);
    expect(checklist.items[0].label).toContain("Invoice review");
    expect(checklist.items[0].status).toBe("warning");
  });

  it("suggest_next uses metadata.suggestions when available", async () => {
    const blocks = await toolResultToContentBlocks(
      "suggest_next",
      {},
      ok("Suggestions (1):\nCoverage: ...", {
        suggestions: [
          { type: "Coverage", content: "Job scheduling would help your business." },
        ],
      }),
    );

    expect(blocks).toHaveLength(1);
    const suggestion = blocks[0] as SuggestionBlock;
    expect(suggestion.type).toBe("suggestion");
    expect(suggestion.content).toBe("Job scheduling would help your business.");
    expect(suggestion.reasoning).toBe("Coverage");
    expect(suggestion.actions).toBeDefined();
  });

  it("suggest_next actions include payload with type and content for dismiss/accept", async () => {
    const blocks = await toolResultToContentBlocks(
      "suggest_next",
      {},
      ok("Suggestions (1):\nCoverage: ...", {
        suggestions: [
          { type: "Coverage", content: "Set up invoicing." },
        ],
      }),
    );

    const suggestion = blocks[0] as SuggestionBlock;
    const acceptAction = suggestion.actions!.find((a) => a.label === "Accept");
    const dismissAction = suggestion.actions!.find((a) => a.label === "Dismiss");

    expect(acceptAction?.payload).toEqual({ suggestionType: "Coverage", content: "Set up invoicing." });
    expect(dismissAction?.payload).toEqual({ suggestionType: "Coverage", content: "Set up invoicing." });
  });
});

// ============================================================
// Brief 079 — search_knowledge block emission
// ============================================================

describe("search_knowledge block emission (Brief 079)", () => {
  it("emits KnowledgeCitationBlock from metadata.contentBlocks", async () => {
    const { toolResultToContentBlocks } = await import("./self-stream");

    const citationBlock: KnowledgeCitationBlock = {
      type: "knowledge_citation",
      label: "Document Sources",
      sources: [
        { name: "pricing.pdf", type: "document", excerpt: "15mm copper pipe: $4.20/m", page: 12, section: "Plumbing", lineRange: [340, 355] as [number, number], matchConfidence: 0.95 },
      ],
    };

    const result: DelegationResult = {
      toolName: "search_knowledge",
      success: true,
      output: "SOURCES FROM KNOWLEDGE BASE: ...",
      metadata: {
        resultCount: 1,
        contentBlocks: [citationBlock],
      },
    };

    const blocks = await toolResultToContentBlocks("search_knowledge", { query: "copper pipe pricing" }, result);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("knowledge_citation");
    const kb = blocks[0] as KnowledgeCitationBlock;
    expect(kb.sources).toHaveLength(1);
    expect(kb.sources[0].name).toBe("pricing.pdf");
    expect(kb.sources[0].page).toBe(12);
    expect(kb.sources[0].matchConfidence).toBe(0.95);
  });

  it("returns empty blocks when no metadata contentBlocks", async () => {
    const { toolResultToContentBlocks } = await import("./self-stream");

    const result: DelegationResult = {
      toolName: "search_knowledge",
      success: true,
      output: "No documents found in the knowledge base matching your query.",
    };

    const blocks = await toolResultToContentBlocks("search_knowledge", { query: "test" }, result);
    expect(blocks).toHaveLength(0);
  });
});

// ============================================================
// Brief 280: workspace chat front-door inline artifacts
// ============================================================

describe("generate_process(save=true) inline summary (Brief 280 AC7)", () => {
  const SAVED_OUTPUT = JSON.stringify({
    action: "saved",
    id: "proc-42",
    slug: "inbox-triage",
    processSlug: "inbox-triage",
    name: "Inbox Triage",
    stepCount: 3,
    status: "draft",
  });

  it("emits a RecordBlock + SuggestionBlock with human-readable fields", async () => {
    const blocks = await toolResultToContentBlocks(
      "generate_process",
      {
        save: true,
        name: "Inbox Triage",
        description: "Triage my inbox daily and surface what needs a reply",
        trigger: "Daily at 8am",
        trustTier: "spot_checked",
        steps: [{}, {}, {}],
      },
      ok(SAVED_OUTPUT),
    );

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("record");
    expect(blocks[1].type).toBe("suggestion");

    const record = blocks[0] as RecordBlock;
    expect(record.title).toBe("Inbox Triage");
    expect(record.status).toEqual({ label: "Draft", variant: "neutral" });

    const fieldMap = Object.fromEntries(
      (record.fields ?? []).map((f) => [f.label, f.value]),
    );
    expect(fieldMap["Purpose"]).toBe(
      "Triage my inbox daily and surface what needs a reply",
    );
    expect(fieldMap["Trigger"]).toBe("Daily at 8am");
    expect(fieldMap["Trust tier"]).toBe("Spot-checked");
    expect(fieldMap["Steps"]).toBe("3");

    // AC7: slug / id / executor names never displayed raw in the summary.
    const fieldValues = (record.fields ?? []).map((f) => String(f.value));
    expect(fieldValues).not.toContain("inbox-triage");
    expect(fieldValues).not.toContain("proc-42");
    expect(record.title).not.toBe("inbox-triage");

    // Drill-down carries the real route shape (AC13) in the payload only.
    const openAction = (record.actions ?? []).find((a) => a.id === "open-process");
    expect(openAction?.payload).toEqual({
      processId: "proc-42",
      href: "/process/proc-42",
    });

    // "Run now" routes back through the Self conversation (AC9 entry point).
    const suggestion = blocks[1] as SuggestionBlock;
    const runAction = (suggestion.actions ?? []).find((a) => a.id === "proposal-run");
    expect(runAction?.payload).toEqual({
      processSlug: "inbox-triage",
      message: "Run the Inbox Triage process now.",
    });
  });

  it("returns no blocks for the save=false preview path", async () => {
    const blocks = await toolResultToContentBlocks(
      "generate_process",
      { save: false, name: "Inbox Triage" },
      ok(JSON.stringify({ action: "preview", slug: "inbox-triage", stepCount: 3 })),
    );
    // The preview branch emits a ProcessProposalBlock, not the saved summary.
    expect(blocks.every((b) => b.type !== "suggestion")).toBe(true);
  });
});

describe("canonical trust tier labels (Brief 280 AC8)", () => {
  it.each([
    ["supervised", "Supervised"],
    ["spot_checked", "Spot-checked"],
    ["autonomous", "Autonomous"],
    ["critical", "Critical"],
  ])("get_process_detail renders %s as %s", async (tier, label) => {
    const blocks = await toolResultToContentBlocks(
      "get_process_detail",
      {},
      ok(JSON.stringify({ name: "P", slug: "p", status: "active", trustTier: tier })),
    );
    const record = blocks.find((b) => b.type === "record") as RecordBlock | undefined;
    expect(record).toBeDefined();
    const trustField = (record!.fields ?? []).find((f) => f.label === "Trust tier");
    expect(trustField?.value).toBe(label);
  });

  // adjust_trust is also an inline process surface in the workspace Self
  // conversation, so AC8's canonical labels apply there too (Reviewer
  // finding: previously used a naive underscore→space transform).
  it.each([
    ["supervised", "Supervised"],
    ["spot_checked", "Spot-checked"],
    ["autonomous", "Autonomous"],
    ["critical", "Critical"],
  ])("adjust_trust proposal renders %s as %s", async (tier, label) => {
    const blocks = await toolResultToContentBlocks(
      "adjust_trust",
      { processSlug: "p" },
      ok(
        JSON.stringify({
          action: "proposal",
          processName: "P",
          currentTier: tier,
          proposedTier: tier,
          reason: "r",
        }),
      ),
    );
    const record = blocks.find((b) => b.type === "record") as RecordBlock | undefined;
    expect(record).toBeDefined();
    const fields = record!.fields ?? [];
    expect(fields.find((f) => f.label === "Current tier")?.value).toBe(label);
    expect(fields.find((f) => f.label === "Proposed tier")?.value).toBe(label);
  });

  it.each([
    ["supervised", "Supervised"],
    ["spot_checked", "Spot-checked"],
    ["autonomous", "Autonomous"],
    ["critical", "Critical"],
  ])("adjust_trust applied renders %s as %s", async (tier, label) => {
    const blocks = await toolResultToContentBlocks(
      "adjust_trust",
      { processSlug: "p" },
      ok(
        JSON.stringify({
          action: "applied",
          processName: "P",
          fromTier: tier,
          toTier: tier,
        }),
      ),
    );
    const statusCard = blocks.find((b) => b.type === "status_card") as
      | StatusCardBlock
      | undefined;
    expect(statusCard).toBeDefined();
    expect(statusCard!.details["From"]).toBe(label);
    expect(statusCard!.details["To"]).toBe(label);
  });
});

describe("start_pipeline generic progress copy (Brief 280)", () => {
  it("uses generic process wording, not dev-pipeline wording", async () => {
    const blocks = await toolResultToContentBlocks(
      "start_pipeline",
      {},
      ok(
        JSON.stringify({
          runId: "run-1",
          processSlug: "inbox-triage",
          status: "running",
          steps: ["Fetch inbox", "Classify", "Summarise"],
        }),
      ),
    );

    const progress = blocks.find((b) => b.type === "progress") as ProgressBlock;
    expect(progress?.entityId).toBe("run-1");
    expect(progress?.totalSteps).toBe(3);

    const text = blocks.find((b) => b.type === "text") as TextBlock;
    expect(text?.text).toBe(
      "Starting the process (3 steps). I'll keep you updated as steps complete.",
    );
    expect(text?.text.toLowerCase()).not.toContain("dev pipeline");
  });

  it("singularises the step count", async () => {
    const blocks = await toolResultToContentBlocks(
      "start_pipeline",
      {},
      ok(
        JSON.stringify({
          runId: "run-2",
          processSlug: "p",
          status: "running",
          steps: ["Only step"],
        }),
      ),
    );
    const text = blocks.find((b) => b.type === "text") as TextBlock;
    expect(text?.text).toBe(
      "Starting the process (1 step). I'll keep you updated as steps complete.",
    );
  });
});
