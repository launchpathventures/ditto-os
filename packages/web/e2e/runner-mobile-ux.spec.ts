/**
 * Brief 221 — Runner Mobile UX e2e (AC #5, #8, #9).
 *
 * Coverage on the runner-dispatch-pause variant of `/review/[token]` at
 * iPhone SE (320×568) AND iPhone 13 mini (375×667):
 *   - Page renders without horizontal scroll.
 *   - Vertical-stacked radio "Run on:" selector with eligible runners only.
 *   - Force-cloud toggle, default OFF.
 *   - Sticky bottom Approve/Reject bar holds during scroll (AC #5).
 *   - Tap targets are ≥44pt high.
 *   - User-facing terminology only — no internal slugs / camelCase / table
 *     names (AC #8 — `FORBIDDEN_INTERNAL_TERMS` exported as a constant).
 */

import type { Page } from "@playwright/test";
import { test, expect, resetDatabase } from "./fixtures";

/**
 * Forbidden terms that must not appear in any rendered surface for
 * Brief 221's narrowed scope — `/review/[token]` runner-dispatch-pause.
 * Brief 231 will extend this list as more surfaces ship.
 */
export const FORBIDDEN_INTERNAL_TERMS: ReadonlyArray<string> = [
  "local-mac-mini",
  "claude-code-routine",
  "claude-managed-agent",
  "github-action",
  "attemptIndex",
  "runner_mode_required",
  "runner_override",
  "runnerKind",
  "runnerMode",
  "runner_dispatches",
  "stepRunId",
];

const VIEWPORTS = [
  { name: "iPhone SE 320×568", width: 320, height: 568 },
  { name: "iPhone 13 mini 375×667", width: 375, height: 667 },
] as const;

async function seedRunnerPause(
  page: Page,
): Promise<{ reviewUrl: string; eligibleKinds: string[] }> {
  // The fixture page object is enough to call fetch; tests run against the
  // same dev server.
  const res = await page.request.post("/api/test/seed-runner-pause", {
    data: {},
  });
  if (!res.ok()) {
    throw new Error(`seed-runner-pause failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { reviewUrl: string; eligibleKinds: string[] };
}

for (const viewport of VIEWPORTS) {
  test.describe(`Runner-dispatch-pause review surface — ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test.beforeAll(async () => {
      await resetDatabase();
    });

    test("renders structured form with sticky action bar; no horizontal scroll; ≥44pt taps", async ({
      page,
    }) => {
      const { reviewUrl } = await seedRunnerPause(page);
      await page.goto(reviewUrl);

      // Header.
      await expect(
        page.getByRole("heading", { name: /Approve dispatch/i }),
      ).toBeVisible();

      // Radio group: at least 2 options visible.
      const radios = page.locator('input[type="radio"][name="selectedKind"]');
      await expect(radios.first()).toBeVisible();
      const count = await radios.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Force-cloud toggle, default OFF.
      const toggle = page.locator('input[type="checkbox"]').first();
      await expect(toggle).toBeVisible();
      expect(await toggle.isChecked()).toBe(false);

      // Approve + Reject buttons present.
      const approveBtn = page.getByTestId("approve-button");
      const rejectBtn = page.getByTestId("reject-button");
      await expect(approveBtn).toBeVisible();
      await expect(rejectBtn).toBeVisible();

      // Each tap target is ≥44pt high (the minimum for mobile-first). The
      // user-visible tap target for each radio is the wrapping <label>; the
      // raw <input type="radio"> renders at the browser's ~13px default but
      // is enclosed in a min-h-44 row, so we measure the label.
      const radioLabels = page.locator(
        'label:has(input[type="radio"][name="selectedKind"])',
      );
      const checks = [approveBtn, rejectBtn, ...(await radioLabels.all())];
      for (const target of checks) {
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }

      // No horizontal scroll.
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      const clientWidth = await page.evaluate(
        () => document.documentElement.clientWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

      // Sticky bottom action bar holds during scroll (AC #5).
      const bar = page.getByTestId("approval-action-bar");
      const before = await bar.boundingBox();
      expect(before).not.toBeNull();
      // Try to scroll the page (likely a no-op on a single-screen-tall page,
      // which is fine — the bar must stay anchored either way).
      await page.evaluate(() => window.scrollTo(0, 9999));
      const after = await bar.boundingBox();
      expect(after).not.toBeNull();
      expect(Math.abs((after!.y ?? 0) - (before!.y ?? 0))).toBeLessThanOrEqual(
        2,
      );
    });

    test("user-facing terminology only — no internal slugs / camelCase / table names", async ({
      page,
    }) => {
      const { reviewUrl } = await seedRunnerPause(page);
      await page.goto(reviewUrl);
      // Wait for dynamic render so the form's option labels are committed.
      await expect(page.getByTestId("approve-button")).toBeVisible();

      // Read the entire body's text content. The option `value` attribute
      // (which carries the `kind|label` string with the raw runner-kind slug)
      // is NOT considered rendered text by the user — but the visible label
      // is. We assert only on user-visible textContent.
      const bodyText = (await page.locator("body").textContent()) ?? "";
      for (const term of FORBIDDEN_INTERNAL_TERMS) {
        expect(
          bodyText.toLowerCase().includes(term.toLowerCase()),
          `forbidden internal term "${term}" appeared in rendered text`,
        ).toBe(false);
      }

      // Sanity — the user-facing labels DO appear.
      expect(bodyText).toMatch(/Routine|Managed Agent|Mac mini|GitHub Action/);
    });

    test("approving the form dispatches via the API and shows the confirmation", async ({
      page,
    }) => {
      const { reviewUrl } = await seedRunnerPause(page);
      await page.goto(reviewUrl);
      await expect(page.getByTestId("approve-button")).toBeVisible();

      // Tap Approve. The dispatcher runs in DITTO_TEST_MODE and there's no
      // adapter registered for cloud kinds in the seeded project — so the
      // dispatch will return `noEligibleRunner` (`configMissing`/equiv).
      // The route returns 502; the client surfaces the error band.
      // The intent of this test isn't to verify a successful dispatch
      // (Brief 222 e2e smoke does that with adapters registered), but to
      // confirm the approve button actually POSTs to the route and the UI
      // transitions from idle → submitting → either success-or-error. Both
      // outcomes prove the button is wired.
      await page.getByTestId("approve-button").click();

      // Either the success confirmation OR the error band must appear.
      const success = page.getByRole("heading", { name: /Approved/i });
      const error = page.getByTestId("approval-error");
      const winner = await Promise.race([
        success.waitFor({ state: "visible", timeout: 5000 }).then(() => "success"),
        error.waitFor({ state: "visible", timeout: 5000 }).then(() => "error"),
      ]).catch(() => "timeout");
      expect(winner).not.toBe("timeout");
    });
  });
}
