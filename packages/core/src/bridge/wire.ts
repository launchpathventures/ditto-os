/**
 * Bridge wire — JSON-RPC 2.0 envelope helpers + method-name constants.
 *
 * Framework-agnostic; no DB, no Express, no Ditto opinions. Both the cloud
 * dispatcher and the daemon import this. The actual JSON-RPC parser is
 * `jsonrpc-lite` on the consuming side — these helpers shape outbound
 * frames so producers don't reinvent the envelope.
 *
 * Brief 212 §What Changes line for `packages/core/src/bridge/wire.ts`.
 */

/** Method names dispatched cloud → daemon. */
export const BRIDGE_METHODS = {
  /** Run a subprocess. Discriminated payload shape; see types.ts. */
  exec: "exec",
  /** Send keys to a tmux session. */
  tmuxSend: "tmux.send",
  /** Cancel an in-flight job. */
  cancel: "cancel",
} as const;
export type BridgeMethod = (typeof BRIDGE_METHODS)[keyof typeof BRIDGE_METHODS];

/** Notification names emitted daemon → cloud (or cloud → daemon). */
export const BRIDGE_NOTIFICATIONS = {
  /** Server-pushed greeting on a successful upgrade. */
  hello: "bridge.hello",
  /** Streamed stdout/stderr chunks. */
  execStream: "exec.stream",
  /** Final exec frame with exit code + byte counts. */
  execResult: "exec.result",
  /** Heartbeat from the daemon. */
  pong: "pong",
  /** Cloud → daemon liveness probe. */
  ping: "ping",
} as const;
export type BridgeNotification = (typeof BRIDGE_NOTIFICATIONS)[keyof typeof BRIDGE_NOTIFICATIONS];

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: P;
}

export interface JsonRpcNotification<P = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: P;
}

export interface JsonRpcSuccess<R = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result: R;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcFrame =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccess
  | JsonRpcError;

export function request<P>(id: number | string, method: string, params?: P): JsonRpcRequest<P> {
  return params === undefined
    ? { jsonrpc: "2.0", id, method }
    : { jsonrpc: "2.0", id, method, params };
}

export function notification<P>(method: string, params?: P): JsonRpcNotification<P> {
  return params === undefined
    ? { jsonrpc: "2.0", method }
    : { jsonrpc: "2.0", method, params };
}

export function success<R>(id: number | string, result: R): JsonRpcSuccess<R> {
  return { jsonrpc: "2.0", id, result };
}

export function errorResponse(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return data === undefined
    ? { jsonrpc: "2.0", id, error: { code, message } }
    : { jsonrpc: "2.0", id, error: { code, message, data } };
}

export function isRequest(frame: unknown): frame is JsonRpcRequest {
  return (
    typeof frame === "object" &&
    frame !== null &&
    (frame as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    typeof (frame as { method?: unknown }).method === "string" &&
    "id" in (frame as object)
  );
}

export function isNotification(frame: unknown): frame is JsonRpcNotification {
  return (
    typeof frame === "object" &&
    frame !== null &&
    (frame as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    typeof (frame as { method?: unknown }).method === "string" &&
    !("id" in (frame as object))
  );
}

export function isSuccess(frame: unknown): frame is JsonRpcSuccess {
  return (
    typeof frame === "object" &&
    frame !== null &&
    (frame as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    "result" in (frame as object) &&
    "id" in (frame as object)
  );
}

export function isError(frame: unknown): frame is JsonRpcError {
  return (
    typeof frame === "object" &&
    frame !== null &&
    (frame as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    "error" in (frame as object)
  );
}
