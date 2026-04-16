/**
 * Tests for composition schema validation (Brief 154).
 */

import { describe, it, expect } from "vitest";
import {
  validateCompositionSchema,
  isReservedSlug,
} from "./composition-schema";
import type { CompositionSchema } from "./composition-schema";

describe("composition-schema", () => {
  // ============================================================
  // Reserved slugs
  // ============================================================

  describe("isReservedSlug", () => {
    it("rejects built-in composition intents", () => {
      expect(isReservedSlug("today")).toBe(true);
      expect(isReservedSlug("inbox")).toBe(true);
      expect(isReservedSlug("work")).toBe(true);
      expect(isReservedSlug("projects")).toBe(true);
      expect(isReservedSlug("growth")).toBe(true);
      expect(isReservedSlug("library")).toBe(true);
      expect(isReservedSlug("routines")).toBe(true);
      expect(isReservedSlug("roadmap")).toBe(true);
      expect(isReservedSlug("settings")).toBe(true);
    });

    it("allows custom slugs", () => {
      expect(isReservedSlug("clients")).toBe(false);
      expect(isReservedSlug("tickets")).toBe(false);
      expect(isReservedSlug("properties")).toBe(false);
    });
  });

  // ============================================================
  // Schema validation
  // ============================================================

  describe("validateCompositionSchema", () => {
    const validSchema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "text",
          content: { text: "Hello world" },
        },
      ],
    };

    it("accepts a valid schema", () => {
      const errors = validateCompositionSchema(validSchema);
      expect(errors).toHaveLength(0);
    });

    it("rejects reserved slugs", () => {
      const errors = validateCompositionSchema(validSchema, "today");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].path).toBe("slug");
      expect(errors[0].message).toContain("reserved");
    });

    it("rejects non-object schema", () => {
      const errors = validateCompositionSchema("not an object");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].path).toBe("schema");
    });

    it("rejects missing version", () => {
      const errors = validateCompositionSchema({ blocks: [{ blockType: "text", content: { text: "hi" } }] });
      expect(errors.some((e) => e.path === "schema.version")).toBe(true);
    });

    it("rejects wrong version", () => {
      const errors = validateCompositionSchema({ version: 2, blocks: [{ blockType: "text", content: { text: "hi" } }] });
      expect(errors.some((e) => e.path === "schema.version")).toBe(true);
    });

    it("rejects missing blocks array", () => {
      const errors = validateCompositionSchema({ version: 1 });
      expect(errors.some((e) => e.path === "schema.blocks")).toBe(true);
    });

    it("rejects empty blocks array", () => {
      const errors = validateCompositionSchema({ version: 1, blocks: [] });
      expect(errors.some((e) => e.message.includes("at least one")));
    });

    it("rejects invalid block types", () => {
      const errors = validateCompositionSchema({
        version: 1,
        blocks: [{ blockType: "nonexistent_block", content: { text: "hi" } }],
      });
      expect(errors.some((e) => e.message.includes("Unknown block type")));
    });

    it("rejects blocks without content", () => {
      const errors = validateCompositionSchema({
        version: 1,
        blocks: [{ blockType: "text" }],
      });
      expect(errors.some((e) => e.message.includes("content")));
    });

    it("validates context query sources", () => {
      const errors = validateCompositionSchema({
        version: 1,
        blocks: [
          {
            blockType: "text",
            content: { text: "hi" },
            contextQuery: { source: "invalid_source" },
          },
        ],
      });
      expect(errors.some((e) => e.message.includes("Invalid context query source")));
    });

    it("accepts valid context query sources", () => {
      const errors = validateCompositionSchema({
        version: 1,
        blocks: [
          {
            blockType: "data",
            content: { label: "Work Items" },
            contextQuery: { source: "workItems", limit: 10 },
          },
        ],
      });
      expect(errors).toHaveLength(0);
    });

    it("validates context query limit", () => {
      const errors = validateCompositionSchema({
        version: 1,
        blocks: [
          {
            blockType: "text",
            content: { text: "hi" },
            contextQuery: { source: "workItems", limit: -1 },
          },
        ],
      });
      expect(errors.some((e) => e.message.includes("limit")));
    });

    it("validates showWhen values", () => {
      const errors = validateCompositionSchema({
        version: 1,
        blocks: [
          {
            blockType: "text",
            content: { text: "hi" },
            showWhen: "invalid_value",
          },
        ],
      });
      expect(errors.some((e) => e.message.includes("showWhen")));
    });

    it("accepts valid showWhen values", () => {
      const errors = validateCompositionSchema({
        version: 1,
        blocks: [
          {
            blockType: "text",
            content: { text: "hi" },
            showWhen: "has_data",
          },
          {
            blockType: "text",
            content: { text: "always shown" },
            showWhen: "always",
          },
        ],
      });
      expect(errors).toHaveLength(0);
    });

    it("validates multiple blocks independently", () => {
      const errors = validateCompositionSchema({
        version: 1,
        blocks: [
          { blockType: "text", content: { text: "valid" } },
          { blockType: "fake_type", content: { text: "invalid block type" } },
          { blockType: "metric", content: { label: "Count", value: "42" } },
        ],
      });
      // Only the second block should produce errors
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe("schema.blocks[1].blockType");
    });
  });
});
