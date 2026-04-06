/**
 * Tests for persona runtime — configuration, assignment, prompt building.
 *
 * Covers: persona config retrieval, persona assignment (round-robin),
 * character bible loading, prompt building per mode.
 *
 * Provenance: Brief 079/082.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

const {
  getPersonaConfig,
  getAllPersonaConfigs,
  assignPersona,
  getPersonaForPerson,
  loadCharacterBible,
  buildPersonaPrompt,
  clearCharacterBibleCache,
} = await import("./persona");

// Need people module for creating test people
const { createPerson } = await import("./people");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  clearCharacterBibleCache();
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Persona Configuration
// ============================================================

describe("getPersonaConfig", () => {
  it("returns Alex config", () => {
    const config = getPersonaConfig("alex");
    expect(config.id).toBe("alex");
    expect(config.name).toBe("Alex");
    expect(config.voiceTraits.directness).toBe(9);
    expect(config.signOff).toBe("Alex\nDitto");
  });

  it("returns Mira config", () => {
    const config = getPersonaConfig("mira");
    expect(config.id).toBe("mira");
    expect(config.name).toBe("Mira");
    expect(config.voiceTraits.formality).toBe(6);
    expect(config.signOff).toBe("Mira\nDitto");
  });
});

describe("getAllPersonaConfigs", () => {
  it("returns both personas", () => {
    const configs = getAllPersonaConfigs();
    expect(configs).toHaveLength(2);
    const ids = configs.map(c => c.id);
    expect(ids).toContain("alex");
    expect(ids).toContain("mira");
  });
});

// ============================================================
// Persona Assignment
// ============================================================

describe("assignPersona", () => {
  it("assigns a persona to a person without one", async () => {
    const person = await createPerson({ userId: "user-1", name: "Test" });
    const assignment = await assignPersona(person.id);
    expect(["alex", "mira"]).toContain(assignment);
  });

  it("returns existing assignment if already set", async () => {
    const person = await createPerson({
      userId: "user-1",
      name: "Already Assigned",
      personaAssignment: "mira",
    });
    const assignment = await assignPersona(person.id);
    expect(assignment).toBe("mira");
  });
});

describe("getPersonaForPerson", () => {
  it("returns full config for assigned persona", async () => {
    const person = await createPerson({
      userId: "user-1",
      name: "Config Test",
      personaAssignment: "alex",
    });
    const config = await getPersonaForPerson(person.id);
    expect(config.name).toBe("Alex");
    expect(config.voiceTraits.warmth).toBe(8);
  });
});

// ============================================================
// Character Bible
// ============================================================

describe("loadCharacterBible", () => {
  it("loads character bible content", () => {
    const bible = loadCharacterBible();
    expect(bible.length).toBeGreaterThan(100);
    // Should contain key character bible markers
    expect(bible).toContain("Ditto");
  });

  it("caches on second call", () => {
    const first = loadCharacterBible();
    const second = loadCharacterBible();
    expect(first).toBe(second); // Same reference (cached)
  });
});

// ============================================================
// Prompt Building
// ============================================================

describe("buildPersonaPrompt", () => {
  it("builds prompt for Alex in selling mode", () => {
    const prompt = buildPersonaPrompt("alex", "selling");
    expect(prompt).toContain("Alex from Ditto");
    expect(prompt).toContain("Selling");
    expect(prompt).toContain("internal sales");
    expect(prompt).toContain("Australian English");
  });

  it("builds prompt for Mira in connecting mode", () => {
    const prompt = buildPersonaPrompt("mira", "connecting");
    expect(prompt).toContain("Mira from Ditto");
    expect(prompt).toContain("Connecting");
    expect(prompt).toContain("researcher and advisor");
    expect(prompt).toContain("British English");
  });

  it("builds prompt for self mode", () => {
    const prompt = buildPersonaPrompt("alex", "self");
    expect(prompt).toContain("Self");
    expect(prompt).toContain("chief of staff");
  });

  it("includes character bible content", () => {
    const prompt = buildPersonaPrompt("alex", "selling");
    expect(prompt).toContain("Character Bible");
    expect(prompt).toContain("Ditto");
  });
});
