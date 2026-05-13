import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { requireNetworkStepRunId } from "./network-step-run";
import type { ContentBlock } from "./content-blocks";
import { queueWorkspaceInboxDelivery } from "./workspace-inbox-delivery";

export interface ForwardNoteVisitor {
  name?: string | null;
  org?: string | null;
  ip?: string | null;
  sessionId?: string | null;
}

export interface ForwardNoteToUserInput {
  db?: PostgresJsDatabase<typeof networkSchema>;
  stepRunId?: string | null;
  userId: string;
  fromVisitor?: ForwardNoteVisitor | null;
  factQuestionMd: string;
  now?: Date;
}

export interface ForwardNoteToUserResult {
  note: typeof networkSchema.networkForwardedNotes.$inferSelect;
  delivery: typeof networkSchema.networkWorkspaceDeliveries.$inferSelect;
  eventId: number;
}

function visitorTitle(visitor?: ForwardNoteVisitor | null): string {
  if (visitor?.name && visitor?.org) return `${visitor.name} at ${visitor.org}`;
  if (visitor?.name) return visitor.name;
  if (visitor?.org) return `Someone at ${visitor.org}`;
  return "Anonymous visitor";
}

function noteBlocks(note: typeof networkSchema.networkForwardedNotes.$inferSelect): ContentBlock[] {
  return [
    {
      type: "record",
      title: `Question from ${visitorTitle({
        name: note.fromVisitorName,
        org: note.fromVisitorOrg,
      })}`,
      subtitle: note.factQuestionMd,
      status: { label: "Forwarded note", variant: "caution" },
      fields: [
        { label: "Source", value: "/people public profile" },
        { label: "Visitor session", value: note.visitorSessionId ?? "anonymous" },
      ],
    },
  ];
}

export async function forwardNoteToUser({
  db = networkDb,
  stepRunId,
  userId,
  fromVisitor,
  factQuestionMd,
  now = new Date(),
}: ForwardNoteToUserInput): Promise<ForwardNoteToUserResult> {
  requireNetworkStepRunId(stepRunId, "forward_note_to_user", { rejectWebDirect: true });
  const trimmedQuestion = factQuestionMd.trim();
  if (!trimmedQuestion) {
    throw new Error("forward_note_to_user requires factQuestionMd");
  }

  const [note] = await db
    .insert(networkSchema.networkForwardedNotes)
    .values({
      userId,
      fromVisitorName: fromVisitor?.name?.trim() || null,
      fromVisitorOrg: fromVisitor?.org?.trim() || null,
      factQuestionMd: trimmedQuestion,
      visitorIp: fromVisitor?.ip?.trim() || null,
      visitorSessionId: fromVisitor?.sessionId?.trim() || null,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const delivery = await queueWorkspaceInboxDelivery({
    db,
    userId,
    kind: "forwarded_note",
    blocks: noteBlocks(note),
    stepRunId,
    dedupeKey: `forwarded-note:${note.id}`,
    now,
  });

  return { note, delivery: delivery.delivery, eventId: delivery.eventId };
}
