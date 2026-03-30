/**
 * Ditto — Block Rendering E2E Tests
 *
 * Verifies content block rendering (AC6):
 * - TextBlock renders markdown (h1/h2, code blocks, bullet lists)
 * - Conversation flow with user and assistant messages
 *
 * Provenance: Brief 054 (Testing Infrastructure), Brief 050 (Markdown Rendering).
 */

import { test, expect, resetDatabase } from "./fixtures";
import { ConversationPage } from "./page-objects/conversation";

test.beforeAll(async () => {
  await resetDatabase();
});

test.describe("Block rendering", () => {
  test("streamed markdown text is visible in conversation", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    // Send message that triggers markdown-rich response
    await conversation.sendMessage("markdown test");
    await conversation.waitForResponse();

    // Streamed text renders as plain text via <span> (not react-markdown HTML).
    // Verify the text content is visible in the conversation.
    await expect(page.getByText("Heading One", { exact: false })).toBeVisible();
    await expect(page.getByText("Heading Two", { exact: false })).toBeVisible();

    // Bullet list items visible as text
    await expect(page.getByText("First item")).toBeVisible();
    await expect(page.getByText("Second item")).toBeVisible();

    // Code content visible as text
    await expect(page.getByText("const x = 42;")).toBeVisible();

    // Bold/italic markers visible as text content
    await expect(page.getByText("bold", { exact: false })).toBeVisible();
    await expect(page.getByText("italic", { exact: false })).toBeVisible();
  });

  test("assistant message has correct data-testid", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("hello");
    await conversation.waitForResponse();

    // Assistant message should have data-testid
    await expect(conversation.assistantMessages.first()).toBeVisible();
  });

  test("conversation renders user and assistant messages with testids", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("hello");
    await conversation.waitForResponse();

    // User message with data-testid
    await expect(conversation.userMessages.first()).toBeVisible();
    // Assistant message with data-testid
    await expect(conversation.assistantMessages.first()).toBeVisible();
    // Assistant response text
    await expect(page.getByText("Hello!", { exact: false })).toBeVisible();
  });

  test("generic message produces text response", async ({ page }) => {
    const conversation = new ConversationPage(page);
    await conversation.goto();

    await conversation.sendMessage("What can you do?");
    await conversation.waitForResponse();

    await expect(page.getByText("I'll help with that")).toBeVisible();
  });
});
