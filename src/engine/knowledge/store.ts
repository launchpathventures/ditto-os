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

async function embedTexts(texts: string[]): Promise<number[][]> {
  const provider = process.env.LLM_PROVIDER ?? "ollama";

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY required for embeddings");

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI embedding failed: ${res.status}`);
    const data = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data.map((d) => d.embedding);
  }

  // Ollama (default, also fallback for Anthropic)
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

    // Embed all chunk texts
    const texts = chunks.map((c) => c.text);
    const vectors = await embedTexts(texts);

    const records: StoredChunk[] = chunks.map((chunk, i) => ({
      ...chunk,
      vector: vectors[i],
    }));

    // Create or append to table, ensuring FTS index exists for hybrid search
    const tableNames = await this.dbConnection.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      const table = await this.dbConnection.openTable(TABLE_NAME);
      await table.add(records);
      // Recreate FTS index to include new data
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

    // Embed query
    const [queryVector] = await embedTexts([query]);

    // Hybrid search: vector + BM25 full-text with RRF fusion
    const rrf = await rerankers.RRFReranker.create();
    const results = await table
      .vectorSearch(queryVector)
      .fullTextSearch(query)
      .rerank(rrf)
      .limit(topK)
      .toArray();

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
