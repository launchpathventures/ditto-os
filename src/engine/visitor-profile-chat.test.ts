import { describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { _resetForTesting, getEventsAfter } from "./network-events";
import {
  buildVisitorIntroAuthorizationBlock,
  deliverVisitorIntroRequestToWorkspace,
} from "./visitor-profile-chat";

describe("visitor profile intro request delivery", () => {
  beforeEach(() => {
    _resetForTesting();
  });

  it("queues the AuthorizationRequestBlock for durable workspace import", async () => {
    await withNetworkDbTransaction(async (db) => {
      await db.insert(networkSchema.networkUsers).values({
        id: "user-intro",
        email: "intro@example.com",
      });
      const block = buildVisitorIntroAuthorizationBlock({
        userName: "Tim Green",
        userFirst: "Tim",
        requesterId: "visitor-session-1",
        draft: "Hi Tim - Avery asked for an introduction.",
        transcript: [
          { role: "visitor", content: "I run Acme." },
          { role: "greeter", content: "Useful context." },
        ],
      });

      const delivery = await deliverVisitorIntroRequestToWorkspace({
        db,
        userId: "user-intro",
        block,
        stepRunId: "network-lane-step:intro",
      });

      const [row] = await db
        .select()
        .from(networkSchema.networkWorkspaceDeliveries)
        .where(eq(networkSchema.networkWorkspaceDeliveries.id, delivery.id));
      expect(row).toMatchObject({
        userId: "user-intro",
        kind: "visitor_intro_request",
        status: "pending",
      });

      const events = getEventsAfter("user-intro", 0);
      expect(events?.[0]).toMatchObject({
        type: "workspace_blocks_push",
        payload: {
          viewSlug: "inbox",
          mode: "append",
          deliveryId: delivery.id,
        },
      });
      expect(JSON.stringify(events?.[0].payload.blocks)).toContain("Visitor transcript");
      expect(JSON.stringify(events?.[0].payload.blocks)).not.toContain("networkForwardedNotes");
    });
  }, 20_000);
});
