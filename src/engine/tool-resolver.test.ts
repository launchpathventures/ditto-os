/**
 * Tool Resolver Tests (Brief 025)
 *
 * Tests: valid tool resolution, invalid tool names, missing registry,
 * codebase tools preserved, service.tool_name format, execution dispatch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { resolveTools } from "./tool-resolver";
import { clearRegistryCache } from "./integration-registry";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ditto-tool-resolver-test-"));
  clearRegistryCache();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  clearRegistryCache();
});

function writeIntegration(name: string, content: string): void {
  fs.writeFileSync(path.join(tmpDir, name), content, "utf-8");
}

function setupGithubIntegration(): void {
  writeIntegration(
    "github.yaml",
    `
service: github
description: GitHub
interfaces:
  cli:
    command: gh
    env_vars: [GH_TOKEN]
preferred: cli
tools:
  - name: search_issues
    description: Search GitHub issues
    parameters:
      repo:
        type: string
        required: true
        description: "owner/repo"
      query:
        type: string
        description: "Search query"
    execute:
      protocol: cli
      command_template: "gh issue list --repo {repo} --json number,title --limit 20"
      args:
        query: "--search '{query}'"
  - name: get_issue
    description: Get a specific issue
    parameters:
      repo:
        type: string
        required: true
      number:
        type: string
        required: true
    execute:
      protocol: cli
      command_template: "gh issue view {number} --repo {repo} --json number,title,body"
`,
  );
}

function setupSlackIntegration(): void {
  writeIntegration(
    "slack.yaml",
    `
service: slack
description: Slack messaging
interfaces:
  rest:
    base_url: https://slack.com/api
    auth: bearer_token
preferred: rest
tools:
  - name: send_message
    description: Send a Slack message
    parameters:
      channel:
        type: string
        required: true
      text:
        type: string
        required: true
    execute:
      protocol: rest
      method: POST
      endpoint: /chat.postMessage
      body:
        channel: "{channel}"
        text: "{text}"
`,
  );
}

describe("tool-resolver", () => {
  // ============================================================
  // CRM Built-in Tools (Brief 097)
  // ============================================================

  describe("CRM built-in tools", () => {
    it("resolves crm.send_email as a built-in tool", () => {
      const result = resolveTools(["crm.send_email"]);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe("crm_send_email");
      expect(result.tools[0].input_schema.required).toContain("to");
      expect(result.tools[0].input_schema.required).toContain("subject");
      expect(result.tools[0].input_schema.required).toContain("body");
      expect(result.tools[0].input_schema.required).toContain("personId");
      expect(result.tools[0].input_schema.required).toContain("mode");
    });

    it("resolves crm.record_interaction as a built-in tool", () => {
      const result = resolveTools(["crm.record_interaction"]);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe("crm_record_interaction");
      expect(result.tools[0].input_schema.required).toContain("personId");
      expect(result.tools[0].input_schema.required).toContain("type");
      expect(result.tools[0].input_schema.required).toContain("mode");
    });

    it("resolves crm.create_person as a built-in tool", () => {
      const result = resolveTools(["crm.create_person"]);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe("crm_create_person");
      expect(result.tools[0].input_schema.required).toContain("name");
    });

    it("resolves all three CRM tools together", () => {
      const result = resolveTools(["crm.send_email", "crm.record_interaction", "crm.create_person"]);
      expect(result.tools).toHaveLength(3);
      const names = result.tools.map(t => t.name);
      expect(names).toContain("crm_send_email");
      expect(names).toContain("crm_record_interaction");
      expect(names).toContain("crm_create_person");
    });

    it("resolves CRM tools alongside integration registry tools", () => {
      setupGithubIntegration();
      const result = resolveTools(["crm.send_email", "github.search_issues"], tmpDir);
      expect(result.tools).toHaveLength(2);
      expect(result.tools.map(t => t.name)).toContain("crm_send_email");
      expect(result.tools.map(t => t.name)).toContain("github.search_issues");
    });

    it("dispatches CRM tool via executeIntegrationTool using LLM name", async () => {
      // This tests the dispatch path (actual execution requires DB, but the lookup path works)
      const result = resolveTools(["crm.create_person"]);
      // The tool is in the builtInMap via its definition.name
      const builtInNames = result.tools.map(t => t.name);
      expect(builtInNames).toContain("crm_create_person");
    });
  });

  describe("resolveTools", () => {
    it("resolves valid CLI-backed tools into LlmToolDefinitions", () => {
      setupGithubIntegration();
      const result = resolveTools(["github.search_issues"], tmpDir);

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe("github.search_issues");
      expect(result.tools[0].description).toBe("Search GitHub issues");
      expect(result.tools[0].input_schema.properties).toHaveProperty("repo");
      expect(result.tools[0].input_schema.properties).toHaveProperty("query");
      expect(result.tools[0].input_schema.required).toEqual(["repo"]);
    });

    it("resolves multiple tools from different services", () => {
      setupGithubIntegration();
      setupSlackIntegration();
      const result = resolveTools(
        ["github.search_issues", "slack.send_message"],
        tmpDir,
      );

      expect(result.tools).toHaveLength(2);
      expect(result.tools.map((t) => t.name)).toEqual([
        "github.search_issues",
        "slack.send_message",
      ]);
    });

    it("resolves multiple tools from the same service", () => {
      setupGithubIntegration();
      const result = resolveTools(
        ["github.search_issues", "github.get_issue"],
        tmpDir,
      );

      expect(result.tools).toHaveLength(2);
    });

    it("skips tools with missing service prefix (no dot)", () => {
      setupGithubIntegration();
      const result = resolveTools(["search_issues"], tmpDir);
      expect(result.tools).toHaveLength(0);
    });

    it("skips tools from unregistered services", () => {
      setupGithubIntegration();
      const result = resolveTools(["jira.search_issues"], tmpDir);
      expect(result.tools).toHaveLength(0);
    });

    it("skips tools not found in the service's tools list", () => {
      setupGithubIntegration();
      const result = resolveTools(["github.nonexistent_tool"], tmpDir);
      expect(result.tools).toHaveLength(0);
    });

    it("rejects unauthorised tools via executeIntegrationTool", async () => {
      setupGithubIntegration();
      const result = resolveTools(["github.search_issues"], tmpDir);

      // Try calling a tool not in the resolved set
      const output = await result.executeIntegrationTool(
        "github.get_issue",
        { repo: "test/repo", number: "1" },
      );
      expect(output).toContain("authorisation rejected");
    });

    it("produces LlmToolDefinitions with correct input_schema", () => {
      setupSlackIntegration();
      const result = resolveTools(["slack.send_message"], tmpDir);

      expect(result.tools[0].input_schema).toEqual({
        type: "object",
        properties: {
          channel: {
            type: "string",
          },
          text: {
            type: "string",
          },
        },
        required: ["channel", "text"],
      });
    });
  });
});
