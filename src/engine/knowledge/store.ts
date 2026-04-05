/**
 * Ditto — Knowledge Base: LanceDB Vector Store
 *
 * Embedded vector + BM25 store for knowledge base chunks.
 * Uses LanceDB (zero-infra, JS/TS native, built-in hybrid search).
 *
 * Embedding strategy: maps to user's LLM_PROVIDER.
 * - OpenAI → text-embedding-3-small
 * - Ollama → nomic-embed-text (local, free)
 * - Anthropic → falls back to Ollama
 *
 * Provenance: Brief 079, LanceDB JS SDK.
 */

import lancedb, { rerankers } from "@lancedb/lancedb";
import { Index } from "@lancedb/lancedb";
import path from "path";
import { DATA_DIR } from "../../paths";
import { getCredential } from "../credential-vault";

// ============================================================
// Types
// ============================================================

export interface ChunkRecord {
  id: string;
  text: string;
  filePath: string;
  fileName: string;
  page: number;
  section: string;
  lineRange: string; // JSON [start, end]
  documentHash: string;
}

interface StoredChunk {
  [key: string]: unknown;
  id: string;
  text: string;
  filePath: string;
  fileName: string;
  page: number;
  section: string;
  lineRange: string;
  documentHash: string;
  vector: number[];
}

export interface SearchResult {
  id: string;
  text: string;
  filePath: string;
  fileName: string;
  page: number;
  section: string;
  lineRange: [number, number];
  documentHash: string;
  score: number;
}

// ============================================================
// Embedding
// ============================================================

/**
 * Resolve the embedding provider and API key.
 * Priority: explicit EMBEDDING_PROVIDER env > inferred from LLM_PROVIDER.
 * Returns null when no embedding provider is available (BM25-only mode).
 */
async function resolveEmbeddingProvider(): Promise<{
  provider: "voyage" | "openai" | "ollama";
  apiKey?: string;
} | null> {
  const explicit = process.env.EMBEDDING_PROVIDER;
  if (explicit) {
    if (explicit === "voyage") {
      const cred = await getCredential("__system__", "voyage");
      const key = cred?.value ?? process.env.VOYAGE_API_KEY;
      return key ? { provider: "voyage", apiKey: key } : null;
    }
    if (explicit === "openai") {
      const key = process.env.OPENAI_API_KEY;
      return key ? { provider: "openai", apiKey: key } : null;
    }
    if (explicit === "ollama") return { provider: "ollama" };
    return null;
  }

  // Infer from LLM_PROVIDER
  const llmProvider = process.env.LLM_PROVIDER ?? "ollama";

  if (llmProvider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    return key ? { provider: "openai", apiKey: key } : null;
  }

  if (llmProvider === "anthropic") {
    // Anthropic has no embedding API — try Voyage AI first, then Ollama
    const cred = await getCredential("__system__", "voyage");
    const voyageKey = cred?.value ?? process.env.VOYAGE_API_KEY;
    if (voyageKey) return { provider: "voyage", apiKey: voyageKey };

    // Try Ollama as local fallback
    try {
      const res = await fetch(`${process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return { provider: "ollama" };
    } catch {
      // Ollama not running — fall through to null (BM25-only)
    }
    return null;
  }

  // Ollama as LLM provider
  return { provider: "ollama" };
}

/**
 * Embed texts using the resolved provider.
 * Returns null when no embedding provider is available (BM25-only mode).
 */
async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const resolved = await resolveEmbeddingProvider();
  if (!resolved) return null;

  const { provider, apiKey } = resolved;

  if (provider === "voyage") {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.EMBEDDING_MODEL ?? "voyage-3-lite",
        input: texts,
      }),
    });

    if (!res.ok) throw new Error(`Voyage AI embedding failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
        input: texts,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.status}`);
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }

  // Ollama
  const ollamaBase = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = process.env.EMBEDDING_MODEL ?? "nomic-embed-text";

  const results: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${ollamaBase}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
    });

    if (!res.ok) {
      throw new Error(
        `Ollama embedding failed: ${res.status}. ` +
        `Ensure '${model}' is pulled: ollama pull ${model}`,
      );
    }

    const data = (await res.json()) as { embeddings: number[][] };
    results.push(data.embeddings[0]);
  }

  return results;
}

// ============================================================
// Knowledge Store
// ============================================================

/**
 * Validate that a value is safe for LanceDB filter interpolation.
 * Only allows hex characters, digits, and hyphens (covers SHA-256 hashes and chunk IDs).
 */
function assertSafeFilterValue(value: string): void {
  if (!/^[a-f0-9-]+$/i.test(value)) {
    throw new Error(`Unsafe filter value: ${value.slice(0, 50)}`);
  }
}

const KNOWLEDGE_DIR = path.join(DATA_DIR, "knowledge.lance");
const TABLE_NAME = "chunks";

let storeInstance: KnowledgeStore | null = null;

export class KnowledgeStore {
  private dbConnection: Awaited<ReturnType<typeof lancedb.connect>>;

  private constructor(dbConnection: Awaited<ReturnType<typeof lancedb.connect>>) {
    this.dbConnection = dbConnection;
  }

  static async create(): Promise<KnowledgeStore> {
    const dbConnection = await lancedb.connect(KNOWLEDGE_DIR);
    return new KnowledgeStore(dbConnection);
  }

  async addChunks(chunks: ChunkRecord[]): Promise<void> {
    if (chunks.length === 0) return;

    // Embed all chunk texts (null = no embedding provider, BM25-only)
    const texts = chunks.map((c) => c.text);
    const vectors = await embedTexts(texts);

    const records: StoredChunk[] = chunks.map((chunk, i) => ({
      ...chunk,
      // Zero vector placeholder when no embedding provider available
      vector: vectors ? vectors[i] : [],
    }));

    // Create or append to table, ensuring FTS index exists for hybrid/BM25 search
    const tableNames = await this.dbConnection.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      const table = await this.dbConnection.openTable(TABLE_NAME);
      await table.add(records);
      await table.createIndex("text", { config: Index.fts(), replace: true });
    } else {
      const table = await this.dbConnection.createTable(TABLE_NAME, records);
      await table.createIndex("text", { config: Index.fts() });
    }
  }

  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    const tableNames = await this.dbConnection.tableNames();
    if (!tableNames.includes(TABLE_NAME)) {
      return [];
    }

    const table = await this.dbConnection.openTable(TABLE_NAME);

    // Try embedding the query — null means no provider, use BM25-only
    const vectors = await embedTexts([query]);

    let results;
    if (vectors) {
      // Hybrid search: vector + BM25 full-text with RRF fusion
      const rrf = await rerankers.RRFReranker.create();
      results = await table
        .vectorSearch(vectors[0])
        .fullTextSearch(query)
        .rerank(rrf)
        .limit(topK)
        .toArray();
    } else {
      // BM25-only: no embedding provider available
      results = await table
        .query()
        .fullTextSearch(query)
        .limit(topK)
        .toArray();
    }

    return results.map((r) => ({
      id: r.id as string,
      text: r.text as string,
      filePath: r.filePath as string,
      fileName: r.fileName as string,
      page: r.page as number,
      section: r.section as string,
      lineRange: JSON.parse(r.lineRange as string) as [number, number],
      documentHash: r.documentHash as string,
      score: r._distance != null ? 1 - (r._distance as number) : 0,
    }));
  }

  async deleteByDocumentHash(hash: string): Promise<void> {
    const tableNames = await this.dbConnection.tableNames();
    if (!tableNames.includes(TABLE_NAME)) return;

    const table = await this.dbConnection.openTable(TABLE_NAME);
    assertSafeFilterValue(hash);
    await table.delete(`documentHash = '${hash}'`);
  }

  async getChunksByIds(ids: string[]): Promise<SearchResult[]> {
    const tableNames = await this.dbConnection.tableNames();
    if (!tableNames.includes(TABLE_NAME)) return [];

    const table = await this.dbConnection.openTable(TABLE_NAME);
    for (const id of ids) assertSafeFilterValue(id);
    const filter = ids.map((id) => `id = '${id}'`).join(" OR ");
    const results = await table.query().where(filter).toArray();

    return results.map((r) => ({
      id: r.id as string,
      text: r.text as string,
      filePath: r.filePath as string,
      fileName: r.fileName as string,
      page: r.page as number,
      section: r.section as string,
      lineRange: JSON.parse(r.lineRange as string) as [number, number],
      documentHash: r.documentHash as string,
      score: 1,
    }));
  }

  /**
   * Get all chunks for a document, sorted by chunk index.
   * Used for neighboring context (Layer 2).
   */
  async getChunksByDocumentHash(hash: string): Promise<SearchResult[]> {
    const tableNames = await this.dbConnection.tableNames();
    if (!tableNames.includes(TABLE_NAME)) return [];

    const table = await this.dbConnection.openTable(TABLE_NAME);
    assertSafeFilterValue(hash);
    const results = await table.query().where(`documentHash = '${hash}'`).toArray();

    return results
      .map((r) => ({
        id: r.id as string,
        text: r.text as string,
        filePath: r.filePath as string,
        fileName: r.fileName as string,
        page: r.page as number,
        section: r.section as string,
        lineRange: JSON.parse(r.lineRange as string) as [number, number],
        documentHash: r.documentHash as string,
        score: 0,
      }))
      .sort((a, b) => {
        // Sort by chunk index parsed from ID: ${hash}-${index}
        const idxA = parseInt(a.id.split("-").pop()!, 10);
        const idxB = parseInt(b.id.split("-").pop()!, 10);
        return idxA - idxB;
      });
  }
}

/**
 * Get or create the singleton knowledge store instance.
 */
export async function getKnowledgeStore(): Promise<KnowledgeStore> {
  if (!storeInstance) {
    storeInstance = await KnowledgeStore.create();
  }
  return storeInstance;
}
