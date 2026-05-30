import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  actionLogDetail,
  NetworkHealthDashboard,
  type NetworkHealthDashboardData,
} from "./network-health-dashboard";

function dashboardData(
  partial: Partial<NetworkHealthDashboardData> = {},
): NetworkHealthDashboardData {
  return {
    generatedAt: "2026-05-19T11:00:00.000Z",
    actionRequired: { total: 0, items: [] },
    health: [
      {
        id: "source-research",
        title: "Source research",
        status: "green",
        count: 0,
        detail: "0 failed jobs · 0 policy blocks",
      },
      {
        id: "leakage-tests",
        title: "Private-leakage tests",
        status: "green",
        count: 0,
        detail: "No leakage failures in the latest audit window",
      },
    ],
    metrics: [
      {
        id: "economic-outcomes",
        label: "Economic outcomes",
        value: 3,
        detail: "Display-only signal for later pricing work",
        displayOnly: true,
      },
      {
        id: "willingness-to-pay",
        label: "Willingness to pay",
        value: "display-only",
        detail: "No commercial collection controls are present in this dashboard",
        displayOnly: true,
      },
    ],
    auditRows: [],
    suppressionRows: [],
    allClear: true,
    ...partial,
  };
}

describe("NetworkHealthDashboard", () => {
  it("renders the deliberately calm all-clear state", () => {
    const html = renderToStaticMarkup(
      <NetworkHealthDashboard token="admin-token" initialData={dashboardData()} />,
    );
    expect(html).toContain("No items need your decision");
    expect(html).toContain("Private-leakage tests");
  });

  it("does not show discovery controls as active before pause state is known", () => {
    const html = renderToStaticMarkup(
      <NetworkHealthDashboard token="admin-token" initialData={dashboardData()} />,
    );
    expect(html).toContain("Status:");
    expect(html).toContain("checking");
    expect(html).not.toContain("<strong>active</strong>");
  });

  it("does not expose raw private text or anti-persona text in the default audit drill", () => {
    const html = renderToStaticMarkup(
      <NetworkHealthDashboard
        token="admin-token"
        initialData={dashboardData({
          allClear: false,
          actionRequired: {
            total: 1,
            items: [
              {
                id: "audit-1",
                kind: "operator_suppressed",
                title: "Source policy block",
                detail: "claim_invite · cand-1",
                reasonCode: "source_policy_block",
                subjectType: "claim_invite",
                subjectId: "cand-1",
                createdAt: "2026-05-19T11:00:00.000Z",
                revealable: true,
              },
            ],
          },
          auditRows: [
            {
              id: "audit-1",
              eventClass: "operator_suppressed",
              subjectType: "claim_invite",
              subjectId: "cand-1",
              actorType: "admin",
              actorId: "admin-1",
              reasonCode: "source_policy_block",
              metadata: {
                sealedRawText: "[sealed]",
                antiPersonaMd: "[sealed]",
                provenanceLabel: "member signal",
              },
              createdAt: "2026-05-19T11:00:00.000Z",
              revealable: true,
            },
          ],
        })}
      />,
    );
    expect(html).toContain("Reveal raw text (audited)");
    expect(html).toContain("Reveal reason");
    expect(html).toContain("Complaint investigation");
    expect(html).toContain("Operator inbox");
    expect(html).toContain("Audit review");
    expect(html).toContain("Event class");
    expect(html).toContain("Actor");
    expect(html).toContain("member signal");
    expect(html).not.toContain("Decision reason");
    expect(html).not.toContain("Candidate ID");
    expect(html).not.toContain("Never introduce me");
    expect(html).not.toContain("acquisition budget");
  });

  it("renders row-owned decisions only for active claim-invite rows", () => {
    const html = renderToStaticMarkup(
      <NetworkHealthDashboard
        token="admin-token"
        initialData={dashboardData({
          allClear: false,
          actionRequired: {
            total: 1,
            items: [
              {
                id: "candidate-1",
                kind: "claim_invite_pending",
                title: "Claim invite needs review",
                detail: "claim_invite - candidate-1",
                reasonCode: null,
                subjectType: "claim_invite",
                subjectId: "candidate-1",
                createdAt: "2026-05-19T11:00:00.000Z",
                revealable: false,
                decision: {
                  kind: "claim_invite_candidate",
                  candidateId: "candidate-1",
                },
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain("Decision reason");
    expect(html).toContain("Operator reviewed");
    expect(html).toContain("Approve");
    expect(html).toContain("Suppress");
    expect(html).not.toContain("Candidate ID");
  });

  it("requires explicit decision metadata before rendering claim-invite actions", () => {
    const html = renderToStaticMarkup(
      <NetworkHealthDashboard
        token="admin-token"
        initialData={dashboardData({
          allClear: false,
          actionRequired: {
            total: 1,
            items: [
              {
                id: "candidate-audit-1",
                kind: "claim_invite_pending_review",
                title: "Claim invite review audit",
                detail: "claim_invite - candidate-1",
                reasonCode: null,
                subjectType: "claim_invite",
                subjectId: "candidate-1",
                createdAt: "2026-05-19T11:00:00.000Z",
                revealable: false,
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain("Audit review");
    expect(html).not.toContain("Decision reason");
  });

  it("never copies revealed raw text into action log details", () => {
    const detail = actionLogDetail(
      "/api/v1/network/admin/superconnector/reveal",
      true,
      200,
      {
        revealed: {
          auditEventId: "audit-1",
          rawText: "Private member email text",
          annotation: "Revealed — this view is audited",
        },
      },
    );

    expect(detail).toBe("raw text revealed (audit audit-1)");
    expect(detail).not.toContain("Private member email text");
  });

  it("summarizes nested dry-run audit ids without copying payloads", () => {
    const detail = actionLogDetail(
      "/api/v1/network/admin/superconnector/dry-run",
      true,
      200,
      {
        result: {
          auditEventId: "dry-run-audit-1",
          watchId: "watch-1",
          banner: "DRY RUN — no contact",
        },
      },
    );

    expect(detail).toBe("dry-run complete (audit dry-run-audit-1)");
    expect(detail).not.toContain("watch-1");
  });

  it("renders economic and willingness-to-pay metrics as display-only signals", () => {
    const html = renderToStaticMarkup(
      <NetworkHealthDashboard token="admin-token" initialData={dashboardData()} />,
    );
    expect(html).toContain("Economic outcomes");
    expect(html).toContain("Willingness to pay");
    expect(html).toContain("display-only");
    expect(html).toContain("Provenance: aggregate network-health read model");
    expect(html).not.toMatch(/checkout|card number|subscribe|invoice/i);
  });
});
