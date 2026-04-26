/**
 * Brief 212 AC #1 — Spike test gate
 *
 * Performs ONE real WebSocket roundtrip with a real JWT through the actual
 * Next.js server stack. Verifies that:
 *   1. `instrumentation.ts`'s `http.Server.prototype.listen` hook captures
 *      Next.js's HTTP server.
 *   2. `attachBridgeWebSocketServer` accepts an upgrade on `/api/v1/bridge/_dial`.
 *   3. Bearer-JWT auth (HS256, BRIDGE_JWT_SIGNING_KEY) round-trips.
 *   4. JSON-RPC 2.0 wire format works for both notification (server-pushed
 *      `bridge.hello`) and request/response (`ping` → `pong`).
 *   5. The WebSocket can be cleanly closed.
 *
 * This is the gate that the rest of Brief 212 builds on. If it passes, the
 * Next.js + WebSocket integration approach is proven and AC #2-#18 can land.
 *
 * Pivot path on failure (per AC #1): if the listen hook does not capture the
 * server, switch to a different attach strategy (e.g., http.createServer hook)
 * before invoking architect re-review.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import WebSocket from "ws";
import { signBridgeJwt, BRIDGE_DIAL_PATH, BRIDGE_PROTOCOL_VERSION } from "./bridge-server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

const SPIKE_PORT = 3457; // off the usual 3000 to avoid colliding with the user's dev server
const SPIKE_SIGNING_KEY = randomBytes(32).toString("hex");
const SPIKE_DEVICE_ID = "spike-device-" + randomBytes(4).toString("hex");

// Booting next dev is slow under cold cache.
const STARTUP_TIMEOUT_MS = 90_000;

let nextProc: ChildProcess | null = null;

async function waitForReady(proc: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("next dev did not become ready in " + STARTUP_TIMEOUT_MS + "ms")),
      STARTUP_TIMEOUT_MS,
    );
    let buffered = "";
    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString();
      buffered += text;
      // Emit live so a stuck spike is debuggable in CI.
      process.stdout.write(`[next] ${text}`);
      if (/Ready in|started server on|Local:.*localhost/i.test(buffered)) {
        clearTimeout(timer);
        resolve();
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`next dev exited early with code ${code}`));
    });
  });
}

async function pollUntilHttpReady(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: "GET" });
      // Any HTTP response means the server is accepting connections.
      void res.text();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`HTTP server at ${url} did not respond within ${timeoutMs}ms`);
}

describe("Brief 212 AC #1 — bridge WebSocket spike", () => {
  beforeAll(async () => {
    nextProc = spawn(
      "pnpm",
      ["--filter", "@ditto/web", "exec", "next", "dev", "--port", String(SPIKE_PORT)],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          BRIDGE_JWT_SIGNING_KEY: SPIKE_SIGNING_KEY,
          // Don't trigger the workspace auth flow during the spike — keeps
          // middleware in dev-mode passthrough so the dial path is reachable.
          WORKSPACE_OWNER_EMAIL: "",
          // Quiet the rest of instrumentation a bit (LLM init etc.) — they're
          // best-effort already.
          NODE_ENV: "development",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await waitForReady(nextProc);
    await pollUntilHttpReady(`http://localhost:${SPIKE_PORT}/api/v1/workspace/session`);
  }, STARTUP_TIMEOUT_MS);

  afterAll(async () => {
    if (nextProc && !nextProc.killed) {
      nextProc.kill("SIGTERM");
      // Give it a beat, then SIGKILL if still alive.
      await new Promise((r) => setTimeout(r, 1500));
      if (!nextProc.killed) nextProc.kill("SIGKILL");
    }
  });

  it("accepts a JWT-authed dial and roundtrips a JSON-RPC ping", async () => {
    const jwt = signBridgeJwt(
      { deviceId: SPIKE_DEVICE_ID, protocolVersion: BRIDGE_PROTOCOL_VERSION },
      SPIKE_SIGNING_KEY,
    );

    const ws = new WebSocket(`ws://localhost:${SPIKE_PORT}${BRIDGE_DIAL_PATH}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    const messages: unknown[] = [];
    const opened = new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    const collect = new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        messages.push(JSON.parse(data.toString("utf8")));
        // Resolve after we have the hello + the ping response.
        if (messages.length >= 2) resolve();
      });
    });

    await opened;

    // Server should push a `bridge.hello` notification on connect.
    // Send a `ping` request and await response.
    ws.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "ping",
        params: { echo: "spike" },
      }),
    );

    await Promise.race([
      collect,
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error("collect timed out")), 5000)),
    ]);

    ws.close();

    expect(messages.length).toBeGreaterThanOrEqual(2);

    const hello = messages.find(
      (m): m is { method: string; params: Record<string, unknown> } =>
        typeof m === "object" &&
        m !== null &&
        (m as { method?: unknown }).method === "bridge.hello",
    );
    expect(hello).toBeDefined();
    expect(hello!.params.deviceId).toBe(SPIKE_DEVICE_ID);
    expect(hello!.params.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);

    const pongResp = messages.find(
      (m): m is { id: number; result: Record<string, unknown> } =>
        typeof m === "object" &&
        m !== null &&
        (m as { id?: unknown }).id === 1 &&
        "result" in (m as object),
    );
    expect(pongResp).toBeDefined();
    expect(pongResp!.result.pong).toBe(true);
    expect(pongResp!.result.deviceId).toBe(SPIKE_DEVICE_ID);
    expect(pongResp!.result.echo).toBe("spike");
  }, 30_000);

  it("rejects a dial without Authorization header", async () => {
    const ws = new WebSocket(`ws://localhost:${SPIKE_PORT}${BRIDGE_DIAL_PATH}`);
    const result = await new Promise<{ kind: "open" } | { kind: "error" } | { kind: "close" }>(
      (resolve) => {
        ws.once("open", () => resolve({ kind: "open" }));
        ws.once("error", () => resolve({ kind: "error" }));
        ws.once("close", () => resolve({ kind: "close" }));
      },
    );
    expect(result.kind).not.toBe("open");
    if (ws.readyState === WebSocket.OPEN) ws.close();
  }, 10_000);

  it("rejects a dial with a wrong-signature JWT", async () => {
    const jwt = signBridgeJwt(
      { deviceId: SPIKE_DEVICE_ID, protocolVersion: BRIDGE_PROTOCOL_VERSION },
      "wrong-signing-key",
    );
    const ws = new WebSocket(`ws://localhost:${SPIKE_PORT}${BRIDGE_DIAL_PATH}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const result = await new Promise<{ kind: "open" } | { kind: "error" } | { kind: "close" }>(
      (resolve) => {
        ws.once("open", () => resolve({ kind: "open" }));
        ws.once("error", () => resolve({ kind: "error" }));
        ws.once("close", () => resolve({ kind: "close" }));
      },
    );
    expect(result.kind).not.toBe("open");
    if (ws.readyState === WebSocket.OPEN) ws.close();
  }, 10_000);
});
