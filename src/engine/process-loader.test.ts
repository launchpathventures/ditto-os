/**
 * Tests for process-loader.ts
 * AC-3: YAML with human step + input_fields parses correctly
 * AC-4: Circular dependency detection throws an error
 */

import { describe, it, expect } from "vitest";
import {
  validateDependencies,
  flattenSteps,
  isParallelGroup,
  isStep,
  type ProcessDefinition,
  type HumanInputField,
} from "./process-loader";
import { makeTestProcessDefinition } from "../test-utils";

describe("process-loader", () => {
  describe("human step parsing", () => {
    it("AC-3: parses human step with input_fields correctly", () => {
      const inputFields: HumanInputField[] = [
        { name: "environment", type: "select", label: "Target", options: ["staging", "prod"], required: true },
        { name: "notes", type: "text", label: "Notes", required: false },
        { name: "deploy_date", type: "date", label: "Date", required: true },
      ];

      const def = makeTestProcessDefinition({
        steps: [
          {
            id: "human-step",
            name: "Confirm deployment",
            executor: "human",
            instructions: "Review and confirm the deployment target.",
            input_fields: inputFields,
            timeout: "24h",
          },
        ],
      }) as unknown as ProcessDefinition;

      const steps = flattenSteps(def);
      expect(steps).toHaveLength(1);

      const step = steps[0];
      expect(step.executor).toBe("human");
      expect(step.instructions).toBe("Review and confirm the deployment target.");
      expect(step.input_fields).toHaveLength(3);
      expect(step.input_fields![0].name).toBe("environment");
      expect(step.input_fields![0].type).toBe("select");
      expect(step.input_fields![0].options).toEqual(["staging", "prod"]);
      expect(step.input_fields![2].type).toBe("date");
      expect(step.timeout).toBe("24h");
    });

    it("parses human step without input_fields (optional)", () => {
      const def = makeTestProcessDefinition({
        steps: [
          {
            id: "simple-human",
            name: "Manual review",
            executor: "human",
            description: "Just confirm.",
          },
        ],
      }) as unknown as ProcessDefinition;

      const steps = flattenSteps(def);
      expect(steps).toHaveLength(1);
      expect(steps[0].input_fields).toBeUndefined();
    });
  });

  describe("dependency validation", () => {
    it("AC-4: detects circular dependencies", () => {
      const def = makeTestProcessDefinition({
        steps: [
          { id: "a", name: "A", executor: "script", depends_on: ["b"] },
          { id: "b", name: "B", executor: "script", depends_on: ["a"] },
        ],
      }) as unknown as ProcessDefinition;

      const errors = validateDependencies(def);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("Circular"))).toBe(true);
    });

    it("detects self-dependency", () => {
      const def = makeTestProcessDefinition({
        steps: [
          { id: "a", name: "A", executor: "script", depends_on: ["a"] },
        ],
      }) as unknown as ProcessDefinition;

      const errors = validateDependencies(def);
      expect(errors.some((e) => e.includes("depends on itself"))).toBe(true);
    });

    it("detects missing dependency targets", () => {
      const def = makeTestProcessDefinition({
        steps: [
          { id: "a", name: "A", executor: "script", depends_on: ["nonexistent"] },
        ],
      }) as unknown as ProcessDefinition;

      const errors = validateDependencies(def);
      expect(errors.some((e) => e.includes("does not exist"))).toBe(true);
    });

    it("accepts valid linear dependencies", () => {
      const def = makeTestProcessDefinition({
        steps: [
          { id: "a", name: "A", executor: "script" },
          { id: "b", name: "B", executor: "script", depends_on: ["a"] },
          { id: "c", name: "C", executor: "script", depends_on: ["b"] },
        ],
      }) as unknown as ProcessDefinition;

      const errors = validateDependencies(def);
      expect(errors).toHaveLength(0);
    });
  });

  describe("parallel groups", () => {
    it("identifies parallel groups vs steps", () => {
      const group = {
        parallel_group: "review-checks",
        steps: [
          { id: "a", name: "A", executor: "script" },
          { id: "b", name: "B", executor: "script" },
        ],
      };
      const step = { id: "c", name: "C", executor: "script" };

      expect(isParallelGroup(group)).toBe(true);
      expect(isStep(group)).toBe(false);
      expect(isParallelGroup(step as any)).toBe(false);
      expect(isStep(step as any)).toBe(true);
    });

    it("flattenSteps extracts steps from parallel groups", () => {
      const def = makeTestProcessDefinition({
        steps: [
          {
            parallel_group: "checks",
            steps: [
              { id: "a", name: "A", executor: "script" },
              { id: "b", name: "B", executor: "script" },
            ],
          },
          { id: "c", name: "C", executor: "script" },
        ],
      }) as unknown as ProcessDefinition;

      const flat = flattenSteps(def);
      expect(flat).toHaveLength(3);
      expect(flat.map((s) => s.id)).toEqual(["a", "b", "c"]);
    });
  });
});
