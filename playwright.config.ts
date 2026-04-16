/**
 * Ditto — Playwright E2E Test Configuration
 *
 * Single browser (Chromium), headless.
 * Uses port 3001 for tests to avoid conflicts with a running dev server.
 * Web server: `pnpm dev` locally, `pnpm build && pnpm start` in CI.
 * Tests run with MOCK_LLM=true and NODE_ENV=test.
 *
 * Provenance: Brief 054 (Testing Infrastructure), Playwright best practices.
 */

import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const port = 3001;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "packages/web/e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30_000,

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: isCI
      ? `pnpm --filter @ditto/web build && pnpm --filter @ditto/web start -p ${port}`
      : `pnpm --filter @ditto/web dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    // CI runs `build && start`; the Next.js build alone takes ~80s locally and
    // often exceeds the previous 120s window on GitHub-hosted runners. Bumped
    // to 4 minutes to cover build + start on slower CI hardware.
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      MOCK_LLM: "true",
      NODE_ENV: "test",
    },
  },
});
