/**
 * Brief 220 AC #12 — runbook bash-syntax check.
 *
 * Extracts every fenced ```bash block from `deploy-prod-setup.md` and
 * shells `bash -n` on each. Failures break the build, ensuring the
 * runbook's commands stay copy-pasteable for the user.
 *
 * The runbook contains genuine setup commands (echo, cat, gh, git push).
 * We do NOT execute them — only parse-syntax via `bash -n`. This
 * guarantees commands haven't drifted into shell-syntax errors when the
 * runbook was edited.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNBOOK_PATH = join(__dirname, "deploy-prod-setup.md");

function extractBashBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```bash\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

describe("deploy-prod-setup.md runbook (Brief 220 AC #12)", () => {
  const markdown = readFileSync(RUNBOOK_PATH, "utf-8");
  const blocks = extractBashBlocks(markdown);

  it("contains at least one bash block (sanity check on extractor)", () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  it.each(blocks.map((b, i) => [i, b]))(
    "block #%i passes `bash -n` syntax check",
    (_index, snippet) => {
      const result = spawnSync("bash", ["-n"], {
        input: snippet,
        encoding: "utf-8",
      });
      if (result.status !== 0) {
        // Surface the failing snippet + bash's stderr for debuggability.
        throw new Error(
          `bash -n failed for snippet:\n${snippet}\n\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.status).toBe(0);
    },
  );
});
