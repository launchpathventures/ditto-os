/**
 * Tests for action boundaries (Brief 102)
 */

import { describe, it, expect } from "vitest";
import {
  getToolSetForContext,
  isToolAllowed,
  filterToolsForContext,
  determineActionContext,
} from "./action-boundaries";

describe("Action boundaries — getToolSetForContext", () => {
  it("front_door returns research-only tools (AC10)", () => {
    const boundary = getToolSetForContext("front_door");

    expect(boundary.context).toBe("front_door");
    expect(boundary.allowedTools).toContain("search_knowledge");
    expect(boundary.allowedTools).toContain("assess_confidence");
    expect(boundary.allowedTools).toContain("web_search");
    expect(boundary.allowedTools).toContain("person_research");
    expect(boundary.allowedTools).toContain("draft_plan");

    // Must NOT include workspace tools
    expect(boundary.allowedTools).not.toContain("generate_process");
    expect(boundary.allowedTools).not.toContain("start_pipeline");
    expect(boundary.allowedTools).not.toContain("create_work_item");
    expect(boundary.allowedTools).not.toContain("allocate_budget");
  });

  it("workspace returns full workspace tools (AC11)", () => {
    const boundary = getToolSetForContext("workspace");

    expect(boundary.context).toBe("workspace");
    expect(boundary.allowedTools).toContain("generate_process");
    expect(boundary.allowedTools).toContain("start_pipeline");
    expect(boundary.allowedTools).toContain("create_work_item");
    expect(boundary.allowedTools).toContain("search_knowledge");
    expect(boundary.allowedTools).toContain("adjust_trust");

    // Must NOT include budget tools
    expect(boundary.allowedTools).not.toContain("allocate_budget");
    expect(boundary.allowedTools).not.toContain("check_budget");
    expect(boundary.allowedTools).not.toContain("approve_spend");
  });

  it("workspace_budgeted returns workspace tools plus budget tools (AC12)", () => {
    const boundary = getToolSetForContext("workspace_budgeted");

    expect(boundary.context).toBe("workspace_budgeted");

    // Should have all workspace tools
    expect(boundary.allowedTools).toContain("generate_process");
    expect(boundary.allowedTools).toContain("start_pipeline");

    // Plus budget tools
    expect(boundary.allowedTools).toContain("allocate_budget");
    expect(boundary.allowedTools).toContain("check_budget");
    expect(boundary.allowedTools).toContain("approve_spend");
  });

  it("front_door person-research is limited to public data (AC10 detail)", () => {
    const boundary = getToolSetForContext("front_door");

    // No workspace data access tools
    expect(boundary.allowedTools).not.toContain("get_briefing");
    expect(boundary.allowedTools).not.toContain("update_user_model");
    expect(boundary.allowedTools).not.toContain("connect_service");
    expect(boundary.allowedTools).not.toContain("get_process_detail");
    expect(boundary.description).toContain("public");
  });
});

describe("Action boundaries — isToolAllowed", () => {
  it("allows search_knowledge in front_door", () => {
    expect(isToolAllowed("search_knowledge", "front_door")).toBe(true);
  });

  it("blocks generate_process in front_door", () => {
    expect(isToolAllowed("generate_process", "front_door")).toBe(false);
  });

  it("allows generate_process in workspace", () => {
    expect(isToolAllowed("generate_process", "workspace")).toBe(true);
  });

  it("Brief 281: search_workspace is workspace-gated, never front_door", () => {
    // Recall exposes private workspace artifacts — it must not leak to
    // unauthenticated visitors.
    expect(isToolAllowed("search_workspace", "front_door")).toBe(false);
    expect(isToolAllowed("search_workspace", "workspace")).toBe(true);
    expect(isToolAllowed("search_workspace", "workspace_budgeted")).toBe(true);
  });

  it("allows allocate_budget only in workspace_budgeted", () => {
    expect(isToolAllowed("allocate_budget", "front_door")).toBe(false);
    expect(isToolAllowed("allocate_budget", "workspace")).toBe(false);
    expect(isToolAllowed("allocate_budget", "workspace_budgeted")).toBe(true);
  });
});

describe("Action boundaries — filterToolsForContext", () => {
  it("filters a mixed tool list to only allowed tools", () => {
    const tools = ["search_knowledge", "generate_process", "start_pipeline", "allocate_budget"];
    const filtered = filterToolsForContext(tools, "front_door");

    expect(filtered).toEqual(["search_knowledge"]);
  });

  it("returns all tools when all are allowed", () => {
    const tools = ["search_knowledge", "assess_confidence", "web_search"];
    const filtered = filterToolsForContext(tools, "front_door");

    expect(filtered).toEqual(tools);
  });
});

describe("Action boundaries — Brief 280 AC5 (workspace chat front door)", () => {
  // The five tools the workspace Self conversation must be able to use
  // inline, and which the public front door must never expose.
  const WORKSPACE_CHAT_TOOLS = [
    "generate_process",
    "get_process_detail",
    "get_briefing",
    "create_work_item",
    "start_pipeline",
  ] as const;

  it.each(WORKSPACE_CHAT_TOOLS)(
    "%s is allowed in workspace and workspace_budgeted",
    (tool) => {
      expect(isToolAllowed(tool, "workspace")).toBe(true);
      expect(isToolAllowed(tool, "workspace_budgeted")).toBe(true);
    },
  );

  it.each(WORKSPACE_CHAT_TOOLS)(
    "%s is blocked in front_door",
    (tool) => {
      expect(isToolAllowed(tool, "front_door")).toBe(false);
    },
  );

  it("front_door tool set excludes every workspace chat tool", () => {
    const frontDoor = getToolSetForContext("front_door").allowedTools;
    for (const tool of WORKSPACE_CHAT_TOOLS) {
      expect(frontDoor).not.toContain(tool);
    }
  });

  it("workspace tool set is a superset of the workspace chat tools", () => {
    const filtered = filterToolsForContext([...WORKSPACE_CHAT_TOOLS], "workspace");
    expect(filtered).toEqual([...WORKSPACE_CHAT_TOOLS]);
  });
});

describe("Action boundaries — determineActionContext (AC13)", () => {
  it("returns front_door when no workspace", () => {
    expect(determineActionContext({ hasWorkspace: false, hasBudget: false }))
      .toBe("front_door");
  });

  it("returns front_door when no workspace even with budget flag", () => {
    expect(determineActionContext({ hasWorkspace: false, hasBudget: true }))
      .toBe("front_door");
  });

  it("returns workspace when workspace exists without budget", () => {
    expect(determineActionContext({ hasWorkspace: true, hasBudget: false }))
      .toBe("workspace");
  });

  it("returns workspace_budgeted when workspace has budget", () => {
    expect(determineActionContext({ hasWorkspace: true, hasBudget: true }))
      .toBe("workspace_budgeted");
  });
});
