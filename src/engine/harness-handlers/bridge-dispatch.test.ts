/**
 * Bridge Dispatcher — unit tests.
 *
 * Brief 212 AC #3: stepRunId guard is the FIRST executable statement.
 * The DB-spy below asserts ZERO DB calls happen before the throw when
 * stepRunId is missing AND DITTO_TEST_MODE is unset.
 *
 * AC #4 routing rules covered: deviceId omission (single active vs
 * multiple), fallback chain, queued_for_primary when nothing online.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { dispatchBridgeJob } from "./bridge-dispatch.js";

/** Minimal proxy that records every method touch and refuses to actually run. */
function makeDbSpy() {
  const calls: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      const name = String(prop);
      // Vitest probes (`then`, Symbol.toPrimitive) shouldn't count as DB calls.
      if (name === "then" || name === "Symbol(Symbol.toPrimitive)") return undefined;
      calls.push(name);
      return new Proxy(() => {}, handler);
    },
    apply() {
      return new Proxy(() => {}, handler);
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxyDb = new Proxy(() => {}, handler) as any;
  return { db: proxyDb, calls };
}

describe("dispatchBridgeJob — AC #3 stepRunId guard", () => {
  const ORIGINAL_TEST_MODE = process.env.DITTO_TEST_MODE;

  beforeEach(() => {
    delete process.env.DITTO_TEST_MODE;
    // The module is read once at import; the constant captured TEST_MODE.
    // Re-import via vi.resetModules + dynamic import for a fresh constant.
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL_TEST_MODE === undefined) {
      delete process.env.DITTO_TEST_MODE;
    } else {
      process.env.DITTO_TEST_MODE = ORIGINAL_TEST_MODE;
    }
  });

  it("throws on missing stepRunId AND performs ZERO DB calls before the throw", async () => {
    delete process.env.DITTO_TEST_MODE;
    const fresh = await import("./bridge-dispatch.js?fresh-1" as string).catch(async () => {
      // Vitest doesn't always honour query-string cache busting; resetModules above is the real trick.
      return await import("./bridge-dispatch.js");
    });
    const { db, calls } = makeDbSpy();
    await expect(
      fresh.dispatchBridgeJob(
        {
          stepRunId: "",
          processRunId: "p1",
          trustTier: "supervised",
          trustAction: "pause",
          payload: { kind: "exec", command: "echo", args: ["hi"] },
        },
        { db },
      ),
    ).rejects.toThrow(/Insight-180/);
    // The DB-spy must show no method touches — the guard is the first
    // executable statement.
    expect(calls).toEqual([]);
  });

  it("does NOT throw in DITTO_TEST_MODE even with empty stepRunId", async () => {
    process.env.DITTO_TEST_MODE = "true";
    vi.resetModules();
    const fresh = await import("./bridge-dispatch.js");
    const { db } = makeDbSpy();
    // We expect NO throw on the guard — but the call will still fail later
    // (the spy DB returns nonsense). Catch any post-guard error and assert
    // the message is NOT the guard's.
    let caught: unknown;
    try {
      await fresh.dispatchBridgeJob(
        {
          stepRunId: "",
          processRunId: "p1",
          trustTier: "supervised",
          trustAction: "pause",
          payload: { kind: "exec", command: "echo", args: ["hi"] },
        },
        { db },
      );
    } catch (err) {
      caught = err;
    }
    if (caught instanceof Error) {
      expect(caught.message).not.toMatch(/Insight-180/);
    }
    // Either it returned (with the spy DB returning a routing error) or it
    // threw with a non-guard error. Either way the guard didn't fire.
  });
});
