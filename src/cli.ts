/**
 * Agent OS — CLI Entry Point (citty)
 *
 * The command-line interface for operating Agent OS.
 * Rewritten from switch-statement to citty framework (Phase 4a, Brief 012).
 *
 * Provenance: citty (unjs/citty) for routing, @clack/prompts for interactive UX.
 * Pattern: GitHub CLI factory injection for shared context.
 *
 * Usage:
 *   pnpm cli sync              # Sync process definitions to DB
 *   pnpm cli start <process>   # Start a new process run
 *   pnpm cli heartbeat <runId> # Execute a heartbeat for a run
 *   pnpm cli status            # Show what needs your attention
 *   pnpm cli review [id]       # Review outputs waiting for approval
 *   pnpm cli approve <id>      # Approve outputs and continue
 *   pnpm cli edit <id>         # Edit output before approving (alias)
 *   pnpm cli reject <id>       # Reject outputs with reason
 *   pnpm cli trust <process>   # Show trust data for a process
 *   pnpm cli capture <text>    # Capture a work item with classification
 *   pnpm cli complete <id>     # Complete a human step
 *   pnpm cli debt              # List all deferred debt
 */

import "dotenv/config";
import { defineCommand, runMain } from "citty";

import { syncCommand } from "./cli/commands/sync";
import { startCommand } from "./cli/commands/start";
import { heartbeatCommand } from "./cli/commands/heartbeat";
import { statusCommand } from "./cli/commands/status";
import { reviewCommand } from "./cli/commands/review";
import { approveCommand, editCommand } from "./cli/commands/approve";
import { rejectCommand } from "./cli/commands/reject";
import { trustCommand } from "./cli/commands/trust";
import { captureCommand } from "./cli/commands/capture";
import { completeCommand } from "./cli/commands/complete";
import { debtCommand } from "./cli/commands/debt";

const main = defineCommand({
  meta: {
    name: "aos",
    version: "0.1.0",
    description: "Agent OS — workspace for human-agent collaboration",
  },
  subCommands: {
    sync: syncCommand,
    start: startCommand,
    heartbeat: heartbeatCommand,
    status: statusCommand,
    review: reviewCommand,
    approve: approveCommand,
    edit: editCommand,
    reject: rejectCommand,
    trust: trustCommand,
    capture: captureCommand,
    complete: completeCommand,
    debt: debtCommand,
  },
});

runMain(main);
