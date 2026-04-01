/**
 * Ditto — Planning Workflow E2E Tests
 *
 * Verifies planning conversation flow (AC9):
 * - Planning message triggers plan response text
 * - Planning-related tool invocation renders in UI
 *
 * Provenance: Brief 054 (Testing Infrastructure), Brief 052 (Planning Workflow).
 * Updated: Brief 057 — Day Zero bypass; Brief 062 — tool display names.
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

  test("planning response shows assistant reply", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("I want to add dark mode support");
    await conversation.waitForResponse();

    // Planning text should appear as Self's response
    await expect(
      page.getByText("Let me help you plan that out."),
    ).toBeVisible();

    // Assistant message container should exist
    await expect(conversation.assistantMessages.first()).toBeVisible();
  });

  test("design request triggers planning response", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("Let's design an onboarding flow");
    await conversation.waitForResponse();

    // Planning text should appear
    await expect(
      page.getByText("Let me help you plan that out."),
    ).toBeVisible();
  });
});
