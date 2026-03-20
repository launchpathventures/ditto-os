/**
 * CLI Command: sync
 * Sync process definitions from YAML to database.
 * Backward compatible with existing `pnpm cli sync`.
 */

import { defineCommand } from "citty";
import { ensureSchema } from "../../db";
import {
  loadAllProcesses,
  syncProcessesToDb,
} from "../../engine/process-loader";

export const syncCommand = defineCommand({
  meta: {
    name: "sync",
    description: "Sync process definitions to database",
  },
  async run() {
    console.log("Ensuring DB schema is up to date...");
    ensureSchema();
    console.log("Schema OK.\n");

    console.log("Syncing process definitions...\n");
    const definitions = loadAllProcesses();
    console.log(`Found ${definitions.length} process definitions:`);
    await syncProcessesToDb(definitions);
    console.log("\nDone.");
  },
});
