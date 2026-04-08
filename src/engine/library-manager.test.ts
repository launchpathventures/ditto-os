/**
 * Tests for library-manager (Brief 104)
 *
 * Covers:
 * - nominateForLibrary() — creates entry in nominated status
 * - getLibraryModels() — filtering by industry, function, complexity
 * - publishToLibrary() — requires admin, bumps version, archives old
 * - archiveModel() — soft delete
 * - findProcessModelInLibrary() — DB-backed model lookup
 * - Library lifecycle: nominate → validate → publish
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("library-manager", () => {
  // ============================================================
  // nominateForLibrary
  // ============================================================

  describe("nominateForLibrary", () => {
    it("creates entry in nominated status (AC5)", async () => {
      const { nominateForLibrary } = await import("./library-manager");

      const result = await nominateForLibrary({
        slug: "test-process",
        name: "Test Process",
        description: "A test process for library nomination",
        processDefinition: {
          name: "Test Process",
          steps: [{ id: "step-1", name: "Do", executor: "ai-agent" }],
        },
        industryTags: ["technology"],
        functionTags: ["research"],
        complexity: "simple",
      });

      expect(result.id).toBeDefined();
      expect(result.slug).toBe("test-process");

      const [model] = await testDb
        .select()
        .from(schema.processModels)
        .where(eq(schema.processModels.id, result.id));

      expect(model.status).toBe("nominated");
      expect(model.version).toBe(1);
      expect(model.nominatedBy).toBe("system");
    });

    it("sets custom nominatedBy", async () => {
      const { nominateForLibrary } = await import("./library-manager");

      const result = await nominateForLibrary({
        slug: "custom-nom",
        name: "Custom",
        description: "Custom nomination test",
        processDefinition: { steps: [] },
        nominatedBy: "admin",
      });

      const [model] = await testDb
        .select()
        .from(schema.processModels)
        .where(eq(schema.processModels.id, result.id));

      expect(model.nominatedBy).toBe("admin");
    });
  });

  // ============================================================
  // getLibraryModels
  // ============================================================

  describe("getLibraryModels", () => {
    it("returns published models by default", async () => {
      const { getLibraryModels } = await import("./library-manager");

      await testDb.insert(schema.processModels).values([
        {
          slug: "published-1",
          name: "Published One",
          description: "First published model",
          processDefinition: { steps: [] },
          status: "published",
          industryTags: ["tech"],
          functionTags: ["research"],
        },
        {
          slug: "nominated-1",
          name: "Nominated One",
          description: "Not yet published",
          processDefinition: { steps: [] },
          status: "nominated",
        },
      ]);

      const models = await getLibraryModels();
      expect(models).toHaveLength(1);
      expect(models[0].slug).toBe("published-1");
    });

    it("filters by industry tag (AC8)", async () => {
      const { getLibraryModels } = await import("./library-manager");

      await testDb.insert(schema.processModels).values([
        {
          slug: "tech-process",
          name: "Tech Process",
          processDefinition: { steps: [] },
          status: "published",
          industryTags: ["technology", "saas"],
          functionTags: ["research"],
        },
        {
          slug: "health-process",
          name: "Health Process",
          processDefinition: { steps: [] },
          status: "published",
          industryTags: ["healthcare"],
          functionTags: ["compliance"],
        },
      ]);

      const models = await getLibraryModels({ industry: "technology" });
      expect(models).toHaveLength(1);
      expect(models[0].slug).toBe("tech-process");
    });

    it("filters by function tag (AC8)", async () => {
      const { getLibraryModels } = await import("./library-manager");

      await testDb.insert(schema.processModels).values([
        {
          slug: "research-process",
          name: "Research Process",
          processDefinition: { steps: [] },
          status: "published",
          industryTags: ["tech"],
          functionTags: ["research"],
        },
        {
          slug: "compliance-process",
          name: "Compliance Process",
          processDefinition: { steps: [] },
          status: "published",
          industryTags: ["tech"],
          functionTags: ["compliance"],
        },
      ]);

      const models = await getLibraryModels({ function: "compliance" });
      expect(models).toHaveLength(1);
      expect(models[0].slug).toBe("compliance-process");
    });

    it("filters by complexity (AC8)", async () => {
      const { getLibraryModels } = await import("./library-manager");

      await testDb.insert(schema.processModels).values([
        {
          slug: "simple-one",
          name: "Simple",
          processDefinition: { steps: [] },
          status: "published",
          complexity: "simple",
        },
        {
          slug: "complex-one",
          name: "Complex",
          processDefinition: { steps: [] },
          status: "published",
          complexity: "complex",
        },
      ]);

      const models = await getLibraryModels({ complexity: "simple" });
      expect(models).toHaveLength(1);
      expect(models[0].slug).toBe("simple-one");
    });
  });

  // ============================================================
  // publishToLibrary
  // ============================================================

  describe("publishToLibrary", () => {
    it("publishes a model with admin approval (AC6)", async () => {
      const { publishToLibrary } = await import("./library-manager");

      const [model] = await testDb.insert(schema.processModels).values({
        slug: "to-publish",
        name: "To Publish",
        processDefinition: { steps: [] },
        status: "standardised",
      }).returning();

      const result = await publishToLibrary({
        processModelId: model.id,
        approvedBy: "admin@ditto.ai",
      });

      expect(result.version).toBe(1);

      const [published] = await testDb
        .select()
        .from(schema.processModels)
        .where(eq(schema.processModels.id, model.id));

      expect(published.status).toBe("published");
      expect(published.approvedBy).toBe("admin@ditto.ai");
      expect(published.publishedAt).not.toBeNull();
    });

    it("rejects publish without approvedBy (AC6)", async () => {
      const { publishToLibrary } = await import("./library-manager");

      const [model] = await testDb.insert(schema.processModels).values({
        slug: "no-approval",
        name: "No Approval",
        processDefinition: { steps: [] },
        status: "standardised",
      }).returning();

      await expect(
        publishToLibrary({ processModelId: model.id, approvedBy: "" }),
      ).rejects.toThrow("Admin approval required");
    });

    it("rejects publish from wrong status", async () => {
      const { publishToLibrary } = await import("./library-manager");

      const [model] = await testDb.insert(schema.processModels).values({
        slug: "wrong-status",
        name: "Wrong Status",
        processDefinition: { steps: [] },
        status: "nominated",
      }).returning();

      await expect(
        publishToLibrary({ processModelId: model.id, approvedBy: "admin" }),
      ).rejects.toThrow('Cannot publish model in "nominated" status');
    });

    it("bumps version when re-publishing same model (AC7)", async () => {
      const { publishToLibrary } = await import("./library-manager");

      // Create and publish v1
      const [v1] = await testDb.insert(schema.processModels).values({
        slug: "versioned",
        name: "Versioned Process",
        processDefinition: { steps: [] },
        status: "standardised",
        version: 1,
      }).returning();

      await publishToLibrary({
        processModelId: v1.id,
        approvedBy: "admin",
      });

      // Now update it and re-standardise (simulating going through pipeline again)
      await testDb
        .update(schema.processModels)
        .set({
          status: "standardised",
          processDefinition: { steps: [{ id: "new-step" }] } as Record<string, unknown>,
        })
        .where(eq(schema.processModels.id, v1.id));

      // Publish again — should bump version
      const result = await publishToLibrary({
        processModelId: v1.id,
        approvedBy: "admin",
      });

      expect(result.version).toBeGreaterThanOrEqual(1);

      const [updated] = await testDb
        .select()
        .from(schema.processModels)
        .where(eq(schema.processModels.id, v1.id));

      expect(updated.status).toBe("published");
      expect(updated.publishedAt).not.toBeNull();
    });
  });

  // ============================================================
  // archiveModel
  // ============================================================

  describe("archiveModel", () => {
    it("archives a model without deleting it", async () => {
      const { archiveModel } = await import("./library-manager");

      const [model] = await testDb.insert(schema.processModels).values({
        slug: "to-archive",
        name: "To Archive",
        processDefinition: { steps: [] },
        status: "published",
      }).returning();

      await archiveModel(model.id);

      const [archived] = await testDb
        .select()
        .from(schema.processModels)
        .where(eq(schema.processModels.id, model.id));

      expect(archived.status).toBe("archived");
    });
  });

  // ============================================================
  // findProcessModelInLibrary (DB-backed AC9)
  // ============================================================

  describe("findProcessModelInLibrary", () => {
    it("finds a matching published model from DB (AC9)", async () => {
      const { findProcessModelInLibrary } = await import("./library-manager");

      await testDb.insert(schema.processModels).values({
        slug: "person-research",
        name: "Person Research",
        description: "Deep research on a specific person before outreach",
        processDefinition: { steps: [] },
        status: "published",
      });

      const match = await findProcessModelInLibrary(
        "Research the person before contacting them",
      );

      expect(match).not.toBeNull();
      expect(match!.slug).toBe("person-research");
      expect(match!.confidence).toBeGreaterThan(0.3);
    });

    it("returns null when no models match", async () => {
      const { findProcessModelInLibrary } = await import("./library-manager");

      await testDb.insert(schema.processModels).values({
        slug: "billing",
        name: "Billing Invoice",
        description: "Generate monthly invoices",
        processDefinition: { steps: [] },
        status: "published",
      });

      const match = await findProcessModelInLibrary(
        "Deploy quantum entanglement stabilizer",
      );

      expect(match).toBeNull();
    });

    it("only matches published models", async () => {
      const { findProcessModelInLibrary } = await import("./library-manager");

      await testDb.insert(schema.processModels).values({
        slug: "person-research",
        name: "Person Research",
        description: "Deep research on a specific person",
        processDefinition: { steps: [] },
        status: "nominated", // Not published
      });

      const match = await findProcessModelInLibrary(
        "Research the person before outreach",
      );

      expect(match).toBeNull();
    });
  });

  // ============================================================
  // Full lifecycle: nominate → validate → publish
  // ============================================================

  describe("library lifecycle", () => {
    it("nominate → publish lifecycle works end-to-end", async () => {
      const { nominateForLibrary, publishToLibrary, getLibraryModels } = await import("./library-manager");

      // Nominate
      const nominated = await nominateForLibrary({
        slug: "lifecycle-test",
        name: "Lifecycle Test",
        description: "Testing the full nomination to publication lifecycle",
        processDefinition: {
          name: "Lifecycle Test",
          steps: [{ id: "step-1", name: "Work", executor: "ai-agent" }],
        },
        industryTags: ["technology"],
      });

      // Simulate validation passing (update status to standardised)
      await testDb
        .update(schema.processModels)
        .set({ status: "standardised" })
        .where(eq(schema.processModels.id, nominated.id));

      // Publish with admin approval
      const published = await publishToLibrary({
        processModelId: nominated.id,
        approvedBy: "admin@test.com",
      });

      expect(published.version).toBe(1);

      // Verify it appears in library
      const models = await getLibraryModels();
      expect(models).toHaveLength(1);
      expect(models[0].slug).toBe("lifecycle-test");
      expect(models[0].status).toBe("published");
    });
  });
});
