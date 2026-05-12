import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import * as networkSchema from "@ditto/core/db/network";
import { withNetworkDbTransaction } from "../db/network-db-test-helpers";
import { recordVoiceIntake } from "./network-voice-intake";

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "network-voice-intake-"));
}

describe("network voice intake", () => {
  it("persists reviewed transcript markdown and links extracted facts to the voice source", async () => {
    await withNetworkDbTransaction(async (db) => {
      const rootDir = await tempRoot();
      await db.insert(networkSchema.networkUsers).values({
        id: "user-voice",
        email: "voice@example.com",
      });

      const result = await recordVoiceIntake({
        db,
        rootDir,
        userId: "user-voice",
        transcriptMd: [
          "I am strongest when a founder has messy demand and needs a calm operator.",
          "Bad-fit clients want a silver bullet instead of an operating rhythm.",
        ].join("\n"),
        inputMode: "paste",
        stepRunId: "network-lane-step:voice",
        actorId: "user-voice",
        sessionId: "expert-session",
      });

      expect(result.document.kind).toBe("voice");
      expect(result.intake.status).toBe("complete");
      expect(result.intake.documentId).toBe(result.document.id);
      expect(result.facts.length).toBeGreaterThan(0);
      expect(result.facts.every((fact) => fact.documentId === result.document.id)).toBe(true);
      await expect(
        fs.readFile(path.join(rootDir, result.document.storagePath), "utf-8"),
      ).resolves.toContain("messy demand");
    });
  }, 20_000);
});
