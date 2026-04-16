/**
 * CLI Protocol Handler Tests
 *
 * Tests: success, failure with retry, timeout, credential scrubbing,
 * and Brief 170 shell-safety (injection payloads cannot cross argv boundaries).
 * Uses the injectable execAsync.fn to avoid mocking promisify(execFile).
 */

import { describe, it, expect, afterEach } from "vitest";
import { executeCli, resolveAuth, execAsync } from "./cli";
import type { CliInterface } from "../integration-registry";

const testCliInterface: CliInterface = {
  command: "gh",
  auth: "cli_login",
  env_vars: ["GH_TOKEN"],
};

const originalFn = execAsync.fn;

afterEach(() => {
  execAsync.fn = originalFn;
});

describe("cli-handler", () => {
  describe("executeCli (argv form — Brief 170)", () => {
    it("executes a CLI command and returns JSON output", async () => {
      let capturedFile = "";
      let capturedArgs: string[] = [];
      execAsync.fn = async (file, args) => {
        capturedFile = file;
        capturedArgs = args;
        return {
          stdout: '{"number":1,"title":"Test Issue"}',
          stderr: "",
        };
      };

      const result = await executeCli({
        service: "github",
        executable: "gh",
        args: ["issue", "list", "--json", "number,title"],
        cliInterface: testCliInterface,
      });

      expect(capturedFile).toBe("gh");
      expect(capturedArgs).toEqual(["issue", "list", "--json", "number,title"]);
      expect(result.confidence).toBe("high");
      expect(result.outputs.result).toEqual({ number: 1, title: "Test Issue" });
      expect(result.outputs.service).toBe("github");
      expect(result.outputs.protocol).toBe("cli");
      expect(result.logs).toBeDefined();
      expect(result.logs!.some((l) => l.startsWith("$"))).toBe(true);
    });

    it("injection payload stays inside a single argv entry — NO shell execution", async () => {
      let capturedArgs: string[] = [];
      execAsync.fn = async (_file, args) => {
        capturedArgs = args;
        return { stdout: "", stderr: "" };
      };

      const malicious = "; rm -rf /; echo pwned";
      await executeCli({
        service: "github",
        executable: "gh",
        args: ["issue", "create", "--title", malicious],
        cliInterface: testCliInterface,
      });

      // The malicious string must arrive at execFile as ONE arg, not split.
      expect(capturedArgs).toEqual(["issue", "create", "--title", malicious]);
      // Exactly that arg — not `rm`, `-rf`, `/`, `echo`, etc.
      expect(capturedArgs).not.toContain("rm");
      expect(capturedArgs).not.toContain("-rf");
      expect(capturedArgs).not.toContain("/");
      expect(capturedArgs).not.toContain("echo");
    });

    it("tokenises a raw command string defensively (back-compat path)", async () => {
      let capturedFile = "";
      let capturedArgs: string[] = [];
      execAsync.fn = async (file, args) => {
        capturedFile = file;
        capturedArgs = args;
        return { stdout: '{"ok":true}', stderr: "" };
      };

      const result = await executeCli({
        service: "github",
        command: "gh issue list --json number,title",
        cliInterface: testCliInterface,
      });

      expect(capturedFile).toBe("gh");
      expect(capturedArgs).toEqual(["issue", "list", "--json", "number,title"]);
      expect(result.confidence).toBe("high");
    });

    it("returns raw string when output is not JSON", async () => {
      execAsync.fn = async () => ({
        stdout: "plain text output\n",
        stderr: "",
      });

      const result = await executeCli({
        service: "github",
        executable: "gh",
        args: ["issue", "view", "1"],
        cliInterface: testCliInterface,
      });

      expect(result.confidence).toBe("high");
      expect(result.outputs.result).toBe("plain text output");
    });

    it("retries on failure and returns low confidence after exhaustion", async () => {
      execAsync.fn = async () => {
        throw Object.assign(new Error("connection error"), {
          code: 1,
          stderr: "connection error",
          stdout: "",
          killed: false,
        });
      };

      const result = await executeCli({
        service: "github",
        executable: "gh",
        args: ["issue", "list"],
        cliInterface: testCliInterface,
      });

      expect(result.confidence).toBe("low");
      expect(result.outputs.error).toBeDefined();
      const commandLogs = result.logs!.filter((l) => l.startsWith("$"));
      expect(commandLogs).toHaveLength(3);
    }, 15000);

    it("does not retry on timeout (killed)", async () => {
      execAsync.fn = async () => {
        throw Object.assign(new Error("timeout"), {
          code: null,
          stderr: "",
          stdout: "",
          killed: true,
        });
      };

      const result = await executeCli({
        service: "github",
        executable: "gh",
        args: ["issue", "list"],
        cliInterface: testCliInterface,
      });

      expect(result.confidence).toBe("low");
      expect(result.logs!.some((l) => l.includes("TIMEOUT"))).toBe(true);
      const commandLogs = result.logs!.filter((l) => l.startsWith("$"));
      expect(commandLogs).toHaveLength(1);
    });

    it("throws when neither argv nor command is provided", async () => {
      await expect(
        executeCli({
          service: "github",
          cliInterface: testCliInterface,
        }),
      ).rejects.toThrow(/executeCli requires/);
    });
  });

  describe("resolveAuth", () => {
    it("reads env vars when available", async () => {
      const original = process.env.GH_TOKEN;
      process.env.GH_TOKEN = "test-token-123";

      try {
        const env = await resolveAuth("github", testCliInterface);
        expect(env.GH_TOKEN).toBe("test-token-123");
      } finally {
        if (original !== undefined) {
          process.env.GH_TOKEN = original;
        } else {
          delete process.env.GH_TOKEN;
        }
      }
    });

    it("returns empty object when env vars not set", async () => {
      const original = process.env.GH_TOKEN;
      delete process.env.GH_TOKEN;

      try {
        const env = await resolveAuth("github", testCliInterface);
        expect(env).toEqual({});
      } finally {
        if (original !== undefined) {
          process.env.GH_TOKEN = original;
        }
      }
    });
  });
});
