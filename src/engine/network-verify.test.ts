/**
 * Ditto — Verify Handler Tests (Brief 095)
 *
 * Tests for uniform response, verification email logic, rate limiting,
 * and constant-time behaviour.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../test-utils";
import * as schema from "../db/schema";
import { eq, sql } from "drizzle-orm";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../db", async () => {
  const realSchema = await vi.importActual<typeof import("../db/schema")>("../db/schema");
  return {
    get db() { return testDb; },
    schema: realSchema,
  };
});

const { handleVerify, EMAIL_FOOTER_TEMPLATE } = await import("./network-verify");

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
});

afterEach(() => {
  cleanup();
});

// ============================================================
// Helper: seed a person with an interaction
// ============================================================

async function seedOutreach(email: string) {
  const personId = "test-person-" + Math.random().toString(36).slice(2);
  await testDb.insert(schema.people).values({
    id: personId,
    userId: "founder",
    name: "Test Person",
    email,
    source: "manual",
    journeyLayer: "participant",
    visibility: "internal",
  });
  await testDb.insert(schema.interactions).values({
    id: "interaction-" + Math.random().toString(36).slice(2),
    personId,
    userId: "founder",
    type: "outreach_sent",
    channel: "email",
    mode: "connecting",
    subject: "Introduction to someone",
    summary: "Alex reached out about a connection",
    outcome: "no_response",
  });
  return personId;
}

// ============================================================
// Uniform Response Tests
// ============================================================

describe("network-verify", () => {
  it("returns the same message for found and not-found emails", async () => {
    await seedOutreach("found@example.com");

    const foundResult = await handleVerify("found@example.com", "1.2.3.4");
    const notFoundResult = await handleVerify("notfound@example.com", "5.6.7.8");

    expect(foundResult.message).toBe(notFoundResult.message);
    expect(foundResult.rateLimited).toBe(notFoundResult.rateLimited);
    expect(foundResult.rateLimited).toBe(false);
  });

  it("records a verification email when email IS found", async () => {
    await seedOutreach("known@example.com");

    await handleVerify("known@example.com", "1.2.3.4");

    const emails = await testDb
      .select()
      .from(schema.verificationEmails)
      .where(eq(schema.verificationEmails.recipientEmail, "known@example.com"));

    expect(emails.length).toBe(1);
  });

  it("does NOT record a verification email when email is NOT found", async () => {
    await handleVerify("unknown@example.com", "1.2.3.4");

    const emails = await testDb
      .select()
      .from(schema.verificationEmails);

    expect(emails.length).toBe(0);
  });

  // ============================================================
  // Rate Limiting Tests
  // ============================================================

  it("rate limits after 5 attempts from same IP within an hour", async () => {
    const ip = "10.0.0.1";

    // First 5 should succeed
    for (let i = 0; i < 5; i++) {
      const result = await handleVerify(`test${i}@example.com`, ip);
      expect(result.rateLimited).toBe(false);
    }

    // 6th should be rate limited
    const result = await handleVerify("test5@example.com", ip);
    expect(result.rateLimited).toBe(true);
    expect(result.message).toContain("checked a few times");
  });

  it("suppresses 2nd verification email to same recipient within 24 hours", async () => {
    await seedOutreach("repeat@example.com");

    // First verify — should send email
    await handleVerify("repeat@example.com", "1.1.1.1");
    const afterFirst = await testDb
      .select()
      .from(schema.verificationEmails)
      .where(eq(schema.verificationEmails.recipientEmail, "repeat@example.com"));
    expect(afterFirst.length).toBe(1);

    // Second verify — should NOT send another email (suppressed)
    await handleVerify("repeat@example.com", "2.2.2.2");
    const afterSecond = await testDb
      .select()
      .from(schema.verificationEmails)
      .where(eq(schema.verificationEmails.recipientEmail, "repeat@example.com"));
    expect(afterSecond.length).toBe(1); // Still 1, not 2
  });

  it("records verify attempts for rate limiting", async () => {
    await handleVerify("test@example.com", "3.3.3.3");

    const attempts = await testDb
      .select()
      .from(schema.verifyAttempts);

    expect(attempts.length).toBe(1);
    expect(attempts[0].email).toBe("test@example.com");
    // ipHash should be a SHA-256 hex, not the raw IP
    expect(attempts[0].ipHash).not.toBe("3.3.3.3");
    expect(attempts[0].ipHash).toMatch(/^[a-f0-9]{64}$/);
  });

  // ============================================================
  // Timing Tests
  // ============================================================

  it("takes at least 500ms (fixed-delay floor)", async () => {
    const start = Date.now();
    await handleVerify("timing@example.com", "4.4.4.4");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(490); // Allow 10ms tolerance
  });

  // ============================================================
  // Email Footer Template
  // ============================================================

  it("exports an email footer template with the referred link", () => {
    expect(EMAIL_FOOTER_TEMPLATE).toContain("/welcome/referred");
    expect(EMAIL_FOOTER_TEMPLATE).toContain("Sent by Alex from Ditto");
    expect(EMAIL_FOOTER_TEMPLATE).toContain("Want your own advisor?");
  });
});
