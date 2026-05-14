/**
 * Brief 271 — Network landing first-viewport e2e (AC 9, AC 12).
 *
 * Coverage on `/network` at desktop and mobile viewports:
 *   - First viewport renders the "superconnector" thesis.
 *   - All four entry jobs are visible.
 *   - Selecting an entry hands off to `/network/chat?mode=...&intent=...`.
 *   - 375×667 viewport has no overlapping fixed CTA/toggle controls.
 */

import { test, expect } from "./fixtures";

const VIEWPORTS = [
  { name: "Desktop 1280×800", width: 1280, height: 800 },
  { name: "iPhone 13 mini 375×667", width: 375, height: 667 },
  { name: "iPhone 13 390×844", width: 390, height: 844 },
] as const;

const ENTRY_LABELS = [
  "Help Ditto understand me",
  "Find someone now",
  "Create a request",
  "Keep watch for me",
] as const;

const ENTRY_HANDOFFS: ReadonlyArray<{ label: (typeof ENTRY_LABELS)[number]; mode: string; intent: string }> = [
  { label: "Help Ditto understand me", mode: "expert", intent: "member-signal" },
  { label: "Find someone now", mode: "client", intent: "manual-search" },
  { label: "Create a request", mode: "client", intent: "request" },
  { label: "Keep watch for me", mode: "client", intent: "background-watch" },
];

for (const viewport of VIEWPORTS) {
  test.describe(`/network at ${viewport.name}`, () => {
    test("first viewport names the superconnector thesis and shows all four entry jobs", async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/network");

      await expect(page.getByRole("heading", { level: 1 })).toContainText(/superconnector/i);

      for (const label of ENTRY_LABELS) {
        await expect(page.getByText(label, { exact: true })).toBeVisible();
      }
    });
  });
}

test.describe("/network entry handoff (Brief 271 AC 7, AC 8)", () => {
  for (const { label, mode, intent } of ENTRY_HANDOFFS) {
    test(`"${label}" routes to /network/chat?mode=${mode}&intent=${intent}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/network");
      await page.getByText(label, { exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`/network/chat\\?mode=${mode}&intent=${intent}`));
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
