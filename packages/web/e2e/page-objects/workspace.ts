/**
 * Ditto — Workspace Page Object
 *
 * Selectors and actions for the workspace layout.
 * Uses data-testid attributes for stable selectors.
 *
 * Provenance: Brief 054, Playwright page object pattern.
 * Updated: Brief 057 — bypass Day Zero, wait for center panel instead of networkidle.
 */

import type { Page, Locator } from "@playwright/test";

export class WorkspacePage {
  readonly page: Page;
  readonly centerPanel: Locator;
  readonly artifactLayout: Locator;
  readonly artifactHost: Locator;
  readonly artifactConversation: Locator;

  constructor(page: Page) {
    this.page = page;
    this.centerPanel = page.getByTestId("center-panel");
    this.artifactLayout = page.getByTestId("artifact-layout");
    this.artifactHost = page.getByTestId("artifact-host");
    this.artifactConversation = page.getByTestId("artifact-conversation");
  }

  /** Navigate to the workspace, bypassing Day Zero welcome (Brief 057) */
  async goto(): Promise<void> {
    await this.page.addInitScript(() => {
      localStorage.setItem("ditto-day-zero-seen", "true");
    });
    await this.page.goto("/");
    // Wait for center panel instead of networkidle (workspace has persistent polling)
    await this.centerPanel.waitFor({ state: "visible", timeout: 15_000 });
  }

  /** Check if artifact mode is active (three-column layout) */
  async isArtifactMode(): Promise<boolean> {
    return this.artifactLayout.isVisible();
  }

  /** Exit artifact mode via the "Back to workspace" button */
  async exitArtifactMode(): Promise<void> {
    const backButton = this.page.getByText("Back to workspace");
    if (await backButton.isVisible()) {
      await backButton.click();
    }
  }
}
