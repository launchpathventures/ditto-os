import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import {
  persistKbDocument,
  isSafeKbEntityId,
  readKbDocumentSource,
  resolveKbStoragePath,
  sanitizeKbFilename,
} from "./network-kb-storage";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-kb-storage-"));
}

describe("network KB storage", () => {
  it("sanitizes source names and rejects traversal storage paths", () => {
    expect(sanitizeKbFilename("../Pitch Deck FINAL.pdf")).toBe("pitch-deck-final.pdf");
    expect(() => resolveKbStoragePath("../escape.md", "/tmp/network-kb")).toThrow(
      "Refusing to write outside",
    );
    expect(isSafeKbEntityId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isSafeKbEntityId("../other-user/rule")).toBe(false);
  });

  it("persists a source document as a DB row plus markdown under the KB root", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      await db.insert(networkSchema.networkUsers).values({
        id: "user-kb-storage",
        email: "storage@example.com",
        name: "Storage User",
      });

      const document = await persistKbDocument({
        db,
        rootDir,
        userId: "user-kb-storage",
        kind: "upload",
        title: "Founder notes",
        sourceLabel: "Founder notes",
        originalFilename: "../../Founder Notes.md",
        mimeType: "text/markdown",
        content: "I build revenue systems for B2B service firms.",
        now: new Date("2026-05-12T00:00:00.000Z"),
      });

      expect(document.originalFilename).toBe("founder-notes.md");
      expect(document.visibilityDefault).toBe("on-request");
      expect(document.storagePath).toContain("users/user-kb-storage/documents/");
      await expect(readKbDocumentSource(document, { rootDir })).resolves.toBe(
        "I build revenue systems for B2B service firms.",
      );
    });
  }, 20_000);
});
