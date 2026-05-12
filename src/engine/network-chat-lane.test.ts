import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";

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
  buildNetworkLaneOpener,
  checkNetworkLaneOpenRateLimit,
  hashIp,
  initializeNetworkLaneSession,
  normalizeNetworkLaneContext,
} = await import("./network-chat");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

describe("network lane session helpers", () => {
  it("normalizes unknown lane values to expert", () => {
    expect(normalizeNetworkLaneContext("client")).toBe("client");
    expect(normalizeNetworkLaneContext("expert")).toBe("expert");
    expect(normalizeNetworkLaneContext("unknown")).toBe("expert");
    expect(normalizeNetworkLaneContext(null)).toBe("expert");
  });

  it("builds the expert Q0 opener exactly", () => {
    expect(buildNetworkLaneOpener("alex", "expert")).toBe(
      "Hi — I'm Alex. Walk me through what you're hunting.",
    );
    expect(buildNetworkLaneOpener("mira", "expert")).toBe(
      "Hi — I'm Mira. Walk me through what you're hunting.",
    );
  });

  it("builds the client lane placeholder opener", () => {
    expect(buildNetworkLaneOpener("alex", "client")).toBe(
      "Hi — I'm Alex. Walk me through what you need.",
    );
  });

  it("uses a known user's existing persona assignment for Q0", async () => {
    await testDb.insert(schema.people).values({
      userId: "founder",
      name: "Known User",
      email: "known@example.com",
      personaAssignment: "mira",
    });
    await testDb.insert(schema.chatSessions).values({
      sessionId: "known-session",
      messages: [],
      context: "front-door",
      ipHash: "hash",
      authenticatedEmail: "known@example.com",
      expiresAt: new Date(Date.now() + 60_000),
    });

    const session = await initializeNetworkLaneSession(
      "known-session",
      "expert",
      "127.0.0.1",
    );

    expect(session.personaId).toBe("mira");
    expect(session.userName).toBe("Known User");
    expect(session.opener).toBe(
      "Hi — I'm Mira. Walk me through what you're hunting.",
    );
  });

  it("uses a verified known email for a fresh lane session", async () => {
    await testDb.insert(schema.networkUsers).values({
      email: "known@example.com",
      name: "Known User",
      personaAssignment: "mira",
    });

    const session = await initializeNetworkLaneSession(
      null,
      "expert",
      "127.0.0.1",
      { authenticatedEmail: " Known@Example.com " },
    );

    expect(session.personaId).toBe("mira");
    expect(session.userName).toBe("Known User");
    expect(session.opener).toBe(
      "Hi — I'm Mira. Walk me through what you're hunting.",
    );

    const [stored] = await testDb
      .select({
        authenticatedEmail: schema.chatSessions.authenticatedEmail,
        personaId: schema.chatSessions.personaId,
      })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.sessionId, session.sessionId));
    expect(stored?.authenticatedEmail).toBe("known@example.com");
    expect(stored?.personaId).toBe("mira");
  });

  it("lets a verified known email replace an anonymous lane assignment", async () => {
    const anonymous = await initializeNetworkLaneSession(
      null,
      "expert",
      "127.0.0.1",
    );
    expect(anonymous.personaId).toBe("alex");
    expect(anonymous.userName).toBeNull();

    await testDb.insert(schema.networkUsers).values({
      email: "known@example.com",
      name: "Known User",
      personaAssignment: "mira",
    });

    const known = await initializeNetworkLaneSession(
      anonymous.sessionId,
      "expert",
      "127.0.0.1",
      { authenticatedEmail: "known@example.com" },
    );

    expect(known.personaId).toBe("mira");

    const [stored] = await testDb
      .select({
        authenticatedEmail: schema.chatSessions.authenticatedEmail,
        personaId: schema.chatSessions.personaId,
      })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.sessionId, known.sessionId));
    expect(stored?.authenticatedEmail).toBe("known@example.com");
    expect(stored?.personaId).toBe("mira");
  });

  it("rate limits repeated lane opens by IP", async () => {
    const ipHash = hashIp("203.0.113.10");

    expect(await checkNetworkLaneOpenRateLimit(ipHash)).toBe(true);

    await testDb.insert(schema.funnelEvents).values(
      Array.from({ length: 30 }, (_, index) => ({
        sessionId: `lane-open-${index}`,
        event: "network_lane_opened",
        surface: "expert",
        metadata: { ipHash },
      })),
    );

    expect(await checkNetworkLaneOpenRateLimit(ipHash)).toBe(false);
  });

  it("falls back to the existing people-table rotation for anonymous visitors", async () => {
    await testDb.insert(schema.people).values({
      userId: "founder",
      name: "Existing Alex",
      email: "alex@example.com",
      personaAssignment: "alex",
    });

    const session = await initializeNetworkLaneSession(
      null,
      "client",
      "127.0.0.1",
    );

    expect(session.personaId).toBe("mira");

    const [stored] = await testDb
      .select({ personaId: schema.chatSessions.personaId })
      .from(schema.chatSessions)
      .where(eq(schema.chatSessions.sessionId, session.sessionId));
    expect(stored?.personaId).toBe("mira");
  });
});
