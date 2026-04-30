/**
 * Brief 226 — Build-system detector unit tests.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { detectBuildSystem } from "./build-system";

const FIXTURES = join(__dirname, "../__fixtures__");

describe("detectBuildSystem", () => {
  it("identifies Node + pnpm in a TS+Next.js fixture", () => {
    const result = detectBuildSystem(join(FIXTURES, "ts-next-vitest"));
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("node");
    expect(result[0].evidence).toBe("package.json");
    expect(result[0].packageManager).toBe("pnpm");
  });

  it("identifies Python + poetry in a pytest fixture", () => {
    const result = detectBuildSystem(join(FIXTURES, "python-pytest-gha"));
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("python");
    expect(result[0].packageManager).toBe("poetry");
  });

  it("returns an empty array for a no-build-system repo", () => {
    const result = detectBuildSystem(join(FIXTURES, "no-tests-bash"));
    expect(result).toEqual([]);
  });

  it("does not throw on a non-existent path", () => {
    expect(() => detectBuildSystem("/tmp/this-path-does-not-exist-226")).not.toThrow();
    expect(detectBuildSystem("/tmp/this-path-does-not-exist-226")).toEqual([]);
  });
});
