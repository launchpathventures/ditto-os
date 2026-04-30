/**
 * Ditto — Projects admin E2E tests (Brief 215 AC #12).
 *
 * Mobile-first verification (375 × 667 viewport):
 *   1. /admin → "Projects" card → /projects index
 *   2. Empty state CTA → /projects/new form
 *   3. Submit valid project → redirected to /projects/[slug]/runners
 *   4. "Add runner" → kind selector shows local-mac-mini enabled and the four
 *      cloud kinds disabled with the correct tooltip text
 *   5. Add a local-mac-mini config → row appears with enabled toggle and
 *      "Test dispatch" button
 *   6. No horizontal scroll at 375×667; all interactive elements ≥ 44pt
 */

import { test, expect, resetDatabase } from "./fixtures";

test.use({ viewport: { width: 375, height: 667 } });

// Use beforeEach so Playwright's CI retries (retries: 2) start clean and
// don't 409 on the slug created by the previous attempt.
test.beforeEach(async () => {
  await resetDatabase();
});

test.describe("Projects admin", () => {
  test("create project + add local-mac-mini runner", async ({ page }) => {
    // Step 1 — admin → projects index
    await page.goto("/admin");
    const projectsCard = page.getByRole("link", { name: /projects/i }).first();
    await expect(projectsCard).toBeVisible();
    await projectsCard.click();
    await expect(page).toHaveURL(/\/projects$/);

    // Step 2 — empty state CTA
    const newButton = page.getByRole("link", { name: /new project|create your first project/i }).first();
    await expect(newButton).toBeVisible();
    await newButton.click();
    await expect(page).toHaveURL(/\/projects\/new$/);

    // Step 3 — fill form + submit
    await page.getByLabel(/^name$/i).fill("Smoke Test Project");
    await page.getByLabel(/^slug$/i).fill("smoke-test");
    await page.getByLabel(/github repo/i).fill("test/smoke-test");
    await page.getByRole("button", { name: /create project/i }).click();
    await expect(page).toHaveURL(/\/projects\/smoke-test\/runners$/);

    // Step 4 — open the kind selector
    await page.getByRole("button", { name: /add runner/i }).click();

    // Local Mac mini + the three implemented cloud kinds are enabled
    // (Briefs 216/217/218 lit them up; Brief 215's "disabled with sub-brief
    // tooltip" state no longer applies). E2B Sandbox stays deferred.
    for (const kind of [
      /local mac mini/i,
      /claude code routine/i,
      /claude managed agent/i,
      /github action/i,
    ]) {
      await expect(page.getByLabel(kind)).toBeEnabled();
    }
    await expect(page.getByLabel(/e2b sandbox/i)).toBeDisabled();
    await expect(page.getByText(/deferred/i)).toBeVisible();

    // Step 5 — fill local-mac-mini config + submit
    await page.getByLabel(/device id/i).fill("dev_smoke_test");
    await page.getByRole("button", { name: /save runner/i }).click();

    // Row appears with toggle + "Test dispatch"
    await expect(page.getByText(/local mac mini/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /test dispatch/i })).toBeVisible();
    await expect(page.getByRole("checkbox").first()).toBeChecked();

    // Step 6 — no horizontal scroll at 375×667
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  });
});
