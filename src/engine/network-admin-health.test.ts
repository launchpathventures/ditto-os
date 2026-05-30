import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import {
  buildNetworkHealthDashboardData,
  revealAdminRawText,
  runDryRunWatchReplay,
} from "./network-admin-health";

const NOW = new Date("2026-05-19T11:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-admin-health-"));
}

async function step(rootDir: string, route = "network-admin-health-test"): Promise<string> {
  return createNetworkLaneStepRun({ route, rootDir, now: NOW });
}

async function insertAudit(
  db: Parameters<Parameters<typeof withNetworkDbTransaction>[0]>[0],
  partial: Partial<typeof networkSchema.networkAuditEvents.$inferInsert> = {},
) {
  const [row] = await db
    .insert(networkSchema.networkAuditEvents)
    .values({
      eventClass: "operator_suppressed",
      subjectType: "claim_invite",
      subjectId: "candidate-1",
      actorType: "admin",
      actorId: "admin-1",
      reasonCode: "source_policy_block",
      metadata: null,
      stepRunId: "network-lane-step:test:00000000-0000-4000-8000-000000000000",
      prevHash: null,
      createdAt: NOW,
      ...partial,
    })
    .returning();
  return row;
}

describe("network admin health dashboard read model", () => {
  it("returns bounded metadata and never exposes raw private or anti-persona text by default", async () => {
    await withNetworkDbTransaction(async (db) => {
      await insertAudit(db, {
        metadata: {
          sealedRawText: "Private claim: acquisition budget is $2m.",
          antiPersonaMd: "Never introduce me to agencies.",
          antiPersonaRules: "Never introduce me to competitors.",
          privateLeakageStatus: "pass",
          provenanceLabel: "member signal",
        },
      });

      const data = await buildNetworkHealthDashboardData({ db, now: NOW });
      const json = JSON.stringify(data);
      expect(json).toContain("source_policy_block");
      expect(json).toContain("member signal");
      expect(json).toContain("[sealed]");
      expect(json).not.toContain("acquisition budget");
      expect(json).not.toContain("Never introduce me");
      expect(json).not.toContain("competitors");
      expect(data.actionRequired.total).toBe(1);
      expect(data.auditRows[0].revealable).toBe(false);
    });
  }, 15_000);

  it("renders the all-clear state data when no action-required or leakage events exist", async () => {
    await withNetworkDbTransaction(async (db) => {
      const data = await buildNetworkHealthDashboardData({ db, now: NOW });
      expect(data.allClear).toBe(true);
      expect(data.actionRequired.items).toHaveLength(0);
      expect(data.health.find((card) => card.id === "leakage-tests")).toMatchObject({
        status: "green",
        count: 0,
      });
    });
  }, 15_000);

  it("emits decision metadata for queued claim invite candidates", async () => {
    await withNetworkDbTransaction(async (db) => {
      const stepRunId = "network-lane-step:test:11111111-1111-4111-8111-111111111111";
      const [profile] = await db
        .insert(networkSchema.networkDiscoveredProfiles)
        .values({
          id: "profile-decision-1",
          displayName: "Rina Patel",
          headline: "Marketplace operator and AI workflow advisor",
          canonicalUrl: "https://rina.example.com",
          contactEmail: "rina@example.com",
          contactPathKind: "email",
          sourceClass: "public-website",
          sourceSummary: "Marketplace operator with source-backed workflow proof.",
          status: "internal",
          stepRunId,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();
      const [candidate] = await db
        .insert(networkSchema.networkInvitationCandidates)
        .values({
          id: "candidate-decision-1",
          discoveryProfileId: profile.id,
          status: "queued",
          channel: "email",
          sourceClass: "public-website",
          contactEmail: "rina@example.com",
          contactPathKind: "email",
          superconnectorFit: 95,
          activeOpportunityFit: 80,
          activeRequestFit: 80,
          sourceConfidence: 100,
          inviteRisk: 90,
          networkHealth: 90,
          totalScore: 90,
          scores: {
            superconnectorFit: 95,
            activeOpportunityFit: 80,
            activeRequestFit: 80,
            sourceConfidence: 100,
            inviteRisk: 90,
            networkHealth: 90,
          },
          riskFlags: [],
          suppressionReasons: [],
          inviteReason: "Rina has source-backed marketplace AI workflow proof.",
          stepRunId,
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();

      const data = await buildNetworkHealthDashboardData({ db, now: NOW });
      expect(data.allClear).toBe(false);
      expect(data.actionRequired.items[0]).toMatchObject({
        id: `candidate:${candidate.id}`,
        kind: "claim_invite_candidate",
        title: "Claim invite needs review",
        subjectType: "claim_invite",
        subjectId: candidate.id,
        revealable: false,
        decision: {
          kind: "claim_invite_candidate",
          candidateId: candidate.id,
        },
      });
      expect(data.actionRequired.items[0].detail).toContain("Rina Patel");
    });
  }, 15_000);

  it("reports total action-required candidates beyond the loaded row limit", async () => {
    await withNetworkDbTransaction(async (db) => {
      const stepRunId = "network-lane-step:test:22222222-2222-4222-8222-222222222222";
      for (let index = 0; index < 13; index += 1) {
        const [profile] = await db
          .insert(networkSchema.networkDiscoveredProfiles)
          .values({
            id: `profile-overflow-${index}`,
            displayName: `Candidate ${index}`,
            headline: "Source-backed operator",
            sourceClass: "public-website",
            sourceSummary: "Source-backed profile.",
            status: "internal",
            stepRunId,
            createdAt: new Date(NOW.getTime() + index),
            updatedAt: NOW,
          })
          .returning();
        await db.insert(networkSchema.networkInvitationCandidates).values({
          id: `candidate-overflow-${index}`,
          discoveryProfileId: profile.id,
          status: "queued",
          channel: "email",
          sourceClass: "public-website",
          contactEmail: `candidate-${index}@example.com`,
          contactPathKind: "email",
          totalScore: 90,
          scores: {},
          riskFlags: [],
          suppressionReasons: [],
          inviteReason: "Source-backed fit.",
          stepRunId,
          createdAt: new Date(NOW.getTime() + index),
          updatedAt: NOW,
        });
      }

      const data = await buildNetworkHealthDashboardData({ db, now: NOW });
      expect(data.actionRequired.items).toHaveLength(12);
      expect(data.actionRequired.total).toBe(13);
    });
  }, 15_000);

  it("reveals raw text only through the audited reveal path", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const source = await insertAudit(db, {
        metadata: { sealedRawText: "Private member email text." },
      });
      const stepRunId = await step(rootDir, "admin-reveal");
      const revealed = await revealAdminRawText({
        db,
        rootDir,
        stepRunId,
        auditEventId: source.id,
        reason: "Investigating complaint ticket T-1",
        actorId: "admin-1",
        now: NOW,
      });

      expect(revealed).toMatchObject({
        sourceEventId: source.id,
        rawText: "Private member email text.",
        annotation: "Revealed — this view is audited",
      });

      const auditRows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.id, revealed.auditEventId));
      expect(auditRows).toHaveLength(1);
      expect(auditRows[0]).toMatchObject({
        eventClass: "operator_revealed_raw_text",
        subjectType: "admin_raw_reveal",
        actorType: "admin",
        reasonCode: "Investigating complaint ticket T-1",
      });
    });
  }, 15_000);

  it("refuses to reveal anti-persona rule text even behind the audited reveal", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const source = await insertAudit(db, {
        metadata: { antiPersonaMd: "Never introduce me to recruiters." },
      });
      const stepRunId = await step(rootDir, "admin-reveal-blocked");
      await expect(
        revealAdminRawText({
          db,
          rootDir,
          stepRunId,
          auditEventId: source.id,
          field: "antiPersonaMd",
          reason: "Bad idea",
          actorId: "admin-1",
          now: NOW,
        }),
      ).rejects.toThrow(/anti_persona_text_has_no_admin_reveal_surface/);
    });
  }, 15_000);

  it("refuses to reveal generic raw text from anti-persona-marked events", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const source = await insertAudit(db, {
        subjectType: "anti_persona_rule",
        metadata: {
          rawText: "Never introduce me to recruiters.",
          provenanceLabel: "member signal",
        },
      });
      const data = await buildNetworkHealthDashboardData({ db, now: NOW });
      expect(data.auditRows[0].revealable).toBe(false);

      const stepRunId = await step(rootDir, "admin-reveal-blocked-generic");
      await expect(
        revealAdminRawText({
          db,
          rootDir,
          stepRunId,
          auditEventId: source.id,
          reason: "Bad idea",
          actorId: "admin-1",
          now: NOW,
        }),
      ).rejects.toThrow(/anti_persona_text_has_no_admin_reveal_surface/);
    });
  }, 15_000);

  it("records dry-run replay with zero user-visible side effects", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir, "admin-dry-run");
      const result = await runDryRunWatchReplay({
        db,
        rootDir,
        stepRunId,
        watchId: "watch-1",
        reason: "Validate scoring before restart",
        actorId: "admin-1",
        now: NOW,
      });

      expect(result).toMatchObject({
        watchId: "watch-1",
        label: "DRY RUN — no contact occurred",
        assertions: {
          emailsSent: 0,
          notificationsSent: 0,
          userVisibleWrites: 0,
        },
      });

      const auditRows = await db
        .select()
        .from(networkSchema.networkAuditEvents)
        .where(eq(networkSchema.networkAuditEvents.id, result.auditEventId));
      expect(auditRows[0]).toMatchObject({
        eventClass: "dry_run_replay",
        subjectType: "background_watch",
        subjectId: "watch-1",
      });
    });
  }, 15_000);
});
