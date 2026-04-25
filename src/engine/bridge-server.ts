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
      handleBridgeConnection(ws, payload);
    });
  });

  console.log(`[bridge] WebSocket server attached at ${BRIDGE_DIAL_PATH}`);
}

function handleBridgeConnection(ws: WebSocket, payload: JwtPayload): void {
  ws.on("message", (data) => {
    const text = data.toString("utf8");
    const parsed = jsonrpc.parse(text);
    const single = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!single || single.type !== "request") return;

    const req = single.payload;
    if (req.method === "ping") {
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

    ws.send(
      JSON.stringify(
        jsonrpc.error(req.id, jsonrpc.JsonRpcError.methodNotFound(req.method)),
      ),
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
}
