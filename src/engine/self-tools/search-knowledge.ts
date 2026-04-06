/**
 * Ditto — Self Tool: Search Knowledge Base
 *
 * Searches the ingested knowledge base and returns results
 * with source citations. Used by Self in conversation and
 * available to process steps via tool resolver.
 *
 * Uses dynamic imports to avoid pulling LanceDB native binary
 * into the Next.js webpack build (the import chain from
 * self-delegation → search-knowledge → store → @lancedb/lancedb
 * would otherwise fail at build time).
 *
 * Provenance: Brief 079, existing self-tool pattern.
 */

import type { DelegationResult } from "../self-delegation";
import type { ContentBlock } from "../content-blocks";

interface SearchKnowledgeInput {
  query: string;
  topK?: number;
}

export async function handleSearchKnowledge(
  input: SearchKnowledgeInput,
): Promise<DelegationResult> {
  const { query, topK = 5 } = input;

  if (!query || query.trim().length === 0) {
    return {
      toolName: "search_knowledge",
      success: false,
      output: "Search query is required.",
    };
  }

  try {
    // Dynamic imports — keeps LanceDB native binary out of webpack bundle
    const { searchKnowledge, formatResultsForPrompt } = await import("../knowledge/search");
    const { buildCitationBlock } = await import("../knowledge/cite");

    const results = await searchKnowledge(query.trim(), topK);

    if (results.length === 0) {
      return {
        toolName: "search_knowledge",
        success: true,
        output: "No documents found in the knowledge base matching your query. Have documents been ingested? Use: ditto knowledge ingest --file <path>",
      };
    }

    // Format results for prompt context
    const promptContext = formatResultsForPrompt(results);

    // Build citation block for the UI
    const citationBlock = buildCitationBlock(
      results.map((r, i) => ({
        sourceId: `SOURCE-${i + 1}`,
        quote: r.text,
        fileName: r.fileName,
        page: r.page,
        section: r.section,
        lineRange: r.lineRange,
        matchConfidence: r.score,
        verified: true,
        chunkId: r.id,
        fullText: r.text,
        documentHash: r.documentHash,
      })),
    );

    const contentBlocks: ContentBlock[] = [citationBlock];

    return {
      toolName: "search_knowledge",
      success: true,
      output: promptContext,
      metadata: {
        resultCount: results.length,
        contentBlocks,
      },
    };
  } catch (err) {
    return {
      toolName: "search_knowledge",
      success: false,
      output: `Knowledge search failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
