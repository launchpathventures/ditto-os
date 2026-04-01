/**
 * Ditto — Conversation Page Object
 *
 * Selectors and actions for the conversation view.
 * Uses data-testid attributes for stable selectors.
 *
 * Provenance: Brief 054, Playwright page object pattern.
 * Updated: Brief 057 — bypass Day Zero, wait for chat input instead of networkidle.
 */

import type { Page, Locator } from "@playwright/test";

export class ConversationPage {
  readonly page: Page;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;
  readonly textBlocks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.messageInput = page.getByTestId("chat-input");
    this.sendButton = page.getByTestId("send-button");
    this.userMessages = page.getByTestId("user-message");
    this.assistantMessages = page.getByTestId("assistant-message");
    this.textBlocks = page.getByTestId("text-block");
  }

  /** Navigate to the workspace, bypassing Day Zero welcome (Brief 057) */
  async goto(): Promise<void> {
    await this.page.addInitScript(() => {
      localStorage.setItem("ditto-day-zero-seen", "true");
    });
    await this.page.goto("/");
    // Wait for chat input instead of networkidle (workspace has persistent polling)
    await this.messageInput.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Send a message via the chat input */
  async sendMessage(text: string): Promise<void> {
    await this.messageInput.fill(text);
    await this.messageInput.press("Enter");
  }

  /** Wait for an assistant response to appear */
  async waitForResponse(timeout = 10_000): Promise<void> {
    await this.assistantMessages.first().waitFor({ state: "visible", timeout });
  }

  /** Get all visible text blocks */
  getTextBlocks(): Locator {
    return this.textBlocks;
  }

  /** Check if a specific block type is visible by its testid */
  async hasBlock(testId: string): Promise<boolean> {
    return this.page.getByTestId(testId).isVisible();
  }
}
