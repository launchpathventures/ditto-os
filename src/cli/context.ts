/**
 * Agent OS — CLI Context
 *
 * Shared context injected into all CLI commands.
 * Pattern: GitHub CLI factory injection (cli/cli pkg/cmd/factory/default.go).
 */

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema";

export interface CLIContext {
  db: BetterSQLite3Database<typeof schema>;
  io: CLIOutput;
  flags: GlobalFlags;
}

export interface GlobalFlags {
  json: boolean;
  quiet: boolean;
}

export interface CLIOutput {
  /** Write to stdout */
  out(text: string): void;
  /** Write to stderr */
  err(text: string): void;
  /** Whether stdout is a TTY (interactive) */
  isTTY: boolean;
}

/**
 * Create the default CLI output adapter.
 * TTY-aware: interactive prompts when TTY, plain output when piped.
 */
export function createCLIOutput(): CLIOutput {
  return {
    out: (text: string) => process.stdout.write(text + "\n"),
    err: (text: string) => process.stderr.write(text + "\n"),
    isTTY: process.stdout.isTTY === true,
  };
}

/**
 * Build a CLIContext from the shared db and parsed global flags.
 */
export function createCLIContext(
  db: BetterSQLite3Database<typeof schema>,
  flags: GlobalFlags,
): CLIContext {
  return {
    db,
    io: createCLIOutput(),
    flags,
  };
}
