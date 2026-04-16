/**
 * Tests for Coverage Agent (MP-10.3)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockWhere = vi.fn();
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock("../../db", () => ({
  db: { select: (...args: any[]) => mockSelect(...args) },
  schema: {
    processes: {
      slug: "slug",
      name: "name",
      description: "description",
      status: "status",
    },
  },
}));

vi.mock("../user-model", () => ({
  getUserModel: vi.fn().mockResolvedValue({
    entries: [
      { content: "plumbing business", dimension: "problems" },
      { content: "renovation contractor", dimension: "tasks" },
    ],
    missingDimensions: [],
    completeness: 0.8,
  }),
}));

vi.mock("./process-model-lookup", () => ({
  findProcessModelSync: vi.fn().mockReturnValue(null),
}));

import { executeCoverageAgent } from "./coverage-agent";

describe("executeCoverageAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
  });

  it("returns gaps for trades business with no processes", async () => {
    mockWhere.mockResolvedValueOnce([]);

    const result = await executeCoverageAgent({ userId: "test" });

    expect(result.confidence).toBe("high");
    const suggestions = result.outputs["coverage-suggestions"] as any[];
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].importance).toBe("core");
    expect(result.outputs["industry"]).toBe("Trades & Construction");
  });

  it("filters out gaps covered by existing processes", async () => {
    mockWhere.mockResolvedValueOnce([
      { slug: "quoting", name: "Quoting & Estimation", description: "Generate quotes with materials, labour" },
      { slug: "job-scheduling", name: "Job Scheduling", description: "Schedule jobs across team with calendar" },
      { slug: "invoicing", name: "Invoicing & Payment", description: "Generate invoices and track payments billing" },
    ]);

    const result = await executeCoverageAgent({ userId: "test" });
    const suggestions = result.outputs["coverage-suggestions"] as any[];

    const suggestionNames = suggestions.map((s: any) => s.name.toLowerCase());
    expect(suggestionNames).not.toContain("quoting & estimation");
    expect(suggestionNames).not.toContain("job scheduling");
    expect(suggestionNames).not.toContain("invoicing & payment");
  });

  it("returns empty when no industry match", async () => {
    const { getUserModel } = await import("../user-model");
    vi.mocked(getUserModel).mockResolvedValueOnce({
      entries: [{ content: "random stuff", dimension: "problems" }],
      missingDimensions: [],
      completeness: 0.5,
    } as any);

    mockWhere.mockResolvedValueOnce([]);

    const result = await executeCoverageAgent({ userId: "test" });
    const suggestions = result.outputs["coverage-suggestions"] as any[];
    expect(suggestions).toEqual([]);
    expect(result.confidence).toBe("medium");
  });

  it("caps suggestions at 5", async () => {
    mockWhere.mockResolvedValueOnce([]);

    const result = await executeCoverageAgent({ userId: "test" });
    const suggestions = result.outputs["coverage-suggestions"] as any[];
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });

  it("includes template slug when template exists", async () => {
    const { findProcessModelSync } = await import("./process-model-lookup");
    vi.mocked(findProcessModelSync).mockReturnValue({
      slug: "invoice-follow-up",
      name: "Invoice Follow-up",
      description: "Follow up on invoices",
      confidence: 0.8,
      reasoning: "keyword match",
      templatePath: "templates/invoice-follow-up.yaml",
    });

    mockWhere.mockResolvedValueOnce([]);

    const result = await executeCoverageAgent({ userId: "test" });
    const suggestions = result.outputs["coverage-suggestions"] as any[];
    const withTemplate = suggestions.find((s: any) => s.templateSlug !== null);
    expect(withTemplate).toBeDefined();
  });
});
