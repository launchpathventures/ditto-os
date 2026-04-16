/**
 * Ditto — CLI Protocol Handler
 *
 * Executes integration commands via child_process.execFile (no shell).
 *
 * Brief 170 hardening: switched from `exec(commandString)` to
 * `execFile(executable, args[])`. Shell interpretation of arguments is no
 * longer possible, eliminating the injection surface where LLM-supplied
 * parameters could contain shell metacharacters (`;`, `&&`, `$(...)`,
 * backticks, redirects). Command templates are tokenised by
 * `shell-tokenizer.ts` before reaching this handler.
 *
 * Features preserved:
 * - Credential resolution via resolveAuth (vault-first, env-var fallback)
 * - Retry with exponential backoff (3 attempts: 1s/2s/4s)
 * - JSON output parsing when possible
 * - Credential scrubbing from logs
 *
 * Provenance: Brief 170 (CLI arg escaping). Replaces shell-interpreted
 * exec with `execFile` contract from Node.js docs; mirrors the pattern
 * used in `src/engine/tools.ts` for agent `run_command`.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { StepExecutionResult } from "../step-executor";
import type { CliInterface } from "../integration-registry";
import { resolveServiceAuth } from "../credential-vault";
import {
  tokenizeCommandTemplate,
  substituteArgv,
  formatArgvForLog,
} from "./shell-tokenizer";

type ExecFileOpts = {
  timeout?: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
};
type ExecFileFn = (
  file: string,
  args: string[],
  opts: ExecFileOpts,
) => Promise<{ stdout: string; stderr: string }>;

/** Testable execFile wrapper — override .fn for testing. */
export const execAsync = {
  fn: promisify(execFile) as ExecFileFn,
};

const BACKOFF_MS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
const MAX_RETRIES = 3;

/**
 * Resolve authentication for a CLI service via credential vault.
 * Vault-first, env-var fallback with deprecation warning (Brief 035).
 */
export async function resolveAuth(
  service: string,
  cliInterface: CliInterface,
  processId?: string,
): Promise<Record<string, string>> {
  const resolved = await resolveServiceAuth(processId, service, {
    envVars: cliInterface.env_vars,
  });
  return resolved.envVars;
}

/**
 * Scrub known credential env var values from text.
 * Prevents accidental credential exposure in logs.
 */
export function scrubCredentials(
  text: string,
  authEnv: Record<string, string>,
): string {
  let scrubbed = text;
  for (const [_key, value] of Object.entries(authEnv)) {
    if (value && value.length > 4) {
      scrubbed = scrubbed.replaceAll(value, "[REDACTED]");
    }
  }
  return scrubbed;
}

/** Try to parse output as JSON, return raw string on failure. */
function parseOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Params for `executeCli`. Callers MUST supply argv form (`executable` + `args`).
 * For backward compatibility with integration-step callers that only have a raw
 * `command` string, pass it under `command` and we'll tokenize defensively. The
 * `command` fallback does NOT permit placeholder substitution — raw strings only.
 */
export interface CliHandlerParams {
  service: string;
  cliInterface: CliInterface;
  timeoutMs?: number;
  processId?: string;
  /** Preferred: explicit argv form. No shell involvement. */
  executable?: string;
  args?: string[];
  /** Back-compat: raw command string (e.g. from YAML config.command). Tokenized here. */
  command?: string;
}

/** Resolve params to a definite argv. Throws if neither form is supplied. */
function resolveArgv(params: CliHandlerParams): {
  executable: string;
  args: string[];
} {
  if (params.executable) {
    return { executable: params.executable, args: params.args ?? [] };
  }
  if (params.command) {
    const tokens = tokenizeCommandTemplate(params.command);
    const argv = substituteArgv(tokens, {});
    if (argv.length === 0) {
      throw new Error(
        `CLI command '${params.command}' tokenised to empty argv`,
      );
    }
    return { executable: argv[0]!, args: argv.slice(1) };
  }
  throw new Error(
    "executeCli requires either { executable, args } or { command }",
  );
}

/**
 * Execute a CLI integration command with retry and backoff.
 *
 * AC-5: Executes via child_process.execFile (NO shell).
 * AC-6: Returns structured StepExecutionResult.
 * AC-7: Retries on failure (exponential backoff, max 3 attempts, 1s/2s/4s).
 * AC-9: Credentials NOT included in logs.
 * Brief 170: Arguments are passed as an array to `execFile`, never
 * concatenated into a shell string.
 */
export async function executeCli(
  params: CliHandlerParams,
): Promise<StepExecutionResult> {
  const { service, cliInterface, timeoutMs = 120_000, processId } = params;
  const { executable, args } = resolveArgv(params);
  const authEnv = await resolveAuth(service, cliInterface, processId);
  const logs: string[] = [];
  let lastError: Error | null = null;

  const commandDisplay = formatArgvForLog(executable, args);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = BACKOFF_MS[attempt - 1]!;
      logs.push(`Retry ${attempt}/${MAX_RETRIES - 1} after ${backoff}ms`);
      await sleep(backoff);
    }

    try {
      logs.push(`$ ${commandDisplay}`);
      const { stdout, stderr } = await execAsync.fn(executable, args, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, ...authEnv },
      });

      if (stderr) {
        logs.push(`STDERR: ${scrubCredentials(stderr.trim(), authEnv)}`);
      }

      const parsed = parseOutput(stdout);
      const scrubbedStdout = scrubCredentials(
        typeof parsed === "string" ? parsed : JSON.stringify(parsed),
        authEnv,
      );
      logs.push(
        `Output: ${scrubbedStdout.slice(0, 500)}${scrubbedStdout.length > 500 ? "..." : ""}`,
      );

      return {
        outputs: {
          result: parsed,
          service,
          protocol: "cli",
        },
        confidence: "high",
        logs,
      };
    } catch (error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
        killed?: boolean;
      };
      lastError = error as Error;

      const errorMsg = scrubCredentials(
        execError.stderr || execError.stdout || (error as Error).message,
        authEnv,
      );

      if (execError.killed) {
        logs.push(`TIMEOUT after ${timeoutMs}ms`);
        break;
      }

      logs.push(`FAILED (exit ${execError.code}): ${errorMsg.slice(0, 200)}`);
    }
  }

  return {
    outputs: {
      error: lastError?.message || "Unknown error",
      service,
      protocol: "cli",
    },
    confidence: "low",
    logs,
  };
}
