/**
 * CLI Command: trust
 * Show trust state, upgrade suggestions, simulation.
 * AC-12: Rewrite of existing trust commands into citty.
 *
 * Because citty's subCommands conflicts with positional args,
 * we handle subcommand routing manually (accept/reject/override
 * are detected from the first positional arg).
 */

import { defineCommand } from "citty";
import { db, schema } from "../../db";
import { eq, desc } from "drizzle-orm";
import type { TrustTier } from "../../db/schema";
import { trustTierValues } from "../../db/schema";
import {
  computeAndCacheTrustState,
  formatTrustState,
  formatUpgradeSuggestion,
  formatDowngradeAlert,
  formatSimulation,
  computeSimulation,
  getPendingSuggestion,
  acceptUpgradeSuggestion,
  rejectUpgradeSuggestion,
  overrideDowngrade,
} from "../../engine/trust";
import { trustTierLabel } from "../format";

export const trustCommand = defineCommand({
  meta: {
    name: "trust",
    description: "View and manage process trust",
  },
  args: {
    firstArg: {
      type: "positional",
      description: "Process slug, or subcommand (accept/reject/override)",
      required: false,
    },
    secondArg: {
      type: "positional",
      description: "Process slug (when first arg is a subcommand)",
      required: false,
    },
    simulate: {
      type: "string",
      description: "Simulate a different trust tier",
    },
    comment: {
      type: "string",
      description: "Add a comment (for accept/reject/override)",
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const firstArg = args.firstArg;
    const secondArg = args.secondArg;

    if (!firstArg) {
      console.error(
        "Usage: pnpm cli trust <process-slug> [--simulate <tier>]",
      );
      console.error(
        "       pnpm cli trust accept <process-slug> [--comment \"...\"]",
      );
      console.error(
        "       pnpm cli trust reject <process-slug> [--comment \"...\"]",
      );
      console.error(
        "       pnpm cli trust override <process-slug> [--comment \"...\"]",
      );
      process.exit(1);
    }

    // Check if first arg is a subcommand
    if (firstArg === "accept") {
      await trustAccept(secondArg, args.comment);
      return;
    }
    if (firstArg === "reject") {
      await trustReject(secondArg, args.comment);
      return;
    }
    if (firstArg === "override") {
      await trustOverride(secondArg, args.comment);
      return;
    }

    // Main trust display
    const processSlug = firstArg;
    const simulateTier = args.simulate;

    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, processSlug))
      .limit(1);

    if (!proc) {
      console.error(`Process not found: ${processSlug}`);
      process.exit(1);
    }

    // Simulation mode
    if (simulateTier) {
      if (!trustTierValues.includes(simulateTier as TrustTier)) {
        console.error(
          `Invalid tier: ${simulateTier}. Valid: ${trustTierValues.join(", ")}`,
        );
        process.exit(1);
      }
      const result = await computeSimulation(
        proc.id,
        simulateTier as TrustTier,
      );
      console.log(formatSimulation(result));
      return;
    }

    // Recompute and cache trust state
    const state = await computeAndCacheTrustState(proc.id);
    console.log(formatTrustState(proc.name, proc.trustTier, state));

    // Show pending upgrade suggestion if any
    const suggestion = await getPendingSuggestion(proc.id);
    if (suggestion) {
      console.log(formatUpgradeSuggestion(proc.slug, suggestion, state));
    }

    // Show recent downgrade if any
    const [lastChange] = await db
      .select()
      .from(schema.trustChanges)
      .where(eq(schema.trustChanges.processId, proc.id))
      .orderBy(desc(schema.trustChanges.createdAt))
      .limit(1);

    if (
      lastChange &&
      lastChange.actor === "system" &&
      lastChange.toTier === proc.trustTier
    ) {
      const meta = lastChange.metadata as Record<string, unknown> | null;
      const triggers =
        (meta?.triggers as Array<{
          name: string;
          threshold: string;
          actual: string;
        }>) ?? [];
      if (triggers.length > 0) {
        console.log("");
        console.log(
          formatDowngradeAlert(
            proc.slug,
            lastChange.fromTier,
            lastChange.toTier,
            triggers,
          ),
        );
      }
    }
  },
});

async function trustAccept(processSlug: string | undefined, comment: string | undefined) {
  if (!processSlug) {
    console.error(
      "Usage: pnpm cli trust accept <process-slug> [--comment \"...\"]",
    );
    process.exit(1);
  }

  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!proc) {
    console.error(`Process not found: ${processSlug}`);
    process.exit(1);
  }

  const suggestion = await getPendingSuggestion(proc.id);
  if (!suggestion) {
    console.log("No pending upgrade suggestion for this process.");
    return;
  }

  await acceptUpgradeSuggestion(suggestion.id, comment ?? undefined);
  console.log(
    `Upgrade accepted: ${suggestion.currentTier} \u2192 ${suggestion.suggestedTier}`,
  );
  console.log(
    `Grace period: next 5 runs are protected from auto-downgrade.`,
  );
}

async function trustReject(processSlug: string | undefined, comment: string | undefined) {
  if (!processSlug) {
    console.error(
      "Usage: pnpm cli trust reject <process-slug> [--comment \"...\"]",
    );
    process.exit(1);
  }

  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!proc) {
    console.error(`Process not found: ${processSlug}`);
    process.exit(1);
  }

  const suggestion = await getPendingSuggestion(proc.id);
  if (!suggestion) {
    console.log("No pending upgrade suggestion for this process.");
    return;
  }

  await rejectUpgradeSuggestion(suggestion.id, comment ?? undefined);
  console.log(
    `Upgrade suggestion rejected: ${suggestion.currentTier} \u2192 ${suggestion.suggestedTier}`,
  );
  if (comment) {
    console.log(`Comment: ${comment}`);
  }
  console.log("Re-evaluation will happen after the next review window.");
}

async function trustOverride(processSlug: string | undefined, comment: string | undefined) {
  if (!processSlug) {
    console.error(
      "Usage: pnpm cli trust override <process-slug> [--comment \"...\"]",
    );
    process.exit(1);
  }

  const [proc] = await db
    .select()
    .from(schema.processes)
    .where(eq(schema.processes.slug, processSlug))
    .limit(1);

  if (!proc) {
    console.error(`Process not found: ${processSlug}`);
    process.exit(1);
  }

  if (proc.trustTier === "critical") {
    console.error("Cannot override trust tier for critical processes.");
    process.exit(1);
  }

  try {
    const result = await overrideDowngrade(proc.id, comment ?? undefined);
    console.log("Downgrade overridden. Previous tier restored.");
    console.log(
      "Monitoring continues \u2014 if triggers persist, downgrade will re-fire.",
    );

    if (result.escalationWarning) {
      console.log("");
      console.log(
        `\u26A0 WARNING: This is override #${result.consecutiveOverrides} for the same trigger.`,
      );
      console.log(
        "Repeated overrides suggest the underlying quality issue needs attention.",
      );
      console.log(
        "Consider reviewing recent outputs or adjusting the process definition.",
      );
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
