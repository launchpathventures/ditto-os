/**
 * Brief 281 — Workspace Artifact Recall and Archive smoke (AC16).
 *
 * Covers both recall surfaces over the one shared helper:
 *
 *   1. Header Archive drawer: open from the chat header, search/filter,
 *      see real drill links, close with Escape — chat context preserved
 *      (the conversation is never navigated away from to browse).
 *   2. Conversational recall: "show me my projects" streams an inline
 *      InteractiveTableBlock with per-row Open actions — the user is
 *      answered in the conversation, not told to go navigate.
 *   3. Both work under `prefers-reduced-motion: reduce`.
 *
 * Determinism: the chat bootstrap, harness SSE, Self stream (`/api/chat`),
 * and the read-only `/api/v1/workspace/archive` route are all mocked at the
 * route boundary — no real LLM, DB, or workspace cookie. The archive mock
 * branches on the `query` param so filtering is reproducible. A live
 * Railway smoke is supplemental, not a substitute (brief constraint).
 *
 * Provenance: Brief 281; workspace-chat-front-door.spec.ts (route-boundary
 * SSE mock + AI SDK UI message stream pattern).
 */

import { test, expect, resetDatabase } from "./fixtures";

type Chunk = Record<string, unknown>;

function uiMessageStream(chunks: Chunk[]): string {
  return (
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

function assistantTurn(opts: { text?: string; blocks?: Chunk[] }): string {
  const chunks: Chunk[] = [{ type: "start" }];
  if (opts.text) {
    chunks.push({ type: "text-start", id: "t1" });
    chunks.push({ type: "text-delta", id: "t1", delta: opts.text });
    chunks.push({ type: "text-end", id: "t1" });
  }
  (opts.blocks ?? []).forEach((block, i) => {
    chunks.push({ type: "data-content-block", id: `cb-${i}`, data: block });
  });
  chunks.push({ type: "finish", finishReason: "stop" });
  return uiMessageStream(chunks);
}

// Inline recall result — the shape self-stream.ts emits for >1 non-memory
// hit: an InteractiveTableBlock with per-row Open actions (href payload).
const RECALL_TABLE: Chunk = {
  type: "interactive_table",
  title: "Workspace results",
  summary: "Showing 2 of 2",
  columns: [
    { key: "kind", label: "Type", format: "badge" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "updated", label: "Updated" },
  ],
  rows: [
    {
      id: "p1",
      cells: { kind: "Project", title: "Acme Revamp", status: "active", updated: "5/16/2026" },
      actions: [
        { id: "recall-open-p1", label: "Open", style: "secondary", payload: { href: "/projects/acme" } },
      ],
    },
    {
      id: "pr1",
      cells: { kind: "Process", title: "Quoting Process", status: "active", updated: "5/16/2026" },
      actions: [
        { id: "recall-open-pr1", label: "Open", style: "secondary", payload: { href: "/process/pr1" } },
      ],
    },
  ],
};

function responseForUserText(userText: string): string {
  const t = userText.toLowerCase();
  if (t.includes("show me my") || t.includes("where did")) {
    return assistantTurn({
      text: "Here's what I found in your workspace:",
      blocks: [RECALL_TABLE],
    });
  }
  return assistantTurn({ text: "Got it." });
}

// Archive route payload — RecallResponse shape, branched on `query`.
function archivePayload(query: string | null) {
  const project = {
    kind: "project",
    id: "p1",
    title: "Acme Revamp",
    subtitle: "acme",
    status: "active",
    projectSlug: "acme",
    route: "/projects/acme",
    updatedAt: "2026-05-16T00:00:00.000Z",
  };
  const process = {
    kind: "process",
    id: "pr1",
    title: "Quoting Process",
    status: "active · Spot-checked",
    route: "/process/pr1",
    updatedAt: "2026-05-16T00:00:00.000Z",
  };
  const results =
    query && query.toLowerCase().includes("quoting")
      ? [process]
      : [project, process];
  return {
    results,
    counts: {
      project: results.some((r) => r.kind === "project") ? 1 : 0,
      process: results.some((r) => r.kind === "process") ? 1 : 0,
      memory: 0,
      work: 0,
      review: 0,
      activity: 0,
    },
    truncated: false,
    query: query?.toLowerCase() ?? null,
    kinds: ["project", "process", "memory", "work", "review", "activity"],
  };
}

async function installMocks(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.route("**/api/v1/chat/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        email: "dev@local",
        sessionId: "sess-e2e-1",
        messages: [],
        messageCount: 0,
        status: { contacted: 0, replied: 0, meetings: 0, nextAction: null },
      }),
    });
  });

  await page.route("**/api/events", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body: `data: ${JSON.stringify({ type: "connected" })}\n\n`,
    });
  });

  await page.route("**/api/v1/workspace/archive**", async (route) => {
    const url = new URL(route.request().url());
    const payload = archivePayload(url.searchParams.get("query"));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      messages?: Array<{
        role: string;
        parts?: Array<{ type?: string; text?: string }>;
      }>;
    };
    const lastUser = (body.messages ?? [])
      .filter((m) => m.role === "user")
      .pop();
    const userText = (lastUser?.parts ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("");

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
        "Cache-Control": "no-cache",
      },
      body: responseForUserText(userText),
    });
  });
}

test.beforeAll(async () => {
  await resetDatabase();
});

test.describe("Brief 281 — workspace artifact recall and archive", () => {
  test("Archive drawer: open from header, search, drill links, Escape closes", async ({
    page,
  }) => {
    await installMocks(page);
    await page.goto("/chat");

    const archiveBtn = page.getByRole("button", { name: "Open archive" });
    await expect(archiveBtn).toBeVisible({ timeout: 15_000 });

    await archiveBtn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Unfiltered: both a project and a process come back.
    await expect(dialog.getByText("Acme Revamp")).toBeVisible();
    await expect(dialog.getByText("Quoting Process")).toBeVisible();

    // Filter narrows to the process; real drill link, never invented.
    await dialog
      .getByPlaceholder(/search projects, processes/i)
      .fill("quoting");
    await expect(dialog.getByText("Acme Revamp")).toHaveCount(0);
    const row = dialog.getByRole("link", { name: /Quoting Process/i });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("href", "/process/pr1");

    // Escape closes — the conversation behind it was never navigated away.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/chat$/);
  });

  test("Conversational recall renders an inline table with Open actions", async ({
    page,
  }) => {
    await installMocks(page);
    await page.goto("/chat");

    const input = page.getByPlaceholder(/message your workspace/i);
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill("show me my projects");
    await input.press("Enter");

    await expect(
      page.getByText("Here's what I found in your workspace:"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("cell", { name: "Acme Revamp" }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Quoting Process" }),
    ).toBeVisible();
    // Recall answers inline; rows expose Open (drill-down, not a redirect).
    await expect(
      page.getByRole("button", { name: "Open" }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/chat$/);
  });

  test("Archive drawer is usable with reduced motion", async ({ page }) => {
    await installMocks(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/chat");

    await page.getByRole("button", { name: "Open archive" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText("Quoting Process")).toBeVisible();
  });
});
