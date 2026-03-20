/**
 * CLI Command: review
 * Show items needing review, or detail for a specific item.
 * AC-9: `pnpm cli review <id>` shows full output detail.
 */

import { defineCommand } from "citty";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { jsonOutput, timeSince } from "../format";

export const reviewCommand = defineCommand({
  meta: {
    name: "review",
    description: "Review outputs waiting for approval",
  },
  args: {
    id: {
      type: "positional",
      description: "Run ID or output ID to review",
      required: false,
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    if (!args.id) {
      await listPendingReviews(args.json);
      return;
    }

    await showReviewDetail(args.id, args.json);
  },
});

async function listPendingReviews(jsonMode: boolean) {
  const outputs = await db
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

  if (outputs.length === 0) {
    if (jsonMode) {
      console.log(jsonOutput([]));
      return;
    }
    console.log("Review queue is empty. Nice.");
    return;
  }

  if (jsonMode) {
    console.log(
      jsonOutput(
        outputs.map(({ output }) => ({
          id: output.id,
          name: output.name,
          type: output.type,
          confidence: output.confidenceScore,
          processRunId: output.processRunId,
          createdAt: output.createdAt.toISOString(),
        })),
      ),
    );
    return;
  }

  console.log(`REVIEW QUEUE (${outputs.length} items)\n`);
  for (const { output, run } of outputs) {
    const confidence = output.confidenceScore
      ? `Confidence: ${Math.round(output.confidenceScore * 100)}%`
      : "";

    // Look up process name
    let processName = "";
    if (run?.processId) {
      const [proc] = await db
        .select({ name: schema.processes.name })
        .from(schema.processes)
        .where(eq(schema.processes.id, run.processId))
        .limit(1);
      processName = proc?.name || "";
    }

    const age = timeSince(output.createdAt);
    console.log(`  #${output.id.slice(0, 8)}  Review   ${output.name}`);
    console.log(
      `       ${confidence ? confidence + " | " : ""}${processName ? "Process: " + processName + " | " : ""}${age}`,
    );
    console.log();
  }
}

async function showReviewDetail(id: string, jsonMode: boolean) {
  // Try as run ID first (backward compatible), then as output ID
  let outputs = await db
    .select()
    .from(schema.processOutputs)
    .where(eq(schema.processOutputs.processRunId, id));

  if (outputs.length === 0) {
    // Try as output ID (prefix match)
    const allPending = await db
      .select()
      .from(schema.processOutputs)
      .where(eq(schema.processOutputs.needsReview, true));

    outputs = allPending.filter((o) => o.id.startsWith(id));
  }

  if (outputs.length === 0) {
    console.log("No outputs found for this ID.");
    return;
  }

  if (jsonMode) {
    console.log(jsonOutput(outputs));
    return;
  }

  for (const output of outputs) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`Output: ${output.name} (${output.type})`);
    console.log(
      `Confidence: ${output.confidenceScore ? Math.round(output.confidenceScore * 100) + "%" : "N/A"}`,
    );
    console.log(`Needs review: ${output.needsReview}`);
    console.log(`${"─".repeat(60)}`);

    const content = output.content;
    if (typeof content === "string") {
      console.log(content);
    } else {
      console.log(JSON.stringify(content, null, 2));
    }

    console.log(`${"═".repeat(60)}`);

    // Show checks (if available in content)
    const contentObj = output.content as Record<string, unknown>;
    if (contentObj.checks && Array.isArray(contentObj.checks)) {
      console.log("\nChecks:");
      for (const check of contentObj.checks as Array<{
        name: string;
        passed: boolean;
      }>) {
        const icon = check.passed ? "\u2713" : "\u2717";
        console.log(`  ${icon} ${check.name}`);
      }
    }

    // Action prompt (Designer spec)
    if (output.needsReview) {
      console.log(
        `\n[a]pprove: pnpm cli approve ${output.processRunId}`,
      );
      console.log(
        `[e]dit:    pnpm cli approve ${output.processRunId} --edit`,
      );
      console.log(
        `[r]eject:  pnpm cli reject ${output.processRunId}`,
      );
    }
  }
}
