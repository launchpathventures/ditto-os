/**
 * Brief 226 — Test-framework detector unit tests.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { detectTestFramework } from "./test-framework";
import { detectBuildSystem } from "./build-system";

const FIXTURES = join(__dirname, "../__fixtures__");

describe("detectTestFramework", () => {
  it("identifies vitest in a TS+Next.js fixture", () => {
    const dir = join(FIXTURES, "ts-next-vitest");
    const builds = detectBuildSystem(dir);
    const result = detectTestFramework(dir, builds);
    expect(result.find((r) => r.framework === "vitest")).toBeDefined();
  });

  it("identifies pytest in a Python fixture (via [tool.pytest] in pyproject.toml)", () => {
    const dir = join(FIXTURES, "python-pytest-gha");
    const builds = detectBuildSystem(dir);
    const result = detectTestFramework(dir, builds);
    expect(result.find((r) => r.framework === "pytest")).toBeDefined();
  });

  it("falls through to pytest.ini when pyproject.toml lacks [tool.pytest]", () => {
    // Regression for the bug where `find()` short-circuits on pyproject.toml
    // even when it doesn't configure pytest, missing the sibling pytest.ini.
    const dir = join(FIXTURES, "python-stub-pyproject");
    const builds = detectBuildSystem(dir);
    const result = detectTestFramework(dir, builds);
    expect(result.find((r) => r.framework === "pytest")).toBeDefined();
    expect(result.find((r) => r.framework === "pytest")?.evidence).toBe(
      "pytest.ini",
    );
  });

  it("returns empty for the no-tests-bash fixture", () => {
    const dir = join(FIXTURES, "no-tests-bash");
    const builds = detectBuildSystem(dir);
    const result = detectTestFramework(dir, builds);
    expect(result).toEqual([]);
  });

  it("does not throw on a non-existent path", () => {
    expect(() => detectTestFramework("/tmp/missing-226", [])).not.toThrow();
  });
});
