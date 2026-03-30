/**
 * Ditto — Planning Workflow E2E Tests
 *
 * Verifies planning conversation flow (AC9):
 * - Planning message triggers plan_with_role response
 * - UI renders planning response text
 * - Planning role appears in tool invocation status
 *
 * Provenance: Brief 054 (Testing Infrastructure), Brief 052 (Planning Workflow).
 */

import { test, expect, resetDatabase } from "./fixtures";
import { ConversationPage } from "./page-objects/conversation";

test.beforeAll(async () => {
  await resetDatabase();
});

test.describe("Planning workflow", () => {
  test("planning message triggers plan response text", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("I want to add a new feature for notifications");
    await conversation.waitForResponse();

    // Mock returns planning text
    await expect(
      page.getByText("Let me help you plan that out."),
    ).toBeVisible();
  });

  test("planning response shows plan_with_role tool invocation", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("I want to add dark mode support");

    // Tool invocation status should show plan_with_role or "Planning with"
    // Allow longer timeout — delegation executes a mock LLM call
    await expect(
      page.getByText(/plan_with_role|Planning with/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("design request triggers planning with architect role", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("Let's design an onboarding flow");
    await conversation.waitForResponse();

    // Planning text should appear
    await expect(
      page.getByText("Let me help you plan that out."),
    ).toBeVisible();

    // Planning status should mention the architect role
    await expect(
      page.getByText("architect", { exact: false }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
