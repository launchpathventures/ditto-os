import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SuggestedCandidate } from "@/lib/engine";
import {
  CLIENT_LANE_UPSELL_COPY,
  ClientCardActions,
  emitDebugWorkspaceUpsell,
  introStubCopy,
  networkScoutStubCopy,
} from "./client-card-actions";
import { WORKSPACE_UPSELL_OQ1_WARN, resetWorkspaceUpsellGuardsForTest } from "./workspace-upsell";

function selectedCandidate(overrides: Partial<SuggestedCandidate> = {}): SuggestedCandidate {
  return {
    handle: "lisa-chen",
    name: "Lisa Chen",
    oneLineRole: "Outbound operator who touches CRM",
    rationaleMd: "Mira: exactly the CRM-touch outbound shape.",
    fitConfidence: "high",
    source: "on-network",
    computedAt: "2026-05-10T08:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetWorkspaceUpsellGuardsForTest();
});

describe("ClientCardActions", () => {
  it("renders the parent scout stub with network-at-large copy", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: false,
        initialNotice: "scout",
      }),
    );

    expect(networkScoutStubCopy()).toContain("scout the network at large");
    expect(html).toContain("Coming in sub-brief 258");
    expect(html).toContain("scout the network at large");
    expect(html).toContain("[ Pretend it scanned ]");
  });

  it("renders the intro stub with selected-candidate copy and debug affordance", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: false,
        initialNotice: "intro",
      }),
    );

    expect(introStubCopy("Lisa Chen")).toBe(
      "Coming in sub-brief 261 — the intro flow drops here. For now, your selection — Lisa Chen — is captured.",
    );
    expect(html).toContain("Coming in sub-brief 261");
    expect(html).toContain("your selection — Lisa Chen — is captured");
    expect(html).toContain("[ Pretend it sent ]");
  });

  it("disables the primary action with cursor-wait during candidate refresh", () => {
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: true,
      }),
    );

    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("cursor-wait");
  });

  it("fires the client OQ1 guard and renders the workspace upsell copy from the debug path", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emitted: string[] = [];

    const copy = emitDebugWorkspaceUpsell({
      mode: "client",
      sessionId: "client-session",
      onUpsell: (value) => emitted.push(value),
    });
    const html = renderToStaticMarkup(
      React.createElement(ClientCardActions, {
        selectedCandidate: selectedCandidate(),
        isRefreshInFlight: false,
        initialUpsellCopy: copy,
      }),
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(WORKSPACE_UPSELL_OQ1_WARN);
    expect(emitted).toEqual([CLIENT_LANE_UPSELL_COPY]);
    expect(html).toContain("Brief&#x27;s saved.");
    expect(html).toContain("Yes, set up workspace");
    expect(html).toContain("Not now, just my brief");
  });

  it("keeps the parent stub paths side-effect-free", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    introStubCopy("Lisa Chen");
    networkScoutStubCopy();

    expect(fetchSpy).not.toHaveBeenCalled();

    const source = readFileSync(
      "packages/web/app/network/chat/client-card-actions.tsx",
      "utf8",
    );
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("emit_intro_request");
    expect(source).not.toContain("gmail-authorized-send");
    expect(source).toContain("TODO: remove when sub-brief 261 [or 258] lands");
  });
});
