/**
 * Ditto — Front Door Block Construction Tests (Brief 137)
 *
 * Tests for buildFrontDoorBlocks — pure function, no DB or LLM needed.
 *
 * Provenance: Brief 137, network-chat.test.ts patterns.
 */

import { describe, it, expect } from "vitest";
import { buildFrontDoorBlocks, type FrontDoorBlockArgs } from "./network-chat-blocks";

function makeArgs(overrides: Partial<FrontDoorBlockArgs> = {}): FrontDoorBlockArgs {
  return {
    plan: null,
    detectedMode: null,
    learned: null,
    stage: "gather",
    enrichmentText: null,
    ...overrides,
  };
}

describe("buildFrontDoorBlocks", () => {
  // ── GATHER stage ──

  it("returns empty array for GATHER stage", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({ stage: "gather" }));
    expect(blocks).toEqual([]);
  });

  it("returns empty array for GATHER even with plan present", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "gather",
      plan: "1. Research targets\n2. Draft intros",
    }));
    expect(blocks).toEqual([]);
  });

  // ── REFLECT stage ──

  it("returns ProcessProposalBlock when plan is present in REFLECT", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "reflect",
      plan: "1. Research logistics contacts\n2. Draft introductions\n3. Send as Alex\n4. Report back",
    }));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("process_proposal");
    const proposal = blocks[0] as any;
    expect(proposal.name).toBe("Proposed approach");
    expect(proposal.steps).toHaveLength(4);
    expect(proposal.steps[0].name).toBe("Research logistics contacts");
    expect(proposal.steps[0].status).toBe("pending");
    expect(proposal.interactive).toBe(false);
  });

  it("handles plan with bullet points", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "reflect",
      plan: "- Find property managers\n- Draft warm intros\n- Send on your behalf",
    }));
    expect(blocks).toHaveLength(1);
    const proposal = blocks[0] as any;
    expect(proposal.steps).toHaveLength(3);
    expect(proposal.steps[0].name).toBe("Find property managers");
  });

  it("handles plan as single line (no list)", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "reflect",
      plan: "Research and connect you with logistics experts",
    }));
    expect(blocks).toHaveLength(1);
    const proposal = blocks[0] as any;
    expect(proposal.steps).toHaveLength(1);
    expect(proposal.steps[0].name).toBe("Research and connect you with logistics experts");
  });

  it("returns empty array in REFLECT when plan is null", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({ stage: "reflect" }));
    expect(blocks).toEqual([]);
  });

  it("returns AuthorizationRequestBlock when Beat 2 action draft is present", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "reflect",
      beat2Action: {
        to: "ops@example.com",
        subject: "Pricing sweep",
        body: "Three SKUs need attention.",
        recipientLabel: "ops@example.com",
      },
    }));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "authorization-request",
      state: "pending",
      header: "Want me to send this to ops@example.com?",
      recipientLabel: "ops@example.com",
      actionClass: "email-send",
      toolName: "gmail-authorized-send",
      toolInput: {
        to: ["ops@example.com"],
        subject: "Pricing sweep",
        body: "Three SKUs need attention.",
      },
    });
    expect((blocks[0] as any).authorizationId).toMatch(/^beat2-[0-9a-f-]{36}$/);
  });

  it("drops malformed Beat 2 action drafts instead of emitting an unsafe block", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "reflect",
      beat2Action: {
        subject: "Missing recipient",
        body: "No recipient.",
      },
    }));
    expect(blocks).toEqual([]);
  });

  // ── ACTIVATE stage ──

  it("returns RecordBlock when enrichment + connector mode", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      detectedMode: "connector",
      learned: { business: "Fleet Tools Co", target: "logistics managers", industry: "logistics", name: "Tim" },
      enrichmentText: "Found 5 logistics companies...",
    }));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("record");
    const record = blocks[0] as any;
    expect(record.title).toBe("logistics managers");
    expect(record.status.label).toBe("Connecting");
    expect(record.fields).toBeDefined();
    expect(record.fields.length).toBeGreaterThan(0);
  });

  it("returns RecordBlock for sales mode", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      detectedMode: "sales",
      learned: { business: "Acme Corp", target: "CTOs", name: null },
      enrichmentText: "search results...",
    }));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("record");
    const record = blocks[0] as any;
    expect(record.status.label).toBe("Outreach");
  });

  it("returns RecordBlock for both mode", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      detectedMode: "both",
      learned: { business: "Acme", target: "investors", name: null },
      enrichmentText: "results...",
    }));
    expect(blocks).toHaveLength(1);
    const record = blocks[0] as any;
    expect(record.status.label).toBe("Connecting + CoS");
  });

  it("no RecordBlock in ACTIVATE without enrichment text", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      detectedMode: "connector",
      learned: { business: "Acme", target: "CTOs", name: null },
      enrichmentText: null,
    }));
    expect(blocks).toEqual([]);
  });

  it("no RecordBlock in ACTIVATE without learned context", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      detectedMode: "connector",
      learned: null,
      enrichmentText: "results...",
    }));
    expect(blocks).toEqual([]);
  });

  it("no RecordBlock for cos-only mode", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      detectedMode: "cos",
      learned: { business: "Acme", target: "priorities", name: null },
      enrichmentText: "results...",
    }));
    expect(blocks).toEqual([]);
  });

  // ── Combined: plan + enrichment ──

  it("returns both ProcessProposalBlock and RecordBlock in ACTIVATE with plan + enrichment", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      plan: "1. Research\n2. Connect",
      detectedMode: "connector",
      learned: { business: "Acme", target: "CTOs", name: null },
      enrichmentText: "results...",
    }));
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("process_proposal");
    expect(blocks[1].type).toBe("record");
  });

  // ── Max 2 blocks ──

  it("never returns more than 2 blocks", () => {
    // Even though the logic currently caps at 2, this is a safety net test
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      plan: "1. A\n2. B",
      detectedMode: "connector",
      learned: { business: "Acme", target: "CTOs", name: null },
      enrichmentText: "results...",
    }));
    expect(blocks.length).toBeLessThanOrEqual(2);
  });

  // ── Error handling ──

  it("returns empty array on error (never throws)", () => {
    // Pass corrupted args
    const blocks = buildFrontDoorBlocks(null as any);
    expect(blocks).toEqual([]);
  });

  // ── RecordBlock uses target for title, falls back ──

  it("falls back to 'Your brief' when no target", () => {
    const blocks = buildFrontDoorBlocks(makeArgs({
      stage: "activate",
      detectedMode: "connector",
      learned: { business: "Acme", target: null, name: null },
      enrichmentText: "results...",
    }));
    expect(blocks).toHaveLength(1);
    const record = blocks[0] as any;
    expect(record.title).toBe("Your brief");
  });
});
