/**
 * Agent OS — Agent Tools (Read-Only Codebase Access)
 *
 * Three tools that give AI agents read-only access to the codebase they're
 * working on. Tools are scoped to process.cwd() with path traversal prevention.
 *
 * Provenance: Claude Code's own Read, Grep, Glob tool patterns.
 * Architecture note: This is a pragmatic shortcut. When the integration registry
 * lands in Phase 6, tool resolution should move out of the adapter and into
 * the harness assembly step.
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import type Anthropic from "@anthropic-ai/sdk";

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

export const toolDefinitions: Anthropic.Messages.Tool[] = [
  {
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
  },
  {
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
  },
  {
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
  },
];

// ============================================================
// Tool handlers
// ============================================================

interface ToolInput {
  path?: string;
  start_line?: number;
  end_line?: number;
  pattern?: string;
  glob?: string;
}

/**
 * Execute a tool call and return the result text.
 */
export function executeTool(
  toolName: string,
  input: ToolInput,
  workDir: string = process.cwd()
): string {
  switch (toolName) {
    case "read_file":
      return readFile(input, workDir);
    case "search_files":
      return searchFiles(input, workDir);
    case "list_files":
      return listFiles(input, workDir);
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
