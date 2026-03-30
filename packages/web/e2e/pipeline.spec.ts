/**
 * Ditto — Pipeline Flow E2E Tests
 *
 * Verifies pipeline trigger and response UI (AC8):
 * - Sending "Build Brief X" triggers pipeline response
 * - UI renders the pipeline trigger text
 * - Tool invocation appears in the UI
 * - Pipeline status text is shown
 *
 * Tests verify UI rendering with deterministic mock data.
 *
 * Provenance: Brief 054 (Testing Infrastructure), Brief 053 (Pipeline Wiring).
 */

import { test, expect, resetDatabase } from "./fixtures";
import { ConversationPage } from "./page-objects/conversation";

test.beforeAll(async () => {
  await resetDatabase();
});

test.describe("Pipeline flow", () => {
  test("pipeline trigger message produces Self response text", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("Build Brief 054");

    // Mock returns text about starting the pipeline
    await expect(
      page.getByText("I'll start the dev pipeline for this brief."),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("pipeline trigger shows tool invocation in UI", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("build brief 001");

    // The response text should be visible
    await expect(
      page.getByText("I'll start the dev pipeline for this brief."),
    ).toBeVisible({ timeout: 15_000 });

    // Tool invocation status should show start_pipeline
    await expect(
      page.getByText("start_pipeline", { exact: false }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("pipeline trigger shows pipeline status message", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("Build Brief 099");

    // Pipeline status text from self-stream.ts
    await expect(
      page.getByText("Starting pipeline", { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
