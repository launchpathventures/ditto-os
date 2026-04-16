/**
 * Tests for adaptive composition evaluator (Brief 154).
 */

import { describe, it, expect } from "vitest";
import { evaluateAdaptiveComposition } from "./adaptive";
import type { CompositionSchema } from "./composition-schema";
import type { CompositionContext } from "./types";

function makeContext(overrides: Partial<CompositionContext> = {}): CompositionContext {
  return {
    processes: [],
    workItems: [],
    feedItems: [],
    pendingReviews: [],
    activeRuns: [],
    now: new Date("2026-04-14T12:00:00Z"),
    ...overrides,
  };
}

describe("adaptive composition evaluator", () => {
  it("renders a static text block", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "text",
          content: { text: "Welcome to your clients view" },
        },
      ],
    };

    const blocks = evaluateAdaptiveComposition(schema, makeContext());
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
    expect((blocks[0] as { text: string }).text).toBe("Welcome to your clients view");
  });

  it("renders empty state when no blocks match", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "data",
          content: { label: "Work Items" },
          contextQuery: { source: "workItems" },
          showWhen: "has_data",
        },
      ],
    };

    const blocks = evaluateAdaptiveComposition(schema, makeContext(), "Clients");
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0].type).toBe("text");
    expect((blocks[0] as { text: string }).text).toContain("No data yet");
  });

  it("renders empty state with action button when source process provided", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "data",
          content: { label: "Work Items" },
          contextQuery: { source: "workItems" },
          showWhen: "has_data",
        },
      ],
    };

    const blocks = evaluateAdaptiveComposition(schema, makeContext(), "Clients", "client-outreach");
    expect(blocks.length).toBe(2);
    expect(blocks[0].type).toBe("text");
    expect(blocks[1].type).toBe("action");
  });

  it("populates data block from context query", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "data",
          content: { label: "Active Work" },
          contextQuery: { source: "workItems" },
        },
      ],
    };

    const context = makeContext({
      workItems: [
        { id: "w1", type: "task", status: "in_progress", content: "Write proposal" } as any,
        { id: "w2", type: "task", status: "completed", content: "Send invoice" } as any,
      ],
    });

    const blocks = evaluateAdaptiveComposition(schema, context);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("data");
    expect((blocks[0] as any).data).toHaveLength(2);
  });

  it("filters context data by filter conditions", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "data",
          content: { label: "Active Only" },
          contextQuery: {
            source: "workItems",
            filter: { status: "in_progress" },
          },
        },
      ],
    };

    const context = makeContext({
      workItems: [
        { id: "w1", type: "task", status: "in_progress", content: "Write proposal" } as any,
        { id: "w2", type: "task", status: "completed", content: "Send invoice" } as any,
      ],
    });

    const blocks = evaluateAdaptiveComposition(schema, context);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as any).data).toHaveLength(1);
  });

  it("sorts context data", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "data",
          content: { label: "Sorted" },
          contextQuery: {
            source: "workItems",
            sortBy: "content",
            sortOrder: "asc",
          },
        },
      ],
    };

    const context = makeContext({
      workItems: [
        { id: "w1", type: "task", status: "active", content: "Zebra" } as any,
        { id: "w2", type: "task", status: "active", content: "Apple" } as any,
      ],
    });

    const blocks = evaluateAdaptiveComposition(schema, context);
    const data = (blocks[0] as any).data;
    expect(data[0].content).toBe("Apple");
    expect(data[1].content).toBe("Zebra");
  });

  it("limits context data", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "data",
          content: { label: "Limited" },
          contextQuery: {
            source: "workItems",
            limit: 1,
          },
        },
      ],
    };

    const context = makeContext({
      workItems: [
        { id: "w1", type: "task", status: "active", content: "First" } as any,
        { id: "w2", type: "task", status: "active", content: "Second" } as any,
      ],
    });

    const blocks = evaluateAdaptiveComposition(schema, context);
    expect((blocks[0] as any).data).toHaveLength(1);
  });

  it("suppresses blocks with showWhen:has_data and no data", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "text",
          content: { text: "Always visible" },
        },
        {
          blockType: "data",
          content: { label: "Work Items" },
          contextQuery: { source: "workItems" },
          showWhen: "has_data",
        },
      ],
    };

    // workItems is empty
    const blocks = evaluateAdaptiveComposition(schema, makeContext());
    // Only the static text block should render
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
  });

  it("renders multiple block types in order", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        { blockType: "text", content: { text: "Header" } },
        { blockType: "metric", content: { label: "Count", value: "42" } },
        { blockType: "text", content: { text: "Footer" } },
      ],
    };

    const blocks = evaluateAdaptiveComposition(schema, makeContext());
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("text");
    expect(blocks[1].type).toBe("metric");
    expect(blocks[2].type).toBe("text");
  });

  it("interpolates template strings from context data", () => {
    const schema: CompositionSchema = {
      version: 1,
      blocks: [
        {
          blockType: "metric",
          content: { label: "{{name}} Status", value: "{{status}}" },
          contextQuery: { source: "processes", limit: 1 },
        },
      ],
    };

    const context = makeContext({
      processes: [
        { id: "p1", name: "Client Outreach", slug: "client-outreach", status: "active" } as any,
      ],
    });

    const blocks = evaluateAdaptiveComposition(schema, context);
    expect(blocks).toHaveLength(1);
    expect((blocks[0] as any).label).toBe("Client Outreach Status");
    expect((blocks[0] as any).value).toBe("active");
  });
});
