/**
 * CLI Command: capture
 * Quick capture a note/task. Simple version — redesigned in 4b with classification.
 */

import { defineCommand } from "citty";
import { db, schema } from "../../db";

export const captureCommand = defineCommand({
  meta: {
    name: "capture",
    description: "Quick capture a note or task",
  },
  args: {
    text: {
      type: "positional",
      description: "Text to capture",
      required: true,
    },
  },
  async run({ args }) {
    if (!args.text) {
      console.error("Usage: pnpm cli capture <text>");
      process.exit(1);
    }

    await db.insert(schema.captures).values({
      content: args.text,
      type: "note",
      source: "cli",
    });

    console.log(`Captured: "${args.text}"`);
  },
});
