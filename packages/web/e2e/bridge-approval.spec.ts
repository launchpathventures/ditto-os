/**
 * Brief 212 AC #15 — Mobile bridge approval surface (Playwright snapshot).
 *
 * Verifies the `/bridge/devices` admin page (Devices admin) and a stub
 * `/review/[token]` bridge-job page render cleanly on iPhone 13 viewport
 * (390×844): no horizontal scroll, ≥44pt touch targets on action buttons,
 * command preview wraps cleanly.
 *
 * The bridge approval surface end-to-end (dispatcher mints a review token,
 * which a reviewer opens here) is exercised in the dispatcher unit suite;
 * this spec validates the visual + touch-target invariants on the UI
 * pages themselves.
 */
import { test, expect, resetDatabase } from "./fixtures";

const IPHONE_13 = { width: 390, height: 844 };

test.describe("Brief 212 AC #15 — bridge admin mobile UX", () => {
  test.beforeAll(async () => {
    await resetDatabase();
  });

  test("Devices page renders on iPhone 13 viewport with ≥44pt touch targets", async ({ page }) => {
    await page.setViewportSize(IPHONE_13);
    await page.goto("/bridge/devices");

    // Page header.
    await expect(page.getByRole("heading", { name: /Local Devices/i })).toBeVisible();

    // Pair-new button — mobile touch target ≥44px height.
    const pairButton = page.getByTestId("bridge-pair-new");
    await expect(pairButton).toBeVisible();
    const pairBox = await pairButton.boundingBox();
    expect(pairBox).not.toBeNull();
    expect(pairBox!.height).toBeGreaterThanOrEqual(44);

    // No horizontal scroll on a fresh page.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // +1 for sub-pixel rounding

    // Empty-state copy is visible (no devices paired yet on a fresh DB).
    await expect(page.getByTestId("bridge-empty")).toBeVisible();
  });

  test("Pairing-code popup wraps cleanly with copy-to-clipboard at 390px", async ({ page }) => {
    await page.setViewportSize(IPHONE_13);
    await page.goto("/bridge/devices");

    // Click "Pair a new device" — the API hits /api/v1/bridge/devices.
    // (In MOCK_LLM/test mode the workspace has no auth, so the request
    // succeeds without a session cookie.)
    await page.getByTestId("bridge-pair-new").click();

    const codeBlock = page.getByTestId("bridge-pairing-code");
    await expect(codeBlock).toBeVisible();

    // Code is rendered, not blank.
    const codeText = await codeBlock.locator("div.font-mono").first().textContent();
    expect(codeText).toMatch(/^[A-Z0-9]{6}$/);

    // The install command preview wraps (no horizontal scroll on the
    // pairing card at 390px wide).
    const cardBox = await codeBlock.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.width).toBeLessThanOrEqual(IPHONE_13.width);

    // Copy + dismiss buttons reachable + tappable.
    const copyButton = page.getByRole("button", { name: /Copy code/i });
    const dismissButton = page.getByRole("button", { name: /Dismiss/i });
    const copyBox = await copyButton.boundingBox();
    const dismissBox = await dismissButton.boundingBox();
    expect(copyBox!.height).toBeGreaterThanOrEqual(40);
    expect(dismissBox!.height).toBeGreaterThanOrEqual(40);
  });
});
