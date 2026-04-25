/**
 * Daemon main loop — wires the dialler to the exec/tmux handlers.
 * The daemon is a transport, not an agent.
 */
import * as jsonrpc from "jsonrpc-lite";
import { Dialler } from "./dialler.js";
import { runExec, type ExecResultFrame } from "./handlers/exec.js";
import { runTmuxSend, isTmuxInstalled } from "./handlers/tmux.js";
import { readState } from "./state.js";
import os from "os";

export async function startDaemon(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.error("[bridge-cli] no paired state at ~/.ditto/bridge.json — run `ditto-bridge pair <CODE> <URL>` first.");
    process.exit(1);
  }

  console.log(`[bridge-cli] dialling ${state.dialUrl} as device ${state.deviceId}...`);
  if (!(await isTmuxInstalled())) {
    console.warn("[bridge-cli] tmux is not installed on this device — `tmux.send` jobs will return errors.");
  }

  const dialler = new Dialler({
    dialUrl: state.dialUrl,
    jwt: state.jwt,
    onConnected: () => {
      console.log(`[bridge-cli] connected; hostname=${os.hostname()}`);
    },
    onDisconnected: (reason) => {
      console.warn(`[bridge-cli] disconnected: ${reason}`);
    },
    onFrame: (frame) => {
      void handleFrame(frame, dialler).catch((err) =>
        console.error("[bridge-cli] frame handler error:", err),
      );
    },
  });
  dialler.start();

  const shutdown = (signal: string) => {
    console.log(`[bridge-cli] received ${signal} — shutting down.`);
    dialler.stop();
    setTimeout(() => process.exit(0), 250).unref?.();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function handleFrame(frame: jsonrpc.IParsedObject, dialler: Dialler): Promise<void> {
  if (frame.type === "notification") {
    const note = frame.payload;
    // Cloud-side `ping` heartbeat — respond `pong`.
    if (note.method === "ping") {
      dialler.send(JSON.stringify(jsonrpc.notification("pong", { ts: Date.now() })));
      return;
    }
    // bridge.hello — informational; no response needed.
    if (note.method === "bridge.hello") return;
  }

  if (frame.type === "request") {
    const req = frame.payload;
    const params =
      typeof req.params === "object" && req.params !== null && !Array.isArray(req.params)
        ? (req.params as Record<string, unknown>)
        : {};

    if (req.method === "exec") {
      const jobId = String(req.id);
      void runExec(
        {
          jobId,
          command: String(params.command ?? ""),
          args: Array.isArray(params.args) ? (params.args as string[]) : undefined,
          cwd: typeof params.cwd === "string" ? params.cwd : undefined,
          env: typeof params.env === "object" && params.env !== null ? (params.env as Record<string, string>) : undefined,
          timeoutMs: typeof params.timeoutMs === "number" ? params.timeoutMs : undefined,
        },
        {
          sendStream: (id, stream, data, cumulativeBytes) => {
            dialler.send(
              JSON.stringify(
                jsonrpc.notification("exec.stream", {
                  jobId: id,
                  stream,
                  data,
                  cumulativeBytes,
                }),
              ),
            );
          },
          sendResult: (result: ExecResultFrame) => {
            dialler.send(JSON.stringify(jsonrpc.notification("exec.result", result)));
            // Also send a JSON-RPC success response keyed on the request id
            // so the cloud's request/response correlation is satisfied.
            dialler.send(JSON.stringify(jsonrpc.success(req.id, result)));
          },
        },
      );
      return;
    }

    if (req.method === "tmux.send") {
      const jobId = String(req.id);
      const result = await runTmuxSend({
        jobId,
        tmuxSession: String(params.tmuxSession ?? ""),
        keys: String(params.keys ?? ""),
      });
      // tmux is one-shot — emit a result-shaped frame matching exec's shape
      // so the cloud-side handler can use the same write path.
      dialler.send(
        JSON.stringify(
          jsonrpc.notification("exec.result", {
            jobId,
            exitCode: result.exitCode,
            durationMs: result.durationMs,
            stdoutBytes: 0,
            stderrBytes: 0,
            truncated: false,
            errorMessage: result.errorMessage,
          }),
        ),
      );
      dialler.send(JSON.stringify(jsonrpc.success(req.id, result)));
      return;
    }

    if (req.method === "cancel") {
      // Cancel is a no-op stub for now — full cancel semantics tracked
      // in a follow-on (subprocess kill via in-memory map of jobId → child).
      dialler.send(JSON.stringify(jsonrpc.success(req.id, { acked: true })));
      return;
    }

    dialler.send(
      JSON.stringify(jsonrpc.error(req.id, jsonrpc.JsonRpcError.methodNotFound(req.method))),
    );
  }
}
