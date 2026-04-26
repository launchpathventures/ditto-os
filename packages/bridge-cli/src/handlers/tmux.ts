/**
 * Daemon `tmux.send` handler — Brief 212 §Constraints "Tmux session
 * lifecycle" + AC #14 (b)/(c).
 *
 * Pre-flight checks:
 *   - tmux installed (`which tmux`); else error frame
 *   - target session exists (`tmux has-session -t <name>`); else error
 * Then sends keys with a trailing Enter:
 *   tmux send-keys -t <session> -- <keys> Enter
 */
import { spawn } from "child_process";

export interface TmuxSendPayload {
  jobId: string;
  tmuxSession: string;
  keys: string;
}

export interface TmuxSendResult {
  jobId: string;
  exitCode: number | null;
  durationMs: number;
  errorMessage?: string;
}

let tmuxInstalledCache: boolean | null = null;

export async function isTmuxInstalled(): Promise<boolean> {
  if (tmuxInstalledCache !== null) return tmuxInstalledCache;
  tmuxInstalledCache = await new Promise<boolean>((resolve) => {
    const child = spawn("which", ["tmux"]);
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
  return tmuxInstalledCache;
}

async function hasSession(name: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn("tmux", ["has-session", "-t", name]);
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

export async function runTmuxSend(payload: TmuxSendPayload): Promise<TmuxSendResult> {
  const start = Date.now();

  if (!(await isTmuxInstalled())) {
    return {
      jobId: payload.jobId,
      exitCode: null,
      durationMs: Date.now() - start,
      errorMessage: "tmux is not installed on this device",
    };
  }

  if (!(await hasSession(payload.tmuxSession))) {
    return {
      jobId: payload.jobId,
      exitCode: null,
      durationMs: Date.now() - start,
      errorMessage: `tmux session '${payload.tmuxSession}' does not exist on this device — create it manually with: tmux new -s ${payload.tmuxSession}`,
    };
  }

  // The `--` separator ensures keys starting with `-` aren't parsed as flags.
  // Trailing `Enter` is appended by tmux's keystroke language.
  const code = await new Promise<number | null>((resolve) => {
    const child = spawn("tmux", [
      "send-keys",
      "-t",
      payload.tmuxSession,
      "--",
      payload.keys,
      "Enter",
    ]);
    child.on("close", (c) => resolve(typeof c === "number" ? c : null));
    child.on("error", () => resolve(null));
  });

  return {
    jobId: payload.jobId,
    exitCode: code,
    durationMs: Date.now() - start,
    errorMessage: code === 0 ? undefined : `tmux send-keys exited with code ${code}`,
  };
}
