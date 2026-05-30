import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import { discoverPublicPeople } from "./public-people-discovery";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "public-discovery-"));
}

async function step(rootDir: string): Promise<string> {
  return createNetworkLaneStepRun({
    route: "public-discovery-test",
    rootDir,
    now: NOW,
  });
}

describe("discover_public_people", () => {
  it("refuses without a server-minted stepRunId before web search or writes", async () => {
    await withNetworkDbTransaction(async (db) => {
      const webSearchFn = vi.fn(async () => "Ada Lovelace https://example.com ada@example.com");

      await expect(
        discoverPublicPeople({
          db,
          stepRunId: "network-lane-step:spoof:00000000-0000-4000-8000-000000000000",
          query: "marketplace operator",
          webSearchFn,
          now: NOW,
        }),
      ).rejects.toThrow(/server-minted network-lane stepRunId/);
      expect(webSearchFn).not.toHaveBeenCalled();
      expect(await db.select().from(networkSchema.networkDiscoveredProfiles)).toHaveLength(0);
    });
  }, 15_000);

  it("stores LinkedIn URLs as pointers without converting snippets to claims or inviteable candidates", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const result = await discoverPublicPeople({
        db,
        rootDir,
        stepRunId,
        query: "AI workflow founder",
        webSearchFn: async () =>
          "Jordan Lee AI workflow founder https://www.linkedin.com/in/jordan-lee jordan@example.com",
        now: NOW,
      });

      expect(result.profileCount).toBe(1);
      const sources = await db.select().from(networkSchema.networkDiscoverySources);
      expect(sources[0]).toMatchObject({
        sourceClass: "linkedin-pointer",
        storagePolicy: "url_pointer_only_no_profile_content",
      });
      const profiles = await db.select().from(networkSchema.networkDiscoveredProfiles);
      expect(sources[0].metadata).toMatchObject({
        discoveryProfileId: profiles[0].id,
        discoveryProfileSourceRole: "primary",
      });
      expect(profiles[0].displayName).not.toContain("Jordan Lee");
      expect(profiles[0].headline).not.toContain("AI workflow founder");
      expect(profiles[0].sourceSummary).not.toContain("AI workflow founder");
      expect(profiles[0].contactEmail).toBeNull();
      expect(await db.select().from(networkSchema.networkDiscoveryClaims)).toHaveLength(0);
      const candidates = await db.select().from(networkSchema.networkInvitationCandidates);
      expect(candidates[0]).toMatchObject({
        status: "blocked",
      });
      expect(candidates[0].suppressionReasons).toContain("source_not_invite_eligible");
    });
  }, 15_000);

  it("can seed discovery from an Active Request and create an internal queued candidate", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await step(rootDir);
      const [request] = await db
        .insert(networkSchema.networkJobRequests)
        .values({
          jobRequestCard: {
            type: "job-request-card",
            jtbd: "Need marketplace AI workflow operator",
            referenceShape: "",
            antiPersonaMd: "",
            successCriteria: "",
            budgetShape: { ballpark: "", cadence: "project" },
            scoutOptIn: true,
            suggestedCandidates: [],
            greeterCuratedBy: "mira",
            matchCuratedBy: "mira",
            lastUpdatedAt: NOW.toISOString(),
          },
          status: "active",
          mode: "background-watch",
          rawNeed: "Find marketplace AI workflow operator",
          outcomeNeeded: "marketplace AI workflow operator",
          idealPerson: "operator with marketplace proof",
          createdAt: NOW,
          updatedAt: NOW,
        })
        .returning();

      const result = await discoverPublicPeople({
        db,
        rootDir,
        stepRunId,
        requestId: request.id,
        watchId: "watch-1",
        webSearchFn: async () =>
          "Rina Patel marketplace AI workflow operator https://rina.example.com rina@example.com",
        now: NOW,
      });

      expect(result.candidates[0]).toMatchObject({ status: "queued", inviteable: true });
      const profiles = await db.select().from(networkSchema.networkDiscoveredProfiles);
      expect(profiles[0]).toMatchObject({
        status: "internal",
        requestId: request.id,
        watchId: "watch-1",
      });
      const claims = await db.select().from(networkSchema.networkDiscoveryClaims);
      expect(claims[0]).toMatchObject({
        sourceUrl: "https://rina.example.com",
        confidence: "medium",
      });
      const events = await db.select().from(networkSchema.networkInvitationEvents);
      expect(events[0]).toMatchObject({ eventType: "queued" });
    });
  }, 15_000);
});
