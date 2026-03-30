import { describe, it, expect } from "vitest";
import { getToolDisplayLabel } from "./tool-display-names";

describe("tool-display-names", () => {
  describe("getToolDisplayLabel", () => {
    it("returns mapped label for known tools", () => {
      const label = getToolDisplayLabel("search_knowledge");
      expect(label.running).toBe("Searching knowledge...");
      expect(label.complete).toBe("Searched knowledge");
      expect(label.action).toBe("search knowledge");
    });

    it("returns mapped label for save_process", () => {
      const label = getToolDisplayLabel("save_process");
      expect(label.running).toBe("Saving process...");
      expect(label.complete).toBe("Saved process");
      expect(label.action).toBe("save this process");
    });

    it("humanizes unmapped tool names", () => {
      const label = getToolDisplayLabel("my_custom_tool");
      expect(label.running).toBe("My custom tool...");
      expect(label.complete).toBe("My custom tool");
      expect(label.action).toBe("my custom tool");
    });

    it("handles single-word unmapped tools", () => {
      const label = getToolDisplayLabel("analyze");
      expect(label.running).toBe("Analyze...");
      expect(label.complete).toBe("Analyze");
      expect(label.action).toBe("analyze");
    });

    it("covers all ~15 mapped tools", () => {
      const mappedTools = [
        "search_knowledge",
        "save_process",
        "start_pipeline",
        "generate_process",
        "get_briefing",
        "quick_capture",
        "create_work_item",
        "approve_review",
        "suggest_next",
        "run_pipeline_step",
        "check_status",
        "update_process",
        "delete_process",
        "list_processes",
        "get_process",
      ];

      for (const tool of mappedTools) {
        const label = getToolDisplayLabel(tool);
        expect(label.running).toBeTruthy();
        expect(label.complete).toBeTruthy();
        // Running labels should end with "..."
        expect(label.running).toMatch(/\.\.\.$/);
        // Complete labels should not end with "..."
        expect(label.complete).not.toMatch(/\.\.\.$/);
      }
    });
  });
});
