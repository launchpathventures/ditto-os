/**
 * Brief 271 — Network landing first-viewport e2e (AC 9, AC 12).
 *
 * Coverage on `/network` at desktop and mobile viewports:
 *   - First viewport renders the "superconnector" thesis.
 *   - One composer offers client/expert starts.
 *   - Submitting either mode hands off to the relevant onboarding route with `seed=...`.
 *   - 375×667 viewport has no overlapping fixed CTA/toggle controls.
 */

import { test, expect } from "./fixtures";

const VIEWPORTS = [
  { name: "Desktop 1280×800", width: 1280, height: 800 },
  { name: "iPhone 13 mini 375×667", width: 375, height: 667 },
  { name: "iPhone 13 390×844", width: 390, height: 844 },
] as const;

const ENTRY_HANDOFFS: ReadonlyArray<{
  tab: string;
  intent: string;
  cta: string;
  mode: string;
  path: string;
  seed: string;
}> = [
  {
    tab: "Be found",
    intent: "member-signal",
    cta: "Create profile",
    mode: "expert",
    path: "/network/signal",
    seed: "I help founders make sales repeatable.",
  },
  {
    tab: "Research",
    intent: "manual-search",
    cta: "Research",
    mode: "client",
    path: "/network/request",
    seed: "Research marketplace operators who have rebuilt trust.",
  },
];

for (const viewport of VIEWPORTS) {
  test.describe(`/network at ${viewport.name}`, () => {
    test("first viewport names the superconnector thesis and shows the two start modes", async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/network");

      await expect(page.getByRole("heading", { level: 1 })).toContainText(/right people/i);
      await expect(page.getByText(/personal superconnector/i)).toBeVisible();

      await expect(page.getByRole("button", { name: "Research" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Research" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Be found" })).toBeVisible();
      await page.getByRole("tab", { name: "Be found" }).click();
      await expect(page.getByRole("button", { name: "Create profile" })).toBeVisible();
    });
  });
}

test.describe("/network entry handoff (Brief 271 AC 7, AC 8)", () => {
  for (const { tab, cta, mode, intent, path, seed } of ENTRY_HANDOFFS) {
    test(`"${cta}" routes to ${path}?mode=${mode}&intent=${intent}&seed=...`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/network");
      await page.getByRole("tab", { name: tab }).click();
      const card = page.locator(`[data-intent="${intent}"]`);
      await card.getByRole("textbox").fill(seed);
      await card.getByRole("button", { name: cta }).click();
      await expect(page).toHaveURL(new RegExp(`${path}\\?mode=${mode}&intent=${intent}&seed=`));
    });
  }

  test("legacy /network/chat?mode=expert link still loads", async ({ page }) => {
    await page.goto("/network/chat?mode=expert");
    await expect(page).toHaveURL(/\/network\/chat\?mode=expert/);
  });

  test("legacy /network/chat?mode=client link still loads", async ({ page }) => {
    await page.goto("/network/chat?mode=client");
    await expect(page).toHaveURL(/\/network\/chat\?mode=client/);
  });
});

test.describe("/network mobile fit (Brief 271 AC 9)", () => {
  test("375×667 first viewport has no horizontal scroll and no fixed-element overlap with entry cards", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/network");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const horizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(horizontalScroll).toBe(false);

    // Bounding-box intersection check: no `position: fixed` element may overlap
    // the entry cards within the first viewport. AC 9.
    const entryHandle = await page.locator('[data-intent]').first().boundingBox();
    expect(entryHandle).not.toBeNull();
    const fixedOverlap = await page.evaluate((rect) => {
      if (!rect) return false;
      const fixedElements = Array.from(document.querySelectorAll("*")).filter((el) => {
        const style = window.getComputedStyle(el);
        return style.position === "fixed" && (style.visibility !== "hidden") && (style.display !== "none");
      });
      return fixedElements.some((el) => {
        const r = el.getBoundingClientRect();
        return !(
          r.right <= rect.x ||
          r.left >= rect.x + rect.width ||
          r.bottom <= rect.y ||
          r.top >= rect.y + rect.height
        );
      });
    }, entryHandle);
    expect(fixedOverlap).toBe(false);
  });
});
