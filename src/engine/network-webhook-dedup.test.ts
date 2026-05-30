import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { createNetworkLaneStepRun } from "./network-step-run";
import {
  claimNetworkWebhookDelivery,
  hasActiveNetworkWebhookDelivery,
} from "./network-webhook-dedup";

const NOW = new Date("2026-05-18T12:00:00.000Z");

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "webhook-dedup-"));
}

describe("network webhook dedup", () => {
  it("claims a Svix id once inside the TTL window", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      const stepRunId = await createNetworkLaneStepRun({
        route: "webhook-dedup-test",
        rootDir,
        now: NOW,
      });

      const first = await claimNetworkWebhookDelivery({
        db,
        rootDir,
        svixId: "msg_1",
        eventType: "message.complained",
        stepRunId,
        ttlMs: 60_000,
        now: NOW,
      });
      const second = await claimNetworkWebhookDelivery({
        db,
        rootDir,
        svixId: "msg_1",
        eventType: "message.complained",
        stepRunId,
        ttlMs: 60_000,
        now: new Date(NOW.getTime() + 1000),
      });

      expect(first).toMatchObject({ claimed: true, duplicate: false });
      expect(second).toMatchObject({ claimed: false, duplicate: true });
      await expect(
        hasActiveNetworkWebhookDelivery("msg_1", {
          db,
          now: new Date(NOW.getTime() + 1000),
        }),
      ).resolves.toBe(true);
      expect(await db.select().from(networkSchema.networkWebhookDeliveries)).toHaveLength(1);
    });
  }, 15_000);
});
