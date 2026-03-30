/**
 * Ditto — Workspace Page Object
 *
 * Selectors and actions for the workspace layout.
 * Uses data-testid attributes for stable selectors.
 *
 * Provenance: Brief 054, Playwright page object pattern.
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

  /** Navigate to the workspace */
  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
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
