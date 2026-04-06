/**
 * Ditto — Knowledge Base: Citation Verification
 *
 * Builds citation objects from retrieved chunks.
 * Verifies LLM-generated verbatim quotes against source chunks
 * using fuzzy string matching. Deterministic — no LLM verification.
 *
 * Provenance: Brief 079 (original to Ditto).
 */

import type { SearchResult } from "./store";
import type { KnowledgeCitationBlock } from "../content-blocks";

// ============================================================
// Types
// ============================================================

export interface Citation {
  sourceId: string; // e.g., "SOURCE-1"
  quote: string;
  fileName: string;
  page: number;
  section: string;
  lineRange: [number, number];
  matchConfidence: number; // 0-1, from fuzzy match
  verified: boolean;
  // Citation verification fields (Layer 1-3)
  chunkId?: string;
  fullText?: string;
  documentHash?: string;
}

// ============================================================
// Fuzzy string matching
// ============================================================

/**
 * Compute similarity between two strings using Dice coefficient
 * on character bigrams. Returns 0-1.
 */
function diceCoefficient(a: string, b: string): number {
  const aNorm = a.toLowerCase().replace(/\s+/g, " ").trim();
  const bNorm = b.toLowerCase().replace(/\s+/g, " ").trim();

  if (aNorm === bNorm) return 1;
  if (aNorm.length < 2 || bNorm.length < 2) return 0;

  const aBigrams = new Map<string, number>();
  for (let i = 0; i < aNorm.length - 1; i++) {
    const bigram = aNorm.slice(i, i + 2);
    aBigrams.set(bigram, (aBigrams.get(bigram) ?? 0) + 1);
  }

  let intersectionSize = 0;
  for (let i = 0; i < bNorm.length - 1; i++) {
    const bigram = bNorm.slice(i, i + 2);
    const count = aBigrams.get(bigram);
    if (count && count > 0) {
      aBigrams.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  return (2 * intersectionSize) / (aNorm.length - 1 + bNorm.length - 1);
}

// ============================================================
// Citation extraction and verification
// ============================================================

const CITATION_THRESHOLD = 0.9;

/**
 * Extract citation references from LLM response text.
 * Looks for patterns like: "quoted text" [SOURCE-N]
 */
export function extractCitations(
  responseText: string,
  sources: SearchResult[],
): Citation[] {
  const citations: Citation[] = [];

  // Match "quoted text" [SOURCE-N] patterns
  const pattern = /"([^"]+)"\s*\[SOURCE-(\d+)\]/g;
  let match;

  while ((match = pattern.exec(responseText)) !== null) {
    const quote = match[1];
    const sourceIndex = parseInt(match[2], 10) - 1;

    if (sourceIndex < 0 || sourceIndex >= sources.length) continue;

    const source = sources[sourceIndex];
    const similarity = diceCoefficient(quote, source.text);

    // Also check if the quote is a substring of the source (exact match)
    const exactMatch = source.text.toLowerCase().includes(quote.toLowerCase());
    const matchConfidence = exactMatch ? 1 : similarity;

    citations.push({
      sourceId: `SOURCE-${sourceIndex + 1}`,
      quote,
      fileName: source.fileName,
      page: source.page,
      section: source.section,
      lineRange: source.lineRange,
      matchConfidence,
      verified: matchConfidence >= CITATION_THRESHOLD,
    });
  }

  return citations;
}

/**
 * Build a KnowledgeCitationBlock from verified citations.
 * Extended with document citation fields per Brief 079.
 */
export function buildCitationBlock(citations: Citation[]): KnowledgeCitationBlock {
  return {
    type: "knowledge_citation",
    label: "Document Sources",
    sources: citations.map((c) => ({
      name: c.fileName,
      type: "document",
      excerpt: c.quote.slice(0, 200),
      page: c.page,
      section: c.section,
      lineRange: c.lineRange,
      verbatimQuote: c.quote,
      matchConfidence: c.matchConfidence,
      chunkId: c.chunkId,
      fullText: c.fullText,
      documentHash: c.documentHash,
    })),
  };
}

/**
 * Check if any citations failed verification.
 */
export function hasUnverifiedCitations(citations: Citation[]): boolean {
  return citations.some((c) => !c.verified);
}

/**
 * Format verification summary for display.
 */
export function formatVerificationSummary(citations: Citation[]): string {
  if (citations.length === 0) return "No citations to verify.";

  const verified = citations.filter((c) => c.verified).length;
  const total = citations.length;

  const lines = citations.map((c) => {
    const status = c.verified ? "✓" : "⚠";
    const conf = Math.round(c.matchConfidence * 100);
    return `  ${status} ${c.sourceId} (${c.fileName} p${c.page}) — ${conf}% match`;
  });

  return [`Citations: ${verified}/${total} verified`, ...lines].join("\n");
}
