/**
 * CLI Command: reject
 * Reject outputs with required reason.
 * AC-11: Requires reason via interactive prompt or --reason flag.
 *
 * Refactored (Brief 027): Core reject logic extracted to
 * src/engine/review-actions.ts. This file handles CLI-specific concerns
 * (TTY prompts, process.exit, console output).
 */

import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { rejectRun } from "../../engine/review-actions";

export const rejectCommand = defineCommand({
  meta: {
    name: "reject",
    description: "Reject outputs with a reason",
  },
  args: {
    id: {
      type: "positional",
      description: "Run ID to reject",
      required: true,
    },
    reason: {
      type: "string",
      description: "Reason for rejection (required)",
    },
  },
  async run({ args }) {
    let reason = args.reason;

    // AC-11: Require reason — interactive prompt if TTY, error if piped
    if (!reason) {
      if (process.stdout.isTTY) {
        const input = await p.text({
          message: "Why are you rejecting this? (required)",
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return "A reason is required for rejection.";
            }
          },
        });
        if (p.isCancel(input)) {
          console.log("Cancelled.");
          return;
        }
        reason = input;
      } else {
        console.error(
          "Rejection requires a reason. Use --reason \"...\" when piping.",
        );
        process.exit(1);
      }
    }

    const result = await rejectRun(args.id, reason!);

    if (!result.success) {
      console.error(result.message);
      process.exit(1);
    }

    console.log(`\u2713 ${result.message}`);
  },
});
