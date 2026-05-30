/**
 * Tests for GET /api/v1/network/people/[handle]/tombstone-status (Brief 284, R-Q11).
 *
 * This is the JSON probe that the middleware uses to decide whether
 * /people/[handle] should render the profile or return HTTP 410 + neutral
 * tombstone page. The endpoint must:
 *   - reveal NOTHING beyond `{ tombstoned: boolean }`
 *   - report `tombstoned: true` when the user row is soft-deleted
 *   - report `tombstoned: true` when `isSubjectTombstoned()` says so
 *   - report `tombstoned: false` (not 404) for unknown handles, so the
 *     middleware falls through to the normal page (which can then claim).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  isSubjectTombstoned: vi.fn(),
}));

vi.mock("../../../../../../../../../src/db/network-db", () => ({
  networkDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mocks.select(),
        }),
      }),
    }),
  },
}));

vi.mock("../../../../../../../../../src/engine/network-tombstones", () => ({
  isSubjectTombstoned: mocks.isSubjectTombstoned,
}));

import { GET } from "./route";

function ctx(handle: string) {
  // The route's dynamic segment is named [id] (Next.js requires consistency
  // with sibling routes), but it's still resolved against the handle column.
  return { params: Promise.resolve({ id: handle }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSubjectTombstoned.mockResolvedValue(false);
});

describe("GET /api/v1/network/people/[id]/tombstone-status", () => {
  it("returns tombstoned=false (200) for an unknown handle without leaking", async () => {
    mocks.select.mockResolvedValueOnce([]);
    const response = await GET(
      new Request("http://localhost/api/v1/network/people/ghost/tombstone-status"),
      ctx("ghost"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ tombstoned: false, handle: "ghost" });
  });

  it("returns tombstoned=true when the user row is soft-deleted", async () => {
    mocks.select.mockResolvedValueOnce([{ id: "u-1", status: "deleted" }]);
    const response = await GET(
      new Request(
        "http://localhost/api/v1/network/people/jane/tombstone-status",
      ),
      ctx("jane"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tombstoned: true, handle: "jane" });
    expect(mocks.isSubjectTombstoned).not.toHaveBeenCalled();
  });

  it("returns tombstoned=true when isSubjectTombstoned says so", async () => {
    mocks.select.mockResolvedValueOnce([{ id: "u-1", status: "active" }]);
    mocks.isSubjectTombstoned.mockResolvedValueOnce(true);
    const response = await GET(
      new Request(
        "http://localhost/api/v1/network/people/jane/tombstone-status",
      ),
      ctx("jane"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ tombstoned: true, handle: "jane" });
    expect(mocks.isSubjectTombstoned).toHaveBeenCalledWith(
      "public-profile",
      "u-1",
    );
  });

  it("returns tombstoned=false for an active, non-tombstoned profile", async () => {
    mocks.select.mockResolvedValueOnce([{ id: "u-1", status: "active" }]);
    mocks.isSubjectTombstoned.mockResolvedValueOnce(false);
    const response = await GET(
      new Request(
        "http://localhost/api/v1/network/people/jane/tombstone-status",
      ),
      ctx("jane"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tombstoned: false,
      handle: "jane",
    });
  });

  it("normalizes the handle to lowercase before look-up", async () => {
    mocks.select.mockResolvedValueOnce([{ id: "u-1", status: "active" }]);
    mocks.isSubjectTombstoned.mockResolvedValueOnce(false);
    const response = await GET(
      new Request(
        "http://localhost/api/v1/network/people/JANE/tombstone-status",
      ),
      ctx("JANE"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      tombstoned: false,
      handle: "jane",
    });
  });

  it("never leaks a prior name or other content on a tombstoned row", async () => {
    mocks.select.mockResolvedValueOnce([
      { id: "u-1", status: "deleted", name: "Jane Doe" },
    ]);
    const response = await GET(
      new Request(
        "http://localhost/api/v1/network/people/jane/tombstone-status",
      ),
      ctx("jane"),
    );
    const body = await response.json();
    expect(body).toEqual({ tombstoned: true, handle: "jane" });
    expect("name" in body).toBe(false);
  });
});
