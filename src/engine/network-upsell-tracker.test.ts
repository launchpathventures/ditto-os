import { beforeEach, describe, expect, it } from "vitest";
import {
  hasFiredUpsell,
  recordUpsellFired,
  resetNetworkUpsellTrackerForTests,
} from "./network-upsell-tracker";

beforeEach(() => {
  resetNetworkUpsellTrackerForTests();
});

describe("network upsell tracker", () => {
  it("returns false before an upsell is recorded", () => {
    expect(hasFiredUpsell("user-1", "session-1", "expert")).toBe(false);
  });

  it("returns true after the same user session lane is recorded", () => {
    recordUpsellFired("user-1", "session-1", "expert");

    expect(hasFiredUpsell("user-1", "session-1", "expert")).toBe(true);
  });

  it("keeps lanes disjoint within the same user session", () => {
    recordUpsellFired("user-1", "session-1", "expert");

    expect(hasFiredUpsell("user-1", "session-1", "client")).toBe(false);
  });

  it("keeps sessions isolated", () => {
    recordUpsellFired("user-1", "session-1", "expert");

    expect(hasFiredUpsell("user-1", "session-2", "expert")).toBe(false);
  });
});
