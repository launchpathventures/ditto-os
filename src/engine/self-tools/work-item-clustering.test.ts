/**
 * Tests for Work Item Clustering Detector (MP-10.2)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock process-model-lookup before importing
vi.mock("../system-agents/process-model-lookup", () => ({
  findProcessModelSync: vi.fn().mockReturnValue(null),
}));

// Mock the db module before importing
vi.mock("../../db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  return {
    db: mockDb,
    schema: {
      workItems: {
        id: "id",
        content: "content",
        type: "type",
        status: "status",
        assignedProcess: "assigned_process",
        source: "source",
        createdAt: "created_at",
      },
    },
  };
});

import { detectWorkItemClusters } from "./work-item-clustering";
import { db } from "../../db";

describe("detectWorkItemClusters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when fewer than 3 items", async () => {
    vi.mocked(db.select().from({} as any).where({} as any).orderBy({} as any).limit).mockResolvedValueOnce([
      { id: "1", content: "quote for bathroom", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
    ]);

    const clusters = await detectWorkItemClusters([]);
    expect(clusters).toEqual([]);
  });

  it("detects cluster of 3+ similar items", async () => {
    const items = [
      { id: "1", content: "generate quote for bathroom renovation", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
      { id: "2", content: "generate quote for kitchen renovation", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
      { id: "3", content: "generate quote for laundry renovation", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
      { id: "4", content: "generate quote for bedroom renovation", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
    ];

    vi.mocked(db.select().from({} as any).where({} as any).orderBy({} as any).limit).mockResolvedValueOnce(items);

    const clusters = await detectWorkItemClusters([]);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0].count).toBeGreaterThanOrEqual(3);
    expect(clusters[0].commonTokens).toContain("quote");
    expect(clusters[0].commonTokens).toContain("renovation");
  });

  it("skips clusters already covered by existing processes", async () => {
    const items = [
      { id: "1", content: "generate quote for bathroom renovation", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
      { id: "2", content: "generate quote for kitchen renovation", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
      { id: "3", content: "generate quote for laundry renovation", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
    ];

    vi.mocked(db.select().from({} as any).where({} as any).orderBy({} as any).limit).mockResolvedValueOnce(items);

    const clusters = await detectWorkItemClusters([
      { slug: "quoting-renovation", name: "Quote Generation", description: "Generate quotes for renovation projects" },
    ]);
    expect(clusters).toEqual([]);
  });

  it("does not cluster dissimilar items", async () => {
    const items = [
      { id: "1", content: "send invoice to client for bathroom work", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
      { id: "2", content: "generate quote for kitchen renovation", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
      { id: "3", content: "follow up with supplier about tile delivery", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
      { id: "4", content: "schedule team meeting for next week", type: "task", status: "intake", assignedProcess: null, source: "conversation" },
    ];

    vi.mocked(db.select().from({} as any).where({} as any).orderBy({} as any).limit).mockResolvedValueOnce(items);

    const clusters = await detectWorkItemClusters([]);
    expect(clusters).toEqual([]);
  });
});
