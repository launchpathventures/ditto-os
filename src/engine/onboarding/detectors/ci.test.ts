/**
 * Brief 226 — CI detector unit tests.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { detectCI } from "./ci";

const FIXTURES = join(__dirname, "../__fixtures__");

describe("detectCI", () => {
  it("identifies github-actions when .github/workflows has yml files", () => {
    const result = detectCI(join(FIXTURES, "ts-next-vitest"));
    expect(result.provider).toBe("github-actions");
    expect(result.workflowPaths).toEqual([".github/workflows/ci.yml"]);
    expect(result.lastKnownStatus).toBe("unknown");
  });

  it("identifies github-actions in the python fixture too", () => {
    const result = detectCI(join(FIXTURES, "python-pytest-gha"));
    expect(result.provider).toBe("github-actions");
    expect(result.workflowPaths).toContain(".github/workflows/test.yml");
  });

  it("returns provider=none when no CI markers present", () => {
    const result = detectCI(join(FIXTURES, "no-tests-bash"));
    expect(result.provider).toBe("none");
    expect(result.workflowPaths).toEqual([]);
  });

  it("does not throw on a non-existent path", () => {
    expect(() => detectCI("/tmp/missing-226-ci")).not.toThrow();
  });
});
