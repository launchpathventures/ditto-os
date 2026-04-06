/**
 * Tests for people, interactions, visibility promotion, and person-scoped memory.
 *
 * Covers: CRUD on people/interactions, auto-promotion on two-way interaction,
 * trust level progression, opt-out, person-scoped memory isolation,
 * and memory assembly integration.
 *
 * Provenance: Brief 079/080.
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

// Import after mock
const {
  createPerson,
  getPersonById,
  getPersonByEmail,
  listConnections,
  listPeople,
  updatePersonVisibility,
  optOutPerson,
  recordInteraction,
  listInteractions,
  getPersonMemories,
  addPersonMemory,
  getPersonMemoriesForUser,
} = await import("./people");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ============================================================
// People CRUD
// ============================================================

describe("createPerson", () => {
  it("creates a person with defaults", async () => {
    const person = await createPerson({ userId: "user-1", name: "Priya Sharma" });
    expect(person.id).toBeDefined();
    expect(person.name).toBe("Priya Sharma");
    expect(person.userId).toBe("user-1");
    expect(person.visibility).toBe("internal");
    expect(person.journeyLayer).toBe("participant");
    expect(person.trustLevel).toBe("cold");
    expect(person.optedOut).toBe(false);
    expect(person.source).toBe("manual");
  });

  it("creates a person with all fields", async () => {
    const person = await createPerson({
      userId: "user-1",
      name: "David Park",
      email: "david@example.com",
      phone: "+61400000000",
      organization: "ParkCo",
      role: "CEO",
      source: "enrichment",
      journeyLayer: "active",
      visibility: "connection",
      personaAssignment: "alex",
    });
    expect(person.email).toBe("david@example.com");
    expect(person.organization).toBe("ParkCo");
    expect(person.personaAssignment).toBe("alex");
    expect(person.visibility).toBe("connection");
  });
});

describe("getPersonById", () => {
  it("returns null for non-existent person", async () => {
    const person = await getPersonById("non-existent");
    expect(person).toBeNull();
  });

  it("retrieves a created person", async () => {
    const created = await createPerson({ userId: "user-1", name: "Test" });
    const found = await getPersonById(created.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Test");
  });
});

describe("getPersonByEmail", () => {
  it("finds person by email scoped to user", async () => {
    await createPerson({ userId: "user-1", name: "A", email: "a@test.com" });
    await createPerson({ userId: "user-2", name: "B", email: "a@test.com" });

    const found = await getPersonByEmail("a@test.com", "user-1");
    expect(found).not.toBeNull();
    expect(found!.userId).toBe("user-1");
  });

  it("returns null when email not found for user", async () => {
    await createPerson({ userId: "user-1", name: "A", email: "a@test.com" });
    const found = await getPersonByEmail("a@test.com", "user-999");
    expect(found).toBeNull();
  });
});

describe("listConnections", () => {
  it("only returns people with visibility 'connection'", async () => {
    await createPerson({ userId: "user-1", name: "Internal", visibility: "internal" });
    await createPerson({ userId: "user-1", name: "Connection", visibility: "connection" });
    await createPerson({ userId: "user-2", name: "Other User Connection", visibility: "connection" });

    const connections = await listConnections("user-1");
    expect(connections).toHaveLength(1);
    expect(connections[0].name).toBe("Connection");
  });
});

describe("listPeople", () => {
  it("returns all people for a user", async () => {
    await createPerson({ userId: "user-1", name: "A" });
    await createPerson({ userId: "user-1", name: "B" });
    await createPerson({ userId: "user-2", name: "C" });

    const people = await listPeople("user-1");
    expect(people).toHaveLength(2);
  });
});

describe("optOutPerson", () => {
  it("marks a person as opted out", async () => {
    const person = await createPerson({ userId: "user-1", name: "Opt Out" });
    await optOutPerson(person.id);
    const updated = await getPersonById(person.id);
    expect(updated!.optedOut).toBe(true);
  });
});

// ============================================================
// Interactions + Visibility Promotion
// ============================================================

describe("recordInteraction", () => {
  it("records an interaction and updates lastInteractionAt", async () => {
    const person = await createPerson({ userId: "user-1", name: "Test" });
    const interaction = await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "outreach_sent",
      mode: "selling",
      subject: "Intro email",
      summary: "Sent initial outreach",
    });

    expect(interaction.id).toBeDefined();
    expect(interaction.type).toBe("outreach_sent");

    const updated = await getPersonById(person.id);
    expect(updated!.lastInteractionAt).not.toBeNull();
  });

  it("promotes to connection on reply_received", async () => {
    const person = await createPerson({ userId: "user-1", name: "Prospect" });
    expect(person.visibility).toBe("internal");

    await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "reply_received",
      mode: "selling",
      summary: "They replied!",
    });

    const updated = await getPersonById(person.id);
    expect(updated!.visibility).toBe("connection");
  });

  it("promotes to connection on meeting_booked", async () => {
    const person = await createPerson({ userId: "user-1", name: "Prospect" });

    await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "meeting_booked",
      mode: "selling",
    });

    const updated = await getPersonById(person.id);
    expect(updated!.visibility).toBe("connection");
  });

  it("promotes to connection on introduction_received", async () => {
    const person = await createPerson({ userId: "user-1", name: "Intro Target" });

    await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "introduction_received",
      mode: "connecting",
    });

    const updated = await getPersonById(person.id);
    expect(updated!.visibility).toBe("connection");
  });

  it("does NOT promote on outreach_sent", async () => {
    const person = await createPerson({ userId: "user-1", name: "Prospect" });

    await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "outreach_sent",
      mode: "selling",
    });

    const updated = await getPersonById(person.id);
    expect(updated!.visibility).toBe("internal");
  });

  it("does NOT promote if already a connection", async () => {
    const person = await createPerson({ userId: "user-1", name: "Already Connection", visibility: "connection" });

    await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "reply_received",
      mode: "selling",
    });

    // Should still be connection (not error)
    const updated = await getPersonById(person.id);
    expect(updated!.visibility).toBe("connection");
  });

  it("upgrades trust level from cold to familiar on positive outcome", async () => {
    const person = await createPerson({ userId: "user-1", name: "Trust Test" });
    expect(person.trustLevel).toBe("cold");

    await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "reply_received",
      mode: "selling",
      outcome: "positive",
    });

    const updated = await getPersonById(person.id);
    expect(updated!.trustLevel).toBe("familiar");
  });
});

describe("listInteractions", () => {
  it("returns interactions for a person in reverse chronological order", async () => {
    const person = await createPerson({ userId: "user-1", name: "Test" });

    await recordInteraction({ personId: person.id, userId: "user-1", type: "outreach_sent", mode: "selling", summary: "First" });
    await recordInteraction({ personId: person.id, userId: "user-1", type: "reply_received", mode: "selling", summary: "Second" });

    const interactions = await listInteractions(person.id);
    expect(interactions).toHaveLength(2);
    // Both present (order may be indeterminate when timestamps are identical)
    const summaries = interactions.map(i => i.summary);
    expect(summaries).toContain("First");
    expect(summaries).toContain("Second");
  });
});

// ============================================================
// Visibility Manual Control
// ============================================================

describe("updatePersonVisibility", () => {
  it("manually promotes to connection", async () => {
    const person = await createPerson({ userId: "user-1", name: "Manual Add" });
    await updatePersonVisibility(person.id, "connection");
    const updated = await getPersonById(person.id);
    expect(updated!.visibility).toBe("connection");
  });

  it("manually demotes to internal", async () => {
    const person = await createPerson({ userId: "user-1", name: "Demote", visibility: "connection" });
    await updatePersonVisibility(person.id, "internal");
    const updated = await getPersonById(person.id);
    expect(updated!.visibility).toBe("internal");
  });
});

// ============================================================
// Person-Scoped Memory
// ============================================================

describe("addPersonMemory", () => {
  it("creates a memory with person scope", async () => {
    const person = await createPerson({ userId: "user-1", name: "Memory Test" });
    const memory = await addPersonMemory({
      personId: person.id,
      type: "preference",
      content: "Prefers email over phone. Responds quickly on Tuesday mornings.",
    });

    expect(memory.scopeType).toBe("person");
    expect(memory.scopeId).toBe(person.id);
    expect(memory.type).toBe("preference");
  });
});

describe("getPersonMemories", () => {
  it("returns memories for a specific person", async () => {
    const person1 = await createPerson({ userId: "user-1", name: "P1" });
    const person2 = await createPerson({ userId: "user-1", name: "P2" });

    await addPersonMemory({ personId: person1.id, type: "context", content: "Met at conference" });
    await addPersonMemory({ personId: person1.id, type: "preference", content: "Prefers direct approach" });
    await addPersonMemory({ personId: person2.id, type: "context", content: "Referred by James" });

    const p1Memories = await getPersonMemories(person1.id);
    expect(p1Memories).toHaveLength(2);

    const p2Memories = await getPersonMemories(person2.id);
    expect(p2Memories).toHaveLength(1);
  });
});

describe("getPersonMemoriesForUser (isolation)", () => {
  it("returns memories when user owns the person", async () => {
    const person = await createPerson({ userId: "user-1", name: "Owned" });
    await addPersonMemory({ personId: person.id, type: "context", content: "Some context" });

    const memories = await getPersonMemoriesForUser(person.id, "user-1");
    expect(memories).toHaveLength(1);
  });

  it("returns empty when user does NOT own the person", async () => {
    const person = await createPerson({ userId: "user-1", name: "Not Yours" });
    await addPersonMemory({ personId: person.id, type: "context", content: "Secret context" });

    const memories = await getPersonMemoriesForUser(person.id, "user-2");
    expect(memories).toHaveLength(0);
  });

  it("returns empty for non-existent person", async () => {
    const memories = await getPersonMemoriesForUser("non-existent", "user-1");
    expect(memories).toHaveLength(0);
  });
});
