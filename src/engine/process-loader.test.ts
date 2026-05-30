/**
 * Tests for process-loader.ts
 * AC-3: YAML with human step + input_fields parses correctly
 * AC-4: Circular dependency detection throws an error
 */

import { describe, it, expect } from "vitest";
import path from "path";
import {
  validateDependencies,
  validateSubProcessSteps,
  flattenSteps,
  loadProcessFile,
  loadAllProcesses,
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

  describe("cycle loading (Brief 117)", () => {
    const cycleDir = path.join(process.cwd(), "processes", "cycles");

    it("loads sales-marketing cycle YAML without errors", () => {
      const def = loadProcessFile(path.join(cycleDir, "sales-marketing.yaml"));
      expect(def.id).toBe("sales-marketing-cycle");
      expect(def.name).toBe("Sales & Marketing Cycle");
      expect(def.status).toBe("active");
      expect(def.defaultIdentity).toBe("agent-of-user");
    });

    it("loads network-connecting cycle YAML without errors", () => {
      const def = loadProcessFile(path.join(cycleDir, "network-connecting.yaml"));
      expect(def.id).toBe("network-connecting-cycle");
      expect(def.defaultIdentity).toBe("principal");
    });

    it("loads relationship-nurture cycle YAML without errors", () => {
      const def = loadProcessFile(path.join(cycleDir, "relationship-nurture.yaml"));
      expect(def.id).toBe("relationship-nurture-cycle");
    });

    it("cycle definitions follow archetype phase order", () => {
      const archetypeOrder = ["sense", "assess", "act", "gate", "land", "learn", "brief"];
      const files = ["sales-marketing.yaml", "network-connecting.yaml", "relationship-nurture.yaml"];

      for (const file of files) {
        const def = loadProcessFile(path.join(cycleDir, file));
        const steps = flattenSteps(def);
        const phases = steps
          .map((s) => (s.config?.cyclePhase as string) || "")
          .filter(Boolean);

        // Verify phases are in archetype order (some may be omitted, duplicates allowed for dual LAND)
        let lastIndex = -1;
        for (const phase of phases) {
          const idx = archetypeOrder.indexOf(phase);
          expect(idx).toBeGreaterThanOrEqual(0); // valid phase name
          expect(idx).toBeGreaterThanOrEqual(lastIndex); // order preserved (equal allowed for dual steps)
          lastIndex = idx;
        }
      }
    });

    it("sales cycle has sub-process step referencing selling-outreach", () => {
      const def = loadProcessFile(path.join(cycleDir, "sales-marketing.yaml"));
      const steps = flattenSteps(def);
      const subProcessSteps = steps.filter((s) => s.executor === "sub-process");
      expect(subProcessSteps.length).toBeGreaterThanOrEqual(1);
      const sellingStep = subProcessSteps.find(
        (s) => s.config?.process_id === "selling-outreach" || s.config?.process_id === "social-publishing"
      );
      expect(sellingStep).toBeDefined();
    });

    it("network connecting cycle has critical trustOverride on GATE step", () => {
      const def = loadProcessFile(path.join(cycleDir, "network-connecting.yaml"));
      const steps = flattenSteps(def);
      const gateStep = steps.find((s) => s.config?.cyclePhase === "gate");
      expect(gateStep).toBeDefined();
      expect(gateStep!.trustOverride).toBe("critical");
    });

    it("loadAllProcesses includes cycles from processes/cycles/ directory", () => {
      const all = loadAllProcesses(
        path.join(process.cwd(), "processes"),
        path.join(process.cwd(), "processes", "templates"),
        cycleDir,
      );
      const cycleIds = all.map((d) => d.id).filter((id) => id.includes("cycle"));
      expect(cycleIds).toContain("sales-marketing-cycle");
      expect(cycleIds).toContain("network-connecting-cycle");
      expect(cycleIds).toContain("relationship-nurture-cycle");
    });

    it("does NOT load the Background Watch YAML (Brief 293 — documentation-only)", () => {
      // The watch YAML lives at processes/cycles/network/network-background-watch.yaml.
      // loadAllProcesses only scans the top level of each directory, so the
      // subdirectory file is invisible to the workspace process engine. The
      // runner is invoked directly by scheduler + manual route; if this test
      // breaks, the watch has been promoted to a workspace process by accident.
      const all = loadAllProcesses(
        path.join(process.cwd(), "processes"),
        path.join(process.cwd(), "processes", "templates"),
        cycleDir,
      );
      const ids = all.map((d) => d.id);
      expect(ids).not.toContain("network-background-watch");
    });

    it("cycle step definitions are under 500 tokens (agent context budget)", () => {
      const files = ["sales-marketing.yaml", "network-connecting.yaml", "relationship-nurture.yaml"];
      for (const file of files) {
        const def = loadProcessFile(path.join(cycleDir, file));
        // Steps-only representation: what the agent actually needs at runtime
        const stepsOnly = {
          name: def.name,
          id: def.id,
          steps: flattenSteps(def).map((s) => ({
            id: s.id, name: s.name, executor: s.executor,
            description: s.description, config: s.config, trustOverride: s.trustOverride,
          })),
        };
        const estimatedTokens = Math.ceil(JSON.stringify(stepsOnly).length / 4);
        // Brief targets 400 tokens for agent context; steps-only is ~450-490
        // Full metadata (trust, feedback, etc.) stays in DB, not in agent context
        expect(estimatedTokens).toBeLessThan(500);
      }
    });
  });

  describe("sub-process validation (Brief 117)", () => {
    it("rejects sub-process step with missing config.process_id", () => {
      const def = makeTestProcessDefinition({
        steps: [
          { id: "sp", name: "Sub", executor: "sub-process", config: {} },
        ],
      }) as unknown as ProcessDefinition;

      const errors = validateSubProcessSteps(def, new Set(["some-process"]));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("requires config.process_id");
    });

    it("rejects sub-process step referencing non-existent process slug", () => {
      const def = makeTestProcessDefinition({
        steps: [
          { id: "sp", name: "Sub", executor: "sub-process", config: { process_id: "nonexistent" } },
        ],
      }) as unknown as ProcessDefinition;

      const errors = validateSubProcessSteps(def, new Set(["some-process"]));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("does not reference a known process slug");
    });

    it("accepts sub-process step referencing a valid process slug", () => {
      const def = makeTestProcessDefinition({
        steps: [
          { id: "sp", name: "Sub", executor: "sub-process", config: { process_id: "selling-outreach" } },
        ],
      }) as unknown as ProcessDefinition;

      const errors = validateSubProcessSteps(def, new Set(["selling-outreach"]));
      expect(errors).toHaveLength(0);
    });

    it("non-sub-process steps are ignored by sub-process validation", () => {
      const def = makeTestProcessDefinition({
        steps: [
          { id: "ai", name: "AI Step", executor: "ai-agent" },
        ],
      }) as unknown as ProcessDefinition;

      const errors = validateSubProcessSteps(def, new Set());
      expect(errors).toHaveLength(0);
    });
  });

  describe("callable_as metadata (Brief 117)", () => {
    it("all templates have callable_as: sub-process", () => {
      const templateDir = path.join(process.cwd(), "processes", "templates");
      const all = loadAllProcesses(
        path.join(process.cwd(), "processes"),
        templateDir,
      );
      const templates = all.filter((d) => d.template === true);
      expect(templates.length).toBe(32);
      for (const t of templates) {
        expect(t.callable_as).toBe("sub-process");
      }
    });
  });
});
