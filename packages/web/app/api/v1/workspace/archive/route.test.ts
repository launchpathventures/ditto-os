/**
 * Brief 281 — /api/v1/workspace/archive route tests.
 *
 * The route is a thin auth + query-parse adapter over the shared
 * `recallWorkspace()` helper. These tests assert: workspace-session auth
 * (dev bypass, missing cookie, wrong email, valid), query-param parsing
 * (repeated + comma-joined kinds, invalid kinds dropped, includeArchived,
 * limit), and that it never mutates — only GET is exported.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recallWorkspace: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));

vi.mock("../../../../../../../src/engine/workspace-recall", () => ({
  recallWorkspace: mocks.recallWorkspace,
  ALL_RECALL_KINDS: [
    "project",
    "process",
    "memory",
    "work",
    "review",
    "activity",
  ],
}));

const routeMod = await import("./route");
const { GET } = routeMod;

const EMPTY = {
  results: [],
  counts: {
    project: 0,
    process: 0,
    memory: 0,
    work: 0,
    review: 0,
    activity: 0,
  },
  truncated: false,
  query: null,
  kinds: [],
};

const ORIG_OWNER = process.env.WORKSPACE_OWNER_EMAIL;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recallWorkspace.mockResolvedValue(EMPTY);
  mocks.cookieGet.mockReturnValue(undefined);
  delete process.env.WORKSPACE_OWNER_EMAIL;
});

afterEach(() => {
  if (ORIG_OWNER === undefined) delete process.env.WORKSPACE_OWNER_EMAIL;
  else process.env.WORKSPACE_OWNER_EMAIL = ORIG_OWNER;
});

function req(qs = "") {
  return new Request(`http://localhost/api/v1/workspace/archive${qs}`);
}

describe("GET /api/v1/workspace/archive — auth", () => {
  it("allows access in local dev when WORKSPACE_OWNER_EMAIL is unset", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mocks.recallWorkspace).toHaveBeenCalledTimes(1);
  });

  it("401s in production when the session cookie is missing", async () => {
    process.env.WORKSPACE_OWNER_EMAIL = "owner@example.com";
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mocks.recallWorkspace).not.toHaveBeenCalled();
  });

  it("401s when the cookie email does not match the owner", async () => {
    process.env.WORKSPACE_OWNER_EMAIL = "owner@example.com";
    mocks.cookieGet.mockReturnValue({ value: "intruder@example.com|sig" });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mocks.recallWorkspace).not.toHaveBeenCalled();
  });

  it("allows the matching owner (case-insensitive)", async () => {
    process.env.WORKSPACE_OWNER_EMAIL = "Owner@Example.com";
    mocks.cookieGet.mockReturnValue({ value: "owner@example.com|sig" });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mocks.recallWorkspace).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/v1/workspace/archive — query parsing", () => {
  it("parses repeated and comma-joined kinds, dropping invalid ones", async () => {
    await GET(req("?kinds=project&kinds=memory,bogus&query=q3&limit=5"));
    expect(mocks.recallWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: ["project", "memory"],
        query: "q3",
        limit: 5,
      }),
    );
  });

  it("passes includeArchived only when explicitly 'true'", async () => {
    await GET(req("?includeArchived=true"));
    expect(mocks.recallWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: true }),
    );
    await GET(req("?includeArchived=1"));
    expect(mocks.recallWorkspace).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeArchived: false }),
    );
  });

  it("omits kinds when none are valid", async () => {
    await GET(req("?kinds=nope"));
    expect(mocks.recallWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ kinds: undefined }),
    );
  });

  it("returns the helper payload unchanged", async () => {
    mocks.recallWorkspace.mockResolvedValue({
      ...EMPTY,
      results: [{ kind: "project", id: "p1", title: "Acme", route: "/projects/acme" }],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].route).toBe("/projects/acme");
  });

  it("exposes no mutating handlers (read-only route)", () => {
    expect("POST" in routeMod).toBe(false);
    expect("PUT" in routeMod).toBe(false);
    expect("DELETE" in routeMod).toBe(false);
    expect("PATCH" in routeMod).toBe(false);
  });
});
