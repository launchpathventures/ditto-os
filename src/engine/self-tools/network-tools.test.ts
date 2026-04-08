/**
 * Tests for Network Agent Self tools.
 *
 * Covers: create_sales_plan, create_connection_plan, network_status.
 *
 * Provenance: Brief 079/083.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../test-utils";
import * as schema from "../../db/schema";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../db", async () => {
  const realSchema = await vi.importActual<typeof import("../../db/schema")>("../../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

const {
  handleCreateSalesPlan,
  handleCreateConnectionPlan,
  handleNetworkStatus,
  verifyOutreach,
  startIntake,
} = await import("./network-tools");

const { createPerson, recordInteraction, updatePersonVisibility } = await import("../people");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ============================================================
// create_sales_plan
// ============================================================

describe("handleCreateSalesPlan", () => {
  it("creates a sales plan with goal", async () => {
    const result = await handleCreateSalesPlan({
      goal: "Generate more inbound for my consulting business",
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain("Sales plan created");
    expect(result.output).toContain("consulting business");
  });

  it("includes ICP when provided", async () => {
    const result = await handleCreateSalesPlan({
      goal: "More clients",
      icp: "Mid-size SaaS companies, Series A/B",
    });
    expect(result.output).toContain("Series A/B");
  });

  it("fails without a goal", async () => {
    const result = await handleCreateSalesPlan({ goal: "" });
    expect(result.success).toBe(false);
    expect(result.output).toContain("required");
  });

  it("mentions approval process", async () => {
    const result = await handleCreateSalesPlan({
      goal: "Find logistics partners",
    });
    expect(result.output).toContain("approval");
  });
});

// ============================================================
// create_connection_plan
// ============================================================

describe("handleCreateConnectionPlan", () => {
  it("creates a connection plan with need", async () => {
    const result = await handleCreateConnectionPlan({
      need: "A logistics consultant in Melbourne",
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain("Connection plan created");
    expect(result.output).toContain("logistics consultant");
  });

  it("includes context when provided", async () => {
    const result = await handleCreateConnectionPlan({
      need: "Fintech founders",
      context: "I'm launching a payment product and need advisors",
    });
    expect(result.output).toContain("payment product");
  });

  it("fails without a need", async () => {
    const result = await handleCreateConnectionPlan({ need: "" });
    expect(result.success).toBe(false);
  });

  it("mentions user decides on introductions", async () => {
    const result = await handleCreateConnectionPlan({
      need: "A good accountant",
    });
    expect(result.output).toContain("You decide");
  });
});

// ============================================================
// network_status
// ============================================================

describe("handleNetworkStatus", () => {
  it("reports zero connections for new user", async () => {
    const result = await handleNetworkStatus({ userId: "user-1" });
    expect(result.success).toBe(true);
    expect(result.output).toContain("0** connections");
  });

  it("counts connections correctly", async () => {
    const p1 = await createPerson({ userId: "user-1", name: "Connection 1" });
    await updatePersonVisibility(p1.id, "connection");
    const p2 = await createPerson({ userId: "user-1", name: "Connection 2" });
    await updatePersonVisibility(p2.id, "connection");
    await createPerson({ userId: "user-1", name: "Internal Only" });

    const result = await handleNetworkStatus({ userId: "user-1" });
    expect(result.output).toContain("2** connections");
    expect(result.output).toContain("1** people in working graph");
  });

  it("counts recent interactions", async () => {
    const person = await createPerson({ userId: "user-1", name: "Active" });
    await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "outreach_sent",
      mode: "selling",
    });

    const result = await handleNetworkStatus({ userId: "user-1" });
    expect(result.output).toContain("1** interactions this week");
  });

  it("identifies cooling connections", async () => {
    const person = await createPerson({ userId: "user-1", name: "Cooling Person" });
    await updatePersonVisibility(person.id, "connection");
    // Set lastInteractionAt to 3 weeks ago
    await testDb
      .update(schema.people)
      .set({ lastInteractionAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000) })
      .where(require("drizzle-orm").eq(schema.people.id, person.id));

    const result = await handleNetworkStatus({ userId: "user-1" });
    expect(result.output).toContain("Cooling connections");
    expect(result.output).toContain("Cooling Person");
  });

  it("fails without userId", async () => {
    const result = await handleNetworkStatus({ userId: "" });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// verifyOutreach (Brief 085)
// ============================================================

describe("verifyOutreach", () => {
  it("returns verified:false for unknown email", async () => {
    const result = await verifyOutreach("unknown@example.com");
    expect(result.verified).toBe(false);
  });

  it("returns verified:false for invalid email", async () => {
    const result = await verifyOutreach("not-an-email");
    expect(result.verified).toBe(false);
  });

  it("returns verified:true with persona and subject for known email", async () => {
    const person = await createPerson({
      userId: "user-1",
      name: "Recipient",
      email: "recipient@test.com",
      personaAssignment: "alex",
    });
    await recordInteraction({
      personId: person.id,
      userId: "user-1",
      type: "outreach_sent",
      mode: "selling",
      subject: "Intro about consulting",
    });

    const result = await verifyOutreach("recipient@test.com");
    expect(result.verified).toBe(true);
    expect(result.personaName).toBe("Alex");
    expect(result.recentSubject).toBe("Intro about consulting");
    expect(result.recentDate).toBeDefined();
  });

  it("returns verified:false when person exists but no interactions", async () => {
    await createPerson({
      userId: "user-1",
      name: "No Interactions",
      email: "nointeraction@test.com",
    });

    const result = await verifyOutreach("nointeraction@test.com");
    expect(result.verified).toBe(false);
  });
});

// ============================================================
// startIntake (Brief 085)
// ============================================================

describe("startIntake", () => {
  it("creates new person for unknown visitor", async () => {
    const result = await startIntake("new@example.com", "New Person", undefined, "user-1");
    expect(result.success).toBe(true);
    expect(result.recognised).toBe(false);
    expect(result.personId).toBeDefined();
    expect(result.personaName).toBeDefined();
    expect(result.message).toContain("Ditto");
  });

  it("recognises existing network participant", async () => {
    // Pre-create networkUser (startIntake now ensures this exists)
    const [networkUser] = await testDb.insert(schema.networkUsers).values({
      email: "existing@example.com",
      name: "Existing Person",
      status: "active",
    }).returning();

    const person = await createPerson({
      userId: networkUser.id,
      name: "Existing Person",
      email: "existing@example.com",
      personaAssignment: "mira",
    });
    await recordInteraction({
      personId: person.id,
      userId: networkUser.id,
      type: "outreach_sent",
      mode: "connecting",
      subject: "Logistics consultants",
    });

    const result = await startIntake("existing@example.com");
    expect(result.success).toBe(true);
    expect(result.recognised).toBe(true);
    expect(result.networkUserId).toBe(networkUser.id);
    expect(result.personaName).toBe("Mira");
    expect(result.message).toContain("we've met");
    expect(result.message).toContain("Logistics consultants");
  });

  it("includes need acknowledgment for new visitors", async () => {
    const result = await startIntake("visitor@example.com", "Visitor", "a good accountant");
    expect(result.message).toContain("accountant");
    expect(result.networkUserId).toBeDefined();
  });

  it("fails for invalid email", async () => {
    const result = await startIntake("bad-email");
    expect(result.success).toBe(false);
  });
});
