import { describe, it, expect } from "vitest";
import { composeBridgeArgs } from "./bridge-cli.js";

describe("bridge-cli adapter — composeBridgeArgs (Brief 212 --bare invariant)", () => {
  it("auto-injects --bare for the `claude` binary", () => {
    expect(composeBridgeArgs("claude", ["-p", "say hi"])).toEqual([
      "--bare",
      "-p",
      "say hi",
    ]);
  });

  it("does not double-add --bare if already present", () => {
    expect(composeBridgeArgs("claude", ["--bare", "-p", "x"])).toEqual([
      "--bare",
      "-p",
      "x",
    ]);
  });

  it("passes through other CLIs without injection", () => {
    expect(composeBridgeArgs("codex", ["-p", "x"])).toEqual(["-p", "x"]);
    expect(composeBridgeArgs("python", ["-c", "print(1)"])).toEqual(["-c", "print(1)"]);
  });
});
