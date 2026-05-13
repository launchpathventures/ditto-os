import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NetworkProfileCardBlock } from "@/lib/engine";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock("../../../../../src/db/network-db", () => ({
  networkDb: { select: mocks.select },
}));

const { default: Image } = await import("./opengraph-image");

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
});

describe("/people/:handle/opengraph-image", () => {
  it("returns a PNG fallback at HTTP-success semantics when the handle is unknown", async () => {
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    const response = await Image({ params: Promise.resolve({ handle: "missing-person" }) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("returns a PNG for an existing handle", async () => {
    mocks.select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: "user-1", card: card() }]),
        }),
      }),
    });

    const response = await Image({ params: Promise.resolve({ handle: "timhgreen" }) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
