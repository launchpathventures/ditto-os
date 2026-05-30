/**
 * Tests for the Network Identity Verifier (Brief 284).
 *
 * Verifier guarantees we lock down:
 *   - `session` method requires a server-minted stepRunId AND a matching owner
 *   - `email-challenge` method gates on tombstone, email match, and code validity
 *   - `claim-token` method verifies active Discovery Profile claim tokens
 *   - Tombstoned subjects are refused even with otherwise-valid credentials
 *     (anti-resurrection, Insight-234 #4)
 *   - Email-challenge initiation never echoes the full owner email
 */

import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import {
  hashTombstoneSubjectId,
  computeTombstoneTimings,
} from "./network-tombstones";

const sendVerificationCodeMock = vi.fn();
const validateVerificationCodeMock = vi.fn();

vi.mock("./email-verification", () => ({
  sendVerificationCode: (...args: unknown[]) => sendVerificationCodeMock(...args),
  validateVerificationCode: (...args: unknown[]) => validateVerificationCodeMock(...args),
}));

import {
  initiateEmailChallenge,
  maskEmail,
  resolveSubjectOwner,
  verifyNetworkIdentity,
} from "./network-identity-verification";
import { hashClaimToken } from "./claim-invite";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-identity-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({ route: "identity-test", rootDir, now: NOW });
}

async function insertUser(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  email: string,
): Promise<string> {
  const [row] = await db
    .insert(networkSchema.networkUsers)
    .values({
      email,
      name: "Test User",
      handle: `user-${randomUUID().slice(0, 8)}`,
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkUsers.id });
  return row.id;
}

async function insertSignal(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  userId: string,
): Promise<string> {
  const [row] = await db
    .insert(networkSchema.networkMemberSignals)
    .values({
      userId,
      status: "draft",
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkMemberSignals.id });
  return row.id;
}

async function insertVisitorRequest(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  email: string,
): Promise<string> {
  const [row] = await db
    .insert(networkSchema.networkJobRequests)
    .values({
      visitorSessionId: `visitor-${randomUUID().slice(0, 8)}`,
      requesterEmail: email,
      jobRequestCard: { type: "job-request-card", title: "Test" } as never,
      status: "open",
      mode: "manual-search",
      sourcesAllowed: "both",
      contactPolicy: "ask-before-contact",
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkJobRequests.id });
  return row.id;
}

async function insertTombstone(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  subjectType: networkSchema.NetworkTombstoneSubjectType,
  subjectId: string,
  stepRunId: string,
): Promise<void> {
  const timings = computeTombstoneTimings({ now: NOW });
  await db.insert(networkSchema.networkTombstones).values({
    subjectType,
    subjectIdHash: hashTombstoneSubjectId(subjectType, subjectId),
    deletedReason: "test",
    deletedByActorType: "user",
    deletedAt: timings.deletedAt,
    purgeAfter: timings.purgeAfter,
    permanentStubAt: timings.permanentStubAt,
    stepRunId,
    createdAt: NOW,
  });
}

async function insertDiscoveryProfile(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  stepRunId: string,
  email = "found@example.com",
): Promise<string> {
  const [row] = await db
    .insert(networkSchema.networkDiscoveredProfiles)
    .values({
      displayName: "Found Person",
      headline: "Public professional signal",
      contactEmail: email,
      sourceClass: "public-website",
      sourceSummary: "Source-backed discovery profile.",
      status: "internal",
      stepRunId,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning({ id: networkSchema.networkDiscoveredProfiles.id });
  return row.id;
}

async function insertClaimToken(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  discoveryProfileId: string,
  stepRunId: string,
  token = "claim-token-test",
  status: networkSchema.NetworkClaimTokenStatus = "active",
  redeemedUserId: string | null = null,
): Promise<string> {
  await db.insert(networkSchema.networkClaimTokens).values({
    tokenHash: hashClaimToken(token),
    discoveryProfileId,
    status,
    redeemedUserId,
    redeemedAt: redeemedUserId ? NOW : null,
    expiresAt: new Date("2026-06-17T12:00:00.000Z"),
    stepRunId,
    createdAt: NOW,
  });
  return token;
}

describe("maskEmail", () => {
  it("keeps the first character of the local part and full domain", () => {
    expect(maskEmail("jane@example.com")).toBe("j***@example.com");
    expect(maskEmail("JANE.DOE@Example.com")).toBe("j***@example.com");
  });
  it("handles single-character local parts without revealing", () => {
    expect(maskEmail("a@example.com")).toBe("a@example.com");
  });
  it("returns *** when the input is not an email shape", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("@bad.com")).toBe("***");
  });
});

describe("resolveSubjectOwner", () => {
  it("resolves member-signal to the owning user's email", async () => {
    await withNetworkDbTransaction(async (db) => {
      const userId = await insertUser(db, "owner@example.com");
      const signalId = await insertSignal(db, userId);
      const owner = await resolveSubjectOwner({
        db,
        subject: { subjectType: "member-signal", subjectId: signalId },
      });
      expect(owner).toEqual({
        userId,
        email: "owner@example.com",
        visitorSessionId: null,
      });
    });
  });

  it("resolves a visitor-authored request via requesterEmail", async () => {
    await withNetworkDbTransaction(async (db) => {
      const requestId = await insertVisitorRequest(db, "visitor@example.com");
      const owner = await resolveSubjectOwner({
        db,
        subject: { subjectType: "request", subjectId: requestId },
      });
      expect(owner?.userId).toBeNull();
      expect(owner?.email).toBe("visitor@example.com");
      expect(owner?.visitorSessionId).toMatch(/^visitor-/);
    });
  });

  it("returns null when the subject row no longer exists", async () => {
    await withNetworkDbTransaction(async (db) => {
      const owner = await resolveSubjectOwner({
        db,
        subject: { subjectType: "member-signal", subjectId: randomUUID() },
      });
      expect(owner).toBeNull();
    });
  });

  it("resolves a Discovery Profile by contact email", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const profileId = await insertDiscoveryProfile(db, stepRunId, "found@example.com");
      const owner = await resolveSubjectOwner({
        db,
        subject: { subjectType: "discovery-profile", subjectId: profileId },
      });
      expect(owner).toEqual({
        userId: null,
        email: "found@example.com",
        visitorSessionId: null,
      });
    });
  });
});

describe("verifyNetworkIdentity — session", () => {
  it("verifies when sessionUserId matches the subject's owner", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db, "owner@example.com");
      const signalId = await insertSignal(db, userId);

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "member-signal", subjectId: signalId },
        method: "session",
        sessionUserId: userId,
      });

      expect(result).toEqual({
        verified: true,
        actorType: "user",
        actorId: userId,
        subjectOwnerEmail: "owner@example.com",
      });
    });
  }, 15_000);

  it("refuses when the session user is not the subject's owner", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const ownerId = await insertUser(db, "owner@example.com");
      const otherId = await insertUser(db, "other@example.com");
      const signalId = await insertSignal(db, ownerId);

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "member-signal", subjectId: signalId },
        method: "session",
        sessionUserId: otherId,
      });

      expect(result.verified).toBe(false);
      expect(result.error).toBe("session_owner_mismatch");
    });
  }, 15_000);

  it("returns missing_session_user when sessionUserId is absent", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db, "owner@example.com");
      const signalId = await insertSignal(db, userId);

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "member-signal", subjectId: signalId },
        method: "session",
      });

      expect(result.verified).toBe(false);
      expect(result.error).toBe("missing_session_user");
    });
  }, 15_000);
});

describe("verifyNetworkIdentity — email-challenge", () => {
  beforeEach(() => {
    sendVerificationCodeMock.mockReset();
    validateVerificationCodeMock.mockReset();
  });

  it("verifies when email + code both pass", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const requestId = await insertVisitorRequest(db, "visitor@example.com");
      validateVerificationCodeMock.mockResolvedValueOnce({ valid: true });

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "request", subjectId: requestId },
        method: "email-challenge",
        emailChallenge: {
          sessionId: "sess-1",
          email: "VISITOR@Example.com",
          code: "123456",
        },
      });

      expect(result.verified).toBe(true);
      expect(result.actorType).toBe("visitor");
      expect(result.subjectOwnerEmail).toBe("visitor@example.com");
      expect(validateVerificationCodeMock).toHaveBeenCalledWith(
        "sess-1",
        "VISITOR@Example.com",
        "123456",
      );
    });
  }, 15_000);

  it("refuses when the challenge email does not match the recorded owner", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const requestId = await insertVisitorRequest(db, "real@example.com");

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "request", subjectId: requestId },
        method: "email-challenge",
        emailChallenge: {
          sessionId: "sess-1",
          email: "imposter@example.com",
          code: "123456",
        },
      });

      expect(result.verified).toBe(false);
      expect(result.error).toBe("challenge_email_mismatch");
      expect(validateVerificationCodeMock).not.toHaveBeenCalled();
    });
  }, 15_000);

  it("propagates a code-validation failure as the verifier error", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const requestId = await insertVisitorRequest(db, "visitor@example.com");
      validateVerificationCodeMock.mockResolvedValueOnce({
        valid: false,
        error: "Incorrect code. 2 attempts remaining.",
      });

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "request", subjectId: requestId },
        method: "email-challenge",
        emailChallenge: {
          sessionId: "sess-1",
          email: "visitor@example.com",
          code: "000000",
        },
      });

      expect(result.verified).toBe(false);
      expect(result.error).toMatch(/Incorrect code/);
    });
  }, 15_000);

  it("returns missing_email_challenge when any field is empty", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const requestId = await insertVisitorRequest(db, "visitor@example.com");

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "request", subjectId: requestId },
        method: "email-challenge",
        emailChallenge: {
          sessionId: "sess-1",
          email: "",
          code: "123456",
        },
      });

      expect(result.verified).toBe(false);
      expect(result.error).toBe("missing_email_challenge");
    });
  }, 15_000);
});

describe("verifyNetworkIdentity — claim-token", () => {
  it("verifies an active Discovery Profile claim token", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const profileId = await insertDiscoveryProfile(db, stepRunId, "found@example.com");
      const token = await insertClaimToken(db, profileId, stepRunId);

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "discovery-profile", subjectId: profileId },
        method: "claim-token",
        claimToken: token,
        now: NOW,
      });

      expect(result).toMatchObject({
        verified: true,
        actorType: "visitor",
        subjectOwnerEmail: "found@example.com",
      });
      expect(result.actorId).toMatch(/^claim-token:/);
    });
  }, 15_000);

  it("verifies a redeemed Discovery Profile claim token as the redeemed user", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db, "found@example.com");
      const profileId = await insertDiscoveryProfile(db, stepRunId, "found@example.com");
      const token = await insertClaimToken(db, profileId, stepRunId, "redeemed-token", "redeemed", userId);

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "discovery-profile", subjectId: profileId },
        method: "claim-token",
        claimToken: token,
        now: NOW,
      });

      expect(result).toMatchObject({
        verified: true,
        actorType: "user",
        actorId: userId,
        subjectOwnerEmail: "found@example.com",
      });
    });
  }, 15_000);

  it("refuses claim-token verification for non-discovery subjects", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db, "owner@example.com");
      const signalId = await insertSignal(db, userId);

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "member-signal", subjectId: signalId },
        method: "claim-token",
        claimToken: "anything",
      });

      expect(result.verified).toBe(false);
      expect(result.error).toBe("claim_token_subject_unsupported");
    });
  }, 15_000);
});

describe("verifyNetworkIdentity — tombstone gate", () => {
  it("refuses verification on a tombstoned subject (anti-resurrection)", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const userId = await insertUser(db, "owner@example.com");
      const signalId = await insertSignal(db, userId);
      await insertTombstone(db, "member-signal", signalId, stepRunId);

      const result = await verifyNetworkIdentity({
        db,
        rootDir,
        stepRunId,
        subject: { subjectType: "member-signal", subjectId: signalId },
        method: "session",
        sessionUserId: userId,
      });

      expect(result.verified).toBe(false);
      expect(result.error).toBe("subject_tombstoned");
    });
  }, 15_000);
});

describe("verifyNetworkIdentity — stepRunId guard", () => {
  it.each([undefined, "", null, false, "web-direct-action:abc"])(
    "rejects spoofed / falsy stepRunId before any check (%s)",
    async (badStepRunId) => {
      await withNetworkDbTransaction(async (db) => {
        const userId = await insertUser(db, "owner@example.com");
        const signalId = await insertSignal(db, userId);
        await expect(
          verifyNetworkIdentity({
            db,
            stepRunId: badStepRunId,
            subject: { subjectType: "member-signal", subjectId: signalId },
            method: "session",
            sessionUserId: userId,
          }),
        ).rejects.toThrow(/server-minted network-lane stepRunId/);
      });
    },
    15_000,
  );
});

describe("initiateEmailChallenge", () => {
  beforeEach(() => {
    sendVerificationCodeMock.mockReset();
    validateVerificationCodeMock.mockReset();
  });

  it("sends a code to the owner's recorded email and returns the masked address", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const requestId = await insertVisitorRequest(db, "Visitor@Example.com");
      sendVerificationCodeMock.mockResolvedValueOnce({ codeId: "code-1" });

      const result = await initiateEmailChallenge({
        db,
        rootDir,
        stepRunId,
        sessionId: "sess-1",
        subject: { subjectType: "request", subjectId: requestId },
      });

      expect(result.ok).toBe(true);
      expect(result.maskedEmail).toBe("v***@example.com");
      expect(result.maskedEmail).not.toContain("isitor");
      expect(sendVerificationCodeMock).toHaveBeenCalledWith(
        "sess-1",
        "Visitor@Example.com",
      );
    });
  }, 15_000);

  it("refuses to initiate when the subject is tombstoned", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const requestId = await insertVisitorRequest(db, "visitor@example.com");
      await insertTombstone(db, "request", requestId, stepRunId);

      const result = await initiateEmailChallenge({
        db,
        rootDir,
        stepRunId,
        sessionId: "sess-1",
        subject: { subjectType: "request", subjectId: requestId },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe("subject_tombstoned");
      expect(sendVerificationCodeMock).not.toHaveBeenCalled();
    });
  }, 15_000);

  it("refuses when the claimed email does not match what is on file", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const requestId = await insertVisitorRequest(db, "real@example.com");

      const result = await initiateEmailChallenge({
        db,
        rootDir,
        stepRunId,
        sessionId: "sess-1",
        subject: { subjectType: "request", subjectId: requestId },
        claimedEmail: "imposter@example.com",
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe("claimed_email_mismatch");
      expect(sendVerificationCodeMock).not.toHaveBeenCalled();
    });
  }, 15_000);

  it("rejects spoofed stepRunId before any side effect", async () => {
    await withNetworkDbTransaction(async (db) => {
      const userId = await insertUser(db, "owner@example.com");
      const signalId = await insertSignal(db, userId);
      await expect(
        initiateEmailChallenge({
          db,
          stepRunId: "web-direct-action:nope",
          sessionId: "sess-1",
          subject: { subjectType: "member-signal", subjectId: signalId },
        }),
      ).rejects.toThrow(/server-minted network-lane stepRunId/);
      expect(sendVerificationCodeMock).not.toHaveBeenCalled();
    });
  }, 15_000);
});
