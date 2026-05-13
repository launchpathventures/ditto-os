import { createHash } from "crypto";
import type { VisitorChatTurn } from "./visitor-profile-chat";

interface PendingIntro {
  userId: string;
  draft: string;
  transcriptHash: string;
  createdAt: number;
}

interface PendingForward {
  userId: string;
  factQuestionMd: string;
  createdAt: number;
}

interface VisitorProfileSession {
  transcript: VisitorChatTurn[];
  pendingIntro?: PendingIntro;
  pendingForward?: PendingForward;
  updatedAt: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_TURNS = 80;
const sessions = new Map<string, VisitorProfileSession>();

function nowMs(): number {
  return Date.now();
}

function cleanup(now = nowMs()): void {
  for (const [id, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

function sessionFor(sessionId: string): VisitorProfileSession {
  cleanup();
  let session = sessions.get(sessionId);
  if (!session) {
    session = { transcript: [], updatedAt: nowMs() };
    sessions.set(sessionId, session);
  }
  return session;
}

export function visitorTranscriptHash(transcript: VisitorChatTurn[]): string {
  return createHash("sha256").update(JSON.stringify(transcript)).digest("hex");
}

export function getVisitorProfileTranscript(sessionId: string): VisitorChatTurn[] {
  return [...sessionFor(sessionId).transcript];
}

export function appendVisitorProfileTurn(sessionId: string, turn: VisitorChatTurn): VisitorChatTurn[] {
  const session = sessionFor(sessionId);
  session.transcript = [...session.transcript, turn].slice(-MAX_TURNS);
  session.updatedAt = nowMs();
  return [...session.transcript];
}

export function setPendingVisitorIntro({
  sessionId,
  userId,
  draft,
  transcript,
}: {
  sessionId: string;
  userId: string;
  draft: string;
  transcript: VisitorChatTurn[];
}): void {
  const session = sessionFor(sessionId);
  session.pendingIntro = {
    userId,
    draft,
    transcriptHash: visitorTranscriptHash(transcript),
    createdAt: nowMs(),
  };
  session.updatedAt = nowMs();
}

export function getPendingVisitorIntro({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}): PendingIntro | null {
  const session = sessionFor(sessionId);
  const pending = session.pendingIntro;
  if (!pending || pending.userId !== userId) return null;
  if (nowMs() - pending.createdAt > SESSION_TTL_MS) {
    session.pendingIntro = undefined;
    return null;
  }
  return pending;
}

export function consumePendingVisitorIntro({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}): PendingIntro | null {
  const session = sessionFor(sessionId);
  const pending = getPendingVisitorIntro({ sessionId, userId });
  if (!pending) return null;
  session.pendingIntro = undefined;
  session.updatedAt = nowMs();
  return pending;
}

export function clearPendingVisitorIntro({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}): void {
  const session = sessionFor(sessionId);
  if (session.pendingIntro?.userId !== userId) return;
  session.pendingIntro = undefined;
  session.updatedAt = nowMs();
}

export function setPendingVisitorForward({
  sessionId,
  userId,
  factQuestionMd,
}: {
  sessionId: string;
  userId: string;
  factQuestionMd: string;
}): void {
  const session = sessionFor(sessionId);
  session.pendingForward = {
    userId,
    factQuestionMd,
    createdAt: nowMs(),
  };
  session.updatedAt = nowMs();
}

export function getPendingVisitorForward({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}): PendingForward | null {
  const session = sessionFor(sessionId);
  const pending = session.pendingForward;
  if (!pending || pending.userId !== userId) return null;
  if (nowMs() - pending.createdAt > SESSION_TTL_MS) {
    session.pendingForward = undefined;
    return null;
  }
  return pending;
}

export function consumePendingVisitorForward({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}): PendingForward | null {
  const session = sessionFor(sessionId);
  const pending = getPendingVisitorForward({ sessionId, userId });
  if (!pending) return null;
  session.pendingForward = undefined;
  session.updatedAt = nowMs();
  return pending;
}

export function clearPendingVisitorForward({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}): void {
  const session = sessionFor(sessionId);
  if (session.pendingForward?.userId !== userId) return;
  session.pendingForward = undefined;
  session.updatedAt = nowMs();
}

export function _resetVisitorProfileSessionsForTesting(): void {
  sessions.clear();
}
