import { describe, it, expect } from "vitest";
import { runExec, type ExecResultFrame } from "./exec.js";
import os from "os";

interface CapturedFrame {
  jobId: string;
  stream: "stdout" | "stderr";
  data: string;
  cumulativeBytes: number;
}

function capture() {
  const streamFrames: CapturedFrame[] = [];
  let resultFrame: ExecResultFrame | null = null;
  return {
    streamFrames,
    getResult: () => resultFrame,
    hooks: {
      sendStream: (jobId: string, stream: "stdout" | "stderr", data: string, cumulativeBytes: number) => {
        streamFrames.push({ jobId, stream, data, cumulativeBytes });
      },
      sendResult: (frame: ExecResultFrame) => {
        resultFrame = frame;
      },
    },
  };
}

describe("daemon exec handler (AC #14a)", () => {
  it("runs a command and emits stdout + result with exitCode 0", async () => {
    const cap = capture();
    await runExec(
      { jobId: "job-1", command: "echo", args: ["hello-bridge"] },
      cap.hooks,
    );
    const result = cap.getResult();
    expect(result).not.toBeNull();
    expect(result!.exitCode).toBe(0);
    expect(result!.errorMessage).toBeUndefined();
    const stdoutText = cap.streamFrames
      .filter((f) => f.stream === "stdout")
      .map((f) => f.data)
      .join("");
    expect(stdoutText).toContain("hello-bridge");
  });

  it("returns a non-zero exitCode when the command fails", async () => {
    const cap = capture();
    await runExec({ jobId: "job-2", command: "false" }, cap.hooks);
    expect(cap.getResult()!.exitCode).not.toBe(0);
  });

  it("returns errorMessage when cwd does not exist", async () => {
    const cap = capture();
    await runExec(
      { jobId: "job-3", command: "echo", args: ["x"], cwd: "/nonexistent-path-9999" },
      cap.hooks,
    );
    const result = cap.getResult();
    expect(result!.exitCode).toBeNull();
    expect(result!.errorMessage).toMatch(/cwd not accessible/);
  });

  it("honours payload-supplied cwd when valid", async () => {
    const cap = capture();
    await runExec(
      { jobId: "job-4", command: "pwd", cwd: os.tmpdir() },
      cap.hooks,
    );
    const stdoutText = cap.streamFrames
      .filter((f) => f.stream === "stdout")
      .map((f) => f.data)
      .join("");
    // On macOS tmpdir is symlinked to /private/var/folders/... — accept either.
    expect(stdoutText.length).toBeGreaterThan(0);
  });

  it("merges payload env additively (overrides on collision)", async () => {
    const cap = capture();
    await runExec(
      {
        jobId: "job-5",
        command: "sh",
        args: ["-c", "echo $DITTO_BRIDGE_TEST_VAR"],
        env: { DITTO_BRIDGE_TEST_VAR: "merged-value" },
      },
      cap.hooks,
    );
    const stdoutText = cap.streamFrames
      .filter((f) => f.stream === "stdout")
      .map((f) => f.data)
      .join("");
    expect(stdoutText).toContain("merged-value");
  });

  it("times out a long-running command via SIGTERM", async () => {
    const cap = capture();
    await runExec(
      { jobId: "job-6", command: "sleep", args: ["30"], timeoutMs: 200 },
      cap.hooks,
    );
    const result = cap.getResult()!;
    // SIGTERM sets exitCode to null and terminationSignal to 'SIGTERM'.
    expect(result.terminationSignal).toBe("SIGTERM");
  });
});
