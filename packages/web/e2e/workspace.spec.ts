/**
 * Ditto — Workspace Layout E2E Tests
 *
 * Verifies workspace layout basics (AC7):
 * - Page loads with conversation interface
 * - Chat input uses data-testid selectors
 * - Send button state management
 *
 * Provenance: Brief 054 (Testing Infrastructure).
 */

import { test, expect, resetDatabase } from "./fixtures";

test.beforeAll(async () => {
  await resetDatabase();
});

test.describe("Workspace layout", () => {
  test("page loads with chat input (data-testid)", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Chat input should be accessible via data-testid
    await expect(page.getByTestId("chat-input")).toBeVisible();
    // Send button should also be accessible
    await expect(page.getByTestId("send-button")).toBeVisible();
  });

  test("page shows Ditto branding on first load", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // The conversation page shows "Hi, I'm Ditto"
    await expect(page.getByText("Ditto", { exact: false })).toBeVisible();
  });

  test("chat input accepts and clears text on submit", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const input = page.getByTestId("chat-input");
    await input.fill("test message");
    await expect(input).toHaveValue("test message");

    // Submit and verify input clears
    await input.press("Enter");
    await expect(input).toHaveValue("");
  });

  test("send button is disabled when input is empty", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const sendButton = page.getByTestId("send-button");
    await expect(sendButton).toBeDisabled();

    // Fill text — button becomes enabled
    await page.getByTestId("chat-input").fill("hello");
    await expect(sendButton).toBeEnabled();
  });
});
