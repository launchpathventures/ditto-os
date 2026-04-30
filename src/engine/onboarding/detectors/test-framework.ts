/**
 * Brief 226 — Test-framework detector.
 *
 * Pure function over a cloned repo dir + the build-system detections from
 * the previous step. Detects vitest, jest, playwright, pytest, RSpec,
 * cargo-test, go-test, phpunit, junit. Returns 0+ frameworks.
 *
 * Detection is config-file + filename-pattern based.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  BuildSystemDetection,
  TestFrameworkDetection,
  TestFrameworkKind,
} from "@ditto/core";

interface ConfigCheck {
  candidates: string[];
  framework: TestFrameworkKind;
}

const NODE_TEST_CONFIGS: ConfigCheck[] = [
  {
    candidates: [
      "vitest.config.ts",
      "vitest.config.js",
      "vitest.config.mjs",
      "vitest.config.mts",
      "vite.config.ts",
      "vite.config.js",
    ],
    framework: "vitest",
  },
  {
    candidates: [
      "jest.config.ts",
      "jest.config.js",
      "jest.config.mjs",
      "jest.config.cjs",
      "jest.config.json",
    ],
    framework: "jest",
  },
  {
    candidates: [
      "playwright.config.ts",
      "playwright.config.js",
      "playwright.config.mjs",
    ],
    framework: "playwright",
  },
];

const PYTHON_TEST_CONFIGS: ConfigCheck[] = [
  {
    candidates: ["pytest.ini", "pyproject.toml", "tox.ini", "conftest.py"],
    framework: "pytest",
  },
];

const RUBY_TEST_CONFIGS: ConfigCheck[] = [
  {
    candidates: [".rspec", "spec/spec_helper.rb"],
    framework: "rspec",
  },
];

/** Read a `package.json` if present; return null on parse / read failure
 *  (treated as "no signal" rather than fatal). */
function readPackageJson(repoDir: string): Record<string, unknown> | null {
  const path = join(repoDir, "package.json");
  if (!existsSync(path)) return null;
  try {
    const body = readFileSync(path, "utf-8");
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Walk up to `maxFiles` and look for `*_test.go` (Go) or `*_test.rs`-style
 *  cargo-test markers without a full recursive scan. */
function shallowFindFile(
  dir: string,
  predicate: (name: string) => boolean,
  maxDepth = 3,
  budget = { count: 200 },
): boolean {
  if (budget.count <= 0 || maxDepth < 0) return false;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (budget.count <= 0) return false;
    budget.count -= 1;
    if (
      entry === "node_modules" ||
      entry === ".git" ||
      entry === "target" ||
      entry === "dist" ||
      entry === "build"
    ) {
      continue;
    }
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      if (shallowFindFile(full, predicate, maxDepth - 1, budget)) return true;
      continue;
    }
    if (predicate(entry)) return true;
  }
  return false;
}

/**
 * Detect all test frameworks present.
 *
 * The `buildSystems` parameter narrows the search — we don't probe Cargo
 * config in a Ruby-only repo, etc. When `buildSystems` is empty (glue-script
 * repo), the detector still tries the universal config files (vitest, etc.)
 * but skips language-specific deep walks.
 */
export function detectTestFramework(
  repoDir: string,
  buildSystems: BuildSystemDetection[],
): TestFrameworkDetection[] {
  const detections: TestFrameworkDetection[] = [];
  const kinds = new Set(buildSystems.map((b) => b.kind));
  const seen = new Set<TestFrameworkKind>();

  /** Validate a candidate hit before treating it as evidence. Returns true
   *  when the file exists AND (for pyproject.toml under pytest) actually
   *  configures the framework. */
  const candidateValid = (framework: TestFrameworkKind, candidate: string): boolean => {
    if (!existsSync(join(repoDir, candidate))) return false;
    if (framework === "pytest" && candidate === "pyproject.toml") {
      try {
        const body = readFileSync(join(repoDir, candidate), "utf-8");
        return body.includes("[tool.pytest");
      } catch {
        return false;
      }
    }
    return true;
  };

  const tryConfigs = (configs: ConfigCheck[]) => {
    for (const cfg of configs) {
      if (seen.has(cfg.framework)) continue;
      // Walk ALL candidates until one validates — `find` would short-circuit
      // on the first existing path even if it doesn't actually configure the
      // framework (e.g. a stub pyproject.toml without [tool.pytest], when a
      // sibling pytest.ini DOES configure it).
      const hit = cfg.candidates.find((c) => candidateValid(cfg.framework, c));
      if (!hit) continue;
      detections.push({ framework: cfg.framework, evidence: hit });
      seen.add(cfg.framework);
    }
  };

  if (kinds.has("node") || kinds.size === 0) {
    tryConfigs(NODE_TEST_CONFIGS);

    // package.json `jest` key fallback for jest-via-package-json projects.
    const pkg = readPackageJson(repoDir);
    if (pkg && pkg.jest && !seen.has("jest")) {
      detections.push({
        framework: "jest",
        evidence: 'package.json ("jest" key)',
      });
      seen.add("jest");
    }
  }

  if (kinds.has("python")) tryConfigs(PYTHON_TEST_CONFIGS);
  if (kinds.has("ruby")) tryConfigs(RUBY_TEST_CONFIGS);

  if (kinds.has("rust")) {
    const cargoToml = join(repoDir, "Cargo.toml");
    if (existsSync(cargoToml)) {
      try {
        const body = readFileSync(cargoToml, "utf-8");
        if (
          body.includes("[dev-dependencies]") ||
          body.includes("[[test]]") ||
          body.includes("[[bench]]")
        ) {
          detections.push({ framework: "cargo-test", evidence: "Cargo.toml" });
          seen.add("cargo-test");
        }
      } catch {
        // ignore — fall through.
      }
    }
  }

  if (kinds.has("go")) {
    const found = shallowFindFile(repoDir, (n) => n.endsWith("_test.go"));
    if (found) {
      detections.push({ framework: "go-test", evidence: "*_test.go" });
      seen.add("go-test");
    }
  }

  if (kinds.has("php")) {
    if (existsSync(join(repoDir, "phpunit.xml")) || existsSync(join(repoDir, "phpunit.xml.dist"))) {
      detections.push({
        framework: "phpunit",
        evidence: existsSync(join(repoDir, "phpunit.xml"))
          ? "phpunit.xml"
          : "phpunit.xml.dist",
      });
      seen.add("phpunit");
    }
  }

  if (kinds.has("java")) {
    const pomPath = join(repoDir, "pom.xml");
    if (existsSync(pomPath)) {
      try {
        const body = readFileSync(pomPath, "utf-8");
        if (body.includes("junit")) {
          detections.push({ framework: "junit", evidence: "pom.xml" });
          seen.add("junit");
        }
      } catch {
        // ignore
      }
    }
  }

  return detections;
}
