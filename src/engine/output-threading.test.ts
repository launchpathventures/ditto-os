/**
 * Tests for output threading (Brief 103)
 *
 * Tests cover:
 * - Output extraction and shaping (AC10)
 * - Re-threading on correction (AC14)
 * - Fallback behavior on LLM parse failure
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./llm", () => ({
  createCompletion: vi.fn(),
  extractText: vi.fn(),
}));

import { threadOutputs, reThreadOutputs } from "./output-threading";
import { createCompletion, extractText } from "./llm";

const mockCreateCompletion = vi.mocked(createCompletion);
const mockExtractText = vi.mocked(extractText);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("output threading", () => {
  describe("threadOutputs (AC10)", () => {
    it("extracts relevant output and shapes it for the target sub-goal", async () => {
      const llmResponse = JSON.stringify({
        shapedInput: { researchFindings: "Key insight about the market" },
        reasoning: "Extracted market research relevant to the build phase",
      });

      mockCreateCompletion.mockResolvedValue({
        content: [{ type: "text", text: llmResponse }],
        tokensUsed: 100,
        costCents: 0.5,
        stopReason: "end_turn",
        model: "test-model",
      });
      mockExtractText.mockReturnValue(llmResponse);

      const result = await threadOutputs({
        sourceSubGoalId: "sg-1",
        sourceSubGoalTitle: "Market Research",
        sourceOutput: { findings: "Market is growing 20% YoY", sources: ["report-1"] },
        targetSubGoalId: "sg-2",
        targetSubGoalTitle: "Build Marketing Strategy",
        targetSubGoalDescription: "Create a marketing strategy based on research findings",
      });

      expect(result.shapedInput).toEqual({ researchFindings: "Key insight about the market" });
      expect(result.reasoning).toContain("market research");
      expect(result.costCents).toBe(0.5);

      // Verify the LLM was called with fast purpose
      expect(mockCreateCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: "analysis" }),
      );
    });

    it("falls back to raw output when LLM parse fails", async () => {
      mockCreateCompletion.mockResolvedValue({
        content: [{ type: "text", text: "unparseable response" }],
        tokensUsed: 50,
        costCents: 0.2,
        stopReason: "end_turn",
        model: "test-model",
      });
      mockExtractText.mockReturnValue("unparseable response");

      const sourceOutput = { data: "test" };
      const result = await threadOutputs({
        sourceSubGoalId: "sg-1",
        sourceSubGoalTitle: "Source",
        sourceOutput,
        targetSubGoalId: "sg-2",
        targetSubGoalTitle: "Target",
        targetSubGoalDescription: "Needs input",
      });

      expect(result.shapedInput).toEqual({ _rawSourceOutput: sourceOutput });
      expect(result.reasoning).toContain("Failed to parse");
    });
  });

  describe("reThreadOutputs (AC14)", () => {
    it("re-threads with user correction applied", async () => {
      const llmResponse = JSON.stringify({
        shapedInput: { correctedData: "Filtered results only" },
        reasoning: "Applied user correction to filter irrelevant results",
      });

      mockCreateCompletion.mockResolvedValue({
        content: [{ type: "text", text: llmResponse }],
        tokensUsed: 120,
        costCents: 0.6,
        stopReason: "end_turn",
        model: "test-model",
      });
      mockExtractText.mockReturnValue(llmResponse);

      const result = await reThreadOutputs({
        original: {
          sourceSubGoalId: "sg-1",
          sourceSubGoalTitle: "Data Collection",
          sourceOutput: { all: "lots of data", filtered: "relevant bits" },
          targetSubGoalId: "sg-2",
          targetSubGoalTitle: "Analysis",
          targetSubGoalDescription: "Analyze the filtered data only",
        },
        correction: "Only pass the filtered data, not the raw collection",
      });

      expect(result.shapedInput).toEqual({ correctedData: "Filtered results only" });
      expect(result.reasoning).toContain("correction");
      expect(result.costCents).toBe(0.6);
    });
  });
});
