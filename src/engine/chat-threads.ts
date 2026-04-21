/**
 * Ditto — Chat Thread Service
 *
 * Thread persistence for the redesigned workspace chat. Threads are
 * stored as sessions with surface="web" and an additional title + scope
 * pair for display + intent routing. Turns mirror the existing session
 * turn shape so the Self's memory layer keeps its familiar contract.
 *
 * API consumers live in packages/web/app/api/chat/threads/**.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import * as schema from "../db/schema.js";

export type ThreadTurn = {
  role: string;
  content: string;
  timestamp: number;
  surface: string;
  toolNames?: string[];
};

export interface ChatThreadSummary {
  id: string;
  title: string;
  scope: string;
  status: string;
  startedAt: number;
  lastActiveAt: number;
  turnCount: number;
}

export interface ChatThreadDetail extends ChatThreadSummary {
  turns: ThreadTurn[];
}

function toSummary(
  row: typeof schema.sessions.$inferSelect,
): ChatThreadSummary {
  const turns = Array.isArray(row.turns) ? (row.turns as ThreadTurn[]) : [];
  return {
    id: row.id,
    title: row.title ?? row.summary ?? firstUserText(turns) ?? "New conversation",
    scope: row.scope ?? "General",
    status: row.status,
    startedAt: row.startedAt.getTime(),
    lastActiveAt: row.lastActiveAt.getTime(),
    turnCount: turns.length,
  };
}

function toDetail(row: typeof schema.sessions.$inferSelect): ChatThreadDetail {
  const summary = toSummary(row);
  const turns = Array.isArray(row.turns) ? (row.turns as ThreadTurn[]) : [];
  return { ...summary, turns };
}

function firstUserText(turns: ThreadTurn[]): string | null {
  const first = turns.find((t) => t.role === "user");
  if (!first?.content) return null;
  return first.content.length > 40 ? `${first.content.slice(0, 40)}…` : first.content;
}

/* ---------------------------------------------------------------------- */

export async function listThreads(
  userId: string,
  limit: number = 20,
): Promise<ChatThreadSummary[]> {
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(
      and(eq(schema.sessions.userId, userId), eq(schema.sessions.surface, "web")),
    )
    .orderBy(desc(schema.sessions.lastActiveAt))
    .limit(limit);
  return rows.map(toSummary);
}

export async function createThread(
  userId: string,
  params: { title?: string; scope?: string } = {},
): Promise<ChatThreadDetail> {
  const now = new Date();
  const rows = await db
    .insert(schema.sessions)
    .values({
      userId,
      surface: "web",
      status: "active",
      title: params.title ?? "New conversation",
      scope: params.scope ?? "General",
      startedAt: now,
      lastActiveAt: now,
      turns: [],
    })
    .returning();
  if (!rows[0]) throw new Error("Failed to create thread");
  return toDetail(rows[0]);
}

export async function getThread(
  id: string,
  userId: string,
): Promise<ChatThreadDetail | null> {
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return toDetail(row);
}

export async function updateThread(
  id: string,
  userId: string,
  patch: { title?: string; scope?: string; status?: "active" | "suspended" | "closed" },
): Promise<ChatThreadSummary | null> {
  const now = new Date();
  const rows = await db
    .update(schema.sessions)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      lastActiveAt: now,
    })
    .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, userId)))
    .returning();
  const row = rows[0];
  if (!row) return null;
  return toSummary(row);
}

export async function appendTurns(
  id: string,
  userId: string,
  newTurns: ThreadTurn[],
): Promise<ChatThreadDetail | null> {
  if (newTurns.length === 0) return getThread(id, userId);

  // Read-modify-write is wrapped in a single better-sqlite3 transaction
  // so concurrent requests can't interleave and lose turns.
  const row = db.transaction((tx) => {
    const [existing] = tx
      .select()
      .from(schema.sessions)
      .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, userId)))
      .limit(1)
      .all();
    if (!existing) return null;

    const currentTurns = Array.isArray(existing.turns)
      ? (existing.turns as ThreadTurn[])
      : [];
    const merged = [...currentTurns, ...newTurns];

    // Auto-name from first user turn if the title is still the default.
    const stillDefault =
      !existing.title ||
      existing.title === "New conversation" ||
      existing.title.length === 0;
    const firstUser = merged.find((t) => t.role === "user");
    const nextTitle =
      stillDefault && firstUser?.content
        ? firstUser.content.length > 40
          ? `${firstUser.content.slice(0, 40)}…`
          : firstUser.content
        : existing.title;

    const [updated] = tx
      .update(schema.sessions)
      .set({
        turns: merged,
        title: nextTitle,
        lastActiveAt: new Date(),
      })
      .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, userId)))
      .returning()
      .all();
    return updated ?? null;
  });

  if (!row) return null;
  return toDetail(row);
}

export async function deleteThread(
  id: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, userId)))
    .returning();
  return rows.length > 0;
}
