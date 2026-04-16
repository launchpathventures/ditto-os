/**
 * Ditto — Chat Page Object
 *
 * Selectors and actions for the /chat page (magic-link authenticated chat).
 * Used by onboarding E2E tests.
 *
 * Provenance: Brief 157, Playwright page object pattern.
 */

import type { Page, Locator } from "@playwright/test";

export class ChatPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly sendMagicLinkButton: Locator;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly assistantMessages: Locator;
  readonly progressBlock: Locator;
  readonly workspacePrompt: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.sendMagicLinkButton = page.getByRole("button", { name: /send magic link/i });
    this.messageInput = page.locator('input[placeholder="Message Alex..."]');
    this.sendButton = page.getByRole("button", { name: "Send" });
    this.assistantMessages = page.locator('[data-testid="assistant-message"]');
    this.progressBlock = page.locator('[data-testid="progress-block"]');
    this.workspacePrompt = page.locator('a[href="/"]').filter({ hasText: /workspace/i });
  }

  /** Navigate to the chat page */
  async goto(): Promise<void> {
    await this.page.goto("/chat");
  }

  /** Navigate to the chat page with a mock authenticated session */
  async gotoAuthenticated(): Promise<void> {
    // Set a test session cookie to bypass magic link auth
    await this.page.addInitScript(() => {
      // The test reset endpoint seeds session "test-session-001"
      // Mock the /api/v1/chat/session response for authenticated state
      const originalFetch = window.fetch;
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("/api/v1/chat/session")) {
          return new Response(JSON.stringify({
            authenticated: true,
            email: "test@example.com",
            sessionId: "test-session-001",
            messages: [],
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return originalFetch(input, init);
      };
    });
    await this.page.goto("/chat");
    await this.messageInput.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Send a chat message */
  async sendMessage(text: string): Promise<void> {
    await this.messageInput.fill(text);
    await this.messageInput.press("Enter");
  }

  /** Wait for an assistant response to appear */
  async waitForResponse(timeout = 15_000): Promise<void> {
    // Wait for any text from the assistant to appear in the message area
    await this.page.locator(".space-y-1 > div").last().waitFor({ state: "visible", timeout });
  }

  /** Check if a progress block is visible */
  async hasProgressBlock(): Promise<boolean> {
    return this.progressBlock.isVisible();
  }

  /** Check if the workspace prompt (progressive reveal) is visible */
  async hasWorkspacePrompt(): Promise<boolean> {
    return this.workspacePrompt.isVisible();
  }
}
