/**
 * Ditto — Knowledge Base: Search
 *
 * Hybrid search query over the knowledge base.
 * Uses LanceDB vector search with built-in RRF.
 *
 * Provenance: Brief 079, LanceDB hybrid search.
 */

import { getKnowledgeStore, type SearchResult } from "./store";

export type { SearchResult };

/**
 * Get neighboring chunks around a specific chunk for context verification.
 * Returns chunks from the same document, ordered by position,
 * with the target chunk index identified.
 */
export async function getNeighboringContext(
  chunkId: string,
  windowSize: number = 2,
): Promise<{ chunks: SearchResult[]; targetIndex: number }> {
  // Parse documentHash and chunkIndex from ID format: ${hash}-${index}
  const lastDash = chunkId.lastIndexOf("-");
  if (lastDash === -1) return { chunks: [], targetIndex: -1 };

  const documentHash = chunkId.slice(0, lastDash);
  const chunkIndex = parseInt(chunkId.slice(lastDash + 1), 10);

  const store = await getKnowledgeStore();
  const allChunks = await store.getChunksByDocumentHash(documentHash);

  // Find position of target chunk in the sorted array
  const targetPos = allChunks.findIndex((c) => c.id === chunkId);
  if (targetPos === -1) return { chunks: [], targetIndex: -1 };

  // Extract window around target
  const start = Math.max(0, targetPos - windowSize);
  const end = Math.min(allChunks.length, targetPos + windowSize + 1);
  const windowChunks = allChunks.slice(start, end);

  return {
    chunks: windowChunks,
    targetIndex: targetPos - start,
  };
}

/**
 * Search the knowledge base for chunks relevant to the query.
 * Returns top-K results with relevance scores and source coordinates.
 */
export async function searchKnowledge(
  query: string,
  topK: number = 5,
): Promise<SearchResult[]> {
  const store = await getKnowledgeStore();
  return store.search(query, topK);
}

/**
 * Format search results for injection into an LLM prompt.
 * Each chunk is labeled with a source ID for citation.
 */
export function formatResultsForPrompt(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No relevant documents found in the knowledge base.";
  }

  const parts = results.map((r, i) => {
    const sourceId = `[SOURCE-${i + 1}]`;
    return [
      `${sourceId}`,
      `File: ${r.fileName} | Page: ${r.page} | Section: ${r.section} | Lines: ${r.lineRange[0]}-${r.lineRange[1]}`,
      `---`,
      r.text,
      `---`,
    ].join("\n");
  });

  return [
    "SOURCES FROM KNOWLEDGE BASE:",
    "",
    ...parts,
    "",
    "INSTRUCTIONS: Answer the question using ONLY the sources above.",
    "For each claim, include a verbatim quote from the source in quotation marks,",
    "followed by the source reference (e.g., [SOURCE-1]).",
    "If the sources don't contain the answer, say so explicitly.",
  ].join("\n");
}
