/**
 * Brief 290 — Share Studio multi-channel smoke.
 *
 * Walks the expert lane to the owner-card render, opens the Studio
 * (`shareMode="studio"`), and exercises each channel tab. The Network
 * API is mocked at the route boundary; Network DB is not required.
 *
 * NOTE: the brief's smoke block names `e2e/network/share-studio.spec.ts`,
 * but the project's Playwright `testDir` is `packages/web/e2e` and the
 * convention is flat `network-*.spec.ts`. Placed here to match the
 * runnable convention — reference-doc drift flagged in handoff.
 */

import { test, expect } from "./fixtures";

const EXPERT_ANSWERS = [
  "Untangling RevOps handoffs for founder-led B2B teams.",
  "Teams that want a slide deck instead of a working pipeline.",
  "A founder past first revenue with a messy sales motion.",
  "Positioning, introductions, follow-through.",
  "The operator who makes the sales motion finally click.",
  "Yes, I'm open for new work right now.",
];

function variantsFor(channel: string) {
  if (channel === "x") {
    return {
      quiet: "Tim untangles RevOps for founder-led teams. https://ditto.partners/people/timhgreen",
      loud: "Founders with a messy sales motion should meet Tim. https://ditto.partners/people/timhgreen",
      ask: "Who needs a RevOps operator? https://ditto.partners/people/timhgreen",
    };
  }
  return {
    quiet: `quiet ${channel} https://ditto.partners/people/timhgreen`,
    loud: `loud ${channel} https://ditto.partners/people/timhgreen`,
    ask: `ask ${channel} https://ditto.partners/people/timhgreen`,
  };
}

test.describe("Brief 290 — Share Studio", () => {
  test("multi-channel authoring loop with no autopost", async ({ page }) => {
    const shareChannels: string[] = [];
    const offsiteRequests: string[] = [];

    await page.addInitScript(() => {
      // Deterministic clipboard so Copy buttons resolve without a
      // permission prompt in headless Chromium.
      (window as unknown as { __copied: string[] }).__copied = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: (text: string) => {
            (window as unknown as { __copied: string[] }).__copied.push(text);
            return Promise.resolve();
          },
        },
      });
    });

    await page.route("**/api/v1/network/chat/lane", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sessionId: "expert-e2e" }) }),
    );

    await page.route("**/api/v1/network/handle", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, handle: "timhgreen" }),
      }),
    );

    await page.route("**/api/v1/network/people/*/share", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as { channel?: string };
      const channel = body.channel ?? "linkedin";
      shareChannels.push(channel);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(variantsFor(channel)),
      });
    });

    await page.route("**/api/v1/network/people/*/story-card-png", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "content-disposition": 'attachment; filename="ditto-story-timhgreen.png"' },
        body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    );

    // Any navigation to a third-party post endpoint would be an autopost
    // violation (AC 7). Studio uses window.open, never fetch — record.
    page.on("request", (req) => {
      const url = req.url();
      if (/linkedin\.com|twitter\.com|x\.com/.test(url)) offsiteRequests.push(url);
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/network/chat?mode=expert");

    const composer = page.getByPlaceholder("Answer the card prompt...");
    await expect(composer).toBeVisible();

    for (const answer of EXPERT_ANSWERS) {
      await composer.fill(answer);
      await page.getByRole("button", { name: "Send" }).click();
    }

    // Owner card now renders with the Studio share entry point.
    const shareButton = page.getByRole("button", { name: /Share .*card/ });
    await expect(shareButton).toBeVisible();
    await shareButton.click();

    const studio = page.getByTestId("network-share-studio");
    await expect(studio).toBeVisible();
    await expect(studio.getByRole("tab", { name: "LinkedIn" })).toBeVisible();

    // Active-channel-first: exactly one POST, for LinkedIn.
    await expect.poll(() => shareChannels).toEqual(["linkedin"]);

    // X tab → lazy POST, variant ≤280 incl. URL.
    await studio.getByRole("tab", { name: "X" }).click();
    await expect.poll(() => shareChannels).toContain("x");
    const xDraft = studio.getByRole("textbox");
    await expect(xDraft).toBeVisible();
    expect(((await xDraft.inputValue()) ?? "").length).toBeLessThanOrEqual(280);

    // Instagram tab → lazy POST, download points at the story PNG route.
    await studio.getByRole("tab", { name: "Instagram" }).click();
    await expect.poll(() => shareChannels).toContain("instagram");
    const download = studio.getByRole("link", { name: /Download story card/ });
    await expect(download).toHaveAttribute("href", /story-card-png$/);

    // Email signature tab → plain-text copy.
    await studio.getByRole("tab", { name: "Email signature" }).click();
    await expect.poll(() => shareChannels).toContain("email-signature");
    await studio.getByRole("button", { name: /Copy plain text/ }).click();

    // Website badge → static snippet, no POST.
    await studio.getByRole("tab", { name: "Website badge" }).click();
    const badge = studio.getByTestId("website-badge-snippet");
    await expect(badge).toBeVisible();
    await badge.getByRole("button", { name: /Copy snippet/ }).click();
    expect(shareChannels).not.toContain("website-badge");

    // Back to LinkedIn → cached, no second POST.
    await studio.getByRole("tab", { name: "LinkedIn" }).click();
    await expect.poll(() => shareChannels.filter((c) => c === "linkedin").length).toBe(1);

    // No autopost: nothing ever fetched a third-party post endpoint.
    expect(offsiteRequests).toEqual([]);

    const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
    expect(copied.some((t) => t.includes("<a href="))).toBe(true);
  });
});
