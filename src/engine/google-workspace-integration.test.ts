/**
 * Google Workspace Integration Tests (Brief 078)
 *
 * Tests: YAML loading via integration registry, tool resolution,
 * CLI command template construction, JSON output parsing.
 *
 * Provenance: Brief 078 (Integration Executor Activation — Google Workspace)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  loadIntegrationFile,
  getIntegration,
  getIntegrationTools,
  clearRegistryCache,
} from "./integration-registry";
import { resolveTools } from "./tool-resolver";
import { executeCli, execAsync } from "./integration-handlers/cli";

// ============================================================
// Fixtures
// ============================================================

const REPO_ROOT = path.resolve(__dirname, "../..");
const GWS_YAML = path.join(REPO_ROOT, "integrations", "google-workspace.yaml");

let tmpDir: string;
const originalExecFn = execAsync.fn;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ditto-gws-test-"));
  clearRegistryCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  clearRegistryCache();
  execAsync.fn = originalExecFn;
});

/** Copy the real google-workspace.yaml into a temp integration dir for isolated tests */
function setupGwsInTmpDir(): void {
  fs.copyFileSync(GWS_YAML, path.join(tmpDir, "google-workspace.yaml"));
}

// ============================================================
// Tests
// ============================================================

describe("google-workspace integration (Brief 078)", () => {
  // ── Loading ──────────────────────────────────────────────

  describe("YAML loading", () => {
    it("loads google-workspace.yaml from the integrations directory", () => {
      const def = loadIntegrationFile(GWS_YAML);
      expect(def.service).toBe("google-workspace");
      expect(def.preferred).toBe("cli");
      expect(def.interfaces.cli?.command).toBe("gws");
    });

    it("has correct connection metadata", () => {
      const def = loadIntegrationFile(GWS_YAML);
      expect(def.connection).toBeDefined();
      expect(def.connection!.auth_type).toBe("cli_login");
      expect(def.connection!.provider_name).toBe("Google Workspace");
    });

    it("registers in the integration registry by service name", () => {
      setupGwsInTmpDir();
      const def = getIntegration("google-workspace", tmpDir);
      expect(def).toBeDefined();
      expect(def!.service).toBe("google-workspace");
    });
  });

  // ── Tool Definitions ────────────────────────────────────

  describe("tool definitions", () => {
    const EXPECTED_TOOLS = [
      "search_messages",
      "read_message",
      "send_message",
      "list_events",
      "create_event",
      "check_availability",
      "read_range",
      "write_range",
    ];

    it("defines all 8 expected tools", () => {
      const def = loadIntegrationFile(GWS_YAML);
      expect(def.tools).toBeDefined();
      const toolNames = def.tools!.map((t) => t.name);
      expect(toolNames).toEqual(EXPECTED_TOOLS);
    });

    it("each tool has a CLI execute config with command_template", () => {
      const def = loadIntegrationFile(GWS_YAML);
      for (const tool of def.tools!) {
        expect(tool.execute.protocol).toBe("cli");
        if (tool.execute.protocol === "cli") {
          expect(tool.execute.command_template).toBeTruthy();
          expect(tool.execute.command_template).toContain("gws");
        }
      }
    });

    it("getIntegrationTools returns tools by service name", () => {
      setupGwsInTmpDir();
      const tools = getIntegrationTools("google-workspace", tmpDir);
      expect(tools).toHaveLength(8);
    });
  });

  // ── Tool Resolution ─────────────────────────────────────

  describe("tool resolution via resolveTools", () => {
    it("resolves google-workspace.search_messages to an LlmToolDefinition", () => {
      setupGwsInTmpDir();
      const resolved = resolveTools(
        ["google-workspace.search_messages"],
        tmpDir,
      );
      expect(resolved.tools).toHaveLength(1);
      expect(resolved.tools[0].name).toBe("google-workspace.search_messages");
      expect(resolved.tools[0].input_schema.properties).toHaveProperty("query");
      expect(resolved.tools[0].input_schema.required).toEqual(["query"]);
    });

    it("resolves google-workspace.read_message with messageId parameter", () => {
      setupGwsInTmpDir();
      const resolved = resolveTools(
        ["google-workspace.read_message"],
        tmpDir,
      );
      expect(resolved.tools).toHaveLength(1);
      expect(resolved.tools[0].input_schema.properties).toHaveProperty("messageId");
      expect(resolved.tools[0].input_schema.required).toEqual(["messageId"]);
    });

    it("resolves multiple google-workspace tools", () => {
      setupGwsInTmpDir();
      const resolved = resolveTools(
        [
          "google-workspace.search_messages",
          "google-workspace.list_events",
          "google-workspace.read_range",
        ],
        tmpDir,
      );
      expect(resolved.tools).toHaveLength(3);
      expect(resolved.tools.map((t) => t.name)).toEqual([
        "google-workspace.search_messages",
        "google-workspace.list_events",
        "google-workspace.read_range",
      ]);
    });

    it("skips non-existent tool names gracefully", () => {
      setupGwsInTmpDir();
      const resolved = resolveTools(
        ["google-workspace.nonexistent_tool"],
        tmpDir,
      );
      expect(resolved.tools).toHaveLength(0);
    });

    it("resolves send_message with all required parameters", () => {
      setupGwsInTmpDir();
      const resolved = resolveTools(
        ["google-workspace.send_message"],
        tmpDir,
      );
      expect(resolved.tools[0].input_schema.required).toEqual(
        expect.arrayContaining(["to", "subject", "body"]),
      );
    });

    it("resolves create_event with all required parameters", () => {
      setupGwsInTmpDir();
      const resolved = resolveTools(
        ["google-workspace.create_event"],
        tmpDir,
      );
      expect(resolved.tools[0].input_schema.required).toEqual(
        expect.arrayContaining(["calendar", "summary", "start", "end"]),
      );
    });
  });

  // ── CLI Command Templates ───────────────────────────────

  describe("CLI command template construction", () => {
    it("constructs Gmail search command from template and parameters", () => {
      const def = loadIntegrationFile(GWS_YAML);
      const searchTool = def.tools!.find((t) => t.name === "search_messages")!;
      const config = searchTool.execute;
      expect(config.protocol).toBe("cli");
      if (config.protocol === "cli") {
        // Simulate interpolation
        const template = config.command_template;
        const result = template.replace("{query}", "is:unread newer_than:1d");
        expect(result).toBe(
          'gws gmail messages list --query "is:unread newer_than:1d" --format json',
        );
      }
    });

    it("constructs Gmail read command from template and parameters", () => {
      const def = loadIntegrationFile(GWS_YAML);
      const readTool = def.tools!.find((t) => t.name === "read_message")!;
      if (readTool.execute.protocol === "cli") {
        const result = readTool.execute.command_template.replace(
          "{messageId}",
          "abc123",
        );
        expect(result).toBe("gws gmail messages get abc123 --format json");
      }
    });

    it("constructs Calendar list_events command with all parameters", () => {
      const def = loadIntegrationFile(GWS_YAML);
      const tool = def.tools!.find((t) => t.name === "list_events")!;
      if (tool.execute.protocol === "cli") {
        let cmd = tool.execute.command_template;
        cmd = cmd
          .replace("{calendar}", "primary")
          .replace("{timeMin}", "2024-01-01T00:00:00Z")
          .replace("{timeMax}", "2024-01-02T00:00:00Z");
        expect(cmd).toBe(
          'gws calendar events list --calendar "primary" --time-min "2024-01-01T00:00:00Z" --time-max "2024-01-02T00:00:00Z" --format json',
        );
      }
    });

    it("constructs Sheets read_range command with spreadsheet ID and range", () => {
      const def = loadIntegrationFile(GWS_YAML);
      const tool = def.tools!.find((t) => t.name === "read_range")!;
      if (tool.execute.protocol === "cli") {
        let cmd = tool.execute.command_template;
        cmd = cmd
          .replace("{spreadsheetId}", "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms")
          .replace("{range}", "Sheet1!A1:D10");
        expect(cmd).toBe(
          'gws sheets values get --spreadsheet "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" --range "Sheet1!A1:D10" --format json',
        );
      }
    });
  });

  // ── JSON Output Parsing ─────────────────────────────────

  describe("CLI handler JSON output parsing", () => {
    it("parses JSON response from gws CLI correctly", async () => {
      const gwsJsonOutput = JSON.stringify({
        messages: [
          {
            id: "msg-001",
            subject: "Meeting tomorrow",
            from: "boss@example.com",
            date: "2024-01-15T10:00:00Z",
          },
          {
            id: "msg-002",
            subject: "Weekly report",
            from: "team@example.com",
            date: "2024-01-15T09:30:00Z",
          },
        ],
      });

      execAsync.fn = async () => ({
        stdout: gwsJsonOutput,
        stderr: "",
      });

      const result = await executeCli({
        service: "google-workspace",
        command: 'gws gmail messages list --query "is:unread" --format json',
        cliInterface: { command: "gws", auth: "cli_login", env_vars: [] },
      });

      expect(result.confidence).toBe("high");
      expect(result.outputs.result).toEqual(JSON.parse(gwsJsonOutput));
      expect(result.outputs.service).toBe("google-workspace");
      expect(result.outputs.protocol).toBe("cli");
    });

    it("parses Calendar events JSON response", async () => {
      const calendarJson = JSON.stringify({
        events: [
          {
            id: "evt-001",
            summary: "Team standup",
            start: "2024-01-15T09:00:00Z",
            end: "2024-01-15T09:15:00Z",
          },
        ],
      });

      execAsync.fn = async () => ({
        stdout: calendarJson,
        stderr: "",
      });

      const result = await executeCli({
        service: "google-workspace",
        command:
          'gws calendar events list --calendar "primary" --time-min "2024-01-15T00:00:00Z" --time-max "2024-01-16T00:00:00Z" --format json',
        cliInterface: { command: "gws", auth: "cli_login", env_vars: [] },
      });

      expect(result.confidence).toBe("high");
      expect(result.outputs.result).toEqual(JSON.parse(calendarJson));
    });

    it("handles empty JSON object output", async () => {
      execAsync.fn = async () => ({
        stdout: "{}",
        stderr: "",
      });

      const result = await executeCli({
        service: "google-workspace",
        command: 'gws gmail messages list --query "nonexistent" --format json',
        cliInterface: { command: "gws", auth: "cli_login", env_vars: [] },
      });

      expect(result.confidence).toBe("high");
      expect(result.outputs.result).toEqual({});
    });

    it("handles JSON array output", async () => {
      const arrayOutput = JSON.stringify([
        { id: "msg-001", subject: "Hello" },
        { id: "msg-002", subject: "World" },
      ]);

      execAsync.fn = async () => ({
        stdout: arrayOutput,
        stderr: "",
      });

      const result = await executeCli({
        service: "google-workspace",
        command: 'gws gmail messages list --query "is:unread" --format json',
        cliInterface: { command: "gws", auth: "cli_login", env_vars: [] },
      });

      expect(result.confidence).toBe("high");
      expect(Array.isArray(result.outputs.result)).toBe(true);
    });
  });
});
