import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { readState, writeState, clearState, statePath } from "./state.js";

const ORIGINAL_HOME = os.homedir();

describe("daemon state persistence", () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "ditto-bridge-test-"));
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
  });

  afterEach(async () => {
    process.env.HOME = ORIGINAL_HOME;
    process.env.USERPROFILE = ORIGINAL_HOME;
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it("writeState persists with mode 0o600 (AC #5)", async () => {
    await writeState({
      deviceId: "test-1",
      jwt: "fake.jwt.value",
      dialUrl: "ws://example.com/dial",
      protocolVersion: "1.0.0",
      pairedAt: new Date().toISOString(),
    });
    const stat = await fs.stat(statePath());
    // mask off the file-type bits; only check the permission bits
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("readState round-trips writeState contents", async () => {
    const orig = {
      deviceId: "test-2",
      jwt: "x.y.z",
      dialUrl: "wss://example.com/dial",
      protocolVersion: "1.0.0",
      pairedAt: "2026-01-01T00:00:00.000Z",
    };
    await writeState(orig);
    const back = await readState();
    expect(back).toEqual(orig);
  });

  it("readState returns null when no state file exists", async () => {
    expect(await readState()).toBeNull();
  });

  it("clearState removes the file and is idempotent", async () => {
    await writeState({
      deviceId: "test-3",
      jwt: "x.y.z",
      dialUrl: "ws://example.com",
      protocolVersion: "1.0.0",
      pairedAt: new Date().toISOString(),
    });
    await clearState();
    expect(await readState()).toBeNull();
    // second call doesn't throw
    await clearState();
  });
});
