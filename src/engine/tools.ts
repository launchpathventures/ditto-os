/**
 * Ditto — Agent Tools (Codebase Access)
 *
 * Four tools that give AI agents access to the codebase they're working on.
 * Read tools (read_file, search_files, list_files) and write tool (write_file).
 * All tools are scoped to process.cwd() with path traversal prevention.
 *
 * Exported as two subsets:
 * - readOnlyTools: read_file, search_files, list_files
 * - readWriteTools: all four tools including write_file
 *
 * Provenance: Claude Code's own Read, Grep, Glob, Write tool patterns.
 * Integration tools (Brief 025) are resolved separately by the tool-resolver
 * and merged with these codebase tools in the Claude adapter.
 */

import fs from "fs";
import path from "path";
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";
import type { LlmToolDefinition } from "./llm";

const execFileAsync = promisify(execFile);

// ============================================================
// Security: deny-list for secret files
// ============================================================

/** File patterns that must never be exposed to agents. Extensible. */
const SECRET_PATTERNS = [
  ".env",
  ".env.*",
  "*credentials*",
  "*secret*",
  "*.pem",
  "*.key",
  "*token*",
  "id_rsa*",
] as const;

/** Max lines per read_file call to prevent context overflow */
const MAX_READ_LINES = 500;

/** Max tool calls per step execution to prevent runaway loops */
export const MAX_TOOL_CALLS = 25;

/**
 * Check if a filename matches any secret pattern.
 * Patterns support leading * (suffix match) and trailing * (prefix match).
 */
function isSecretFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.startsWith("*") && pattern.endsWith("*")) {
      // Contains match: *credentials* → basename contains "credentials"
      const inner = pattern.slice(1, -1);
      if (basename.includes(inner)) return true;
    } else if (pattern.startsWith("*")) {
      // Suffix match: *.pem → basename ends with ".pem"
      const suffix = pattern.slice(1);
      if (basename.endsWith(suffix)) return true;
    } else if (pattern.endsWith("*")) {
      // Prefix match: id_rsa* → basename starts with "id_rsa"
      const prefix = pattern.slice(0, -1);
      if (basename.startsWith(prefix)) return true;
    } else if (pattern.includes(".*")) {
      // .env.* → basename starts with ".env."
      const prefix = pattern.replace(".*", ".");
      if (basename.startsWith(prefix)) return true;
    } else {
      // Exact match: .env
      if (basename === pattern) return true;
    }
  }
  return false;
}

/**
 * Validate that a resolved path is within the working directory.
 * Checks both resolved path and real path (to prevent symlink escapes).
 */
function validatePath(requestedPath: string, workDir: string): string {
  const resolved = path.resolve(workDir, requestedPath);

  // Check resolved path is within workDir
  if (!resolved.startsWith(workDir + path.sep) && resolved !== workDir) {
    throw new Error(`Path traversal rejected: ${requestedPath}`);
  }

  // Check real path (resolves symlinks) is also within workDir
  if (fs.existsSync(resolved)) {
    const realPath = fs.realpathSync(resolved);
    const realWorkDir = fs.realpathSync(workDir);
    if (
      !realPath.startsWith(realWorkDir + path.sep) &&
      realPath !== realWorkDir
    ) {
      throw new Error(`Symlink traversal rejected: ${requestedPath}`);
    }
  }

  return resolved;
}

// ============================================================
// Tool definitions (Claude API tool format)
// ============================================================

const readFileTool: LlmToolDefinition = {
  name: "read_file",
  description:
    "Read the contents of a file in the project. Returns file contents with line numbers. Use this to understand code structure, read configuration, or examine specific files.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description:
          "File path relative to the project root (e.g., 'src/cli.ts', 'package.json')",
      },
      start_line: {
        type: "number",
        description: "Optional: first line to read (1-based). Defaults to 1.",
      },
      end_line: {
        type: "number",
        description:
          "Optional: last line to read (1-based). Defaults to start_line + 499.",
      },
    },
    required: ["path"],
  },
};

const searchFilesTool: LlmToolDefinition = {
  name: "search_files",
  description:
    "Search file contents using a regex pattern. Returns matching lines with file paths and line numbers. Use this to find function definitions, usages, imports, or any text pattern across the codebase.",
  input_schema: {
    type: "object" as const,
    properties: {
      pattern: {
        type: "string",
        description: "Regex pattern to search for (e.g., 'export function', 'import.*drizzle')",
      },
      path: {
        type: "string",
        description:
          "Optional: subdirectory to search within, relative to project root (e.g., 'src/'). Defaults to project root.",
      },
      glob: {
        type: "string",
        description:
          "Optional: file glob filter (e.g., '*.ts', '*.yaml'). Defaults to all files.",
      },
    },
    required: ["pattern"],
  },
};

const listFilesTool: LlmToolDefinition = {
  name: "list_files",
  description:
    "List files in the project matching a glob pattern. Returns file paths sorted by name. Use this to explore project structure, find files by extension, or discover directory contents.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description:
          "Optional: directory to list, relative to project root (e.g., 'src/engine/'). Defaults to project root.",
      },
      pattern: {
        type: "string",
        description:
          "Optional: glob pattern to filter files (e.g., '*.ts', '**/*.yaml'). Defaults to '*' (all files in directory).",
      },
    },
  },
};

const writeFileTool: LlmToolDefinition = {
  name: "write_file",
  description:
    "Write content to a file. Creates the file if it doesn't exist. Creates parent directories if needed. Use for creating new files or updating existing ones.",
  input_schema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "File path relative to project root",
      },
      content: {
        type: "string",
        description: "The full content to write to the file",
      },
    },
    required: ["path", "content"],
  },
};

// ============================================================
// Shell execution: run_command tool (Brief 051)
// ============================================================

/**
 * Command allowlist: executable → allowed subcommands/flags.
 * Subcommand is args[0]. Null means executable is entirely blocked.
 * Special entries:
 *   - `node`: args[0] must end in .js/.ts/.mjs/.cjs (no -e/--eval/--print/-p/--input-type)
 *   - `pnpm install`: only with --frozen-lockfile
 */
export const COMMAND_ALLOWLIST: Record<string, { allowed: string[]; denied: string[] } | null> = {
  pnpm: {
    allowed: ["run", "test", "install"],
    // exec blocked: runs arbitrary binaries from node_modules/.bin or PATH
    denied: ["publish", "link"],
  },
  npm: {
    allowed: ["run", "test"],
    denied: ["exec", "publish", "link", "install"],
  },
  node: {
    allowed: [], // Special: validated by file extension check
    denied: ["-e", "--eval", "--input-type", "-p", "--print", "-r", "--require", "--import", "--loader", "--experimental-loader"],
  },
  git: {
    allowed: ["status", "log", "diff", "show", "branch", "ls-files", "rev-parse"],
    denied: ["push", "reset", "checkout", "clean", "merge", "rebase"],
  },
  npx: null, // Entirely blocked
};

/** Max output buffer for command execution (10MB) */
const MAX_COMMAND_BUFFER = 10 * 1024 * 1024;

/** Default command timeout (120 seconds) */
const DEFAULT_COMMAND_TIMEOUT = 120_000;

/**
 * Validate an executable + args against the command allowlist.
 * Returns null if allowed, error string if denied.
 */
export function validateCommand(executable: string, args: string[]): string | null {
  const entry = COMMAND_ALLOWLIST[executable];

  // Executable not in allowlist at all
  if (entry === undefined) {
    return `Command not allowed: '${executable}' is not in the allowlist. Allowed: ${Object.keys(COMMAND_ALLOWLIST).filter(k => COMMAND_ALLOWLIST[k] !== null).join(", ")}`;
  }

  // Executable entirely blocked (e.g., npx)
  if (entry === null) {
    return `Command not allowed: '${executable}' is blocked entirely`;
  }

  const subcommand = args[0];

  // Special case: node — first arg must be a file path, no eval flags
  if (executable === "node") {
    for (const flag of args) {
      // Check exact match and prefix match (e.g., --input-type=module matches --input-type)
      const isDenied = entry.denied.some(d => flag === d || flag.startsWith(d + "="));
      if (isDenied) {
        return `Command not allowed: 'node ${flag}' — eval/print flags are blocked`;
      }
    }
    if (!subcommand || !/\.(js|ts|mjs|cjs)$/.test(subcommand)) {
      return `Command not allowed: 'node' requires a file path as first argument (must end in .js, .ts, .mjs, or .cjs)`;
    }
    return null;
  }

  // Check subcommand is present
  if (!subcommand) {
    return `Command not allowed: '${executable}' requires a subcommand. Allowed: ${entry.allowed.join(", ")}`;
  }

  // Check denied first (takes precedence)
  if (entry.denied.includes(subcommand)) {
    return `Command not allowed: '${executable} ${subcommand}' is denied`;
  }

  // Check allowed
  if (!entry.allowed.includes(subcommand)) {
    return `Command not allowed: '${executable} ${subcommand}' is not in the allowlist. Allowed: ${entry.allowed.join(", ")}`;
  }

  // Special case: pnpm install requires --frozen-lockfile
  if (executable === "pnpm" && subcommand === "install") {
    if (!args.includes("--frozen-lockfile")) {
      return `Command not allowed: 'pnpm install' requires --frozen-lockfile flag`;
    }
  }

  return null;
}

const runCommandTool: LlmToolDefinition = {
  name: "run_command",
  description:
    "Run an allowlisted shell command in the project directory. Use this to run tests (pnpm test), type-check (pnpm run type-check), check git status, or execute node scripts. Commands are executed via execFile (no shell interpretation). Only allowlisted executables and subcommands are permitted: pnpm (run/test/exec/install --frozen-lockfile), npm (run/test), node (file paths only, no -e/--eval), git (status/log/diff/show/branch/ls-files/rev-parse).",
  input_schema: {
    type: "object" as const,
    properties: {
      executable: {
        type: "string",
        description: "The executable to run (e.g., 'pnpm', 'git', 'node')",
      },
      args: {
        type: "array",
        items: { type: "string" },
        description: "Arguments to pass to the executable (e.g., ['run', 'type-check'] or ['test'])",
      },
      timeout: {
        type: "number",
        description: "Optional timeout in seconds (default: 120). Command is killed if it exceeds this.",
      },
    },
    required: ["executable", "args"],
  },
};

/** Read-only tools: read_file, search_files, list_files */
export const readOnlyTools: LlmToolDefinition[] = [
  readFileTool,
  searchFilesTool,
  listFilesTool,
];

/** All tools including write_file */
export const readWriteTools: LlmToolDefinition[] = [
  ...readOnlyTools,
  writeFileTool,
];

/** Exec tools: read-write + run_command (Brief 051) */
export const execTools: LlmToolDefinition[] = [
  ...readWriteTools,
  runCommandTool,
];

/** @deprecated Use readOnlyTools or readWriteTools instead */
export const toolDefinitions: LlmToolDefinition[] = readOnlyTools;

// ============================================================
// Tool handlers
// ============================================================

interface ToolInput {
  path?: string;
  start_line?: number;
  end_line?: number;
  pattern?: string;
  glob?: string;
  content?: string;
  executable?: string;
  args?: string[];
  timeout?: number;
}

/**
 * Execute a tool call and return the result text.
 * Synchronous for read/write tools, returns Promise<string> for run_command.
 */
export function executeTool(
  toolName: string,
  input: ToolInput,
  workDir: string = process.cwd()
): string | Promise<string> {
  switch (toolName) {
    case "read_file":
      return readFile(input, workDir);
    case "search_files":
      return searchFiles(input, workDir);
    case "list_files":
      return listFiles(input, workDir);
    case "write_file":
      return writeFile(input, workDir);
    case "run_command":
      return executeCommand(input, workDir);
    default:
      return `Unknown tool: ${toolName}`;
  }
}

function readFile(input: ToolInput, workDir: string): string {
  if (!input.path) {
    return "Error: 'path' parameter is required";
  }

  // Security: reject secret files
  if (isSecretFile(input.path)) {
    return "Error: access to this file is restricted";
  }

  let resolved: string;
  try {
    resolved = validatePath(input.path, workDir);
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }

  if (!fs.existsSync(resolved)) {
    return `Error: file not found: ${input.path}`;
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return `Error: ${input.path} is a directory, not a file. Use list_files instead.`;
  }

  const content = fs.readFileSync(resolved, "utf-8");
  const allLines = content.split("\n");

  const startLine = Math.max(1, input.start_line || 1);
  const endLine = Math.min(
    allLines.length,
    input.end_line || startLine + MAX_READ_LINES - 1
  );

  const lines = allLines.slice(startLine - 1, endLine);
  const numbered = lines.map(
    (line, i) => `${(startLine + i).toString().padStart(4)}│ ${line}`
  );

  const header = `File: ${input.path} (lines ${startLine}-${endLine} of ${allLines.length})`;
  const result = `${header}\n${numbered.join("\n")}`;

  if (endLine < allLines.length) {
    return `${result}\n\n... (${allLines.length - endLine} more lines. Use start_line/end_line to read more.)`;
  }

  return result;
}

function searchFiles(input: ToolInput, workDir: string): string {
  if (!input.pattern) {
    return "Error: 'pattern' parameter is required";
  }

  const searchDir = input.path
    ? validatePath(input.path, workDir)
    : workDir;

  // Build grep arguments safely — no shell interpretation
  const args: string[] = [
    "-rn", // recursive, line numbers
    "--color=never",
    "-E", // extended regex
    "--max-count=50", // limit matches per file
  ];

  // Add glob filter if specified
  if (input.glob) {
    args.push(`--include=${input.glob}`);
  }

  // Exclude common non-code directories and secret files
  args.push(
    "--exclude-dir=node_modules",
    "--exclude-dir=.git",
    "--exclude-dir=dist",
    "--exclude-dir=.next",
    "--exclude-dir=coverage",
  );

  // Exclude secret file patterns
  for (const pattern of SECRET_PATTERNS) {
    args.push(`--exclude=${pattern}`);
  }

  args.push(input.pattern, searchDir);

  try {
    const result = execFileSync("grep", args, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024, // 1MB
      timeout: 10000, // 10s
    });

    // Make paths relative to workDir for readability
    const lines = result
      .split("\n")
      .filter((l) => l.trim())
      .map((line) => line.replace(workDir + path.sep, ""))
      .slice(0, 100); // Cap total results

    if (lines.length === 0) {
      return `No matches found for pattern: ${input.pattern}`;
    }

    return `Found ${lines.length} matches:\n\n${lines.join("\n")}`;
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    // grep returns exit code 1 for "no matches" — that's not an error
    if (err.status === 1) {
      return `No matches found for pattern: ${input.pattern}`;
    }
    return `Search error: ${err.stderr || "unknown error"}`;
  }
}

function listFiles(input: ToolInput, workDir: string): string {
  const targetDir = input.path
    ? validatePath(input.path, workDir)
    : workDir;

  if (!fs.existsSync(targetDir)) {
    return `Error: directory not found: ${input.path || "."}`;
  }

  const stat = fs.statSync(targetDir);
  if (!stat.isDirectory()) {
    return `Error: ${input.path} is a file, not a directory. Use read_file instead.`;
  }

  // Use find for glob support — safe via execFileSync (no shell)
  const args: string[] = [targetDir];

  // Exclude common non-code directories
  args.push(
    "-not", "-path", "*/node_modules/*",
    "-not", "-path", "*/.git/*",
    "-not", "-path", "*/dist/*",
    "-not", "-path", "*/.next/*",
    "-not", "-path", "*/coverage/*",
  );

  if (input.pattern) {
    args.push("-name", input.pattern);
  }

  args.push("-type", "f");

  try {
    const result = execFileSync("find", args, {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
      timeout: 10000,
    });

    let files = result
      .split("\n")
      .filter((l) => l.trim())
      .map((line) => line.replace(workDir + path.sep, ""))
      .filter((f) => !isSecretFile(f))
      .sort();

    if (files.length === 0) {
      return `No files found in ${input.path || "."} matching ${input.pattern || "*"}`;
    }

    // Cap results
    const total = files.length;
    if (files.length > 200) {
      files = files.slice(0, 200);
    }

    const header =
      total > 200
        ? `Files (showing 200 of ${total}):`
        : `Files (${total}):`;

    return `${header}\n\n${files.join("\n")}`;
  } catch (e) {
    return `Error listing files: ${(e as Error).message}`;
  }
}

function writeFile(input: ToolInput, workDir: string): string {
  if (!input.path) {
    return "Error: 'path' parameter is required";
  }
  if (input.content === undefined || input.content === null) {
    return "Error: 'content' parameter is required";
  }

  // Security: reject secret files
  if (isSecretFile(input.path)) {
    return "Error: writing to this file is restricted";
  }

  let resolved: string;
  try {
    // validatePath checks the resolved path is within workDir.
    // For new files, the parent must exist within workDir (symlink check
    // only runs if the file already exists — validatePath handles this).
    resolved = validatePath(input.path, workDir);
  } catch (e) {
    return `Error: ${(e as Error).message}`;
  }

  try {
    // Create parent directories if needed
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });

    // Write the file (not atomic — writeFileSync overwrites in place)
    fs.writeFileSync(resolved, input.content, "utf-8");

    const lineCount = input.content.split("\n").length;
    return `Written: ${input.path} (${lineCount} lines)`;
  } catch (e) {
    return `Error writing file: ${(e as Error).message}`;
  }
}

// ============================================================
// run_command handler (Brief 051)
// ============================================================

/**
 * Scrub output for references to secret files.
 * Filename-based pattern matching using SECRET_PATTERNS.
 * Note: does NOT detect inline secrets (API keys, tokens) — accepted limitation.
 */
function scrubOutput(text: string): string {
  let scrubbed = text;
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.startsWith("*") && pattern.endsWith("*")) {
      const inner = pattern.slice(1, -1);
      const re = new RegExp(`\\S*${inner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S*`, "gi");
      scrubbed = scrubbed.replace(re, "[REDACTED]");
    } else if (pattern.startsWith("*")) {
      const suffix = pattern.slice(1);
      const re = new RegExp(`\\S*${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi");
      scrubbed = scrubbed.replace(re, "[REDACTED]");
    } else if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      const re = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S*`, "gi");
      scrubbed = scrubbed.replace(re, "[REDACTED]");
    } else if (pattern.includes(".*")) {
      const prefix = pattern.replace(".*", ".");
      const re = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\S*`, "gi");
      scrubbed = scrubbed.replace(re, "[REDACTED]");
    } else {
      const re = new RegExp(`(^|\\s|/)${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$|/)`, "gi");
      scrubbed = scrubbed.replace(re, "$1[REDACTED]$2");
    }
  }
  return scrubbed;
}

/**
 * Execute an allowlisted shell command via execFile (no shell interpretation).
 * Returns structured output or error message.
 */
async function executeCommand(input: ToolInput, workDir: string): Promise<string> {
  const { executable, args = [], timeout } = input;

  if (!executable) {
    return "Error: 'executable' parameter is required";
  }

  // Validate against allowlist
  const validationError = validateCommand(executable, args);
  if (validationError) {
    return `Error: ${validationError}`;
  }

  // Validate working directory is within project root
  const resolvedWorkDir = path.resolve(workDir);
  const projectRoot = path.resolve(process.cwd());
  if (!resolvedWorkDir.startsWith(projectRoot) && resolvedWorkDir !== projectRoot) {
    return "Error: working directory must be within project root";
  }

  const timeoutMs = timeout ? timeout * 1000 : DEFAULT_COMMAND_TIMEOUT;
  const cmdDisplay = `${executable} ${args.join(" ")}`.trim();

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: workDir,
      timeout: timeoutMs,
      maxBuffer: MAX_COMMAND_BUFFER,
      env: { ...process.env },
    });

    const parts: string[] = [`$ ${cmdDisplay}`, ""];

    if (stdout) {
      const scrubbedStdout = scrubOutput(stdout.trim());
      // Truncate if over buffer
      if (scrubbedStdout.length > MAX_COMMAND_BUFFER) {
        parts.push("[stdout — truncated to 10MB]");
        parts.push(scrubbedStdout.slice(0, MAX_COMMAND_BUFFER));
      } else {
        parts.push(scrubbedStdout);
      }
    }

    if (stderr) {
      const scrubbedStderr = scrubOutput(stderr.trim());
      if (scrubbedStderr) {
        parts.push("", "[stderr]", scrubbedStderr);
      }
    }

    if (!stdout && !stderr) {
      parts.push("(no output)");
    }

    parts.push("", `Exit code: 0`);
    return parts.join("\n");
  } catch (error) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };

    // Timeout
    if (execError.killed || execError.signal === "SIGTERM") {
      return `Error: Command timed out after ${Math.round(timeoutMs / 1000)}s: ${cmdDisplay}`;
    }

    // Command failed with exit code
    const parts: string[] = [`$ ${cmdDisplay}`, ""];

    if (execError.stdout) {
      parts.push(scrubOutput(execError.stdout.trim()));
    }
    if (execError.stderr) {
      parts.push("", "[stderr]", scrubOutput(execError.stderr.trim()));
    }

    const exitCode = typeof execError.code === "number" ? execError.code : 1;
    parts.push("", `Exit code: ${exitCode}`);
    return parts.join("\n");
  }
}
