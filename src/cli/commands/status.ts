/**
 * CLI Command: status
 * Morning check-in: pending tasks + process health + running quietly.
 *
 * Designer spec: Scenarios 1, 2. Silence is the happy path.
 * AC-4 through AC-8.
 */

import { defineCommand } from "citty";
import { db, schema } from "../../db";
import { eq, desc, and, ne } from "drizzle-orm";
import type { TrustTier } from "../../db/schema";
import {
  formatWorkItemLine,
  formatProcessHealthLine,
  trustTierLabel,
  sectionHeader,
  timeSince,
  jsonOutput,
} from "../format";
import { getPendingSuggestion } from "../../engine/trust";

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show what needs your attention",
  },
  args: {
    all: {
      type: "boolean",
      description: "Show running quietly section for autonomous processes",
      default: false,
    },
    process: {
      type: "string",
      description: "Show detailed status for a specific process",
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    // Single process detail view (Designer spec: Scenario 5)
    if (args.process) {
      await showProcessDetail(args.process, args.json);
      return;
    }

    // Load all data in parallel (GitHub CLI status.go pattern)
    const [processes, pendingItems, recentRuns] = await Promise.all([
      db.select().from(schema.processes).orderBy(schema.processes.name),
      db
        .select()
        .from(schema.workItems)
        .where(
          and(
            ne(schema.workItems.status, "completed"),
            ne(schema.workItems.status, "failed"),
          ),
        )
        .orderBy(desc(schema.workItems.createdAt)),
      db
        .select()
        .from(schema.processRuns)
        .orderBy(desc(schema.processRuns.createdAt))
        .limit(50),
    ]);

    // Also load pending review outputs (legacy — until fully migrated to work items)
    const pendingOutputs = await db
      .select({
        output: schema.processOutputs,
        run: schema.processRuns,
      })
      .from(schema.processOutputs)
      .leftJoin(
        schema.processRuns,
        eq(schema.processOutputs.processRunId, schema.processRuns.id),
      )
      .where(eq(schema.processOutputs.needsReview, true));

    if (processes.length === 0) {
      if (args.json) {
        console.log(jsonOutput({ pending: [], processHealth: [], runningQuietly: [] }));
        return;
      }
      console.log("Welcome to Agent OS. Run `pnpm cli sync` to get started.");
      return;
    }

    // Pre-build process lookup maps (eliminates N+1 queries in render loops)
    const processNameById = new Map<string, string>();
    const processIdBySlug = new Map<string, string>();
    for (const proc of processes) {
      processNameById.set(proc.id, proc.name);
      processIdBySlug.set(proc.slug, proc.id);
    }

    // Build process run counts
    const runCounts = new Map<string, number>();
    for (const run of recentRuns) {
      runCounts.set(run.processId, (runCounts.get(run.processId) || 0) + 1);
    }

    // Build process issue map (runs that are failed or stuck)
    const processIssues = new Map<string, string>();
    for (const run of recentRuns) {
      if (run.status === "failed") {
        processIssues.set(run.processId, "failed run");
      }
    }

    // Categorize processes by attention model (ADR-011)
    const needsAttention: typeof pendingOutputs = [...pendingOutputs];
    const processHealth: Array<{
      name: string;
      slug: string;
      status: string;
      trustTier: TrustTier;
      runCount: number;
      hasIssues: boolean;
      issueText?: string;
    }> = [];
    const runningQuietly: Array<{
      name: string;
      runCount: number;
      exceptions: number;
      trustTier: TrustTier;
    }> = [];

    for (const proc of processes) {
      const tier = proc.trustTier as TrustTier;
      const count = runCounts.get(proc.id) || 0;
      const issue = processIssues.get(proc.id);

      processHealth.push({
        name: proc.name,
        slug: proc.slug,
        status: proc.status,
        trustTier: tier,
        runCount: count,
        hasIssues: !!issue,
        issueText: issue,
      });

      // AC-6: --all shows RUNNING QUIETLY for autonomous/spot-checked
      if (
        args.all &&
        (tier === "autonomous" || tier === "spot_checked") &&
        !issue
      ) {
        runningQuietly.push({
          name: proc.name,
          runCount: count,
          exceptions: 0,
          trustTier: tier,
        });
      }
    }

    // AC-8: JSON output
    if (args.json) {
      const jsonData = {
        pending: [
          ...pendingItems.map((item) => ({
            id: item.id,
            type: item.type,
            content: item.content,
            status: item.status,
            createdAt: item.createdAt.toISOString(),
          })),
          ...needsAttention.map(({ output, run }) => ({
            id: output.id,
            type: "review",
            content: output.name,
            processRunId: output.processRunId,
            confidence: output.confidenceScore,
            createdAt: output.createdAt.toISOString(),
          })),
        ],
        processHealth: processHealth.map((p) => ({
          name: p.name,
          slug: p.slug,
          status: p.status,
          trustTier: p.trustTier,
          runCount: p.runCount,
          healthy: !p.hasIssues,
        })),
        runningQuietly: runningQuietly.map((p) => ({
          name: p.name,
          runCount: p.runCount,
          exceptions: p.exceptions,
          trustTier: p.trustTier,
        })),
      };
      console.log(jsonOutput(jsonData));
      return;
    }

    // Human-readable output (Designer spec)
    console.log(`Agent OS \u2014 Status\n`);

    // NEEDS YOUR ATTENTION section (AC-4)
    const totalPending = pendingItems.length + needsAttention.length;
    if (totalPending > 0) {
      console.log(sectionHeader("NEEDS YOUR ATTENTION", totalPending));

      // Work items first
      for (const item of pendingItems) {
        const processName = item.assignedProcess
          ? processNameById.get(item.assignedProcess)
          : undefined;
        console.log(
          formatWorkItemLine({
            id: item.id,
            type: item.type,
            status: item.status,
            content: item.content,
            processName,
            createdAt: item.createdAt,
          }),
        );
      }

      // Legacy pending outputs (review items not yet migrated to work items)
      for (const { output, run } of needsAttention) {
        const confidence = output.confidenceScore
          ? `${Math.round(output.confidenceScore * 100)}%`
          : "";
        const processName = run?.processId
          ? processNameById.get(run.processId) || "Unknown"
          : "Unknown";
        const age = timeSince(output.createdAt);
        console.log(
          `  #${output.id.slice(0, 8)}  Review   ${output.name}`,
        );
        console.log(
          `       ${confidence ? `Confidence: ${confidence} | ` : ""}Process: ${processName} | ${age}`,
        );
      }
      console.log();
    } else {
      // AC-7: Nothing pending — silence principle
      console.log("Nothing needs your attention right now.\n");
    }

    // PROCESS HEALTH section (AC-5)
    // Pre-load all pending suggestions to avoid N+1 queries
    const pendingSuggestions = new Map<string, { suggestedTier: string }>();
    for (const proc of processes) {
      const suggestion = await getPendingSuggestion(proc.id);
      if (suggestion) {
        pendingSuggestions.set(proc.slug, suggestion);
      }
    }

    console.log(sectionHeader("PROCESS HEALTH"));
    for (const proc of processHealth) {
      console.log(formatProcessHealthLine(proc));

      const suggestion = pendingSuggestions.get(proc.slug);
      if (suggestion) {
        console.log(
          `    \u2191 Upgrade available: \u2192 ${trustTierLabel(suggestion.suggestedTier as TrustTier)} (run: pnpm cli trust ${proc.slug})`,
        );
      }
    }

    // AC-6: RUNNING QUIETLY section (only with --all)
    if (runningQuietly.length > 0) {
      console.log(`\n${sectionHeader("RUNNING QUIETLY")}`);
      for (const proc of runningQuietly) {
        console.log(
          `  ${proc.name.padEnd(18)} ${proc.runCount} runs | ${proc.exceptions} exceptions | ${trustTierLabel(proc.trustTier)}`,
        );
      }
    }

    // Debt summary
    const debtSummary = getDebtSummary();
    if (debtSummary) {
      console.log(`\n${debtSummary}`);
    }
  },
});

// ============================================================
// Process detail view (Designer spec: Scenario 5 — Nadia)
// ============================================================

async function showProcessDetail(slug: string, jsonMode: boolean) {
  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, slug))
    .limit(1);

  if (!proc) {
    console.error(`Process not found: ${slug}`);
    process.exit(1);
  }

  const runs = await db
    .select()
    .from(schema.processRuns)
    .where(eq(schema.processRuns.processId, proc.id))
    .orderBy(desc(schema.processRuns.createdAt))
    .limit(20);

  const feedbackRecords = await db
    .select()
    .from(schema.feedback)
    .where(eq(schema.feedback.processId, proc.id))
    .orderBy(desc(schema.feedback.createdAt))
    .limit(20);

  const approved = feedbackRecords.filter((f) => f.type === "approve").length;
  const corrected = feedbackRecords.filter((f) => f.type === "edit").length;
  const rejected = feedbackRecords.filter((f) => f.type === "reject").length;
  const total = approved + corrected + rejected;

  if (jsonMode) {
    console.log(
      jsonOutput({
        name: proc.name,
        slug: proc.slug,
        trustTier: proc.trustTier,
        runCount: runs.length,
        feedback: { approved, corrected, rejected, total },
      }),
    );
    return;
  }

  const tier = trustTierLabel(proc.trustTier as TrustTier);
  console.log(`${proc.name}${"".padEnd(Math.max(0, 40 - proc.name.length))}${tier} | ${runs.length} runs`);
  console.log("\u2500".repeat(60));
  console.log(`Trust:        ${tier}`);

  if (total > 0) {
    console.log(`Last ${total} reviews: ${approved} approved, ${corrected} corrected, ${rejected} rejected`);
  }

  // Show recent corrections
  const corrections = feedbackRecords.filter((f) => f.type === "edit");
  if (corrections.length > 0) {
    console.log(`\nRecent corrections:`);
    for (const c of corrections.slice(0, 3)) {
      const comment = c.comment || "no comment";
      console.log(`  ${timeSince(c.createdAt)}: ${comment}`);
    }
  }
}

// ============================================================
// Debt summary (migrated from old cli.ts)
// ============================================================

import fs from "fs";
import path from "path";
import YAML from "yaml";

function getDebtSummary(): string {
  const debtsDir = path.join(process.cwd(), "docs", "debts");
  if (!fs.existsSync(debtsDir)) return "";

  const files = fs
    .readdirSync(debtsDir)
    .filter((f) => f.endsWith(".md") && f !== "000-template.md");

  let high = 0,
    medium = 0,
    low = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(debtsDir, file), "utf-8");
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;
    try {
      const fm = YAML.parse(match[1]) as Record<string, unknown>;
      if (String(fm.status) !== "deferred") continue;
      const sev = String(fm.severity || "medium");
      if (sev === "high") high++;
      else if (sev === "low") low++;
      else medium++;
    } catch {
      // Skip invalid frontmatter
    }
  }

  const total = high + medium + low;
  if (total === 0) return "";

  const parts: string[] = [];
  if (high > 0) parts.push(`${high} high`);
  if (medium > 0) parts.push(`${medium} medium`);
  if (low > 0) parts.push(`${low} low`);

  return `DEBT: ${parts.join(", ")}`;
}
