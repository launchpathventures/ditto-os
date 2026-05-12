import fs from "fs/promises";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { extractKbFacts, manualAddKbFact, updateKbFactWithAudit } from "./network-kb-extract";
import { persistKbDocument } from "./network-kb-storage";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-kb-extract-"));
}

describe("network KB fact extraction", () => {
  it("extracts source-traced facts with on-request visibility and audit feedback", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      await db.insert(networkSchema.networkUsers).values({
        id: "user-kb-extract",
        email: "extract@example.com",
        name: "Extract User",
      });
      const document = await persistKbDocument({
        db,
        rootDir,
        userId: "user-kb-extract",
        kind: "upload",
        title: "Source",
        sourceLabel: "Source",
        originalFilename: "source.md",
        mimeType: "text/markdown",
        content: [
          "I redesign HubSpot and sales motion for founder-led B2B services.",
          "The best clients already have a sales motion but need operational discipline.",
        ].join("\n"),
      });

      const facts = await extractKbFacts({
        db,
        rootDir,
        documentId: document.id,
        userId: "user-kb-extract",
        stepRunId: "network-lane-step:test",
        actorId: "actor-1",
        sessionId: "session-1",
      });

      expect(facts.length).toBeGreaterThanOrEqual(2);
      expect(facts[0]).toMatchObject({
        userId: "user-kb-extract",
        documentId: document.id,
        visibility: "on-request",
        status: "active",
        sourceLabel: "Source",
      });
      const [updatedDocument] = await db
        .select({ status: networkSchema.networkUserKbDocuments.status })
        .from(networkSchema.networkUserKbDocuments)
        .where(eq(networkSchema.networkUserKbDocuments.id, document.id));
      expect(updatedDocument?.status).toBe("ready");

      const auditPath = path.join(
        rootDir,
        "users",
        "user-kb-extract",
        "audit",
        "kb-feedback.jsonl",
      );
      await expect(fs.readFile(auditPath, "utf-8")).resolves.toContain("fact_extracted");
    });
  }, 20_000);

  it("requires stepRunId for side-effecting extraction outside explicit test mode", async () => {
    await expect(
      extractKbFacts({
        db: {} as never,
        documentId: "missing",
        userId: "user",
      }),
    ).rejects.toThrow("extract_kb_facts requires stepRunId");
  });

  it("audits manual fact add, visibility change, and archive operations", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      await db.insert(networkSchema.networkUsers).values({
        id: "user-kb-manual",
        email: "manual@example.com",
      });
      const fact = await manualAddKbFact({
        db,
        rootDir,
        userId: "user-kb-manual",
        factMd: "I lead RevOps turnarounds for founder-led B2B teams.",
        visibility: "on-request",
        stepRunId: "network-lane-step:manual",
      });
      const publicFact = await updateKbFactWithAudit({
        db,
        rootDir,
        userId: "user-kb-manual",
        factId: fact.id,
        visibility: "public",
        eventType: "fact_visibility_changed",
        stepRunId: "network-lane-step:visibility",
      });
      const archivedFact = await updateKbFactWithAudit({
        db,
        rootDir,
        userId: "user-kb-manual",
        factId: fact.id,
        status: "archived",
        eventType: "fact_archived",
        stepRunId: "network-lane-step:archive",
      });

      expect(publicFact?.visibility).toBe("public");
      expect(archivedFact?.status).toBe("archived");
      const audit = await fs.readFile(
        path.join(rootDir, "users", "user-kb-manual", "audit", "kb-feedback.jsonl"),
        "utf-8",
      );
      expect(audit).toContain("fact_manual_added");
      expect(audit).toContain("fact_visibility_changed");
      expect(audit).toContain("fact_archived");
    });
  }, 20_000);
});
