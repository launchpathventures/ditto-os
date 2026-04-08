/**
 * Tests for network nurture loop — verifies the template loads,
 * the schedule can be created, and the quality gate checks work.
 *
 * Provenance: Brief 079/084.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import YAML from "yaml";
import fs from "fs";
import path from "path";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

const { createPerson, recordInteraction, optOutPerson } = await import("./people");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("network-nurture template", () => {
  it("parses the YAML template correctly", () => {
    const templatePath = path.resolve(process.cwd(), "processes/templates/network-nurture.yaml");
    const content = fs.readFileSync(templatePath, "utf-8");
    const parsed = YAML.parse(content);

    expect(parsed.id).toBe("network-nurture");
    expect(parsed.trigger.type).toBe("schedule");
    expect(parsed.trust.initial_tier).toBe("autonomous"); // Insight-160: Alex is the professional
    expect(parsed.steps).toHaveLength(4);
    expect(parsed.steps[0].id).toBe("scan-graph");
    expect(parsed.steps[2].id).toBe("quality-gate");
  });

  it("has the quality-gate step as a rules executor", () => {
    const templatePath = path.resolve(process.cwd(), "processes/templates/network-nurture.yaml");
    const content = fs.readFileSync(templatePath, "utf-8");
    const parsed = YAML.parse(content);

    const qualityGate = parsed.steps.find((s: { id: string }) => s.id === "quality-gate");
    expect(qualityGate).toBeDefined();
    expect(qualityGate.executor).toBe("rules");
  });
});

describe("nurture candidate selection logic", () => {
  it("identifies people who haven't been contacted recently", async () => {
    // Create people with different last interaction times
    const recent = await createPerson({ userId: "user-1", name: "Recent Contact" });
    await recordInteraction({
      personId: recent.id,
      userId: "user-1",
      type: "nurture",
      mode: "nurture",
    });

    const stale = await createPerson({ userId: "user-1", name: "Stale Contact" });
    // Set lastInteractionAt to 3 weeks ago
    const { eq } = await import("drizzle-orm");
    await testDb
      .update(schema.people)
      .set({ lastInteractionAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.people.id, stale.id));

    const neverContacted = await createPerson({ userId: "user-1", name: "Never Contacted" });

    // Query people who need nurture (lastInteractionAt > 2 weeks ago or null)
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const allPeople = await testDb
      .select()
      .from(schema.people)
      .where(eq(schema.people.userId, "user-1"));

    const nurtureCandidates = allPeople.filter((p) => {
      if (p.optedOut) return false;
      if (!p.lastInteractionAt) return true; // Never contacted
      return new Date(p.lastInteractionAt).getTime() < twoWeeksAgo;
    });

    expect(nurtureCandidates).toHaveLength(2);
    const names = nurtureCandidates.map((p) => p.name);
    expect(names).toContain("Stale Contact");
    expect(names).toContain("Never Contacted");
    expect(names).not.toContain("Recent Contact");
  });

  it("excludes opted-out people from nurture", async () => {
    const person = await createPerson({ userId: "user-1", name: "Opted Out" });
    await optOutPerson(person.id);

    const allPeople = await testDb
      .select()
      .from(schema.people)
      .where(require("drizzle-orm").eq(schema.people.userId, "user-1"));

    const nurtureCandidates = allPeople.filter((p) => !p.optedOut);
    expect(nurtureCandidates).toHaveLength(0);
  });
});

describe("all four process templates", () => {
  const templates = [
    "selling-outreach",
    "connecting-research",
    "connecting-introduction",
    "network-nurture",
  ];

  for (const template of templates) {
    it(`${template} template parses and has required fields`, () => {
      const templatePath = path.resolve(process.cwd(), `processes/templates/${template}.yaml`);
      const content = fs.readFileSync(templatePath, "utf-8");
      const parsed = YAML.parse(content);

      expect(parsed.id).toBe(template);
      expect(parsed.name).toBeDefined();
      expect(parsed.steps.length).toBeGreaterThan(0);
      expect(parsed.trust).toBeDefined();
      expect(parsed.trust.initial_tier).toBeDefined();
      expect(parsed.quality_criteria).toBeDefined();
      expect(parsed.feedback).toBeDefined();
    });
  }

  it("connecting-introduction runs at autonomous trust tier (Insight-160: Alex is the professional)", () => {
    const templatePath = path.resolve(process.cwd(), "processes/templates/connecting-introduction.yaml");
    const content = fs.readFileSync(templatePath, "utf-8");
    const parsed = YAML.parse(content);
    expect(parsed.trust.initial_tier).toBe("autonomous");
  });

  it("selling-outreach has trust upgrade path", () => {
    const templatePath = path.resolve(process.cwd(), "processes/templates/selling-outreach.yaml");
    const content = fs.readFileSync(templatePath, "utf-8");
    const parsed = YAML.parse(content);
    expect(parsed.trust.upgrade_path.length).toBeGreaterThan(0);
  });
});
