/**
 * Ditto — Onboarding Flow E2E Tests (Brief 157, MP-2.5)
 *
 * End-to-end test of the onboarding handoff:
 * 1. Magic link → authenticated /chat page
 * 2. Greeting with frontdoor context
 * 3. First process proposed (generate_process preview)
 * 4. First process approved → ProgressBlock appears via SSE
 * 5. First output reviewed
 *
 * Tests verify UI rendering and SSE integration with mock data.
 * The actual LLM is mocked (MOCK_LLM=true), so we verify the
 * UI wiring, not the AI responses.
 *
 * Provenance: Brief 157 (Onboarding Handoff + Streaming), Brief 054 (Testing Infrastructure).
 */

import { test, expect, resetDatabase } from "./fixtures";
import { ChatPage } from "./page-objects/chat";

test.beforeAll(async () => {
  await resetDatabase();
});

test.describe("Onboarding flow", () => {
  test("unauthenticated user sees email form on /chat", async ({ page }) => {
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

  test("progressive reveal shows workspace prompt after process creation", async ({ page }) => {
    // Intercept /api/events to inject build-process-created event
    await page.route("**/api/events", (route) => {
      const sseBody = [
        `data: ${JSON.stringify({ type: "connected" })}\n\n`,
        `data: ${JSON.stringify({
          type: "build-process-created",
          goalWorkItemId: "test-goal-001",
          processSlug: "daily-email-check",
          processName: "Daily Email Check",
          processDescription: "Check and process emails daily",
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

    // The build-process-created event should trigger the workspace prompt
    await expect(chat.workspacePrompt).toBeVisible({ timeout: 10_000 });
  });
});
