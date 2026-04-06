/**
 * Tests for knowledge base modules.
 * Covers cite.ts (deterministic verification), ingest.ts (chunking),
 * and search.ts (prompt formatting).
 *
 * Provenance: Brief 079 acceptance criteria.
 */

import { describe, it, expect } from "vitest";
import { chunkMarkdown } from "./ingest";
import { formatResultsForPrompt } from "./search";
import {
  extractCitations,
  buildCitationBlock,
  hasUnverifiedCitations,
  formatVerificationSummary,
} from "./cite";
import type { SearchResult } from "./store";

// ============================================================
// chunkMarkdown
// ============================================================

describe("chunkMarkdown", () => {
  it("splits on heading boundaries", () => {
    const text = [
      "# Introduction",
      "Some intro text here.",
      "",
      "# Methods",
      "The methodology section.",
    ].join("\n");

    const chunks = chunkMarkdown(text, "test.md");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].section).toBe("Introduction");
    expect(chunks[1].section).toBe("Methods");
  });

  it("tracks page numbers via page break markers", () => {
    const text = [
      "# Page 1 Content",
      "First page text.",
      "---",
      "# Page 2 Content",
      "Second page text.",
    ].join("\n");

    const chunks = chunkMarkdown(text, "test.pdf");
    const pages = chunks.map((c) => c.page);
    // Page break (---) increments to page 2, heading after break starts a new chunk
    expect(pages).toContain(2);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("respects max chunk size", () => {
    // Use multiple lines to ensure chunking at the 1500 char boundary
    const lines = ["# Section"];
    for (let i = 0; i < 100; i++) {
      lines.push("This is a line of text that helps fill the chunk. ".repeat(2));
    }
    const longText = lines.join("\n");
    const chunks = chunkMarkdown(longText, "long.md");
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves line range metadata", () => {
    const text = ["# Title", "Line 2", "Line 3", "Line 4"].join("\n");
    const chunks = chunkMarkdown(text, "test.md");
    expect(chunks[0].lineRange[0]).toBe(1);
    expect(chunks[0].lineRange[1]).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for empty text", () => {
    const chunks = chunkMarkdown("", "empty.md");
    expect(chunks).toHaveLength(0);
  });

  it("handles text with no headings", () => {
    const text = "Just plain text\nwith multiple lines\nno headings.";
    const chunks = chunkMarkdown(text, "plain.txt");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].section).toBe("Document Start");
  });
});

// ============================================================
// extractCitations
// ============================================================

const mockSources: SearchResult[] = [
  {
    id: "abc123-0",
    text: "The quick brown fox jumps over the lazy dog.",
    filePath: "/docs/test.pdf",
    fileName: "test.pdf",
    page: 1,
    section: "Intro",
    lineRange: [1, 5],
    documentHash: "abc123",
    score: 0.95,
  },
  {
    id: "def456-0",
    text: "Revenue grew 15% year over year in Q3 2025.",
    filePath: "/docs/report.pdf",
    fileName: "report.pdf",
    page: 3,
    section: "Financials",
    lineRange: [20, 25],
    documentHash: "def456",
    score: 0.88,
  },
];

describe("extractCitations", () => {
  it("extracts verbatim quotes with source references", () => {
    const response = 'According to the document, "The quick brown fox jumps over the lazy dog." [SOURCE-1]';
    const citations = extractCitations(response, mockSources);
    expect(citations).toHaveLength(1);
    expect(citations[0].sourceId).toBe("SOURCE-1");
    expect(citations[0].verified).toBe(true);
    expect(citations[0].matchConfidence).toBe(1); // exact substring match
  });

  it("verifies fuzzy-matched quotes above threshold", () => {
    // Slightly different quote — should still match via Dice coefficient
    const response = '"The quick brown fox jumps over a lazy dog" [SOURCE-1]';
    const citations = extractCitations(response, mockSources);
    expect(citations).toHaveLength(1);
    expect(citations[0].matchConfidence).toBeGreaterThan(0.8);
  });

  it("marks low-confidence quotes as unverified", () => {
    const response = '"Something completely different and unrelated" [SOURCE-1]';
    const citations = extractCitations(response, mockSources);
    expect(citations).toHaveLength(1);
    expect(citations[0].verified).toBe(false);
    expect(citations[0].matchConfidence).toBeLessThan(0.9);
  });

  it("handles multiple citations", () => {
    const response =
      '"The quick brown fox jumps over the lazy dog." [SOURCE-1] ' +
      '"Revenue grew 15% year over year in Q3 2025." [SOURCE-2]';
    const citations = extractCitations(response, mockSources);
    expect(citations).toHaveLength(2);
    expect(citations[0].sourceId).toBe("SOURCE-1");
    expect(citations[1].sourceId).toBe("SOURCE-2");
  });

  it("ignores invalid source references", () => {
    const response = '"Some text" [SOURCE-99]';
    const citations = extractCitations(response, mockSources);
    expect(citations).toHaveLength(0);
  });

  it("returns empty for no citations", () => {
    const citations = extractCitations("No citations here.", mockSources);
    expect(citations).toHaveLength(0);
  });
});

// ============================================================
// buildCitationBlock
// ============================================================

describe("buildCitationBlock", () => {
  it("creates a knowledge_citation block", () => {
    const citations = extractCitations(
      '"The quick brown fox jumps over the lazy dog." [SOURCE-1]',
      mockSources,
    );
    const block = buildCitationBlock(citations);
    expect(block.type).toBe("knowledge_citation");
    expect(block.label).toBe("Document Sources");
    expect(block.sources).toHaveLength(1);
    expect(block.sources[0].name).toBe("test.pdf");
    expect(block.sources[0].page).toBe(1);
    expect(block.sources[0].section).toBe("Intro");
    expect(block.sources[0].matchConfidence).toBe(1);
  });
});

// ============================================================
// hasUnverifiedCitations
// ============================================================

describe("hasUnverifiedCitations", () => {
  it("returns false when all citations are verified", () => {
    const citations = extractCitations(
      '"The quick brown fox jumps over the lazy dog." [SOURCE-1]',
      mockSources,
    );
    expect(hasUnverifiedCitations(citations)).toBe(false);
  });

  it("returns true when any citation is unverified", () => {
    const citations = extractCitations(
      '"Something completely different" [SOURCE-1]',
      mockSources,
    );
    expect(hasUnverifiedCitations(citations)).toBe(true);
  });
});

// ============================================================
// formatVerificationSummary
// ============================================================

describe("formatVerificationSummary", () => {
  it("shows verified/total counts", () => {
    const citations = extractCitations(
      '"The quick brown fox jumps over the lazy dog." [SOURCE-1]',
      mockSources,
    );
    const summary = formatVerificationSummary(citations);
    expect(summary).toContain("1/1 verified");
    expect(summary).toContain("✓");
  });

  it("handles empty citations", () => {
    expect(formatVerificationSummary([])).toBe("No citations to verify.");
  });
});

// ============================================================
// formatResultsForPrompt
// ============================================================

describe("formatResultsForPrompt", () => {
  it("formats results with SOURCE labels", () => {
    const formatted = formatResultsForPrompt(mockSources);
    expect(formatted).toContain("[SOURCE-1]");
    expect(formatted).toContain("[SOURCE-2]");
    expect(formatted).toContain("test.pdf");
    expect(formatted).toContain("report.pdf");
    expect(formatted).toContain("SOURCES FROM KNOWLEDGE BASE");
  });

  it("returns helpful message for empty results", () => {
    const formatted = formatResultsForPrompt([]);
    expect(formatted).toContain("No relevant documents found");
  });
});
