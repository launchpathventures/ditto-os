/**
 * Brief 232 AC #12 — GH Action runner template `responseBody` field +
 * `bash -n` syntax check on the embedded `run: |` blocks.
 *
 * The template is an end-user reference workflow that gets pasted into a
 * target repo. We don't execute it — only parse-syntax via `bash -n` to
 * ensure the assembled JSON body shape and shell logic stay valid.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, "dispatch-coding-work.yml");

/**
 * Extract every `run: |` block's body from the YAML. Each block is a
 * shell script — multi-line, indented under `run: |`. We capture from
 * after `run: |` (or `run: |-`) through the last indented line.
 */
function extractRunBlocks(yaml: string): string[] {
  const blocks: string[] = [];
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = /^(\s*)run:\s*\|-?\s*$/.exec(line);
    if (m) {
      const baseIndent = m[1].length;
      // Step indent is one nesting deeper than `run:` itself; the body
      // is indented further. Capture until we hit a line whose indent
      // is <= baseIndent (the next sibling key) or end-of-file.
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === "") {
          body.push("");
          i++;
          continue;
        }
        const indent = /^(\s*)/.exec(next)![1].length;
        if (indent <= baseIndent) break;
        body.push(next.slice(baseIndent + 2)); // strip step-body indent
        i++;
      }
      blocks.push(body.join("\n"));
    } else {
      i++;
    }
  }
  return blocks;
}

describe("dispatch-coding-work.yml — Brief 232 responseBody wire", () => {
  const yaml = readFileSync(TEMPLATE_PATH, "utf-8");

  it("the callback step's curl body includes a responseBody field assembled from env vars", () => {
    expect(yaml).toContain("responseBody");
    // Sanity: the env vars the README documents are referenced.
    expect(yaml).toContain("$COMMIT_SHA");
    expect(yaml).toContain("$ACTUALLY_CHANGED_FILES");
    expect(yaml).toContain("$SKIPPED_FILES");
    // The optional-field gate fires only when at least one env var is set.
    expect(yaml).toMatch(/RESPONSE_BODY_FIELD/);
  });

  it("documents the responseBody convention in a comment", () => {
    expect(yaml).toMatch(/responseBody/);
    expect(yaml).toMatch(/Brief 232/);
  });
});

describe("dispatch-coding-work.yml — bash syntax in run blocks", () => {
  const yaml = readFileSync(TEMPLATE_PATH, "utf-8");
  const blocks = extractRunBlocks(yaml);

  it("contains at least one run block (extractor sanity)", () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it.each(blocks.map((b, i) => [i, b]))(
    "run block #%i passes `bash -n` syntax check",
    (_index, snippet) => {
      // Replace GitHub Actions expressions like `${{ inputs.foo }}` with
      // shell-safe placeholders so bash -n doesn't choke on `{{`.
      const sanitised = snippet.replace(/\$\{\{[^}]*\}\}/g, "PLACEHOLDER");
      const result = spawnSync("bash", ["-n"], {
        input: sanitised,
        encoding: "utf-8",
      });
      if (result.status !== 0) {
        throw new Error(
          `bash -n failed for run block:\n${sanitised}\n\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.status).toBe(0);
    },
  );
});
