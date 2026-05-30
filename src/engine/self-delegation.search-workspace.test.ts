/**
 * Brief 281 — search_workspace registration + dispatch.
 *
 * Asserts the Self tool contract the model sees (all six filters, no
 * required fields so recall can also just "browse") and that
 * executeDelegation routes "search_workspace" to the handler with the
 * input mapped through unchanged. The handler itself is mocked so this
 * stays a pure registration/dispatch test (no DB).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  handleSearchWorkspace: vi.fn(),
}));

vi.mock("./self-tools/search-workspace", () => ({
  handleSearchWorkspace: mocks.handleSearchWorkspace,
}));

const { selfTools, executeDelegation } = await import("./self-delegation");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handleSearchWorkspace.mockResolvedValue({
    toolName: "search_workspace",
    success: true,
    output: "ok",
  });
});

describe("search_workspace tool registration (Brief 281 AC4)", () => {
  const def = selfTools.find((t) => t.name === "search_workspace");

  it("is registered with the six recall filters and is browse-friendly", () => {
    expect(def).toBeDefined();
    const props = def!.input_schema.properties as Record<string, unknown>;
    for (const f of [
      "query",
      "kinds",
      "projectSlug",
      "status",
      "includeArchived",
      "limit",
    ]) {
      expect(props[f]).toBeDefined();
    }
    // No required fields — recall must also work as a plain "show me…".
    expect(def!.input_schema.required).toEqual([]);
  });

  it("constrains kinds to the recall taxonomy", () => {
    const kinds = (def!.input_schema.properties as Record<string, any>).kinds;
    expect(kinds.items.enum).toEqual([
      "project",
      "process",
      "memory",
      "work",
      "review",
      "activity",
    ]);
  });
});

describe("executeDelegation dispatch (Brief 281 AC5)", () => {
  it("routes search_workspace to the in-process handler with mapped input", async () => {
    await executeDelegation("search_workspace", {
      query: "q3",
      kinds: ["memory", "project"],
      projectSlug: "acme",
      status: "active",
      includeArchived: true,
      limit: 12,
    });
    expect(mocks.handleSearchWorkspace).toHaveBeenCalledWith({
      query: "q3",
      kinds: ["memory", "project"],
      projectSlug: "acme",
      status: "active",
      includeArchived: true,
      limit: 12,
    });
  });
});
