/**
 * Daemon `exec` handler — spawn a subprocess on the laptop, line-buffer
 * stdout/stderr into JSON-RPC notifications, send a final result frame.
 *
 * Caps stdout/stderr at 4 MB each (truncation marker appended). Honours
 * timeoutMs (SIGTERM, then SIGKILL after 5s). Stdin is /dev/null.
 *
 * Brief 212 §Constraints "Subprocess defaults" + AC #14 (a).
 */
import { spawn } from "child_process";
import os from "os";

export interface ExecPayload {
  jobId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface ExecHandlerHooks {
  /** Send a JSON-RPC notification frame (stream chunk). */
  sendStream: (jobId: string, stream: "stdout" | "stderr", data: string, cumulativeBytes: number) => void;
  /** Send the final result frame. */
  sendResult: (frame: ExecResultFrame) => void;
}

export interface ExecResultFrame {
  jobId: string;
  exitCode: number | null;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
  terminationSignal?: "SIGTERM" | "SIGKILL";
  errorMessage?: string;
}

const MAX_BYTES_PER_STREAM = 4 * 1024 * 1024; // 4 MB
const TRUNCATION_MARKER = "\n[ditto-bridge: stream truncated at 4 MB]\n";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_AFTER_TERM_MS = 5_000;

export async function runExec(payload: ExecPayload, hooks: ExecHandlerHooks): Promise<void> {
  const cwd = payload.cwd ?? os.homedir();
  const start = Date.now();

  // cwd existence check — surface a friendly error frame instead of an
  // ENOENT spawn error.
  const fs = await import("fs/promises");
  try {
    const stat = await fs.stat(cwd);
    if (!stat.isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
  } catch (err) {
    hooks.sendResult({
      jobId: payload.jobId,
      exitCode: null,
      durationMs: Date.now() - start,
      stdoutBytes: 0,
      stderrBytes: 0,
      truncated: false,
      errorMessage: `cwd not accessible: ${(err as Error).message}`,
    });
    return;
  }

  let stdoutBytes = 0;
  let stderrBytes = 0;
  let truncated = false;
  let terminationSignal: "SIGTERM" | "SIGKILL" | undefined;

  const child = spawn(payload.command, payload.args ?? [], {
    cwd,
    env: { ...process.env, ...(payload.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const handleChunk = (stream: "stdout" | "stderr", chunk: Buffer) => {
    const currentBytes = stream === "stdout" ? stdoutBytes : stderrBytes;
    const remaining = MAX_BYTES_PER_STREAM - currentBytes;
    if (remaining <= 0) return; // already truncated

    let usable: Buffer = chunk;
    if (chunk.length > remaining) {
      usable = chunk.subarray(0, remaining);
      truncated = true;
    }
    const text = usable.toString("utf8");
    if (stream === "stdout") {
      stdoutBytes += usable.length;
    } else {
      stderrBytes += usable.length;
    }
    hooks.sendStream(payload.jobId, stream, text, stream === "stdout" ? stdoutBytes : stderrBytes);

    // If we just hit the cap, append the truncation marker once.
    if (truncated && usable.length < chunk.length) {
      hooks.sendStream(
        payload.jobId,
        stream,
        TRUNCATION_MARKER,
        stream === "stdout" ? stdoutBytes : stderrBytes,
      );
    }
  };

  child.stdout?.on("data", (c: Buffer) => handleChunk("stdout", c));
  child.stderr?.on("data", (c: Buffer) => handleChunk("stderr", c));

  // Timeout: SIGTERM at timeoutMs; SIGKILL 5s later if still alive.
  const timeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const termTimer = setTimeout(() => {
    if (!child.killed) {
      terminationSignal = "SIGTERM";
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => {
        if (!child.killed) {
          terminationSignal = "SIGKILL";
          child.kill("SIGKILL");
        }
      }, KILL_AFTER_TERM_MS);
      if (typeof killTimer.unref === "function") killTimer.unref();
    }
  }, timeoutMs);
  if (typeof termTimer.unref === "function") termTimer.unref();

  await new Promise<void>((resolve) => {
    child.on("close", (code, signal) => {
      clearTimeout(termTimer);
      hooks.sendResult({
        jobId: payload.jobId,
        exitCode: typeof code === "number" ? code : null,
        durationMs: Date.now() - start,
        stdoutBytes,
        stderrBytes,
        truncated,
        terminationSignal: terminationSignal ?? (signal as "SIGTERM" | "SIGKILL" | undefined),
      });
      resolve();
    });
    child.on("error", (err) => {
      clearTimeout(termTimer);
      hooks.sendResult({
        jobId: payload.jobId,
        exitCode: null,
        durationMs: Date.now() - start,
        stdoutBytes,
        stderrBytes,
        truncated,
        errorMessage: err.message,
      });
      resolve();
    });
  });
}
