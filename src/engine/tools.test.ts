/**
 * Tests for Agent Tools (Brief 031 + Brief 051)
 *
 * Tests write_file tool security, tool subsets, backward compatibility,
 * and run_command allowlist enforcement, path validation, timeout, output scrubbing.
 */

import { describe, it, expect, afterEach } from "vitest";
import { executeTool, readOnlyTools, readWriteTools, execTools, toolDefinitions, validateCommand, COMMAND_ALLOWLIST } from "./tools";
import fs from "fs";
import path from "path";
import os from "os";

// Use a temp directory as workDir for tests
const testWorkDir = path.join(os.tmpdir(), `ditto-tools-test-${Date.now()}`);

// Setup and teardown
function setup() {
  fs.mkdirSync(testWorkDir, { recursive: true });
}

function teardown() {
  fs.rmSync(testWorkDir, { recursive: true, force: true });
}

describe("tool subsets", () => {
  it("readOnlyTools contains 3 tools", () => {
    expect(readOnlyTools).toHaveLength(3);
    const names = readOnlyTools.map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("search_files");
    expect(names).toContain("list_files");
  });

  it("readWriteTools contains 4 tools", () => {
    expect(readWriteTools).toHaveLength(4);
    const names = readWriteTools.map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("search_files");
    expect(names).toContain("list_files");
    expect(names).toContain("write_file");
  });

  it("toolDefinitions is backward compatible (equals readOnlyTools)", () => {
    expect(toolDefinitions).toEqual(readOnlyTools);
  });
});

describe("write_file tool", () => {
  beforeAll(() => setup());
  afterAll(() => teardown());

  it("writes a file and returns confirmation", () => {
    const result = executeTool("write_file", {
      path: "test-output.txt",
      content: "hello\nworld\n",
    }, testWorkDir);

    expect(result).toContain("Written: test-output.txt");
    expect(result).toContain("3 lines");

    // Verify file was actually written
    const written = fs.readFileSync(path.join(testWorkDir, "test-output.txt"), "utf-8");
    expect(written).toBe("hello\nworld\n");
  });

  it("creates parent directories when needed", () => {
    const result = executeTool("write_file", {
      path: "nested/dir/file.txt",
      content: "nested content",
    }, testWorkDir);

    expect(result).toContain("Written: nested/dir/file.txt");
    const written = fs.readFileSync(path.join(testWorkDir, "nested/dir/file.txt"), "utf-8");
    expect(written).toBe("nested content");
  });

  it("rejects writes to secret files", () => {
    const result = executeTool("write_file", {
      path: ".env",
      content: "SECRET=bad",
    }, testWorkDir);

    expect(result).toContain("restricted");
    expect(fs.existsSync(path.join(testWorkDir, ".env"))).toBe(false);
  });

  it("rejects writes to credential files", () => {
    const result = executeTool("write_file", {
      path: "credentials.json",
      content: "{}",
    }, testWorkDir);

    expect(result).toContain("restricted");
  });

  it("rejects writes to key files", () => {
    const result = executeTool("write_file", {
      path: "server.key",
      content: "key data",
    }, testWorkDir);

    expect(result).toContain("restricted");
  });

  it("rejects path traversal", () => {
    const result = executeTool("write_file", {
      path: "../../../etc/passwd",
      content: "bad",
    }, testWorkDir);

    expect(result).toContain("Path traversal rejected");
  });

  it("rejects writes outside workDir via absolute path", () => {
    const result = executeTool("write_file", {
      path: "/tmp/outside.txt",
      content: "bad",
    }, testWorkDir);

    expect(result).toContain("Path traversal rejected");
  });

  it("requires path parameter", () => {
    const result = executeTool("write_file", {
      content: "content",
    }, testWorkDir);

    expect(result).toContain("'path' parameter is required");
  });

  it("requires content parameter", () => {
    const result = executeTool("write_file", {
      path: "test.txt",
    }, testWorkDir);

    expect(result).toContain("'content' parameter is required");
  });
});

// Import beforeAll/afterAll
import { beforeAll, afterAll } from "vitest";

// ============================================================
// Brief 051: run_command tests
// ============================================================

describe("tool subsets — execTools", () => {
  it("execTools contains 5 tools (read-write + run_command)", () => {
    expect(execTools).toHaveLength(5);
    const names = execTools.map((t) => t.name);
    expect(names).toContain("read_file");
    expect(names).toContain("search_files");
    expect(names).toContain("list_files");
    expect(names).toContain("write_file");
    expect(names).toContain("run_command");
  });

  it("readOnlyTools and readWriteTools are unchanged", () => {
    expect(readOnlyTools).toHaveLength(3);
    expect(readWriteTools).toHaveLength(4);
  });
});

describe("validateCommand — allowlist enforcement", () => {
  // Positive cases: allowed commands
  it("allows pnpm run", () => {
    expect(validateCommand("pnpm", ["run", "type-check"])).toBeNull();
  });

  it("allows pnpm test", () => {
    expect(validateCommand("pnpm", ["test"])).toBeNull();
  });

  it("denies pnpm exec", () => {
    const error = validateCommand("pnpm", ["exec", "tsc", "--noEmit"]);
    expect(error).toContain("not in the allowlist");
  });

  it("allows pnpm install --frozen-lockfile", () => {
    expect(validateCommand("pnpm", ["install", "--frozen-lockfile"])).toBeNull();
  });

  it("allows npm run", () => {
    expect(validateCommand("npm", ["run", "build"])).toBeNull();
  });

  it("allows npm test", () => {
    expect(validateCommand("npm", ["test"])).toBeNull();
  });

  it("allows git status", () => {
    expect(validateCommand("git", ["status"])).toBeNull();
  });

  it("allows git log", () => {
    expect(validateCommand("git", ["log", "--oneline", "-10"])).toBeNull();
  });

  it("allows git diff", () => {
    expect(validateCommand("git", ["diff"])).toBeNull();
  });

  it("allows git show", () => {
    expect(validateCommand("git", ["show", "HEAD"])).toBeNull();
  });

  it("allows git branch", () => {
    expect(validateCommand("git", ["branch"])).toBeNull();
  });

  it("allows git ls-files", () => {
    expect(validateCommand("git", ["ls-files"])).toBeNull();
  });

  it("allows git rev-parse", () => {
    expect(validateCommand("git", ["rev-parse", "HEAD"])).toBeNull();
  });

  it("allows node with .js file", () => {
    expect(validateCommand("node", ["script.js"])).toBeNull();
  });

  it("allows node with .ts file", () => {
    expect(validateCommand("node", ["src/test.ts"])).toBeNull();
  });

  it("allows node with .mjs file", () => {
    expect(validateCommand("node", ["module.mjs"])).toBeNull();
  });

  it("allows node with .cjs file", () => {
    expect(validateCommand("node", ["module.cjs"])).toBeNull();
  });

  // Negative cases: denied commands
  it("denies npx entirely", () => {
    const error = validateCommand("npx", ["vitest"]);
    expect(error).toContain("blocked entirely");
  });

  it("denies npm exec", () => {
    const error = validateCommand("npm", ["exec", "vitest"]);
    expect(error).toContain("not allowed");
  });

  it("denies npm install", () => {
    const error = validateCommand("npm", ["install", "lodash"]);
    expect(error).toContain("not allowed");
  });

  it("denies pnpm publish", () => {
    const error = validateCommand("pnpm", ["publish"]);
    expect(error).toContain("denied");
  });

  it("denies pnpm link", () => {
    const error = validateCommand("pnpm", ["link"]);
    expect(error).toContain("denied");
  });

  it("denies pnpm install without --frozen-lockfile", () => {
    const error = validateCommand("pnpm", ["install"]);
    expect(error).toContain("--frozen-lockfile");
  });

  it("denies git push", () => {
    const error = validateCommand("git", ["push"]);
    expect(error).toContain("not allowed");
  });

  it("denies git reset", () => {
    const error = validateCommand("git", ["reset", "--hard"]);
    expect(error).toContain("not allowed");
  });

  it("denies git checkout", () => {
    const error = validateCommand("git", ["checkout", "main"]);
    expect(error).toContain("not allowed");
  });

  it("denies git clean", () => {
    const error = validateCommand("git", ["clean", "-fd"]);
    expect(error).toContain("not allowed");
  });

  it("denies git merge", () => {
    const error = validateCommand("git", ["merge", "feature"]);
    expect(error).toContain("not allowed");
  });

  it("denies git rebase", () => {
    const error = validateCommand("git", ["rebase", "main"]);
    expect(error).toContain("not allowed");
  });

  it("denies node -e", () => {
    const error = validateCommand("node", ["-e", "console.log('bad')"]);
    expect(error).toContain("eval/print flags are blocked");
  });

  it("denies node --eval", () => {
    const error = validateCommand("node", ["--eval", "process.exit(1)"]);
    expect(error).toContain("eval/print flags are blocked");
  });

  it("denies node -p", () => {
    const error = validateCommand("node", ["-p", "'hello'"]);
    expect(error).toContain("eval/print flags are blocked");
  });

  it("denies node --print", () => {
    const error = validateCommand("node", ["--print", "'hello'"]);
    expect(error).toContain("eval/print flags are blocked");
  });

  it("denies node --input-type", () => {
    const error = validateCommand("node", ["--input-type=module", "script.js"]);
    expect(error).toContain("eval/print flags are blocked");
  });

  it("denies node --require", () => {
    const error = validateCommand("node", ["script.js", "--require", "./malicious.js"]);
    expect(error).toContain("eval/print flags are blocked");
  });

  it("denies node -r", () => {
    const error = validateCommand("node", ["script.js", "-r", "./malicious.js"]);
    expect(error).toContain("eval/print flags are blocked");
  });

  it("denies node --import", () => {
    const error = validateCommand("node", ["script.js", "--import", "./malicious.js"]);
    expect(error).toContain("eval/print flags are blocked");
  });

  it("denies node without a file path", () => {
    const error = validateCommand("node", []);
    expect(error).toContain("requires a file path");
  });

  it("denies node with non-js file", () => {
    const error = validateCommand("node", ["script.py"]);
    expect(error).toContain("requires a file path");
  });

  it("denies unknown executables (rm, curl, ssh, etc.)", () => {
    for (const cmd of ["rm", "curl", "ssh", "mv", "cp", "wget", "cat"]) {
      const error = validateCommand(cmd, ["something"]);
      expect(error).toContain("not in the allowlist");
    }
  });

  it("denies executable without subcommand (except node)", () => {
    const error = validateCommand("pnpm", []);
    expect(error).toContain("requires a subcommand");
  });
});

describe("run_command execution", () => {
  // Use process.cwd() as workDir since executeCommand validates against project root
  const projectDir = process.cwd();

  it("denies node without file extension (allowlist level)", async () => {
    const result = await executeTool("run_command", {
      executable: "node",
      args: ["--version"],
    });
    expect(result).toContain("requires a file path");
  });

  it("executes git rev-parse in project directory", async () => {
    const result = await executeTool("run_command", {
      executable: "git",
      args: ["rev-parse", "--is-inside-work-tree"],
    }, projectDir);
    expect(result).toContain("true");
    expect(result).toContain("Exit code: 0");
  });

  it("returns error for disallowed executable", async () => {
    const result = await executeTool("run_command", {
      executable: "rm",
      args: ["-rf", "/"],
    }, projectDir);
    expect(result).toContain("not in the allowlist");
  });

  it("returns error for missing executable param", async () => {
    const result = await executeTool("run_command", {
      args: ["test"],
    }, projectDir);
    expect(result).toContain("'executable' parameter is required");
  });

  it("scrubs secret file references from output", async () => {
    // Create a temp script inside the project dir
    const testDir = path.join(projectDir, ".test-tmp-cmd");
    fs.mkdirSync(testDir, { recursive: true });
    const scriptPath = path.join(testDir, "test-scrub.js");
    fs.writeFileSync(scriptPath, `console.log("Loading .env file"); console.log("Reading credentials.json");`);

    try {
      const result = await executeTool("run_command", {
        executable: "node",
        args: [scriptPath],
      }, projectDir);

      expect(result).toContain("[REDACTED]");
      // .env should be scrubbed but the word "Loading" stays
      expect(result).not.toContain("credentials.json");
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("handles command timeout", async () => {
    const testDir = path.join(projectDir, ".test-tmp-cmd");
    fs.mkdirSync(testDir, { recursive: true });
    const scriptPath = path.join(testDir, "slow.js");
    fs.writeFileSync(scriptPath, `setTimeout(() => {}, 60000);`);

    try {
      const result = await executeTool("run_command", {
        executable: "node",
        args: [scriptPath],
        timeout: 1, // 1 second timeout
      }, projectDir);

      expect(result).toContain("timed out");
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("handles non-zero exit codes", async () => {
    const testDir = path.join(projectDir, ".test-tmp-cmd");
    fs.mkdirSync(testDir, { recursive: true });
    const scriptPath = path.join(testDir, "fail.js");
    fs.writeFileSync(scriptPath, `process.exit(42);`);

    try {
      const result = await executeTool("run_command", {
        executable: "node",
        args: [scriptPath],
      }, projectDir);

      expect(result).toContain("Exit code: 42");
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
