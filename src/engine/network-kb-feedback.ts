import fs from "fs/promises";
import path from "path";
import { getNetworkKbRoot, safeKbPath } from "./network-kb-storage";

export type NetworkKbFeedbackEventType =
  | "fact_extracted"
  | "fact_manual_added"
  | "fact_edited"
  | "fact_visibility_changed"
  | "fact_archived"
  | "private_filter_upserted"
  | "private_filter_archived"
  | "voice_intake_recorded";

export interface NetworkKbFeedbackEvent {
  type: NetworkKbFeedbackEventType;
  userId: string;
  targetId: string;
  actorId?: string | null;
  sessionId?: string | null;
  stepRunId?: string | null;
  before?: unknown;
  after?: unknown;
  createdAt?: Date;
  rootDir?: string;
}

function safeUserSegment(userId: string): string {
  return userId
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase() || "user";
}

export async function recordNetworkKbFeedback(
  event: NetworkKbFeedbackEvent,
): Promise<void> {
  const root = getNetworkKbRoot(event.rootDir);
  const userSegment = safeUserSegment(event.userId);
  const auditDir = safeKbPath(root, "users", userSegment, "audit");
  await fs.mkdir(auditDir, { recursive: true });
  await fs.appendFile(
    path.join(auditDir, "kb-feedback.jsonl"),
    `${JSON.stringify({
      type: event.type,
      userId: event.userId,
      targetId: event.targetId,
      actorId: event.actorId ?? null,
      sessionId: event.sessionId ?? null,
      stepRunId: event.stepRunId ?? null,
      before: event.before ?? null,
      after: event.after ?? null,
      createdAt: (event.createdAt ?? new Date()).toISOString(),
    })}\n`,
    "utf-8",
  );
}
