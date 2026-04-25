import { describe, it, expect } from "vitest";
import {
  request,
  notification,
  success,
  errorResponse,
  isRequest,
  isNotification,
  isSuccess,
  isError,
  BRIDGE_METHODS,
  BRIDGE_NOTIFICATIONS,
} from "./wire.js";

describe("bridge wire helpers", () => {
  it("request omits params when undefined", () => {
    expect(request(1, "ping")).toEqual({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(request("a", "exec", { kind: "exec" })).toEqual({
      jsonrpc: "2.0",
      id: "a",
      method: "exec",
      params: { kind: "exec" },
    });
  });

  it("notification omits params when undefined", () => {
    expect(notification("pong")).toEqual({ jsonrpc: "2.0", method: "pong" });
    expect(notification("exec.stream", { stdout: "hi" })).toEqual({
      jsonrpc: "2.0",
      method: "exec.stream",
      params: { stdout: "hi" },
    });
  });

  it("success and errorResponse shapes", () => {
    expect(success(1, { ok: true })).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
    expect(errorResponse(1, -32601, "method not found")).toEqual({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32601, message: "method not found" },
    });
    expect(errorResponse(null, -32700, "parse error", { detail: "x" })).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "parse error", data: { detail: "x" } },
    });
  });

  it("type guards distinguish request vs notification vs success vs error", () => {
    const req = request(1, "ping");
    const note = notification("pong");
    const ok = success(1, {});
    const err = errorResponse(1, 1, "x");

    expect(isRequest(req)).toBe(true);
    expect(isRequest(note)).toBe(false);
    expect(isRequest(ok)).toBe(false);
    expect(isRequest(err)).toBe(false);

    expect(isNotification(note)).toBe(true);
    expect(isNotification(req)).toBe(false);

    expect(isSuccess(ok)).toBe(true);
    expect(isSuccess(req)).toBe(false);
    expect(isSuccess(err)).toBe(false);

    expect(isError(err)).toBe(true);
    expect(isError(ok)).toBe(false);
  });

  it("guards reject non-objects and non-jsonrpc payloads", () => {
    expect(isRequest(null)).toBe(false);
    expect(isRequest("ping")).toBe(false);
    expect(isRequest({ method: "ping", id: 1 })).toBe(false); // missing jsonrpc
    expect(isNotification({ jsonrpc: "2.0", method: "x", id: 1 })).toBe(false); // has id
  });

  it("method-name constants match the brief", () => {
    expect(BRIDGE_METHODS.exec).toBe("exec");
    expect(BRIDGE_METHODS.tmuxSend).toBe("tmux.send");
    expect(BRIDGE_METHODS.cancel).toBe("cancel");
    expect(BRIDGE_NOTIFICATIONS.hello).toBe("bridge.hello");
    expect(BRIDGE_NOTIFICATIONS.execStream).toBe("exec.stream");
    expect(BRIDGE_NOTIFICATIONS.execResult).toBe("exec.result");
  });
});
