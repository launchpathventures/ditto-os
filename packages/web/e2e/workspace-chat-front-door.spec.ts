/**
 * Brief 280 — Workspace Conversational Front Door smoke (AC17).
 *
 * Verifies the post-Day-Zero workspace home is a single Self conversation
 * at `/chat`, with processes/saves/runs rendered as inline ContentBlocks:
 *
 *   1. `/` (Day Zero already seen) hard-redirects to `/chat`.
 *   2. The empty workspace conversation shows the "talk to your workspace"
 *      entry points (Brief 280 IA), not primitive tabs.
 *   3. A natural-language ask streams an inline process proposal.
 *   4. Approving it streams a human-readable saved-process summary
 *      (RecordBlock, canonical "Spot-checked" trust label, no raw slug —
 *      Brief 280 AC7/AC8) plus a run SuggestionBlock.
 *   5. Running it streams an inline ProgressBlock — the user never leaves
 *      the conversation.
 *   6. The surface is usable with `prefers-reduced-motion: reduce`.
 *
 * Determinism: the Self stream (`/api/chat`) and the two session bootstraps
 * are mocked at the route boundary, so neither a real LLM nor a real
 * workspace cookie is required. The mock speaks the AI SDK UI message
 * stream wire format (`x-vercel-ai-ui-message-stream: v1`, `data:` SSE
 * chunks validated by the SDK's strict `uiMessageChunkSchema`) and branches
 * on the last user message so each conversational turn is reproducible.
 * A live Railway smoke is supplemental, not a substitute (brief constraint).
 *
 * Provenance: Brief 280, onboarding.spec.ts (SSE route-mock pattern),
 * network-signal.spec.ts (route-boundary mocking for portability).
 */

import { test, expect, resetDatabase } from "./fixtures";

const DAY_ZERO_KEY = "ditto-day-zero-seen";

// ----------------------------------------------------------------------------
// AI SDK UI message stream helpers
// ----------------------------------------------------------------------------

type Chunk = Record<string, unknown>;

/** Serialise chunks as an AI SDK UI message stream SSE body. */
function uiMessageStream(chunks: Chunk[]): string {
  return (
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

/** A complete assistant turn: optional text, then optional content blocks. */
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

// Inline artifacts for the three conversational turns.

const PROCESS_PROPOSAL: Chunk = {
  type: "process_proposal",
  name: "Inbox Triage",
  description: "Sort and prioritise your inbox every weekday morning.",
  steps: [
    { name: "Scan new email", status: "pending" },
    { name: "Group by urgency", status: "pending" },
    { name: "Draft replies for your review", status: "pending" },
  ],
};

// Saved-process summary — human-readable, canonical trust label, no slug/id
// leaked into the conversation (Brief 280 AC7/AC8).
const SAVED_PROCESS_RECORD: Chunk = {
  type: "record",
  title: "Inbox Triage",
  status: { label: "Draft", variant: "neutral" },
  fields: [
    { label: "Purpose", value: "Sort and prioritise your inbox every weekday morning." },
    { label: "Trigger", value: "Every weekday at 8am" },
    { label: "Trust tier", value: "Spot-checked" },
    { label: "Steps", value: "3 steps" },
  ],
  actions: [
    { id: "open-process", label: "Open process", payload: { href: "/process/inbox-triage" } },
  ],
};

const RUN_SUGGESTION: Chunk = {
  type: "suggestion",
  content: "Want me to run Inbox Triage once now so you can see it work?",
  actions: [
    {
      id: "proposal-run",
      label: "Run it now",
      style: "primary",
      payload: { message: "Run the Inbox Triage process now." },
    },
  ],
};

const RUN_PROGRESS: Chunk = {
  type: "progress",
  entityType: "process_run",
  entityId: "run-e2e-1",
  currentStep: "Scanning your inbox",
  totalSteps: 3,
  completedSteps: 1,
  status: "running",
};

/** Pick the assistant turn for the given last user message. */
function responseForUserText(userText: string): string {
  const t = userText.toLowerCase();
  if (t.includes("looks good")) {
    // proposal-approve → saved summary + run suggestion (AC7)
    return assistantTurn({
      text: "Saved. Here's your Inbox Triage process.",
      blocks: [SAVED_PROCESS_RECORD, RUN_SUGGESTION],
    });
  }
  if (t.includes("run the")) {
    // proposal-run → inline progress, no page leave (AC objective)
    return assistantTurn({
      text: "Running it now — I'll keep you posted right here.",
      blocks: [RUN_PROGRESS],
    });
  }
  // First turn: natural-language ask → inline proposal.
  return assistantTurn({
    text: "Here's a process I can set up for that:",
    blocks: [PROCESS_PROPOSAL],
  });
}

// ----------------------------------------------------------------------------
// Shared route mocks
// ----------------------------------------------------------------------------

async function installMocks(page: import("@playwright/test").Page): Promise<void> {
  // Day Zero already seen → EntryPoint redirects `/` to `/chat` (not a
  // server redirect, so Day Zero is never skipped — brief constraint).
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "true");
  }, DAY_ZERO_KEY);

  // EntryPoint's auth gate — authenticated so it proceeds to the redirect.
  await page.route("**/api/v1/workspace/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true }),
    });
  });

  // Chat page bootstrap — workspace-authed, empty history (Brief 280
  // reconciliation: workspace owner is the Self-home user).
  await page.route("**/api/v1/chat/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        email: "dev@local",
        messages: [],
        messageCount: 0,
        status: { contacted: 0, replied: 0, meetings: 0, nextAction: null },
      }),
    });
  });

  // Harness SSE feed — connected only (no live runs). Mirrors onboarding.spec.
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

  // The Self conversation stream — deterministic per turn.
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as {
      messages?: Array<{ role: string; parts?: Array<{ type?: string; text?: string }> }>;
    };
    const lastUser = (body.messages ?? []).filter((m) => m.role === "user").pop();
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

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

test.beforeAll(async () => {
  await resetDatabase();
});

test.describe("Brief 280 — workspace conversational front door", () => {
  test("`/` lands in the Self conversation; propose → save → run inline", async ({
    page,
  }) => {
    await installMocks(page);

    // 1. Day Zero already seen → `/` redirects to the Self conversation.
    await page.goto("/");
    await page.waitForURL("**/chat", { timeout: 20_000 });

    // 2. Empty workspace conversation: "talk to your workspace" entry
    //    points, not primitive tabs (Brief 280 IA inversion).
    await expect(page.getByText("What's on your mind?")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: "Start a new process" }),
    ).toBeVisible();

    const input = page.getByPlaceholder(/message your workspace/i);
    await expect(input).toBeVisible();

    // 3. Natural-language ask → inline process proposal (no separate tab).
    await input.fill("Triage my inbox every weekday morning");
    await input.press("Enter");

    const assistant = page.locator('[data-testid="assistant-message"]');
    await expect(assistant.first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Here's a process I can set up for that:")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Inbox Triage" }),
    ).toBeVisible();
    await expect(page.getByText("Scan new email")).toBeVisible();

    // 4. Approve inline → saved-process summary streams back in-conversation.
    await page
      .getByRole("button", { name: /Looks good/i })
      .click();

    await expect(page.getByText("Saved. Here's your Inbox Triage process.")).toBeVisible({
      timeout: 15_000,
    });
    // AC8: canonical trust tier label, human-readable summary.
    await expect(page.getByText("Spot-checked")).toBeVisible();
    await expect(page.getByText("Every weekday at 8am")).toBeVisible();
    // AC7: no raw slug/id leaked into the conversation text.
    await expect(page.locator("body")).not.toContainText("inbox-triage");

    // 5. Run it inline via the suggestion → ProgressBlock, never leaving chat.
    await page.getByRole("button", { name: "Run it now" }).click();

    const progress = page.locator('[data-testid="progress-block"]');
    await expect(progress).toBeVisible({ timeout: 15_000 });
    await expect(progress).toContainText("Scanning your inbox");
    await expect(progress).toContainText("Running");
    await expect(progress).toContainText("1 of 3");

    // Still the single conversation surface — no navigation away.
    await expect(page).toHaveURL(/\/chat$/);
  });

  test("workspace chat home is usable with reduced motion", async ({ page }) => {
    await installMocks(page);
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/");
    await page.waitForURL("**/chat", { timeout: 20_000 });

    const input = page.getByPlaceholder(/message your workspace/i);
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill("Triage my inbox every weekday morning");
    await input.press("Enter");

    // Inline artifacts still render (entrance animations are decorative,
    // never gate content) under prefers-reduced-motion.
    await expect(
      page.getByRole("heading", { name: "Inbox Triage" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /Looks good/i }),
    ).toBeVisible();
  });
});
