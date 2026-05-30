/**
 * Ditto — Onboarding Flow E2E Tests (Brief 157, MP-2.5; reconciled with Brief 280)
 *
 * End-to-end test of the onboarding handoff at the /chat Self conversation:
 * 1. Unauthenticated → Brief 123 email-request form (preserved fallback)
 * 2. Authenticated → chat composer
 * 3. Send a message → assistant response renders
 * 4. ProgressBlock appears via the preserved harness SSE feed
 *
 * Tests verify UI rendering and SSE integration with mock data.
 * The actual LLM is mocked (MOCK_LLM=true), so we verify the
 * UI wiring, not the AI responses.
 *
 * Brief 280 reconciliation:
 *  - `/chat` is now the post-Day-Zero workspace home (the Self conversation).
 *  - In local/CI (`WORKSPACE_OWNER_EMAIL` unset) `/api/v1/chat/session`
 *    resolves the owner as `dev@local` (workspace dev-bypass), so the
 *    unauthenticated email-form path is only reachable by explicitly
 *    mocking the session as unauthenticated. Test 1 does exactly that to
 *    keep regression coverage of the preserved Brief 123 fallback.
 *  - The Brief-157 progressive-reveal "workspace prompt" banner was removed
 *    by Brief 280's IA inversion (there is no separate workspace to be
 *    prompted toward — `/chat` is the home). The propose → save → run
 *    inline flow that replaces it is covered by
 *    `workspace-chat-front-door.spec.ts`.
 *
 * Provenance: Brief 157 (Onboarding Handoff + Streaming), Brief 054
 * (Testing Infrastructure), Brief 280 (Conversational Front Door IA).
 */

import { test, expect, resetDatabase } from "./fixtures";
import { ChatPage } from "./page-objects/chat";

test.beforeAll(async () => {
  await resetDatabase();
});

test.describe("Onboarding flow", () => {
  test("unauthenticated user sees email form on /chat", async ({ page }) => {
    // Brief 280: the workspace dev-bypass authenticates `dev@local` in
    // local/CI, so force the unauthenticated path to verify the preserved
    // Brief 123 email-request fallback still renders (must not regress).
    await page.route("**/api/v1/chat/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false }),
      }),
    );

    const chat = new ChatPage(page);
    await chat.goto();

    // Should see the "Continue your conversation" form
    await expect(chat.emailInput).toBeVisible({ timeout: 10_000 });
    await expect(chat.sendMagicLinkButton).toBeVisible();
  });

  test("authenticated user sees chat input", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.gotoAuthenticated();

    // Should see the message input (authenticated state)
    await expect(chat.messageInput).toBeVisible({ timeout: 15_000 });
  });

  test("authenticated user can send a message and receive response", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.gotoAuthenticated();

    await chat.sendMessage("Tell me about my first process");

    // Wait for any assistant response (mock LLM will respond)
    await chat.waitForResponse(20_000);
  });

  test("progress block renders from SSE events", async ({ page }) => {
    // Intercept /api/events to inject mock SSE events
    await page.route("**/api/events", (route) => {
      const sseBody = [
        `data: ${JSON.stringify({ type: "connected" })}\n\n`,
        `data: ${JSON.stringify({
          type: "step-start",
          processRunId: "test-run-001",
          stepId: "gather-basics",
          roleName: "Gather Basics",
          processName: "Onboarding",
        })}\n\n`,
      ].join("");

      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        body: sseBody,
      });
    });

    const chat = new ChatPage(page);
    await chat.gotoAuthenticated();

    // The SSE route mock fires a step-start event, which should render a ProgressBlock
    await expect(chat.progressBlock).toBeVisible({ timeout: 10_000 });
  });
});
