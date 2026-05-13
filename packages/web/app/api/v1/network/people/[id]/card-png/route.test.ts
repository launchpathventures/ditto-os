import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkProfileCardBlock } from "@/lib/engine";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("../../../../../../../../../src/db/network-db", () => ({
  isNetworkDbConnectionError: () => false,
  networkDb: { select: mocks.select },
}));

const { GET } = await import("./route");

function card(): NetworkProfileCardBlock {
  return {
    type: "network-profile-card",
    handle: "timhgreen",
    name: "Tim Green",
    portraitUrl: null,
    cityLabel: "Auckland",
    oneLineRole: "RevOps operator",
    signalDots: [{ id: "value", label: "Value", filled: true, color: "canary" }],
    badges: [],
    narrativeMd: "I *untangle* sales motion.",
    antiPersonaMd: null,
    greeterCuratedBy: "alex",
    lastUpdatedAt: "2026-05-13T00:00:00.000Z",
    visibility: "public",
    shareUrl: "https://ditto.partners/people/timhgreen",
    ogImageUrl: "https://ditto.partners/people/timhgreen/opengraph-image",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ id: "user-1", card: card() }]),
      }),
    }),
  });
});

describe("GET /api/v1/network/people/:id/card-png", () => {
  it("returns a downloadable PNG image", async () => {
    const response = await GET(
      new Request("http://localhost/api/v1/network/people/timhgreen/card-png"),
      { params: Promise.resolve({ id: "timhgreen" }) },
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="ditto-card-timhgreen.png"');
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
