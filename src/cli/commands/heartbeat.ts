/**
 * CLI Command: heartbeat
 * Execute a heartbeat cycle for a process run.
 */

import { defineCommand } from "citty";
import { fullHeartbeat } from "../../engine/heartbeat";

export const heartbeatCommand = defineCommand({
  meta: {
    name: "heartbeat",
    description: "Execute a heartbeat for a process run",
  },
  args: {
    runId: {
      type: "positional",
      description: "Process run ID",
      required: true,
    },
  },
  async run({ args }) {
    const result = await fullHeartbeat(args.runId);
    console.log(`Status: ${result.status}`);
    console.log(`Steps: ${result.stepsExecuted}`);
    console.log(`Message: ${result.message}`);
  },
});
