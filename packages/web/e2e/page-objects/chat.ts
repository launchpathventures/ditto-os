/**
 * Ditto — Chat Page Object
 *
 * Selectors and actions for the /chat page — the post-Day-Zero workspace
 * Self conversation (Brief 280). Used by onboarding E2E tests.
 *
 * Brief 280 reconciliation:
 *  - `messageInput` matches the Self-conversation composer placeholder
 *    ("Message your workspace…"), not the legacy "Message Alex…" string.
 *  - The Brief-157 progressive-reveal workspace-prompt banner (an
 *    `a[href="/"]` link) was removed by Brief 280's IA inversion: `/chat`
 *    *is* the workspace home, so there is no separate workspace to be
 *    prompted toward. `workspacePrompt`/`hasWorkspacePrompt` are gone.
 *
 * Provenance: Brief 157 (page object pattern), Brief 280 (IA inversion).
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

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[type="email"]');
    this.sendMagicLinkButton = page.getByRole("button", { name: /send magic link/i });
    this.messageInput = page.getByPlaceholder(/message your workspace/i);
    this.sendButton = page.getByRole("button", { name: "Send" });
    this.assistantMessages = page.locator('[data-testid="assistant-message"]');
    this.progressBlock = page.locator('[data-testid="progress-block"]');
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
    // Wait for an assistant message to render. Previously this waited for
    // `.space-y-1 > div:last-child`, but that selector resolves to the empty
    // `messagesEndRef` scroll anchor at the end of the list — always hidden.
    await this.assistantMessages.first().waitFor({ state: "visible", timeout });
  }

  /** Check if a progress block is visible */
  async hasProgressBlock(): Promise<boolean> {
    return this.progressBlock.isVisible();
  }
}
