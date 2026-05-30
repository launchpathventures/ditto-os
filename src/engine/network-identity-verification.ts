/**
 * Network Identity Verification (Brief 284)
 *
 * Pluggable identity-gate that every Network privacy action (export, delete,
 * profile mutations from an owner-claimed shell) routes through before any
 * side effect runs. Three methods:
 *
 *   - `session`         — owner already holds an authenticated workspace
 *                         session; we confirm the session userId matches the
 *                         subject's recorded owner.
 *   - `email-challenge` — no session (visitor-owned request, or a logged-out
 *                         former member); workspace-tier 6-digit code is sent
 *                         to the owner's recorded email, code is validated
 *                         against `emailVerificationCodes`.
 *   - `claim-token`     — Discovery Profile claim-token verification for
 *                         logged-out invite recipients.
 *
 * Anti-resurrection (Insight-234 #4): any verification attempt against a
 * tombstoned subject is refused before the gate runs. A deleted profile cannot
 * be re-claimed or re-exported.
 *
 * Email-masking: when initiating an email-challenge, we never echo the full
 * target address back — only `j***@gmail.com` shape. Brief 286 wires the
 * abuse-controls hook in front of `initiateEmailChallenge` so per-IP /
 * per-session attempt counters land before the workspace-tier sender runs.
 */

import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import type { NetworkDbLike } from "./network-kb-storage";
import {
  requireServerMintedNetworkLaneStepRunId,
} from "./network-step-run";
import {
  sendVerificationCode,
  validateVerificationCode,
} from "./email-verification";
import {
  isSubjectTombstoned,
  type NetworkTombstoneSubjectType,
} from "./network-tombstones";
import { hashClaimToken } from "./claim-invite";

export type NetworkIdentityMethod = "session" | "email-challenge" | "claim-token";
export type NetworkIdentitySubjectType = NetworkTombstoneSubjectType;

export interface NetworkIdentitySubjectRef {
  subjectType: NetworkIdentitySubjectType;
  subjectId: string;
}

export interface SubjectOwner {
  /** Recorded owner userId on the subject row. Null for visitor-owned subjects
   *  (e.g., a request authored by a visitor session that hasn't been claimed). */
  userId: string | null;
  /** Recorded email on the subject row. Null when none has been captured yet
   *  (no email-challenge path is possible in that case). */
  email: string | null;
  /** Visitor session id when the subject was authored without an account. */
  visitorSessionId: string | null;
}

export class NetworkIdentityVerificationError extends Error {
  readonly code: string;
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "NetworkIdentityVerificationError";
    this.code = code;
  }
}

export interface ResolveSubjectOwnerInput {
  db?: NetworkDbLike;
  subject: NetworkIdentitySubjectRef;
}

/**
 * Look up the recorded owner of a subject so verification can compare against
 * what was committed to the table at the time the subject was created.
 * Returns `null` if the subject row no longer exists (caller should treat as
 * a 404 / refused verification).
 */
export async function resolveSubjectOwner(
  input: ResolveSubjectOwnerInput,
): Promise<SubjectOwner | null> {
  const db = input.db ?? networkDb;
  const { subjectType, subjectId } = input.subject;

  switch (subjectType) {
    case "member-signal": {
      const [signal] = await db
        .select({ userId: networkSchema.networkMemberSignals.userId })
        .from(networkSchema.networkMemberSignals)
        .where(eq(networkSchema.networkMemberSignals.id, subjectId))
        .limit(1);
      if (!signal) return null;
      const [user] = await db
        .select({ email: networkSchema.networkUsers.email })
        .from(networkSchema.networkUsers)
        .where(eq(networkSchema.networkUsers.id, signal.userId))
        .limit(1);
      return {
        userId: signal.userId,
        email: user?.email ?? null,
        visitorSessionId: null,
      };
    }
    case "request": {
      const [req] = await db
        .select({
          userId: networkSchema.networkJobRequests.userId,
          requesterEmail: networkSchema.networkJobRequests.requesterEmail,
          visitorSessionId: networkSchema.networkJobRequests.visitorSessionId,
        })
        .from(networkSchema.networkJobRequests)
        .where(eq(networkSchema.networkJobRequests.id, subjectId))
        .limit(1);
      if (!req) return null;
      if (req.userId) {
        const [user] = await db
          .select({ email: networkSchema.networkUsers.email })
          .from(networkSchema.networkUsers)
          .where(eq(networkSchema.networkUsers.id, req.userId))
          .limit(1);
        return {
          userId: req.userId,
          email: user?.email ?? null,
          visitorSessionId: req.visitorSessionId ?? null,
        };
      }
      return {
        userId: null,
        email: req.requesterEmail ?? null,
        visitorSessionId: req.visitorSessionId ?? null,
      };
    }
    case "public-profile": {
      const [user] = await db
        .select({
          id: networkSchema.networkUsers.id,
          email: networkSchema.networkUsers.email,
        })
        .from(networkSchema.networkUsers)
        .where(eq(networkSchema.networkUsers.id, subjectId))
        .limit(1);
      if (!user) return null;
      return { userId: user.id, email: user.email, visitorSessionId: null };
    }
    case "discovery-profile":
      {
        const [profile] = await db
          .select({
            id: networkSchema.networkDiscoveredProfiles.id,
            contactEmail: networkSchema.networkDiscoveredProfiles.contactEmail,
            claimedUserId: networkSchema.networkDiscoveredProfiles.claimedUserId,
          })
          .from(networkSchema.networkDiscoveredProfiles)
          .where(eq(networkSchema.networkDiscoveredProfiles.id, subjectId))
          .limit(1);
        if (!profile) return null;
        return {
          userId: profile.claimedUserId ?? null,
          email: profile.contactEmail ?? null,
          visitorSessionId: null,
        };
      }
  }
}

export function maskEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const first = local.slice(0, 1);
  const suffix = local.length > 1 ? "***" : "";
  return `${first}${suffix}@${domain}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// =============================================================================
// Email-challenge initiation
// =============================================================================

export interface InitiateEmailChallengeInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId: unknown;
  sessionId: string;
  subject: NetworkIdentitySubjectRef;
  /** When the caller already knows the email (front-end echo). We still verify
   *  against the recorded owner email — never trust the caller-supplied value
   *  for delivery. */
  claimedEmail?: string;
  now?: Date;
}

export interface InitiateEmailChallengeResult {
  ok: boolean;
  maskedEmail?: string;
  error?: string;
}

/**
 * Sends a 6-digit code to the subject's recorded owner email via the
 * workspace-tier email-verification helper. Returns the masked email on
 * success; never echoes the full address.
 *
 * Brief 286 hook: `network-abuse-controls.ts` will gate this call (per-IP /
 * per-session attempt counters) before delivery. Until 286 lands, the existing
 * MAX_CODES_PER_SESSION rate-limit inside `email-verification.ts` is the only
 * defence.
 */
export async function initiateEmailChallenge(
  input: InitiateEmailChallengeInput,
): Promise<InitiateEmailChallengeResult> {
  const stepRunId = await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "initiate_email_challenge",
    { rootDir: input.rootDir },
  );
  if (!input.sessionId?.trim()) {
    throw new NetworkIdentityVerificationError(
      "missing_session_id",
      "initiate_email_challenge requires sessionId",
    );
  }

  if (await isSubjectTombstoned(input.subject.subjectType, input.subject.subjectId, { db: input.db })) {
    return { ok: false, error: "subject_tombstoned" };
  }

  const owner = await resolveSubjectOwner({ db: input.db, subject: input.subject });
  if (!owner || !owner.email) {
    return { ok: false, error: "subject_email_unknown" };
  }

  if (input.claimedEmail) {
    if (normalizeEmail(input.claimedEmail) !== normalizeEmail(owner.email)) {
      return { ok: false, error: "claimed_email_mismatch" };
    }
  }

  const { error } = await sendVerificationCode(input.sessionId, owner.email);
  if (error) return { ok: false, error };

  // Step run id is referenced for invocation-guard auditing only; the email
  // sender does not write its own network-tier audit row.
  void stepRunId;
  return { ok: true, maskedEmail: maskEmail(owner.email) };
}

// =============================================================================
// Verification
// =============================================================================

export type NetworkIdentityActorType = "user" | "visitor";

export interface VerifyNetworkIdentityInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId: unknown;
  subject: NetworkIdentitySubjectRef;
  method: NetworkIdentityMethod;
  /** Required for `session` method. */
  sessionUserId?: string | null;
  /** Required for `email-challenge`. The sessionId and email match the values
   *  passed to `initiateEmailChallenge`; the code is the 6-digit number the
   *  visitor typed back. */
  emailChallenge?: {
    sessionId: string;
    email: string;
    code: string;
  };
  claimToken?: string;
  now?: Date;
}

export interface VerifyNetworkIdentityResult {
  verified: boolean;
  actorType: NetworkIdentityActorType;
  actorId: string | null;
  /** The subject owner email, NOT echoed back to clients. Returned here only
   *  so callers (export / delete) can attach it to their audit metadata. */
  subjectOwnerEmail: string | null;
  error?: string;
}

/**
 * Pluggable identity gate. Refuses tombstoned subjects unconditionally
 * (anti-resurrection), then dispatches to the requested method.
 *
 * Callers MUST treat `verified: false` as a hard stop — no side effect is
 * authorized. The `stepRunId` is required (Insight-180) even on read-only
 * verifications because the call is part of a server-minted privacy flow.
 */
export async function verifyNetworkIdentity(
  input: VerifyNetworkIdentityInput,
): Promise<VerifyNetworkIdentityResult> {
  await requireServerMintedNetworkLaneStepRunId(
    input.stepRunId,
    "verify_network_identity",
    { rootDir: input.rootDir },
  );

  if (
    await isSubjectTombstoned(input.subject.subjectType, input.subject.subjectId, {
      db: input.db,
    })
  ) {
    return {
      verified: false,
      actorType: "visitor",
      actorId: null,
      subjectOwnerEmail: null,
      error: "subject_tombstoned",
    };
  }

  const owner = await resolveSubjectOwner({
    db: input.db,
    subject: input.subject,
  });
  if (!owner) {
    return {
      verified: false,
      actorType: "visitor",
      actorId: null,
      subjectOwnerEmail: null,
      error: "subject_not_found",
    };
  }

  switch (input.method) {
    case "session": {
      const claimed = input.sessionUserId?.trim();
      if (!claimed) {
        return {
          verified: false,
          actorType: "visitor",
          actorId: null,
          subjectOwnerEmail: owner.email,
          error: "missing_session_user",
        };
      }
      if (!owner.userId || owner.userId !== claimed) {
        return {
          verified: false,
          actorType: "visitor",
          actorId: claimed,
          subjectOwnerEmail: owner.email,
          error: "session_owner_mismatch",
        };
      }
      return {
        verified: true,
        actorType: "user",
        actorId: claimed,
        subjectOwnerEmail: owner.email,
      };
    }
    case "email-challenge": {
      const challenge = input.emailChallenge;
      if (!challenge?.sessionId || !challenge?.email || !challenge?.code) {
        return {
          verified: false,
          actorType: "visitor",
          actorId: null,
          subjectOwnerEmail: owner.email,
          error: "missing_email_challenge",
        };
      }
      if (!owner.email) {
        return {
          verified: false,
          actorType: "visitor",
          actorId: null,
          subjectOwnerEmail: null,
          error: "subject_email_unknown",
        };
      }
      if (normalizeEmail(challenge.email) !== normalizeEmail(owner.email)) {
        return {
          verified: false,
          actorType: "visitor",
          actorId: null,
          subjectOwnerEmail: owner.email,
          error: "challenge_email_mismatch",
        };
      }
      const validation = await validateVerificationCode(
        challenge.sessionId,
        challenge.email,
        challenge.code,
      );
      if (!validation.valid) {
        return {
          verified: false,
          actorType: "visitor",
          actorId: null,
          subjectOwnerEmail: owner.email,
          error: validation.error ?? "verification_failed",
        };
      }
      return {
        verified: true,
        actorType: owner.userId ? "user" : "visitor",
        actorId: owner.userId ?? owner.visitorSessionId ?? null,
        subjectOwnerEmail: owner.email,
      };
    }
    case "claim-token": {
      if (!input.claimToken?.trim()) {
        return {
          verified: false,
          actorType: "visitor",
          actorId: null,
          subjectOwnerEmail: owner.email,
          error: "missing_claim_token",
        };
      }
      if (input.subject.subjectType !== "discovery-profile") {
        return {
          verified: false,
          actorType: "visitor",
          actorId: null,
          subjectOwnerEmail: owner.email,
          error: "claim_token_subject_unsupported",
        };
      }
      const [token] = await (input.db ?? networkDb)
        .select()
        .from(networkSchema.networkClaimTokens)
        .where(eq(networkSchema.networkClaimTokens.tokenHash, hashClaimToken(input.claimToken)))
        .limit(1);
      if (
        !token ||
        token.discoveryProfileId !== input.subject.subjectId ||
        (token.status !== "active" && token.status !== "redeemed") ||
        token.expiresAt <= (input.now ?? new Date())
      ) {
        return {
          verified: false,
          actorType: "visitor",
          actorId: null,
          subjectOwnerEmail: owner.email,
          error: "claim_token_invalid_or_expired",
        };
      }
      return {
        verified: true,
        actorType: token.redeemedUserId ? "user" : "visitor",
        actorId: token.redeemedUserId ?? `claim-token:${token.id}`,
        subjectOwnerEmail: owner.email,
      };
    }
  }
}
