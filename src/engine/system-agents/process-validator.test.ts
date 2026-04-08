/**
 * Tests for process-validator system agent (Brief 104)
 *
 * Covers:
 * - Edge-case testing (missing fields, circular deps, invalid refs)
 * - Compliance scanning (secrets, PII, trust tier)
 * - Efficiency analysis (parameterisation, consolidation, criteria)
 * - Duplicate detection (keyword overlap, similarity threshold)
 * - Full validation pass with good and bad processes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ============================================================
// Edge-case testing
// ============================================================

describe("process-validator", () => {
  describe("validateEdgeCases", () => {
    it("passes for a well-formed process definition", async () => {
      const { validateEdgeCases } = await import("./process-validator");

      const checks = validateEdgeCases({
        name: "Test Process",
        id: "test-process",
        description: "A valid test process for testing",
        steps: [
          { id: "step-1", name: "Research", executor: "ai-agent", description: "Do research" },
          { id: "step-2", name: "Review", executor: "human", description: "Review results", depends_on: ["step-1"] },
        ],
        inputs: [{ name: "topic", type: "text", required: true }],
      });

      const failures = checks.filter((c) => !c.pass);
      expect(failures).toHaveLength(0);
    });

    it("fails when process has no name", async () => {
      const { validateEdgeCases } = await import("./process-validator");

      const checks = validateEdgeCases({
        steps: [{ id: "step-1", name: "Step", executor: "ai-agent" }],
      });

      const nameCheck = checks.find((c) => c.input === "process.name");
      expect(nameCheck?.pass).toBe(false);
    });

    it("fails when process has no steps", async () => {
      const { validateEdgeCases } = await import("./process-validator");

      const checks = validateEdgeCases({
        name: "Empty Process",
        steps: [],
      });

      const stepsCheck = checks.find((c) => c.input === "process.steps");
      expect(stepsCheck?.pass).toBe(false);
    });

    it("fails for steps missing required fields", async () => {
      const { validateEdgeCases } = await import("./process-validator");

      const checks = validateEdgeCases({
        name: "Bad Steps",
        steps: [
          { id: "step-1", name: "Good Step", executor: "ai-agent" },
          { id: "", name: "No ID", executor: "ai-agent" },
          { id: "step-3", name: "", executor: "ai-agent" },
        ],
      });

      const stepFailures = checks.filter(
        (c) => c.check === "edge-case" && !c.pass && c.input.startsWith("step"),
      );
      expect(stepFailures.length).toBeGreaterThan(0);
    });

    it("detects invalid dependency references", async () => {
      const { validateEdgeCases } = await import("./process-validator");

      const checks = validateEdgeCases({
        name: "Bad Deps",
        steps: [
          { id: "step-1", name: "First", executor: "ai-agent" },
          { id: "step-2", name: "Second", executor: "ai-agent", depends_on: ["nonexistent"] },
        ],
      });

      const depCheck = checks.find((c) => c.input.includes("nonexistent"));
      expect(depCheck?.pass).toBe(false);
    });

    it("detects circular dependencies", async () => {
      const { validateEdgeCases } = await import("./process-validator");

      const checks = validateEdgeCases({
        name: "Circular",
        steps: [
          { id: "step-1", name: "A", executor: "ai-agent", depends_on: ["step-2"] },
          { id: "step-2", name: "B", executor: "ai-agent", depends_on: ["step-1"] },
        ],
      });

      const circularCheck = checks.find((c) => c.input === "step dependency graph");
      expect(circularCheck?.pass).toBe(false);
    });
  });

  // ============================================================
  // Compliance scanning
  // ============================================================

  describe("validateCompliance", () => {
    it("passes for clean definitions", async () => {
      const { validateCompliance } = await import("./process-validator");

      const checks = validateCompliance({
        name: "Clean Process",
        steps: [{ id: "step-1", name: "Work", executor: "ai-agent" }],
        trust: { initial_tier: "supervised" },
      });

      const failures = checks.filter((c) => !c.pass);
      expect(failures).toHaveLength(0);
    });

    it("detects hardcoded secrets", async () => {
      const { validateCompliance } = await import("./process-validator");

      const checks = validateCompliance({
        name: "Secret Process",
        steps: [{
          id: "step-1",
          name: "Call API",
          executor: "ai-agent",
          config: { api_key: "sk-1234567890abcdef" },
        }],
      });

      const secretCheck = checks.find(
        (c) => c.check === "compliance" && c.input.includes("full text") && c.expected.includes("secrets"),
      );
      expect(secretCheck?.pass).toBe(false);
    });

    it("detects PII patterns", async () => {
      const { validateCompliance } = await import("./process-validator");

      const checks = validateCompliance({
        name: "PII Process",
        description: "Send email to john@example.com",
        steps: [{ id: "step-1", name: "Send", executor: "ai-agent" }],
      });

      const piiCheck = checks.find(
        (c) => c.check === "compliance" && c.expected.includes("PII"),
      );
      expect(piiCheck?.pass).toBe(false);
    });
  });

  // ============================================================
  // Efficiency analysis
  // ============================================================

  describe("validateEfficiency", () => {
    it("passes for efficient processes", async () => {
      const { validateEfficiency } = await import("./process-validator");

      const checks = validateEfficiency(
        {
          name: "Efficient Process",
          description: "A well-designed process with proper documentation",
          steps: [
            { id: "step-1", name: "Research", executor: "ai-agent" },
            { id: "step-2", name: "Review", executor: "human", depends_on: ["step-1"] },
          ],
          quality_criteria: ["Output is accurate", "Review is thorough"],
        },
        "Efficient Process",
      );

      const failures = checks.filter((c) => !c.pass);
      expect(failures).toHaveLength(0);
    });

    it("flags hardcoded URLs", async () => {
      const { validateEfficiency } = await import("./process-validator");

      const checks = validateEfficiency(
        {
          name: "Hardcoded Process",
          description: "A long enough description for the check",
          steps: [{
            id: "step-1",
            name: "Fetch",
            executor: "ai-agent",
            config: { url: "https://api.example.com/v1/data" },
          }],
          quality_criteria: ["Works"],
        },
        "Hardcoded Process",
      );

      const urlCheck = checks.find((c) => c.input.includes("hardcoded"));
      expect(urlCheck?.pass).toBe(false);
    });

    it("flags consecutive same-executor steps", async () => {
      const { validateEfficiency } = await import("./process-validator");

      const checks = validateEfficiency(
        {
          name: "Chatty Process",
          description: "Too many AI steps in sequence for efficiency",
          steps: [
            { id: "step-1", name: "Research A", executor: "ai-agent" },
            { id: "step-2", name: "Research B", executor: "ai-agent", depends_on: ["step-1"] },
            { id: "step-3", name: "Research C", executor: "ai-agent", depends_on: ["step-2"] },
          ],
          quality_criteria: ["Thorough"],
        },
        "Chatty Process",
      );

      const consolidationCheck = checks.find((c) => c.input.includes("step sequence"));
      expect(consolidationCheck?.pass).toBe(false);
    });

    it("flags missing quality criteria", async () => {
      const { validateEfficiency } = await import("./process-validator");

      const checks = validateEfficiency(
        {
          name: "No Criteria",
          description: "This process has no quality criteria defined",
          steps: [{ id: "step-1", name: "Do", executor: "ai-agent" }],
        },
        "No Criteria",
      );

      const criteriaCheck = checks.find((c) => c.input === "quality_criteria");
      expect(criteriaCheck?.pass).toBe(false);
    });
  });

  // ============================================================
  // Duplicate detection
  // ============================================================

  describe("detectDuplicates", () => {
    it("passes when library is empty", async () => {
      const { detectDuplicates } = await import("./process-validator");

      const checks = await detectDuplicates(
        "new-process",
        "New Process",
        "Something entirely new",
        randomUUID(),
      );

      expect(checks.every((c) => c.pass)).toBe(true);
    });

    it("passes for dissimilar processes", async () => {
      const { detectDuplicates } = await import("./process-validator");

      await testDb.insert(schema.processModels).values({
        slug: "billing-invoices",
        name: "Billing Invoice Generator",
        description: "Generate monthly billing invoices for customers",
        processDefinition: { steps: [] },
        status: "published",
      });

      const checks = await detectDuplicates(
        "person-research",
        "Person Research Deep Dive",
        "Research a specific person for outreach",
        randomUUID(),
      );

      expect(checks.every((c) => c.pass)).toBe(true);
    });

    it("detects duplicates with >70% similarity", async () => {
      const { detectDuplicates } = await import("./process-validator");

      await testDb.insert(schema.processModels).values({
        slug: "person-research",
        name: "Person Research Deep Dive",
        description: "Research a specific person before outreach contact",
        processDefinition: { steps: [] },
        status: "published",
      });

      const checks = await detectDuplicates(
        "person-deep-research",
        "Person Research Deep Analysis",
        "Research a specific person before outreach contact",
        randomUUID(),
      );

      const dupCheck = checks.find((c) => c.check === "duplicate");
      expect(dupCheck?.pass).toBe(false);
    });
  });

  // ============================================================
  // Full validation (executeProcessValidator)
  // ============================================================

  describe("executeProcessValidator", () => {
    it("validates a good process and marks as standardised", async () => {
      const { executeProcessValidator } = await import("./process-validator");

      const [model] = await testDb.insert(schema.processModels).values({
        slug: "good-process",
        name: "Good Process",
        description: "A well-formed process model for testing validation",
        processDefinition: {
          name: "Good Process",
          id: "good-process",
          description: "A well-formed process model for testing validation",
          steps: [
            { id: "step-1", name: "Research", executor: "ai-agent", description: "Do research" },
            { id: "step-2", name: "Review", executor: "human", description: "Review", depends_on: ["step-1"] },
          ],
          inputs: [{ name: "topic", type: "text", required: true }],
          quality_criteria: ["Accurate results", "Complete coverage"],
          trust: { initial_tier: "supervised" },
        },
        status: "nominated",
      }).returning();

      const result = await executeProcessValidator({ processModelId: model.id });

      expect(result.confidence).toBe("high");
      const report = result.outputs["validation-result"] as { passed: boolean };
      expect(report.passed).toBe(true);

      // Verify model was updated to standardised
      const [updated] = await testDb
        .select()
        .from(schema.processModels)
        .where(require("drizzle-orm").eq(schema.processModels.id, model.id));
      expect(updated.status).toBe("standardised");
    });

    it("validates a bad process and keeps nominated", async () => {
      const { executeProcessValidator } = await import("./process-validator");

      const [model] = await testDb.insert(schema.processModels).values({
        slug: "bad-process",
        name: "",
        description: "",
        processDefinition: {
          name: "",
          steps: [],
        },
        status: "nominated",
      }).returning();

      const result = await executeProcessValidator({ processModelId: model.id });

      expect(result.confidence).toBe("medium");
      const report = result.outputs["validation-result"] as { passed: boolean; checks: Array<{ pass: boolean }> };
      expect(report.passed).toBe(false);
      expect(report.checks.some((c) => !c.pass)).toBe(true);
    });

    it("returns error for missing model", async () => {
      const { executeProcessValidator } = await import("./process-validator");

      const result = await executeProcessValidator({ processModelId: randomUUID() });

      expect(result.confidence).toBe("low");
    });
  });
});
