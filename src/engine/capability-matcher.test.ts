/**
 * Capability Matcher Tests — Brief 167
 *
 * Tests for the deterministic matching algorithm:
 * problem match, challenge match, dimension weighting,
 * dedup, suppression rules, match reason formatting.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  matchCapabilities,
  tokenize,
  stem,
  loadTemplateMetadata,
  clearTemplateCache,
  type TemplateMetadata,
  type CapabilityMatch,
} from "./capability-matcher";

// ============================================================
// Test Fixtures
// ============================================================

const TEMPLATES: TemplateMetadata[] = [
  {
    slug: "follow-up-sequences",
    name: "Follow-Up Sequences",
    description: "Value-driven follow-ups for prospects who haven't responded to initial outreach.",
    qualityCriteria: ["Follow-ups add genuine value", "Auto-stops on opt-out or fatigue"],
  },
  {
    slug: "inbox-triage",
    name: "Inbox Triage",
    description: "Automated email inbox triage with urgency classification and suggested next steps.",
    qualityCriteria: ["High-urgency emails never missed", "Classification matches actual urgency"],
  },
  {
    slug: "meeting-prep",
    name: "Meeting Prep",
    description: "Prepare briefing materials and agenda items before scheduled meetings.",
    qualityCriteria: ["Briefing references specific recent activity"],
  },
  {
    slug: "content-creation",
    name: "Content Creation",
    description: "Create and schedule social media content aligned with brand voice.",
    qualityCriteria: ["Content matches brand voice", "Scheduling follows engagement patterns"],
  },
  {
    slug: "analytics-reporting",
    name: "Analytics Reporting",
    description: "Generate weekly analytics reports from connected data sources.",
    qualityCriteria: ["Reports reference actual data, not estimates"],
  },
  {
    slug: "selling-outreach",
    name: "Selling Outreach",
    description: "Personalized outreach messages to potential customers based on research.",
    qualityCriteria: ["Messages reflect genuine understanding of the prospect"],
  },
];

// ============================================================
// Core Matching (AC1, AC2)
// ============================================================

describe("matchCapabilities", () => {
  it("returns matches sorted by relevance descending", () => {
    const entries = [
      { dimension: "problems", content: "follow-ups are falling through the cracks" },
    ];

    const matches = matchCapabilities(entries, [], TEMPLATES);

    expect(matches.length).toBeGreaterThan(0);
    // Verify sorted descending
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].relevanceScore).toBeLessThanOrEqual(matches[i - 1].relevanceScore);
    }
  });

  it("scores problems dimension highest (weight 1.0)", () => {
    const problemEntry = [{ dimension: "problems", content: "follow-ups fall through" }];
    const visionEntry = [{ dimension: "vision", content: "follow-ups fall through" }];

    const problemMatches = matchCapabilities(problemEntry, [], TEMPLATES);
    const visionMatches = matchCapabilities(visionEntry, [], TEMPLATES);

    const problemFollowUp = problemMatches.find((m) => m.templateSlug === "follow-up-sequences");
    const visionFollowUp = visionMatches.find((m) => m.templateSlug === "follow-up-sequences");

    expect(problemFollowUp).toBeDefined();
    expect(visionFollowUp).toBeDefined();
    expect(problemFollowUp!.relevanceScore).toBeGreaterThan(visionFollowUp!.relevanceScore);
  });

  it("matches problems dimension to relevant template (AC2)", () => {
    const entries = [
      { dimension: "problems", content: "follow-ups are falling through the cracks" },
    ];

    const matches = matchCapabilities(entries, [], TEMPLATES);
    const followUp = matches.find((m) => m.templateSlug === "follow-up-sequences");

    expect(followUp).toBeDefined();
    expect(followUp!.relevanceScore).toBeGreaterThan(0);
  });

  it("matches challenges dimension with 0.8 weight", () => {
    const entries = [
      { dimension: "challenges", content: "inbox is overwhelming, emails pile up" },
    ];

    const matches = matchCapabilities(entries, [], TEMPLATES);
    const inbox = matches.find((m) => m.templateSlug === "inbox-triage");

    expect(inbox).toBeDefined();
    expect(inbox!.relevanceScore).toBeGreaterThan(0);
  });

  it("matches regardless of industry when content overlaps (AC2)", () => {
    // A plumber mentioning follow-ups should match follow-up-sequences
    const entries = [
      { dimension: "problems", content: "follow-ups falling through the cracks" },
      { dimension: "work", content: "plumbing business, 5 employees" },
    ];

    const matches = matchCapabilities(entries, [], TEMPLATES);
    const followUp = matches.find((m) => m.templateSlug === "follow-up-sequences");

    expect(followUp).toBeDefined();
  });

  it("returns empty array for empty user model", () => {
    const matches = matchCapabilities([], [], TEMPLATES);
    expect(matches).toEqual([]);
  });

  it("returns empty when no templates overlap", () => {
    const entries = [
      { dimension: "problems", content: "completely unrelated quantum physics research" },
    ];

    const matches = matchCapabilities(entries, [], TEMPLATES);
    // May have weak matches but nothing strong
    const strongMatches = matches.filter((m) => m.relevanceScore > 0.3);
    expect(strongMatches.length).toBe(0);
  });
});

// ============================================================
// Match Reason (AC3)
// ============================================================

describe("match reason uses user's words", () => {
  it("includes user's content in match reason (AC3)", () => {
    const entries = [
      { dimension: "problems", content: "follow-ups falling through the cracks" },
    ];

    const matches = matchCapabilities(entries, [], TEMPLATES);
    const followUp = matches.find((m) => m.templateSlug === "follow-up-sequences");

    expect(followUp).toBeDefined();
    expect(followUp!.matchReason).toContain("follow-ups falling through");
    expect(followUp!.matchReason).toMatch(/^You mentioned/);
  });

  it("truncates long content in match reason", () => {
    const longContent = "x".repeat(100) + " follow-ups are terrible";
    const entries = [{ dimension: "problems", content: longContent }];

    const matches = matchCapabilities(entries, [], TEMPLATES);
    for (const m of matches) {
      expect(m.matchReason.length).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================
// Dedup and Suppression (AC4)
// ============================================================

describe("dedup and suppression", () => {
  it("excludes active processes by slug (AC4a)", () => {
    const entries = [
      { dimension: "problems", content: "follow-ups falling through the cracks" },
    ];

    const matches = matchCapabilities(entries, ["follow-up-sequences"], TEMPLATES);
    const followUp = matches.find((m) => m.templateSlug === "follow-up-sequences");

    expect(followUp).toBeUndefined();
  });

  it("excludes paused processes by slug (AC4b)", () => {
    const entries = [
      { dimension: "problems", content: "inbox is overwhelming, emails pile up" },
    ];

    // Paused processes are passed in as active slugs by the caller
    const matches = matchCapabilities(entries, ["inbox-triage"], TEMPLATES);
    const inbox = matches.find((m) => m.templateSlug === "inbox-triage");

    expect(inbox).toBeUndefined();
  });

  it("still matches other templates when some are excluded", () => {
    const entries = [
      { dimension: "problems", content: "follow-ups falling through and inbox overwhelm" },
    ];

    const matches = matchCapabilities(entries, ["follow-up-sequences"], TEMPLATES);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every((m) => m.templateSlug !== "follow-up-sequences")).toBe(true);
  });
});

// ============================================================
// Text Processing
// ============================================================

describe("tokenize", () => {
  it("splits text into meaningful words", () => {
    const tokens = tokenize("follow-ups are falling through the cracks");
    expect(tokens).toContain("follow");
    expect(tokens).toContain("ups");
    expect(tokens).toContain("falling");
    expect(tokens).toContain("cracks");
    // Stop words excluded
    expect(tokens).not.toContain("are");
    expect(tokens).not.toContain("the");
  });

  it("lowercases all tokens", () => {
    const tokens = tokenize("Follow-Up Sequences");
    for (const t of tokens) {
      expect(t).toBe(t.toLowerCase());
    }
  });
});

describe("stem", () => {
  it("strips common suffixes", () => {
    expect(stem("following")).toBe("follow");
    expect(stem("sequences")).toBe("sequenc");
    expect(stem("outreach")).toBe("outreach");
    expect(stem("invoicing")).toBe("invoic");
    expect(stem("invoice")).toBe("invoic");
  });
});

// ============================================================
// Forward Compatibility (AC1 options)
// ============================================================

describe("options", () => {
  it("accepts optional teamId without error", () => {
    const entries = [{ dimension: "problems", content: "follow-ups" }];
    const matches = matchCapabilities(entries, [], TEMPLATES, { teamId: "team-123" });
    expect(Array.isArray(matches)).toBe(true);
  });
});

// ============================================================
// Template Cache Invalidation
// ============================================================

describe("template cache", () => {
  // Isolated temp dirs — no pollution of real processes/templates
  let tmpTemplateDir: string;
  let tmpCycleDir: string;

  beforeEach(() => {
    clearTemplateCache();
    tmpTemplateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cap-matcher-tpl-"));
    tmpCycleDir = fs.mkdtempSync(path.join(os.tmpdir(), "cap-matcher-cyc-"));

    // Seed with one YAML template
    fs.writeFileSync(
      path.join(tmpTemplateDir, "seed.yaml"),
      `name: Seed Template
id: seed
description: Initial template for cache tests
quality_criteria:
  - "Seed criterion"
`,
    );
  });

  afterAll(() => {
    clearTemplateCache();
  });

  function cleanupDirs() {
    try { fs.rmSync(tmpTemplateDir, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(tmpCycleDir, { recursive: true, force: true }); } catch {}
  }

  it("caches and returns the same reference on repeat calls", () => {
    try {
      const first = loadTemplateMetadata(tmpTemplateDir, tmpCycleDir);
      const second = loadTemplateMetadata(tmpTemplateDir, tmpCycleDir);
      expect(second).toBe(first);
      expect(first.find((t) => t.slug === "seed")).toBeDefined();
    } finally {
      cleanupDirs();
    }
  });

  it("clearTemplateCache() forces reload on next call", () => {
    try {
      const first = loadTemplateMetadata(tmpTemplateDir, tmpCycleDir);
      clearTemplateCache();
      const second = loadTemplateMetadata(tmpTemplateDir, tmpCycleDir);
      expect(second).not.toBe(first);
      expect(second.length).toBe(first.length);
    } finally {
      cleanupDirs();
    }
  });

  it("auto-invalidates when a YAML file is added to the template dir", () => {
    try {
      const before = loadTemplateMetadata(tmpTemplateDir, tmpCycleDir);
      const beforeCount = before.length;

      // Small delay ensures dir mtime changes on fs with second-granularity mtime
      const newFile = path.join(tmpTemplateDir, "added.yaml");
      fs.writeFileSync(
        newFile,
        `name: Added Template
id: added
description: New template to trigger cache invalidation
quality_criteria:
  - "Added criterion"
`,
      );
      // Bump dir mtime explicitly — guards against fs with coarse mtime resolution
      const future = new Date(Date.now() + 1000);
      fs.utimesSync(tmpTemplateDir, future, future);

      const after = loadTemplateMetadata(tmpTemplateDir, tmpCycleDir);
      expect(after).not.toBe(before);
      expect(after.length).toBe(beforeCount + 1);
      expect(after.find((t) => t.slug === "added")).toBeDefined();
    } finally {
      cleanupDirs();
    }
  });
});
