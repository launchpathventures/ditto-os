"use client";

/**
 * Ditto — Chat Thread Store (server-backed)
 *
 * Wraps the /api/chat/threads endpoints in a simple pub/sub store so
 * React can subscribe to the current active thread + thread list. No
 * localStorage — persistence lives on the server (sessions table, ADR-016).
 * Thread switching is instantaneous because the thread list + the active
 * thread's turns are cached in memory; background fetches refresh them.
 *
 * Cross-surface send bridge: universal chatbar, per-card "Ask about this"
 * triggers, and chat-panel input all funnel text through `requestSend`.
 * The chat-panel watches `pendingSend` and pipes it into useChat.sendMessage;
 * the workspace shell watches the same slot to open the split panel if
 * needed. One code path, one source of truth for an in-flight send.
 */

import { useCallback, useEffect, useState } from "react";
import type { ChatThreadSummary, ThreadTurn } from "@/lib/engine";

export type ChatRole = "user" | "assistant" | string;

export interface ChatThreadDetail extends ChatThreadSummary {
  turns: ThreadTurn[];
}

export interface PendingSend {
  text: string;
  scope: string;
  /** Unique per request so chat-panel can dedupe if it fires twice. */
  nonce: string;
}

interface Snapshot {
  threads: ChatThreadSummary[];
  activeId: string | null;
  active: ChatThreadDetail | null;
  loading: boolean;
  pendingSend: PendingSend | null;
}

type Listener = (s: Snapshot) => void;

/* ---------------------------------------------------------------------- */

const THREADS_BASE = "/api/chat/threads";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

class Store {
  private snap: Snapshot = {
    threads: [],
    activeId: null,
    active: null,
    loading: false,
    pendingSend: null,
  };
  private listeners = new Set<Listener>();
  private userId: string = "default";
  private hydrated = false;
  /**
   * Bumped every time the user scope changes. Async methods capture the
   * generation before `await` and discard their response if it's stale —
   * prevents a previous user's in-flight fetch from writing into the
   * new user's state.
   */
  private gen = 0;

  configure(userId: string) {
    if (this.userId === userId) return;
    this.userId = userId;
    // userId changed — invalidate any in-flight fetches, wipe cached
    // state, and mark un-hydrated so the next hydrate() pulls fresh.
    this.gen++;
    this.hydrated = false;
    this.set({ threads: [], activeId: null, active: null });
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.snap);
    return () => {
      this.listeners.delete(l);
    };
  }

  snapshot(): Snapshot {
    return this.snap;
  }

  private set(next: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...next };
    this.listeners.forEach((l) => l(this.snap));
  }

  /** One-shot fetch of the thread list. Re-runs when forced. */
  async hydrate(force = false) {
    if (this.hydrated && !force) return;
    this.hydrated = true;
    const g = this.gen;
    this.set({ loading: true });
    try {
      const data = await fetchJson<{ threads: ChatThreadSummary[] }>(
        `${THREADS_BASE}?userId=${encodeURIComponent(this.userId)}&limit=20`,
      );
      if (g !== this.gen) return; // stale — user scope changed mid-fetch
      this.set({ threads: data.threads, loading: false });
    } catch (err) {
      if (g !== this.gen) return;
      console.warn("[thread-store] hydrate failed", err);
      this.set({ loading: false });
    }
  }

  async refreshList() {
    const g = this.gen;
    try {
      const data = await fetchJson<{ threads: ChatThreadSummary[] }>(
        `${THREADS_BASE}?userId=${encodeURIComponent(this.userId)}&limit=20`,
      );
      if (g !== this.gen) return;
      this.set({ threads: data.threads });
    } catch (err) {
      if (g !== this.gen) return;
      console.warn("[thread-store] refreshList failed", err);
    }
  }

  async setActive(id: string | null): Promise<ChatThreadDetail | null> {
    if (!id) {
      this.set({ activeId: null, active: null });
      return null;
    }
    const g = this.gen;
    this.set({ activeId: id, loading: true });
    try {
      const data = await fetchJson<{ thread: ChatThreadDetail }>(
        `${THREADS_BASE}/${encodeURIComponent(id)}?userId=${encodeURIComponent(this.userId)}`,
      );
      if (g !== this.gen) return null;
      this.set({ active: data.thread, loading: false });
      return data.thread;
    } catch (err) {
      if (g !== this.gen) return null;
      console.warn("[thread-store] setActive fetch failed", err);
      this.set({ loading: false, active: null });
      return null;
    }
  }

  async create(params: { title?: string; scope?: string } = {}): Promise<ChatThreadDetail> {
    const g = this.gen;
    const data = await fetchJson<{ thread: ChatThreadDetail }>(
      THREADS_BASE,
      {
        method: "POST",
        body: JSON.stringify({ userId: this.userId, ...params }),
      },
    );
    if (g !== this.gen) return data.thread; // stale scope — return without touching store
    this.set({
      activeId: data.thread.id,
      active: data.thread,
      threads: [
        { ...data.thread },
        ...this.snap.threads.filter((t) => t.id !== data.thread.id),
      ],
    });
    return data.thread;
  }

  async rename(id: string, title: string) {
    const g = this.gen;
    try {
      const data = await fetchJson<{ thread: ChatThreadSummary }>(
        `${THREADS_BASE}/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ userId: this.userId, title }),
        },
      );
      if (g !== this.gen) return;
      const next = data.thread;
      const threads = this.snap.threads.map((t) =>
        t.id === id ? { ...t, title: next.title, lastActiveAt: next.lastActiveAt } : t,
      );
      const active =
        this.snap.active?.id === id
          ? { ...this.snap.active, title: next.title, lastActiveAt: next.lastActiveAt }
          : this.snap.active;
      this.set({ threads, active });
    } catch (err) {
      if (g !== this.gen) return;
      console.warn("[thread-store] rename failed", err);
    }
  }

  async deleteThread(id: string) {
    const g = this.gen;
    try {
      await fetch(`${THREADS_BASE}/${encodeURIComponent(id)}?userId=${encodeURIComponent(this.userId)}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.warn("[thread-store] delete failed", err);
    }
    if (g !== this.gen) return;
    const threads = this.snap.threads.filter((t) => t.id !== id);
    const activeId = this.snap.activeId === id ? null : this.snap.activeId;
    const active = this.snap.active?.id === id ? null : this.snap.active;
    this.set({ threads, activeId, active });
  }

  /**
   * Append turns to the active thread. Chat panel calls this after the
   * user's message is queued and after the assistant's stream completes.
   * Returns true on success so callers can defer advancing their own
   * "last-persisted" index until the write is durable.
   */
  async appendTurns(id: string, turns: ThreadTurn[]): Promise<boolean> {
    if (turns.length === 0) return true;
    const g = this.gen;
    try {
      const data = await fetchJson<{ thread: ChatThreadDetail }>(
        `${THREADS_BASE}/${encodeURIComponent(id)}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ userId: this.userId, turns }),
        },
      );
      if (g !== this.gen) return true;
      const next = data.thread;
      const threads = [
        {
          id: next.id,
          title: next.title,
          scope: next.scope,
          status: next.status,
          startedAt: next.startedAt,
          lastActiveAt: next.lastActiveAt,
          turnCount: next.turnCount,
        },
        ...this.snap.threads.filter((t) => t.id !== id),
      ];
      const active = this.snap.active?.id === id ? next : this.snap.active;
      this.set({ threads, active });
      return true;
    } catch (err) {
      console.warn("[thread-store] appendTurns failed", err);
      return false;
    }
  }

  /** Surface a pending send so the chat-panel + workspace can pick it up. */
  requestSend(text: string, scope: string) {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.set({ pendingSend: { text, scope, nonce } });
  }

  clearPending() {
    if (this.snap.pendingSend) this.set({ pendingSend: null });
  }
}

export const threadStore = new Store();

/* ---------------------------------------------------------------------- */
/* React hook                                                             */
/* ---------------------------------------------------------------------- */

export function useThreadStore(userId: string = "default") {
  const [snap, setSnap] = useState<Snapshot>(() => threadStore.snapshot());

  useEffect(() => {
    threadStore.configure(userId);
    threadStore.hydrate();
    return threadStore.subscribe(setSnap);
  }, [userId]);

  const create = useCallback(
    (params?: { title?: string; scope?: string }) => threadStore.create(params),
    [],
  );
  const setActive = useCallback(
    (id: string | null) => threadStore.setActive(id),
    [],
  );
  const rename = useCallback(
    (id: string, title: string) => threadStore.rename(id, title),
    [],
  );
  const deleteThread = useCallback(
    (id: string) => threadStore.deleteThread(id),
    [],
  );
  const appendTurns = useCallback(
    (id: string, turns: ThreadTurn[]): Promise<boolean> =>
      threadStore.appendTurns(id, turns),
    [],
  );
  const requestSend = useCallback(
    (text: string, scope: string) => threadStore.requestSend(text, scope),
    [],
  );
  const clearPending = useCallback(() => threadStore.clearPending(), []);

  return {
    threads: snap.threads,
    activeId: snap.activeId,
    active: snap.active,
    loading: snap.loading,
    pendingSend: snap.pendingSend,
    create,
    setActive,
    rename,
    deleteThread,
    appendTurns,
    requestSend,
    clearPending,
  };
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

export function relativeMinutes(updatedAt: number, now: number = Date.now()): string {
  const mins = Math.floor((now - updatedAt) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}
