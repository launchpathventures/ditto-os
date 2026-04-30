/**
 * Brief 226 — Existing-harness detector unit tests.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { detectHarness } from "./harness";

const FIXTURES = join(__dirname, "../__fixtures__");

describe("detectHarness", () => {
  it("identifies claude-md in the TS fixture", () => {
    const result = detectHarness(join(FIXTURES, "ts-next-vitest"));
    expect(result.flavours).toContain("claude-md");
    expect(result.markers).toContain("CLAUDE.md");
  });

  it("returns flavours=['none'] when no markers present", () => {
    const result = detectHarness(join(FIXTURES, "no-tests-bash"));
    expect(result.flavours).toEqual(["none"]);
    expect(result.markers).toEqual([]);
  });

  it("does not throw on a non-existent path", () => {
    expect(() => detectHarness("/tmp/missing-226-harness")).not.toThrow();
  });
});
