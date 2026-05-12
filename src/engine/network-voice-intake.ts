import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import { extractKbFacts } from "./network-kb-extract";
import { persistKbDocument, type NetworkDbLike } from "./network-kb-storage";
import { recordNetworkKbFeedback } from "./network-kb-feedback";

export interface RecordVoiceIntakeInput {
  db?: NetworkDbLike;
  rootDir?: string;
  userId: string;
  transcriptMd: string;
  inputMode?: "speech" | "paste" | "manual";
  stepRunId?: string | null;
  actorId?: string | null;
  sessionId?: string | null;
  now?: Date;
}

export async function recordVoiceIntake(input: RecordVoiceIntakeInput) {
  const db = input.db ?? networkDb;
  const stepRunId = requireNetworkStepRunId(input.stepRunId, "record_voice_intake");
  const now = input.now ?? new Date();
  const document = await persistKbDocument({
    db,
    rootDir: input.rootDir,
    userId: input.userId,
    kind: "voice",
    title: "Reviewed voice intake",
    sourceLabel: "Voice intake transcript",
    originalFilename: `voice-intake-${now.toISOString().slice(0, 10)}.md`,
    mimeType: "text/markdown",
    content: input.transcriptMd,
    visibilityDefault: "on-request",
    metadata: { inputMode: input.inputMode ?? "paste" },
    status: "processing",
    now,
  });
  const [intake] = await db
    .insert(networkSchema.networkUserVoiceIntake)
    .values({
      userId: input.userId,
      documentId: document.id,
      transcriptStoragePath: document.storagePath,
      status: "processing",
      metadata: { inputMode: input.inputMode ?? "paste" },
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordNetworkKbFeedback({
    type: "voice_intake_recorded",
    userId: input.userId,
    targetId: intake.id,
    actorId: input.actorId,
    sessionId: input.sessionId,
    stepRunId,
    after: { documentId: document.id, inputMode: input.inputMode ?? "paste" },
    createdAt: now,
    rootDir: input.rootDir,
  });

  try {
    const facts = await extractKbFacts({
      db,
      rootDir: input.rootDir,
      documentId: document.id,
      userId: input.userId,
      stepRunId,
      actorId: input.actorId,
      sessionId: input.sessionId,
      now,
    });
    const [updatedIntake] = await db
      .update(networkSchema.networkUserVoiceIntake)
      .set({ status: "complete", updatedAt: now })
      .where(eq(networkSchema.networkUserVoiceIntake.id, intake.id))
      .returning();
    return { intake: updatedIntake ?? intake, document, facts };
  } catch (error) {
    await db
      .update(networkSchema.networkUserVoiceIntake)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: now,
      })
      .where(eq(networkSchema.networkUserVoiceIntake.id, intake.id));
    throw error;
  }
}
