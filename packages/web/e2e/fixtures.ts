/**
 * Ditto — Playwright Test Fixtures
 *
 * Database reset helper, app URL, and shared test setup.
 * Each spec file uses resetDatabase() in beforeAll.
 *
 * Provenance: Brief 054 (Testing Infrastructure).
 */

import { test as base, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";

/**
 * Reset the database to a clean state via the test-only API endpoint.
 * Called in beforeAll of each spec file for proper isolation.
 */
export async function resetDatabase(): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/test/reset`, {
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Database reset failed (${response.status}): ${body}`);
  }
}

/**
 * Extended test fixture with Ditto-specific helpers.
 */
export const test = base.extend<{
  appUrl: string;
}>({
  appUrl: async ({}, use) => {
    await use(BASE_URL);
  },
});

export { expect };
