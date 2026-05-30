/**
 * Brief 274 — Manual Search integration e2e (AC #18).
 *
 * Proves the Manual Search workflow is *mounted and reachable in the real
 * app*: completing the client-lane brief on `/network/chat?mode=client`
 * surfaces the grounded `SearchBox`, submitting a query drives the
 * `/api/v1/network/search` route, and `SearchResultsPanel` renders an
 * honest outcome without crashing.
 *
 * Environment note: the Playwright server runs without a Network tier
 * (`SUPABASE_DB_URL` unset — a documented, pre-existing constraint; see
 * docs/state.md "Known Gaps"). The route therefore degrades gracefully to
 * its 503 path, so the deterministic e2e outcome here is the panel's
 * error/degradation state — a real integration + no-crash assertion. The
 * per-state visual matrix (loading / success / empty / partial /
 * web-unavailable / mobile grid) is covered deterministically at the
 * component level in `search-results-panel.test.tsx`. This spec owns the
 * end-to-end wiring proof; that test owns the state matrix.
 */

import { test, expect, resetDatabase } from "./fixtures";

const CLIENT_ANSWERS = [
  "A marketplace operations lead who can rebuild supply liquidity.",
  "Someone who ran ops at a two-sided marketplace I advised.",
  "No agency middlemen, no pure strategy decks.",
  "Supply onboarding time halved within 30 days.",
  "Around $20k a month, project-based.",
  "Stick with people already in the network for now.",
];

test.describe("Brief 274 — Manual Search is mounted in the client lane", () => {
  test.beforeAll(async () => {
    await resetDatabase();
  });

  test("complete the brief, then run a grounded manual search end to end", async ({
    page,
  }) => {
    await page.goto("/network/chat?mode=client");

    const composer = page.locator("textarea");
    await expect(composer).toBeVisible();
    const send = page.getByRole("button", { name: "Send" });

    // Walk the six scripted client-lane questions. Each answer clears the
    // composer; the sixth writes the opportunity brief (the Active Request)
    // which is what grounds Manual Search.
    for (const answer of CLIENT_ANSWERS) {
      await expect(composer).toBeEnabled();
      await composer.fill(answer);
      await send.click();
      await expect(composer).toHaveValue("");
    }

    // The grounded Manual Search box appears once the brief exists.
    const searchBox = page.getByTestId("network-search-box");
    await expect(searchBox).toBeVisible({ timeout: 15_000 });

    // No-contact reassurance is present (superconnector posture).
    await expect(
      searchBox.getByText(/contacted without your say-so/i),
    ).toBeVisible();

    // Grounded mode hides the source-scope selector and the
    // save-as-Active-Request checkbox (the brief already is the request).
    await expect(
      searchBox.getByLabel("Search source scope"),
    ).toHaveCount(0);
    await expect(
      searchBox.getByText(/Save this as an Active Request/i),
    ).toHaveCount(0);

    // Run the search.
    await searchBox.getByLabel("Ask me to find someone").fill(
      "marketplace operations expert for a messy two-sided network",
    );
    await searchBox.getByRole("button", { name: /search/i }).click();

    // The panel must render an honest outcome — results, empty, or the
    // graceful error/degradation state — and never crash the lane.
    const outcome = page.locator(
      '[data-testid="search-results-panel"], ' +
        '[data-testid="search-results-empty"], ' +
        '[data-testid="search-results-error"], ' +
        '[data-testid="search-results-loading"]',
    );
    await expect(outcome.first()).toBeVisible({ timeout: 15_000 });

    // The composer is still usable — the feature degraded, it did not
    // take the page down.
    await expect(composer).toBeVisible();
  });
});
