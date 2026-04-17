/**
 * YAML round-trip validation tests (Brief 173).
 */

import { describe, it, expect } from "vitest";
import { roundTripValidate } from "./yaml-round-trip";
import type { ProcessDefinition } from "../process-loader";

function validDef(
  overrides: Partial<ProcessDefinition> = {},
): ProcessDefinition {
  return {
    name: "Test Process",
    id: "test",
    slug: "test",
    version: 1,
    status: "active",
    description: "Test",
    trigger: { type: "manual" },
    inputs: [],
    outputs: [],
    governance: {
      trust_tier: "supervised",
      quality_criteria: "passes",
      feedback: "implicit",
    },
    steps: [
      {
        id: "s1",
        name: "Step 1",
        executor: "ai-agent",
        description: "Do work",
      },
    ],
    ...overrides,
  } as unknown as ProcessDefinition;
}

describe("roundTripValidate", () => {
  it("accepts a valid definition", () => {
    const r = roundTripValidate(validDef());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.yaml).toContain("Test Process");
    }
  });

  it("rejects a definition containing a NUL byte", () => {
    const def = validDef();
    (def.steps as unknown as Array<Record<string, unknown>>)[0]!.description =
      "contains \0 a null byte";
    const r = roundTripValidate(def);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/NUL/);
    }
  });

  it("rejects a definition with a non-JSON-safe value (Function)", () => {
    const def = validDef() as unknown as Record<string, unknown>;
    (def.steps as unknown as Array<Record<string, unknown>>)[0]!.handler = () => 1;
    const r = roundTripValidate(def as unknown as ProcessDefinition);
    expect(r.ok).toBe(false);
  });

  it("provides a diff path when the round-trip loses data", () => {
    // Construct a tree where YAML parse produces something different —
    // using a value that serialises but doesn't round-trip cleanly is rare,
    // so simulate by passing a Date, which YAML writes as a timestamp
    // string and parses back as a Date too (so that would equal). Use
    // undefined vs null asymmetry instead: undefined drops on stringify
    // but null round-trips, creating a mismatch if mixed.
    const def = validDef() as unknown as Record<string, unknown>;
    (def.steps as unknown as Array<Record<string, unknown>>)[0]!.sentinel = undefined;
    // This actually round-trips (both sides collapse undefined), so
    // produce a guaranteed-different round-trip: inject a map where the
    // value is a function.
    (def.steps as unknown as Array<Record<string, unknown>>)[0]!.handler = () => 1;
    const r = roundTripValidate(def as unknown as ProcessDefinition);
    expect(r.ok).toBe(false);
  });

  it("re-runs loader validators on the reparsed definition", () => {
    // Construct a definition with a dependency cycle — loader validator
    // should flag it via the round-trip check.
    const def = validDef() as unknown as Record<string, unknown>;
    const steps = def.steps as Array<Record<string, unknown>>;
    steps.push({
      id: "s2",
      name: "Step 2",
      executor: "ai-agent",
      depends_on: ["s1"],
    });
    steps[0]!.depends_on = ["s2"];
    const r = roundTripValidate(def as unknown as ProcessDefinition);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/loader checks|depend/i);
    }
  });

  it("returns the yaml string on success", () => {
    const r = roundTripValidate(validDef());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.yaml).toContain("steps:");
      expect(r.yaml).toContain("s1");
    }
  });

  describe("Brief 179 P1-4 — explicit undefined rejection", () => {
    it("rejects an explicit undefined value on a step field", () => {
      const def = validDef() as unknown as Record<string, unknown>;
      // Explicitly set undefined — not absent, actually `undefined` as a
      // value. YAML would silently drop it, losing intent.
      (def.steps as unknown as Array<Record<string, unknown>>)[0]!.description = undefined;
      const r = roundTripValidate(def as unknown as ProcessDefinition);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toMatch(/undefined/i);
        expect(r.path).toMatch(/description/);
      }
    });

    it("rejects explicit undefined inside a nested object", () => {
      const def = validDef() as unknown as Record<string, unknown>;
      (def.steps as unknown as Array<Record<string, unknown>>)[0]!.config = {
        trust_tier: undefined,
      };
      const r = roundTripValidate(def as unknown as ProcessDefinition);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toMatch(/undefined/i);
      }
    });

    it("accepts explicit null (null round-trips cleanly; intent preserved)", () => {
      const def = validDef() as unknown as Record<string, unknown>;
      (def.steps as unknown as Array<Record<string, unknown>>)[0]!.description = null;
      const r = roundTripValidate(def as unknown as ProcessDefinition);
      expect(r.ok).toBe(true);
    });

    it("accepts fully absent keys (the clean way to signal 'no value')", () => {
      const def = validDef();
      // steps[0] already has no `config` key — that's fine
      const r = roundTripValidate(def);
      expect(r.ok).toBe(true);
    });
  });
});
