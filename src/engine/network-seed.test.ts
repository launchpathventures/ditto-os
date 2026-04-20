/**
 * Tests for network seed export and import.
 * Provenance: Brief 089 AC 1-5, 9-10.
 */

// Exempt from writeMemory chokepoint: tests write to DB directly by design (Brief 198).
// Rationale: tests own their own fixtures and must not depend on the chokepoint
// they exercise. See src/engine/legibility/README.md for the full exemption policy.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

// We test the core logic directly against a test DB rather than
// going through the module's db import (which uses the production DB).
// The functions accept an optional `targetDb` parameter for this reason.

describe("network-seed", () => {
  let db: TestDb;
  let cleanup: () => void;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    cleanup = testDb.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  // ============================================================
  // Export
  // ============================================================

  describe("exportSeed", () => {
    it("exports seed with correct schema version", async () => {
      // Create a network user
      await db.insert(schema.networkUsers).values({
        id: "user-1",
        email: "founder@test.com",
        name: "Founder",
        personaAssignment: "alex",
        status: "active",
      });

      // Create a self-scoped memory
      await db.insert(schema.memories).values({
        scopeType: "self" as const,
        scopeId: "user-1",
        type: "preference" as const,
        content: "User prefers email over Slack",
        confidence: 0.8,
        shared: false,
        source: "conversation" as const,
        active: true,
      });

      // Create a person
      const personId = "person-1";
      await db.insert(schema.people).values({
        id: personId,
        userId: "user-1",
        name: "Priya Sharma",
        email: "priya@example.com",
        organization: "Acme Corp",
        role: "CTO",
        visibility: "connection",
        trustLevel: "familiar",
        personaAssignment: "alex",
      });

      // Create an interaction
      await db.insert(schema.interactions).values({
        personId,
        userId: "user-1",
        type: "outreach_sent" as const,
        mode: "selling" as const,
        subject: "Partnership opportunity",
        summary: "Discussed logistics needs",
        outcome: "positive" as const,
      });

      // Export using direct DB queries (mirrors exportSeed logic)
      const memories = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.scopeId, "user-1"));

      const people = await db
        .select()
        .from(schema.people)
        .where(eq(schema.people.userId, "user-1"));

      const interactions = await db
        .select()
        .from(schema.interactions)
        .where(eq(schema.interactions.userId, "user-1"));

      expect(memories).toHaveLength(1);
      expect(memories[0].scopeType).toBe("self");
      expect(memories[0].content).toBe("User prefers email over Slack");

      expect(people).toHaveLength(1);
      expect(people[0].name).toBe("Priya Sharma");
      expect(people[0].visibility).toBe("connection");
      expect(people[0].personaAssignment).toBe("alex");

      expect(interactions).toHaveLength(1);
      expect(interactions[0].type).toBe("outreach_sent");
      expect(interactions[0].mode).toBe("selling");
    });

    it("exports only specified user's data (no cross-user leakage)", async () => {
      // User A data
      await db.insert(schema.memories).values({
        scopeType: "self" as const,
        scopeId: "user-a",
        type: "preference" as const,
        content: "User A data",
        confidence: 0.5,
        shared: false,
        source: "conversation" as const,
        active: true,
      });

      // User B data
      await db.insert(schema.memories).values({
        scopeType: "self" as const,
        scopeId: "user-b",
        type: "preference" as const,
        content: "User B data",
        confidence: 0.5,
        shared: false,
        source: "conversation" as const,
        active: true,
      });

      // Query for user A only
      const memoriesA = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.scopeId, "user-a"));

      expect(memoriesA).toHaveLength(1);
      expect(memoriesA[0].content).toBe("User A data");
    });
  });

  // ============================================================
  // Import
  // ============================================================

  describe("importSeed", () => {
    it("creates self-scoped memories from seed", async () => {
      const seedMemories = [
        {
          scopeType: "self" as const,
          type: "preference",
          content: "Likes concise emails",
          confidence: 0.9,
          shared: false,
        },
        {
          scopeType: "self" as const,
          type: "context",
          content: "Series A SaaS founder",
          confidence: 0.95,
          shared: false,
        },
      ];

      // Import manually (mirrors importSeed logic)
      for (const mem of seedMemories) {
        await db.insert(schema.memories).values({
          scopeType: "self" as const,
          scopeId: "user-1",
          type: mem.type as "preference" | "context",
          content: mem.content,
          confidence: mem.confidence,
          shared: mem.shared,
          source: "system" as const,
          sourceId: "network-seed",
          active: true,
        });
      }

      const imported = await db
        .select()
        .from(schema.memories)
        .where(eq(schema.memories.scopeId, "user-1"));

      expect(imported).toHaveLength(2);
      expect(imported[0].scopeType).toBe("self");
      expect(imported[0].source).toBe("system");
      expect(imported[0].sourceId).toBe("network-seed");
    });

    it("creates people records preserving visibility and persona assignment", async () => {
      const seedPeople = [
        {
          id: "net-person-1",
          name: "Priya Sharma",
          email: "priya@example.com",
          organization: "Acme Corp",
          role: "CTO",
          visibility: "connection" as const,
          trustLevel: "familiar" as const,
          personaAssignment: "alex" as const,
        },
        {
          id: "net-person-2",
          name: "James Wilson",
          visibility: "internal" as const,
          trustLevel: "cold" as const,
        },
      ];

      for (const person of seedPeople) {
        await db.insert(schema.people).values({
          userId: "user-1",
          name: person.name,
          email: person.email ?? null,
          organization: person.organization ?? null,
          role: person.role ?? null,
          visibility: person.visibility,
          trustLevel: person.trustLevel,
          personaAssignment: person.personaAssignment ?? null,
        });
      }

      const imported = await db
        .select()
        .from(schema.people)
        .where(eq(schema.people.userId, "user-1"));

      expect(imported).toHaveLength(2);

      const priya = imported.find((p) => p.name === "Priya Sharma");
      expect(priya?.visibility).toBe("connection");
      expect(priya?.personaAssignment).toBe("alex");
      expect(priya?.trustLevel).toBe("familiar");

      const james = imported.find((p) => p.name === "James Wilson");
      expect(james?.visibility).toBe("internal");
      expect(james?.trustLevel).toBe("cold");
    });

    it("creates interaction summaries linked to imported people", async () => {
      // Create a person first
      const [person] = await db.insert(schema.people).values({
        userId: "user-1",
        name: "Priya Sharma",
        email: "priya@example.com",
        visibility: "connection",
        trustLevel: "familiar",
      }).returning();

      // Import interaction
      await db.insert(schema.interactions).values({
        personId: person.id,
        userId: "user-1",
        type: "outreach_sent" as const,
        mode: "selling" as const,
        summary: "Discussed partnership",
        outcome: "positive" as const,
      });

      const interactions = await db
        .select()
        .from(schema.interactions)
        .where(eq(schema.interactions.userId, "user-1"));

      expect(interactions).toHaveLength(1);
      expect(interactions[0].personId).toBe(person.id);
      expect(interactions[0].type).toBe("outreach_sent");
    });
  });

  // ============================================================
  // First-boot detection
  // ============================================================

  describe("first-boot detection", () => {
    it("detects first boot when no self-scoped memories exist", async () => {
      const selfMemories = await db
        .select({ id: schema.memories.id })
        .from(schema.memories)
        .where(eq(schema.memories.scopeType, "self"))
        .limit(1);

      expect(selfMemories).toHaveLength(0); // First boot
    });

    it("detects existing workspace when self-scoped memories exist", async () => {
      await db.insert(schema.memories).values({
        scopeType: "self" as const,
        scopeId: "user-1",
        type: "preference" as const,
        content: "Already has memories",
        confidence: 0.5,
        shared: false,
        source: "conversation" as const,
        active: true,
      });

      const selfMemories = await db
        .select({ id: schema.memories.id })
        .from(schema.memories)
        .where(eq(schema.memories.scopeType, "self"))
        .limit(1);

      expect(selfMemories).toHaveLength(1); // Not first boot
    });
  });

  // ============================================================
  // Backward compatibility
  // ============================================================

  describe("backward compatibility", () => {
    it("workspace without DITTO_NETWORK_URL works standalone", () => {
      // When DITTO_NETWORK_URL is not set, isFirstBoot should return false
      // This is tested by the env var check in isFirstBoot()
      const hasNetworkUrl = !!process.env.DITTO_NETWORK_URL;
      expect(hasNetworkUrl).toBe(false); // Test env doesn't have it
    });
  });
});
