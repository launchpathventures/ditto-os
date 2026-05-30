import { afterEach, describe, expect, it } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { maybeFireWorkspaceUpsell } from "./workspace-upsell-trigger";

const originalTestMode = process.env.DITTO_TEST_MODE;

afterEach(() => {
  if (originalTestMode === undefined) delete process.env.DITTO_TEST_MODE;
  else process.env.DITTO_TEST_MODE = originalTestMode;
});

describe("workspace upsell trigger", () => {
  it("refuses without stepRunId outside DITTO_TEST_MODE", async () => {
    delete process.env.DITTO_TEST_MODE;
    await expect(
      maybeFireWorkspaceUpsell({
        userId: "user-1",
        trigger: "expert-q6",
      }),
    ).rejects.toThrow("workspace_upsell_trigger requires stepRunId");
  });

  it("fires once per durable (userId, trigger) tuple", async () => {
    await withNetworkDbTransaction(async (db) => {
      await db.insert(networkSchema.networkUsers).values({
        id: "upsell-user",
        email: "upsell@example.com",
        handle: "upsell-user",
      });

      const first = await maybeFireWorkspaceUpsell({
        db,
        stepRunId: "network-lane-step:upsell",
        userId: "upsell-user",
        trigger: "expert-q6",
        handle: "upsell-user",
      });
      const second = await maybeFireWorkspaceUpsell({
        db,
        stepRunId: "network-lane-step:upsell-fresh-session",
        userId: "upsell-user",
        trigger: "expert-q6",
        handle: "upsell-user",
      });

      expect(first.fired).toBe(true);
      expect(first.copy).toContain("Worth it if you do this kind of hunting more than twice a year");
      expect(second.fired).toBe(false);

      const rows = await db.select().from(networkSchema.networkSessionUpsellLog);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        userId: "upsell-user",
        trigger: "expert-q6",
      });
    });
  }, 20_000);

  it("keeps expert and client triggers separate", async () => {
    await withNetworkDbTransaction(async (db) => {
      await db.insert(networkSchema.networkUsers).values({
        id: "two-lane-user",
        email: "two-lane@example.com",
      });

      const expert = await maybeFireWorkspaceUpsell({
        db,
        stepRunId: "network-lane-step:expert",
        userId: "two-lane-user",
        trigger: "expert-q6",
      });
      const client = await maybeFireWorkspaceUpsell({
        db,
        stepRunId: "network-lane-step:client",
        userId: "two-lane-user",
        trigger: "client-q6",
      });

      expect(expert.fired).toBe(true);
      expect(client.fired).toBe(true);
      expect(client.declineLabel).toBe("Not now, just my brief");
    });
  }, 20_000);
});
