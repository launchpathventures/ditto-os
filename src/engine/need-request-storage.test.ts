import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { draftNeedRequestFromText } from "./need-request-calibration";
import {
  buildNeedRequestPublicCopy,
  buildSearchHandoffPayload,
  needRequestIdentityReadyForIntro,
  saveNeedRequest,
  updateNeedRequestState,
} from "./need-request-storage";

describe("need request storage", () => {
  it("creates, lists, pauses, resumes, and closes Active Request rows", async () => {
    await withNetworkDbTransaction(async (db) => {
      const draft = draftNeedRequestFromText({
        rawNeed: "Need a marketplace ops expert in Europe, paid advisory, budget £5k/month.",
      });
      const row = await saveNeedRequest({
        db,
        draft,
        visitorSessionId: "visitor-1",
        status: "active",
        mode: "both",
        stepRunId: "network-lane-step:request:test",
      });

      expect(row.userId).toBeNull();
      expect(row.visitorSessionId).toBe("visitor-1");
      expect(row.status).toBe("active");
      expect(row.mode).toBe("both");
      expect(row.searchHandoff).toMatchObject({ kind: "active-request-search-input" });
      expect(row.watchHandoff).toMatchObject({ kind: "active-request-watch-seed" });

      const paused = await updateNeedRequestState({
        db,
        requestId: row.id,
        visitorSessionId: "visitor-1",
        action: "pause",
        stepRunId: "network-lane-step:request:pause",
      });
      expect(paused.status).toBe("paused");

      const resumed = await updateNeedRequestState({
        db,
        requestId: row.id,
        visitorSessionId: "visitor-1",
        action: "resume",
        stepRunId: "network-lane-step:request:resume",
      });
      expect(resumed.status).toBe("active");

      const closed = await updateNeedRequestState({
        db,
        requestId: row.id,
        visitorSessionId: "visitor-1",
        action: "close",
        stepRunId: "network-lane-step:request:close",
      });
      expect(closed.status).toBe("closed");

      const events = await db
        .select()
        .from(networkSchema.networkRequestAuditEvents)
        .where(eq(networkSchema.networkRequestAuditEvents.requestId, row.id));
      expect(events.map((event) => event.eventType)).toEqual([
        "published",
        "paused",
        "resumed",
        "closed",
      ]);
    });
  }, 15_000);

  it("scrubs private budget and value from public request and search payloads", () => {
    const draft = draftNeedRequestFromText({
      rawNeed: "Need a fractional CMO for $20k/month revenue work in Europe.",
    });
    const copy = buildNeedRequestPublicCopy(draft);
    const search = buildSearchHandoffPayload(draft);

    expect(copy).not.toContain("$20k/month");
    expect(JSON.stringify(search)).not.toContain("$20k/month");
  });

  it("requires calibrated identity before intro/contact", () => {
    expect(needRequestIdentityReadyForIntro({
      name: "Tim",
      email: "tim@example.com",
      orgSite: "launchpathventures.com",
    })).toBe(true);
    expect(needRequestIdentityReadyForIntro({
      name: "Tim",
      email: "tim@example.com",
    })).toBe(false);
  });
});
