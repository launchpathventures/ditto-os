/**
 * Runner registry — Brief 215 AC #9 unit tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import {
  registerAdapter,
  getAdapter,
  hasAdapter,
  listRegisteredKinds,
  _resetRegistryForTests,
} from "./runner-registry";
import type { RunnerAdapter } from "@ditto/core";

function stubAdapter(kind: RunnerAdapter["kind"]): RunnerAdapter {
  return {
    kind,
    mode: kind === "local-mac-mini" ? "local" : "cloud",
    configSchema: z.object({}),
    supportsCancel: false,
    execute: async () => ({
      externalRunId: null,
      externalUrl: null,
      startedAt: new Date(),
    }),
    status: async () => ({
      status: "queued",
      externalRunId: null,
      externalUrl: null,
      lastUpdatedAt: new Date(),
    }),
    cancel: async () => ({ ok: true }),
    healthCheck: async () => ({ status: "unknown" }),
  };
}

describe("runner registry", () => {
  beforeEach(() => _resetRegistryForTests());

  it("register + get round-trips", () => {
    const a = stubAdapter("local-mac-mini");
    registerAdapter(a);
    expect(getAdapter("local-mac-mini")).toBe(a);
    expect(hasAdapter("local-mac-mini")).toBe(true);
  });

  it("rejects double-registration of the same kind", () => {
    registerAdapter(stubAdapter("local-mac-mini"));
    expect(() => registerAdapter(stubAdapter("local-mac-mini"))).toThrow(
      /already registered/
    );
  });

  it("rejects get() for unregistered kind", () => {
    expect(() => getAdapter("github-action")).toThrow(/No runner adapter/);
  });

  it("listRegisteredKinds returns all registered kinds", () => {
    registerAdapter(stubAdapter("local-mac-mini"));
    registerAdapter(stubAdapter("github-action"));
    const kinds = listRegisteredKinds().sort();
    expect(kinds).toEqual(["github-action", "local-mac-mini"]);
  });
});
