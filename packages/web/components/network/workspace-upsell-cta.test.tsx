import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceUpsellCta, requestWorkspaceProvision } from "./workspace-upsell-cta";

describe("WorkspaceUpsellCta", () => {
  it("renders verbatim upsell copy and the locked action labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkspaceUpsellCta, {
        copy: "Worth it if you do this kind of hunting more than twice a year.",
        declineLabel: "Not now, just my card",
        sessionId: "expert-session",
        context: "expert",
      }),
    );

    expect(html).toContain("Worth it if you do this kind of hunting more than twice a year.");
    expect(html).toContain("Yes, set up workspace");
    expect(html).toContain("Not now, just my card");
  });

  it("posts a self-service provision request with lane session context", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, workspaceUrl: "https://workspace.example" }),
    });

    await requestWorkspaceProvision({
      fetchImpl,
      sessionId: "expert-session",
      context: "expert",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/v1/network/workspace-provision",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ sessionId: "expert-session", context: "expert" }),
      }),
    );
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("stepRunId");
  });

  it("throws without reporting success when the provision route rejects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "network_lane_session_required" }),
    });

    await expect(
      requestWorkspaceProvision({
        fetchImpl,
        sessionId: "missing-session",
        context: "client",
      }),
    ).rejects.toThrow("network_lane_session_required");
  });
});
