import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  CLIENT_LANE_UPSELL_COPY,
  EXPERT_LANE_UPSELL_COPY,
  WORKSPACE_UPSELL_OQ1_WARN,
  emitWorkspaceUpsell,
  resetWorkspaceUpsellGuardsForTest,
} from "./workspace-upsell";

afterEach(() => {
  vi.restoreAllMocks();
  resetWorkspaceUpsellGuardsForTest();
});

describe("workspace upsell", () => {
  it("emits the client OQ1 warning exactly once per session", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(emitWorkspaceUpsell("client", { sessionId: "session-a" })).toBe(CLIENT_LANE_UPSELL_COPY);
    expect(emitWorkspaceUpsell("client", { sessionId: "session-a" })).toBe(CLIENT_LANE_UPSELL_COPY);
    expect(emitWorkspaceUpsell("client", { sessionId: "session-b" })).toBe(CLIENT_LANE_UPSELL_COPY);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenNthCalledWith(1, WORKSPACE_UPSELL_OQ1_WARN);
    expect(warn).toHaveBeenNthCalledWith(2, WORKSPACE_UPSELL_OQ1_WARN);
  });

  it("does not emit the OQ1 warning for expert mode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(emitWorkspaceUpsell("expert", { sessionId: "session-a", handle: "lisa-chen" }))
      .toBe(EXPERT_LANE_UPSELL_COPY.replace("{handle}", "lisa-chen"));

    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps the lane-specific copy locked to parent brief 254", () => {
    const source = readFileSync(
      "docs/briefs/254-network-two-sided-conversational-front-door.md",
      "utf8",
    );

    expect(source).toContain("Brief's saved. I'll keep it open and let you know if anyone good comes through.");
    expect(source).toContain(
      "One more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**",
    );
    expect(CLIENT_LANE_UPSELL_COPY).toContain("Brief's saved.");
    expect(CLIENT_LANE_UPSELL_COPY).not.toContain("ditto.partners/people/{handle}");
    const moduleSource = readFileSync(
      "packages/web/app/network/chat/workspace-upsell.ts",
      "utf8",
    );
    expect(moduleSource).toContain(
      "// TODO(post-261): remove OQ1 guard when sub-brief 261 wires live upsell trigger",
    );
  });
});
