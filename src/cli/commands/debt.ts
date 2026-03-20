/**
 * CLI Command: debt
 * List all deferred technical/process debt.
 */

import { defineCommand } from "citty";
import fs from "fs";
import path from "path";
import YAML from "yaml";

interface DebtRecord {
  file: string;
  title: string;
  severity: string;
  status: string;
  scope: string;
  source: string;
  reentry: string;
  created: string;
}

export const debtCommand = defineCommand({
  meta: {
    name: "debt",
    description: "List all deferred technical/process debt",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const debts = loadDebtFiles();
    const deferred = debts.filter((d) => d.status === "deferred");

    if (deferred.length === 0) {
      if (args.json) {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      console.log("No deferred debt. Clean slate.");
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(deferred, null, 2));
      return;
    }

    console.log(`DEBT (${deferred.length} items)\n`);

    const bySeverity: Record<string, DebtRecord[]> = {
      high: [],
      medium: [],
      low: [],
    };
    for (const d of deferred) {
      const sev = d.severity || "medium";
      if (bySeverity[sev]) {
        bySeverity[sev].push(d);
      }
    }

    for (const severity of ["high", "medium", "low"]) {
      const items = bySeverity[severity];
      if (items.length === 0) continue;

      console.log(`  ${severity.toUpperCase()} (${items.length})`);
      console.log(`  ${"─".repeat(56)}`);
      for (const d of items) {
        console.log(`  ${d.file.padEnd(40)} ${d.title}`);
        console.log(`  ${"".padEnd(40)} reentry: ${d.reentry}`);
      }
      console.log();
    }
  },
});

function loadDebtFiles(): DebtRecord[] {
  const debtsDir = path.join(process.cwd(), "docs", "debts");

  if (!fs.existsSync(debtsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(debtsDir)
    .filter((f) => f.endsWith(".md") && f !== "000-template.md");

  const records: DebtRecord[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(debtsDir, file), "utf-8");
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) continue;

    try {
      const frontmatter = YAML.parse(frontmatterMatch[1]) as Record<
        string,
        unknown
      >;
      records.push({
        file,
        title: String(frontmatter.title || ""),
        severity: String(frontmatter.severity || "medium"),
        status: String(frontmatter.status || "deferred"),
        scope: String(frontmatter.scope || ""),
        source: String(frontmatter.source || "manual"),
        reentry: String(frontmatter.reentry || ""),
        created: String(frontmatter.created || ""),
      });
    } catch {
      // Skip files with invalid frontmatter
    }
  }

  return records;
}
