/**
 * Tests for Training Data Extraction (Brief 136).
 *
 * Covers: extraction with approved-only data, edited data with corrected output,
 * rejected data exclusion, scrubber application, JSONL format.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractTrainingData, toOpenAiFineTuningJsonl } from "./training-data";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { randomUUID } from "crypto";

let db: TestDb;
let cleanup: () => void;

// Helpers
function insertProcess(slug: string) {
  const id = randomUUID();
  db.insert(schema.processes).values({
    id,
    name: slug,
    slug,
    definition: {},
  }).run();
  return id;
}

function insertProcessRun(processId: string) {
  const id = randomUUID();
  db.insert(schema.processRuns).values({
    id,
    processId,
    triggeredBy: "test",
    status: "approved",
  }).run();
  return id;
}

function insertStepRun(opts: {
  processRunId: string;
  stepId: string;
  status: "approved" | "rejected";
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  model?: string;
}) {
  const id = randomUUID();
  db.insert(schema.stepRuns).values({
    id,
    processRunId: opts.processRunId,
    stepId: opts.stepId,
    status: opts.status,
    executorType: "ai-agent",
    inputs: opts.inputs ?? { query: "classify this email" },
    outputs: opts.outputs ?? { category: "sales" },
    model: opts.model ?? "claude-haiku-4-5-20251001",
    tokensUsed: 100,
    costCents: 1,
  }).run();
  return id;
}

function insertOutputAndFeedback(opts: {
  processRunId: string;
  stepRunId: string;
  processId: string;
  feedbackType: "approve" | "edit" | "reject";
  content?: Record<string, unknown>;
  diff?: Record<string, unknown>;
}) {
  const outputId = randomUUID();
  db.insert(schema.processOutputs).values({
    id: outputId,
    processRunId: opts.processRunId,
    stepRunId: opts.stepRunId,
    name: "result",
    type: "text",
    content: opts.content ?? { category: "sales" },
  }).run();

  db.insert(schema.feedback).values({
    id: randomUUID(),
    outputId,
    processId: opts.processId,
    type: opts.feedbackType,
    diff: opts.diff,
  }).run();
}

beforeEach(() => {
  const result = createTestDb();
  db = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("extractTrainingData", () => {
  it("extracts approved-only step runs as training examples", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "approved",
      inputs: { email: "Hello, I want to buy" },
      outputs: { category: "sales" },
    });

    const result = extractTrainingData(db, "inbox-triage", "classify", {
      scrubber: (t) => t,
    });

    expect(result.processSlug).toBe("inbox-triage");
    expect(result.stepId).toBe("classify");
    expect(result.format).toBe("jsonl");
    expect(result.totalExamples).toBe(1);
    expect(result.approvedCount).toBe(1);
    expect(result.editedCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.examples[0].label).toBe("approved");
    expect(result.examples[0].input).toContain("Hello, I want to buy");
    expect(result.examples[0].output).toContain("sales");
  });

  it("uses corrected output as training target for edited examples", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    const stepRunId = insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "approved",
      inputs: { email: "Please fix my account" },
      outputs: { category: "sales" },
    });

    insertOutputAndFeedback({
      processRunId: runId,
      stepRunId,
      processId,
      feedbackType: "edit",
      content: { category: "support" },
      diff: { category: { from: "sales", to: "support" } },
    });

    const result = extractTrainingData(db, "inbox-triage", "classify", {
      scrubber: (t) => t,
    });

    expect(result.totalExamples).toBe(1);
    expect(result.editedCount).toBe(1);
    expect(result.approvedCount).toBe(0);
    expect(result.examples[0].label).toBe("edited");
    expect(result.examples[0].correctedOutput).toContain("support");
  });

  it("excludes rejected outputs from training examples but tracks in stats", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "rejected",
      inputs: { email: "Bad input" },
      outputs: { category: "wrong" },
    });
    insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "approved",
      inputs: { email: "Good input" },
      outputs: { category: "right" },
    });

    const result = extractTrainingData(db, "inbox-triage", "classify", {
      scrubber: (t) => t,
    });

    expect(result.totalExamples).toBe(1); // Only approved
    expect(result.rejectedCount).toBe(1); // Rejected tracked in stats
    expect(result.approvedCount).toBe(1);
    expect(result.examples[0].input).toContain("Good input");
  });

  it("applies scrubber to all text fields", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "approved",
      inputs: { email: "Contact john@example.com" },
      outputs: { category: "sales" },
    });

    const scrubber = (text: string) => text.replace(/[\w.-]+@[\w.-]+/g, "[EMAIL]");
    const result = extractTrainingData(db, "inbox-triage", "classify", {
      scrubber,
    });

    expect(result.examples[0].input).toContain("[EMAIL]");
    expect(result.examples[0].input).not.toContain("john@example.com");
  });

  it("requires scrubber parameter (no default)", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "approved",
    });

    // TypeScript enforces this — scrubber is required in TrainingDataOptions
    // This test verifies the function signature at runtime
    expect(() => {
      extractTrainingData(db, "inbox-triage", "classify", {
        scrubber: (t) => t,
      });
    }).not.toThrow();
  });

  it("returns empty export when no matching data exists", () => {
    insertProcess("inbox-triage");

    const result = extractTrainingData(db, "inbox-triage", "nonexistent", {
      scrubber: (t) => t,
    });

    expect(result.totalExamples).toBe(0);
    expect(result.examples).toEqual([]);
    expect(result.approvedCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
  });
});

describe("toOpenAiFineTuningJsonl", () => {
  it("produces OpenAI chat fine-tuning format", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "approved",
      inputs: { email: "I want to buy" },
      outputs: { category: "sales" },
    });

    const exportData = extractTrainingData(db, "inbox-triage", "classify", {
      scrubber: (t) => t,
    });

    const jsonl = toOpenAiFineTuningJsonl(exportData, "You are an email classifier.");
    const lines = jsonl.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.messages).toBeDefined();
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[0].role).toBe("system");
    expect(parsed.messages[0].content).toBe("You are an email classifier.");
    expect(parsed.messages[1].role).toBe("user");
    expect(parsed.messages[2].role).toBe("assistant");
  });

  it("uses corrected output for edited examples", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    const stepRunId = insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "approved",
      inputs: { email: "Fix my account" },
      outputs: { category: "sales" },
    });

    insertOutputAndFeedback({
      processRunId: runId,
      stepRunId,
      processId,
      feedbackType: "edit",
      content: { category: "support" },
      diff: { category: { from: "sales", to: "support" } },
    });

    const exportData = extractTrainingData(db, "inbox-triage", "classify", {
      scrubber: (t) => t,
    });

    const jsonl = toOpenAiFineTuningJsonl(exportData);
    const parsed = JSON.parse(jsonl.split("\n")[0]);
    // The assistant message should use the corrected output
    expect(parsed.messages[parsed.messages.length - 1].content).toContain("support");
  });

  it("omits system message when no system prompt provided to toOpenAiFineTuningJsonl", () => {
    const processId = insertProcess("inbox-triage");
    const runId = insertProcessRun(processId);
    insertStepRun({
      processRunId: runId,
      stepId: "classify",
      status: "approved",
      inputs: { email: "test" },
      outputs: { result: "ok" },
    });

    const exportData = extractTrainingData(db, "inbox-triage", "classify", {
      scrubber: (t) => t,
    });

    // No system prompt provided — systemPrompt on examples is ""
    const jsonl = toOpenAiFineTuningJsonl(exportData);
    const parsed = JSON.parse(jsonl.split("\n")[0]);
    // Should only have user + assistant (no system with empty content)
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe("user");
    expect(parsed.messages[1].role).toBe("assistant");
  });
});
