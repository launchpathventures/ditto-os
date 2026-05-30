/**
 * Brief 272 — Member Signal onboarding smoke (AC #21).
 *
 * Walks /network/signal end-to-end with the Network API mocked at the
 * route boundary: source intake → research → draft → approve a public
 * claim. Network DB is not required so the spec is portable.
 */

import { test, expect } from "./fixtures";

const SIGNAL_ID = "signal-e2e";

function laneResponse(): { sessionId: string } {
  return { sessionId: "expert-e2e-session" };
}

function researchResponse() {
  return {
    memberSignal: {
      id: SIGNAL_ID,
      status: "review",
      sourceSummary: "1 source found; 0 limited sources.",
      calibrationQuestions: [
        "What do people usually come to you for?",
        "What kind of work do you want more of?",
      ],
    },
    sources: [
      {
        id: "source-paste",
        sourceType: "pasted_text",
        sourceLabel: "Bio paste",
        sourceUrl: null,
        status: "found",
        accessNote: null,
        evidenceSnippet: "I untangle RevOps for founder-led B2B teams.",
        confidence: "medium",
      },
    ],
    webEnrichment: { status: "unconfigured" },
  };
}

function draftResponse() {
  return {
    memberSignal: { id: SIGNAL_ID, status: "review" },
    claims: [
      {
        id: "claim-knownFor",
        memberSignalId: SIGNAL_ID,
        section: "knownFor",
        claimText: "Untangles RevOps handoffs for founder-led B2B teams.",
        sourceType: "pasted_text",
        sourceLabel: "Bio paste",
        sourceUrl: null,
        evidenceSnippet: "I untangle RevOps for founder-led B2B teams.",
        confidence: "medium",
        visibility: "on-request",
        approvalState: "suggested",
      },
      {
        id: "claim-openTo",
        memberSignalId: SIGNAL_ID,
        section: "openTo",
        claimText: "Needs review: what kind of work do you want more of?",
        sourceType: "pasted_text",
        sourceLabel: "Bio paste",
        sourceUrl: null,
        evidenceSnippet: "I untangle RevOps for founder-led B2B teams.",
        confidence: "low",
        visibility: "on-request",
        approvalState: "suggested",
      },
    ],
  };
}

function approvedClaim() {
  return {
    claim: {
      id: "claim-knownFor",
      memberSignalId: SIGNAL_ID,
      section: "knownFor",
      claimText: "Untangles RevOps handoffs for founder-led B2B teams.",
      sourceType: "pasted_text",
      sourceLabel: "Bio paste",
      sourceUrl: null,
      evidenceSnippet: "I untangle RevOps for founder-led B2B teams.",
      confidence: "medium",
      visibility: "public",
      approvalState: "approved",
    },
  };
}

test.describe("Brief 272 — Member Signal onboarding smoke", () => {
  test("source intake → research → draft → approve a public claim", async ({ page }) => {
    const callLog: Array<{ action: string; hadStepRunId: boolean }> = [];

    await page.route("**/api/v1/network/chat/lane", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(laneResponse()),
      });
    });

    await page.route("**/api/v1/network/signal", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      callLog.push({
        action: String(body.action ?? ""),
        hadStepRunId: Object.prototype.hasOwnProperty.call(body, "stepRunId"),
      });
      if (body.action === "research") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(researchResponse()),
        });
        return;
      }
      if (body.action === "draft") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(draftResponse()),
        });
        return;
      }
      if (body.action === "update_claim") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(approvedClaim()),
        });
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "unsupported_action" }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/network/signal");

    await expect(
      page.getByRole("heading", {
        name: /Turn your public signal into a reviewed Member Signal\./,
      }),
    ).toBeVisible();

    const intake = page.getByTestId("member-signal-source-intake");
    await expect(intake).toBeVisible();

    await intake.getByPlaceholder(/Paste a bio/).fill(
      "I untangle RevOps for founder-led B2B teams.",
    );

    await intake.getByRole("button", { name: /Research my signal/ }).click();

    await expect(
      page.getByText(/Sources saved\. Web enrichment is unavailable/),
    ).toBeVisible();
    await expect(page.getByText("Bio paste")).toBeVisible();

    await page.getByRole("button", { name: /Draft signal/ }).click();

    const review = page.getByTestId("member-signal-review");
    await expect(review).toBeVisible();
    await expect(review.getByText("Known for")).toBeVisible();
    await expect(review.getByText(/Needs approval/).first()).toBeVisible();

    const knownForCard = review.locator("article").first();
    await knownForCard
      .getByRole("combobox", { name: /Visibility for Known for/ })
      .selectOption("public");
    await knownForCard.getByRole("button", { name: /^Approve$/ }).click();

    await expect(knownForCard.getByText(/approved/i)).toBeVisible();

    expect(callLog.filter((entry) => entry.hadStepRunId)).toHaveLength(0);
    expect(callLog.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["research", "draft", "update_claim", "update_claim"]),
    );
  });
});
