/**
 * Tests for dimension map clarity assessment (Brief 102)
 */

import { describe, it, expect } from "vitest";
import { assessClarity, isDecompositionReady, getClarityQuestions } from "./dimension-map";
import type { DimensionMap } from "@ditto/core";

describe("Dimension map — assessClarity", () => {
  it("assesses a detailed goal as partially clear", () => {
    const map = assessClarity(
      "Build a freelance consulting business that delivers $10,000/month within 6 months using our existing CRM and website",
    );

    expect(map.dimensions).toHaveLength(6);

    // Outcome should be partial (has clear signals like "build", "$10,000/month", "within 6 months")
    const outcome = map.dimensions.find(d => d.dimension === "outcome")!;
    expect(outcome.level).toBe("partial");

    // Constraints should be partial (has "$10,000" and "6 months")
    const constraints = map.dimensions.find(d => d.dimension === "constraints")!;
    expect(constraints.level).toBe("partial");

    // Infrastructure should be partial (mentions "CRM and website")
    const infra = map.dimensions.find(d => d.dimension === "infrastructure")!;
    expect(infra.level).toBe("partial");

    // Should be ready to decompose (outcome is at least partial)
    expect(map.readyToDecompose).toBe(true);
  });

  it("assesses a vague goal as needing clarity", () => {
    const map = assessClarity("I want better onboarding");

    const outcome = map.dimensions.find(d => d.dimension === "outcome")!;
    expect(outcome.level).toBe("vague"); // "want" is a weak signal

    expect(map.readyToDecompose).toBe(false);
  });

  it("assesses an empty goal as unknown across all dimensions", () => {
    const map = assessClarity("");

    for (const dim of map.dimensions) {
      expect(dim.level).toBe("unknown");
    }
    expect(map.overallClarity).toBe("unknown");
    expect(map.readyToDecompose).toBe(false);
  });

  it("uses existingContext to improve clarity", () => {
    const map = assessClarity("improve our processes", {
      outcome: "Reduce average process completion time by 30%",
      constraints: "Budget of $5000 and deadline by end of Q2",
    });

    const outcome = map.dimensions.find(d => d.dimension === "outcome")!;
    expect(["clear", "partial"]).toContain(outcome.level);

    const constraints = map.dimensions.find(d => d.dimension === "constraints")!;
    expect(["clear", "partial"]).toContain(constraints.level);
  });
});

describe("Dimension map — isDecompositionReady", () => {
  it("returns true when outcome is clear", () => {
    const map: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "test" },
        { dimension: "assets", level: "unknown", evidence: "test" },
        { dimension: "constraints", level: "unknown", evidence: "test" },
        { dimension: "context", level: "unknown", evidence: "test" },
        { dimension: "infrastructure", level: "unknown", evidence: "test" },
        { dimension: "risk_tolerance", level: "unknown", evidence: "test" },
      ],
      overallClarity: "unknown",
      readyToDecompose: false,
    };

    expect(isDecompositionReady(map)).toBe(true);
  });

  it("returns true when outcome is partial", () => {
    const map: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "partial", evidence: "test" },
        { dimension: "assets", level: "unknown", evidence: "test" },
        { dimension: "constraints", level: "unknown", evidence: "test" },
        { dimension: "context", level: "unknown", evidence: "test" },
        { dimension: "infrastructure", level: "unknown", evidence: "test" },
        { dimension: "risk_tolerance", level: "unknown", evidence: "test" },
      ],
      overallClarity: "unknown",
      readyToDecompose: false,
    };

    expect(isDecompositionReady(map)).toBe(true);
  });

  it("returns false when outcome is vague", () => {
    const map: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "vague", evidence: "test" },
        { dimension: "assets", level: "clear", evidence: "test" },
        { dimension: "constraints", level: "clear", evidence: "test" },
        { dimension: "context", level: "clear", evidence: "test" },
        { dimension: "infrastructure", level: "clear", evidence: "test" },
        { dimension: "risk_tolerance", level: "clear", evidence: "test" },
      ],
      overallClarity: "partial",
      readyToDecompose: false,
    };

    expect(isDecompositionReady(map)).toBe(false);
  });

  it("returns false when outcome is unknown", () => {
    const map: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "unknown", evidence: "test" },
        { dimension: "assets", level: "clear", evidence: "test" },
        { dimension: "constraints", level: "clear", evidence: "test" },
        { dimension: "context", level: "clear", evidence: "test" },
        { dimension: "infrastructure", level: "clear", evidence: "test" },
        { dimension: "risk_tolerance", level: "clear", evidence: "test" },
      ],
      overallClarity: "partial",
      readyToDecompose: false,
    };

    expect(isDecompositionReady(map)).toBe(false);
  });
});

describe("Dimension map — getClarityQuestions", () => {
  it("returns questions only for vague/unknown dimensions", () => {
    const map: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "test" },
        { dimension: "assets", level: "vague", evidence: "test", question: "What do you have?" },
        { dimension: "constraints", level: "unknown", evidence: "test" },
        { dimension: "context", level: "partial", evidence: "test" },
        { dimension: "infrastructure", level: "clear", evidence: "test" },
        { dimension: "risk_tolerance", level: "vague", evidence: "test" },
      ],
      overallClarity: "vague",
      readyToDecompose: true,
    };

    const questions = getClarityQuestions(map);

    expect(questions).toHaveLength(3);
    expect(questions.map(q => q.dimension)).toEqual(
      expect.arrayContaining(["assets", "constraints", "risk_tolerance"]),
    );

    // Each question should have content
    for (const q of questions) {
      expect(q.question.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array when all dimensions are clear", () => {
    const map: DimensionMap = {
      dimensions: [
        { dimension: "outcome", level: "clear", evidence: "test" },
        { dimension: "assets", level: "clear", evidence: "test" },
        { dimension: "constraints", level: "partial", evidence: "test" },
        { dimension: "context", level: "clear", evidence: "test" },
        { dimension: "infrastructure", level: "partial", evidence: "test" },
        { dimension: "risk_tolerance", level: "clear", evidence: "test" },
      ],
      overallClarity: "partial",
      readyToDecompose: true,
    };

    expect(getClarityQuestions(map)).toHaveLength(0);
  });
});
