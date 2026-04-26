/**
 * Ditto — Bridge WebSocket Server (Brief 212 spike)
 *
 * Attaches a `ws.Server` to the Next.js underlying HTTP server so that
 * cloud-hosted Ditto can accept outbound dials from `ditto-bridge` daemons
 * running on user laptops.
 *
 * Spike scope (AC #1): minimal upgrade-handler that validates a Bearer JWT
 * (HS256, signed with BRIDGE_JWT_SIGNING_KEY), accepts the connection, and
 * answers a single JSON-RPC `ping` request with `{ pong: true, deviceId }`.
 *
 * Full implementation (later ACs) adds: device registration in
 * `bridge_devices`, queue persistence, JSON-RPC method tables, heartbeat,
 * orphan detection, etc.
 */
import type { Server as HttpServer, IncomingMessage } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import { WebSocketServer, type WebSocket } from "ws";
import * as jsonrpc from "jsonrpc-lite";
import { and, eq, inArray, lt, asc } from "drizzle-orm";
import type { BridgePayload } from "@ditto/core";

/** Path the daemon dials. Brief 212 §Constraints — path-based topology. */
export const BRIDGE_DIAL_PATH = "/api/v1/bridge/_dial";

/** Current wire-protocol version. Major mismatches reject HTTP 426. */
export const BRIDGE_PROTOCOL_VERSION = "1.0.0";

interface JwtPayload {
  deviceId: string;
  workspaceId?: string;
  protocolVersion: string;
  iat?: number;
}

function base64UrlDecode(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Sign an HS256 JWT. Test + cloud-side use this to mint device tokens. */
export function signBridgeJwt(payload: Omit<JwtPayload, "iat">, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const fullPayload: JwtPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const encHeader = base64UrlEncode(Buffer.from(JSON.stringify(header)));
  const encPayload = base64UrlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const sig = createHmac("sha256", secret).update(`${encHeader}.${encPayload}`).digest();
  return `${encHeader}.${encPayload}.${base64UrlEncode(sig)}`;
}

function verifyBridgeJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSig] = parts;
  const expected = createHmac("sha256", secret).update(`${encHeader}.${encPayload}`).digest();
  const actual = base64UrlDecode(encSig);
  if (expected.length !== actual.length) return null;
  if (!timingSafeEqual(expected, actual)) return null;
  try {
    return JSON.parse(base64UrlDecode(encPayload).toString("utf8")) as JwtPayload;
  } catch {
    return null;
  }
}

function getMajorVersion(v: string): number {
  return Number.parseInt(v.split(".")[0] ?? "0", 10);
}

let attached = false;

/**
 * In-memory map of currently-connected devices. Populated when a daemon
 * dials in successfully (after JWT validation), removed on socket close
 * or revocation. The dispatcher consults this for the `online` check
 * before queueing-vs-sending decisions.
 */
const connectedDevices = new Map<string, import("ws").WebSocket>();

/** Returns true if the device's WebSocket is currently connected. */
export function isDeviceConnected(deviceId: string): boolean {
  return connectedDevices.has(deviceId);
}

/**
 * Close a device's WebSocket immediately (revocation flow). Idempotent —
 * no-op if the device isn't connected. Closes with code 4001 reason
 * "device_revoked" so the daemon logs cleanly and exits with a meaningful
 * status.
 */
export function revokeDeviceConnection(deviceId: string, reason: string): void {
  const ws = connectedDevices.get(deviceId);
  if (!ws) return;
  try {
    ws.close(4001, `device_revoked:${reason}`);
  } catch {
    // best-effort
  }
  connectedDevices.delete(deviceId);
}

/** Test/admin helper — current connection map size. */
export function connectedDeviceCount(): number {
  return connectedDevices.size;
}

/** 60s heartbeat ping cadence — matches actions/runner's renewjob pattern. */
const HEARTBEAT_INTERVAL_MS = 60_000;
/** 10 min staleness window — running jobs whose lastHeartbeatAt is older transition to orphaned. */
const ORPHAN_STALENESS_MS = 10 * 60 * 1000;
/** How often the staleness sweeper runs. */
const SWEEPER_INTERVAL_MS = 60_000;

/**
 * Send a JSON-RPC `exec` (or `tmux.send`) request to a connected daemon.
 * Returns true when the frame was queued to the socket; false when the
 * device isn't connected (caller leaves the job in `queued` and retries
 * on reconnect via drainQueueForDevice).
 */
export async function sendBridgeFrame(
  jobId: string,
  deviceId: string,
  payload: BridgePayload,
): Promise<boolean> {
  const ws = connectedDevices.get(deviceId);
  if (!ws || ws.readyState !== ws.OPEN) return false;
  ws.send(
    JSON.stringify(
      jsonrpc.request(jobId, payload.kind, payload as unknown as Record<string, unknown>),
    ),
  );
  return true;
}

/**
 * Drain queued jobs for a freshly-connected device. Reads `bridge_jobs` rows
 * in `queued` for this deviceId in queuedAt order, sends them via the
 * WebSocket, transitions to `dispatched`. AC #8a — queue persistence.
 */
export async function drainQueueForDevice(deviceId: string): Promise<number> {
  const { db } = await import("../db");
  const { bridgeJobs } = await import("../db/schema");
  const queued = await db
    .select()
    .from(bridgeJobs)
    .where(and(eq(bridgeJobs.deviceId, deviceId), eq(bridgeJobs.state, "queued")))
    .orderBy(asc(bridgeJobs.queuedAt));

  let sent = 0;
  for (const row of queued) {
    const payload = row.payload as unknown as BridgePayload;
    const ok = await sendBridgeFrame(row.id, deviceId, payload);
    if (!ok) break; // socket closed mid-drain; remaining stay queued
    await db
      .update(bridgeJobs)
      .set({ state: "dispatched", dispatchedAt: new Date() })
      .where(eq(bridgeJobs.id, row.id));
    sent++;
  }
  return sent;
}

/**
 * Cloud-side staleness sweeper. Scans for `running` jobs whose
 * lastHeartbeatAt has gone stale (> ORPHAN_STALENESS_MS) and transitions
 * them to `orphaned`, writing a `harness_decisions` row with
 * `trustAction="pause"` + `reviewDetails.bridge.orphaned=true` per AC #10.
 */
export async function sweepStaleJobs(now: Date = new Date()): Promise<number> {
  const { db } = await import("../db");
  const { bridgeJobs, bridgeDevices, harnessDecisions } = await import("../db/schema");
  const cutoff = new Date(now.getTime() - ORPHAN_STALENESS_MS);

  const stale = await db
    .select()
    .from(bridgeJobs)
    .where(and(eq(bridgeJobs.state, "running"), lt(bridgeJobs.lastHeartbeatAt, cutoff)));

  for (const row of stale) {
    await db
      .update(bridgeJobs)
      .set({ state: "orphaned", completedAt: now })
      .where(eq(bridgeJobs.id, row.id));

    const deviceRows = await db.select().from(bridgeDevices).where(eq(bridgeDevices.id, row.deviceId));
    const deviceName = deviceRows[0]?.deviceName ?? row.deviceId;
    await db.insert(harnessDecisions).values({
      processRunId: row.processRunId,
      stepRunId: row.stepRunId,
      trustTier: "supervised",
      trustAction: "pause",
      reviewPattern: ["bridge_dispatch", "bridge_orphaned"],
      reviewResult: "flag",
      reviewDetails: {
        bridge: {
          deviceId: row.deviceId,
          deviceName,
          routedAs: row.routedAs,
          kind: row.kind,
          exitCode: null,
          orphaned: true,
          stdoutBytes: row.stdoutBytes,
          stderrBytes: row.stderrBytes,
          truncated: row.truncated,
        },
      },
    });
  }
  return stale.length;
}

let sweeperTimer: NodeJS.Timeout | null = null;

/** Start the periodic staleness sweeper. Idempotent — second call no-op. */
export function startStaleSweeper(): void {
  if (sweeperTimer) return;
  sweeperTimer = setInterval(() => {
    sweepStaleJobs().catch((err) => console.error("[bridge] sweeper error:", err));
  }, SWEEPER_INTERVAL_MS);
  if (typeof sweeperTimer.unref === "function") sweeperTimer.unref();
}

/** Stop the sweeper (test cleanup). */
export function stopStaleSweeper(): void {
  if (sweeperTimer) {
    clearInterval(sweeperTimer);
    sweeperTimer = null;
  }
}


/**
 * Attach the bridge WebSocket server to a running Node HTTP server.
 *
 * Idempotent — a second call is a no-op so module re-evaluation under
 * Next.js HMR (and the multi-pronged discovery in instrumentation.ts)
 * doesn't double-attach. The flag is module-scoped, so a fresh import
 * (different worker, different test) starts clean.
 *
 * Caller is `packages/web/instrumentation.ts`, which uses two strategies
 * to find the HTTP server (see that file for the why and the failure modes):
 *   1. Patch `http.Server.prototype.listen` so future listen() calls attach.
 *   2. Walk `process._getActiveHandles()` for an already-listening Server —
 *      necessary because `next dev` binds before `register()` returns.
 * The brittle path is (2): `_getActiveHandles` is a Node-internal API. If
 * Node ever changes it, the discovery breaks; at that point a more durable
 * hook (Next-exposed server reference, or a custom server) is needed.
 */
export function attachBridgeWebSocketServer(httpServer: HttpServer): void {
  if (attached) return;
  attached = true;

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    if (!req.url || !req.url.startsWith(BRIDGE_DIAL_PATH)) {
      // Not a bridge dial — let other handlers (e.g., Next.js HMR) deal with it.
      return;
    }

    const secret = process.env.BRIDGE_JWT_SIGNING_KEY;
    if (!secret) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    const auth = req.headers["authorization"];
    if (!auth || !auth.startsWith("Bearer ")) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    const token = auth.slice("Bearer ".length).trim();
    const payload = verifyBridgeJwt(token, secret);
    if (!payload) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    if (getMajorVersion(payload.protocolVersion) !== getMajorVersion(BRIDGE_PROTOCOL_VERSION)) {
      socket.write("HTTP/1.1 426 Upgrade Required\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleBridgeConnection(ws, payload, req.socket.remoteAddress).catch((err) =>
        console.error("[bridge] connection handler failed:", err),
      );
    });
  });

  startStaleSweeper();
  console.log(`[bridge] WebSocket server attached at ${BRIDGE_DIAL_PATH}`);
}

async function handleBridgeConnection(ws: WebSocket, payload: JwtPayload, remoteAddress?: string): Promise<void> {
  connectedDevices.set(payload.deviceId, ws);

  // Update lastDialAt + lastIp opportunistically. Best-effort — failure
  // doesn't reject the connection.
  try {
    const { db } = await import("../db");
    const { bridgeDevices } = await import("../db/schema");
    await db
      .update(bridgeDevices)
      .set({ lastDialAt: new Date(), lastIp: remoteAddress ?? null })
      .where(eq(bridgeDevices.id, payload.deviceId));
  } catch (err) {
    console.warn("[bridge] lastDialAt update failed:", err);
  }

  // Heartbeat: send a `ping` notification every 60s. Daemon's `pong` updates
  // bridge_jobs.lastHeartbeatAt for the device's running jobs.
  const heartbeat = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(jsonrpc.notification("ping", { ts: Date.now() })));
  }, HEARTBEAT_INTERVAL_MS);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  ws.on("close", () => {
    clearInterval(heartbeat);
    // Only delete if still pointing at this socket — a reconnect race could
    // already have replaced it.
    if (connectedDevices.get(payload.deviceId) === ws) {
      connectedDevices.delete(payload.deviceId);
    }
  });

  ws.on("message", (data) => {
    void handleFrame(ws, payload, data.toString("utf8")).catch((err) =>
      console.error("[bridge] frame handler error:", err),
    );
  });

  ws.send(
    JSON.stringify(
      jsonrpc.notification("bridge.hello", {
        deviceId: payload.deviceId,
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
      }),
    ),
  );

  // Drain any queued jobs accumulated while the daemon was offline (AC #8a).
  try {
    const drained = await drainQueueForDevice(payload.deviceId);
    if (drained > 0) {
      console.log(`[bridge] drained ${drained} queued job(s) for device ${payload.deviceId}`);
    }
  } catch (err) {
    console.warn("[bridge] drain queue failed:", err);
  }
}

async function handleFrame(ws: WebSocket, payload: JwtPayload, text: string): Promise<void> {
  const parsed = jsonrpc.parse(text);
  const single = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!single) return;

  // Spike-mode `ping` (test-only — daemons don't send ping; this preserves
  // the AC #1 spike test behavior where the test client sends a ping).
  if (single.type === "request" && single.payload.method === "ping") {
    const req = single.payload;
    const params =
      typeof req.params === "object" && req.params !== null && !Array.isArray(req.params)
        ? (req.params as Record<string, unknown>)
        : {};
    ws.send(
      JSON.stringify(
        jsonrpc.success(req.id, {
          pong: true,
          deviceId: payload.deviceId,
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          echo: params.echo ?? null,
        }),
      ),
    );
    return;
  }

  // Daemon-side notifications: pong, exec.stream, exec.result.
  if (single.type === "notification") {
    const note = single.payload;
    const params =
      typeof note.params === "object" && note.params !== null && !Array.isArray(note.params)
        ? (note.params as Record<string, unknown>)
        : {};

    if (note.method === "pong") {
      // Update lastHeartbeatAt on all running jobs for this device.
      const { db } = await import("../db");
      const { bridgeJobs } = await import("../db/schema");
      await db
        .update(bridgeJobs)
        .set({ lastHeartbeatAt: new Date() })
        .where(and(eq(bridgeJobs.deviceId, payload.deviceId), eq(bridgeJobs.state, "running")));
      return;
    }

    if (note.method === "exec.stream") {
      // Append byte counts; first frame transitions dispatched → running.
      const jobId = String(params.jobId ?? "");
      if (!jobId) return;
      const stream = String(params.stream ?? "stdout");
      const data = String(params.data ?? "");
      const bytes = Buffer.byteLength(data, "utf8");

      const { db } = await import("../db");
      const { bridgeJobs } = await import("../db/schema");
      const rows = await db.select().from(bridgeJobs).where(eq(bridgeJobs.id, jobId));
      const row = rows[0];
      if (!row) return;
      const updates: Record<string, unknown> = { lastHeartbeatAt: new Date() };
      if (row.state === "dispatched") {
        updates.state = "running";
      }
      if (stream === "stdout") {
        updates.stdoutBytes = (row.stdoutBytes ?? 0) + bytes;
      } else {
        updates.stderrBytes = (row.stderrBytes ?? 0) + bytes;
      }
      await db.update(bridgeJobs).set(updates).where(eq(bridgeJobs.id, jobId));
      // (Live byte streaming to the human is a follow-on; this ACK keeps
      // counts + heartbeat fresh for AC #8b/#10.)
      return;
    }

    if (note.method === "exec.result") {
      const jobId = String(params.jobId ?? "");
      if (!jobId) return;
      const exitCode = typeof params.exitCode === "number" ? params.exitCode : null;
      const stdoutBytes = Number(params.stdoutBytes ?? 0);
      const stderrBytes = Number(params.stderrBytes ?? 0);
      const truncated = Boolean(params.truncated);
      const terminationSignal = typeof params.terminationSignal === "string" ? params.terminationSignal : null;
      const errorMessage = typeof params.errorMessage === "string" ? params.errorMessage : null;

      const { db } = await import("../db");
      const { bridgeJobs } = await import("../db/schema");
      const newState = errorMessage || (exitCode !== null && exitCode !== 0) ? "failed" : "succeeded";
      await db
        .update(bridgeJobs)
        .set({
          state: newState,
          completedAt: new Date(),
          exitCode,
          stdoutBytes,
          stderrBytes,
          truncated,
          terminationSignal,
          errorMessage,
        })
        .where(and(eq(bridgeJobs.id, jobId), inArray(bridgeJobs.state, ["dispatched", "running"])));
      return;
    }
  }
}
