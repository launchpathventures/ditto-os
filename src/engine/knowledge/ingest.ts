/**
 * Ditto — Knowledge Base: Document Ingestion
 *
 * Parses documents into markdown chunks with source coordinates,
 * then stores them in LanceDB via the knowledge store.
 *
 * Two parsing modes:
 * - Cloud: LlamaParse REST API (130+ formats, structure-preserving)
 * - Local: TypeScript-native parsers (pdf-parse, mammoth, cheerio)
 *
 * Provenance: Brief 079, LlamaParse API, dsRAG chunking pattern.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import { getCredential } from "../credential-vault";
import { getKnowledgeStore, type ChunkRecord } from "./store";

// ============================================================
// Types
// ============================================================

export interface IngestResult {
  filePath: string;
  fileName: string;
  chunkCount: number;
  source: "llamaparse" | "local";
  skipped: boolean;
  skipReason?: string;
}

interface ParsedChunk {
  text: string;
  page: number;
  section: string;
  lineRange: [number, number];
}

// ============================================================
// File hashing for change detection
// ============================================================

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

// ============================================================
// LlamaParse cloud parsing
// ============================================================

async function parseLlamaParse(filePath: string, apiKey: string): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);

  // Upload
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileName);

  const uploadRes = await fetch("https://api.cloud.llamaindex.ai/api/parsing/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    throw new Error(`LlamaParse upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  const { id: jobId } = (await uploadRes.json()) as { id: string };

  // Poll for completion
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const statusRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!statusRes.ok) continue;

    const status = (await statusRes.json()) as { status: string };
    if (status.status === "SUCCESS") {
      const resultRes = await fetch(
        `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );

      if (!resultRes.ok) {
        throw new Error(`LlamaParse result fetch failed: ${resultRes.status}`);
      }

      const result = (await resultRes.json()) as { markdown: string };
      return result.markdown;
    }

    if (status.status === "ERROR") {
      throw new Error("LlamaParse parsing failed");
    }
  }

  throw new Error("LlamaParse timed out");
}

// ============================================================
// Local parsers (TypeScript-native)
// ============================================================

/** Block-level elements that should produce newlines when extracting text from HTML. */
const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "tr", "br", "blockquote", "pre", "section", "article",
  "header", "footer", "dt", "dd", "figcaption",
]);

/**
 * Extract text from cheerio DOM preserving structural whitespace.
 * Inserts newlines around block elements so downstream chunking works.
 */
function extractStructuredText($: ReturnType<typeof import("cheerio").load>): string {
  const lines: string[] = [];

  function walk(nodes: ReturnType<typeof $.root>["0"]["children"]) {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "text") {
        const text = (node as unknown as { data: string }).data;
        if (text.trim()) lines.push(text.trim());
      } else if (node.type === "tag") {
        const el = node as unknown as { tagName: string; children: typeof nodes };
        const tag = el.tagName.toLowerCase();
        // Convert headings to markdown headings for chunker compatibility
        if (tag.match(/^h[1-6]$/)) {
          const level = parseInt(tag[1], 10);
          const heading = $(node).text().trim();
          if (heading) lines.push(`${"#".repeat(level)} ${heading}`);
        } else if (BLOCK_TAGS.has(tag)) {
          walk(el.children);
          lines.push(""); // blank line after block
        } else {
          walk(el.children);
        }
      }
    }
  }

  walk($("body").length ? $("body")[0].children as never : $.root()[0].children as never);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function parseLocal(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf": {
      const { PDFParse } = await import("pdf-parse");
      const buffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      return result.text;
    }

    case ".docx":
    case ".doc": {
      // mammoth ships no TS types — use require for CJS interop
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as { convertToMarkdown: (input: { path: string }) => Promise<{ value: string }> };
      const result = await mammoth.convertToMarkdown({ path: filePath });
      return result.value;
    }

    case ".html":
    case ".htm": {
      const cheerio = await import("cheerio");
      const html = fs.readFileSync(filePath, "utf-8");
      const $ = cheerio.load(html);
      // Remove scripts and styles
      $("script, style").remove();
      // Extract text with structural whitespace ($.text() fuses words across elements)
      return extractStructuredText($);
    }

    case ".xlsx": {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(fs.readFileSync(filePath));
      const lines: string[] = [];
      for (const name of workbook.SheetNames) {
        lines.push(`## ${name}`);
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
        lines.push(csv);
      }
      return lines.join("\n\n");
    }

    case ".txt":
    case ".md":
    case ".csv":
      return fs.readFileSync(filePath, "utf-8");

    default:
      throw new Error(`Unsupported format for local parsing: ${ext}`);
  }
}

// ============================================================
// Structure-aware chunking (dsRAG pattern)
// ============================================================

/**
 * Chunk markdown text along structural boundaries (headings, page breaks).
 * Each chunk carries source coordinates: page, section, line range.
 *
 * Provenance: dsRAG structure-aware sectioning pattern.
 */
export function chunkMarkdown(text: string, fileName: string): ParsedChunk[] {
  const lines = text.split("\n");
  const chunks: ParsedChunk[] = [];

  let currentSection = "Document Start";
  let currentPage = 1;
  let currentChunkLines: string[] = [];
  let chunkStartLine = 1;

  const maxChunkSize = 1500; // characters

  function flushChunk() {
    const chunkText = currentChunkLines.join("\n").trim();
    if (chunkText.length > 0) {
      chunks.push({
        text: chunkText,
        page: currentPage,
        section: currentSection,
        lineRange: [chunkStartLine, chunkStartLine + currentChunkLines.length - 1],
      });
    }
    currentChunkLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect page breaks (LlamaParse uses --- or Page N markers)
    if (line.match(/^---+$/) || line.match(/^#+\s*Page\s+\d+/i)) {
      flushChunk();
      currentPage++;
      chunkStartLine = lineNum + 1;
      continue;
    }

    // Detect section headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      // Flush current chunk before starting a new section
      flushChunk();
      currentSection = headingMatch[2].trim();
      chunkStartLine = lineNum;
    }

    currentChunkLines.push(line);

    // Flush if chunk is large enough
    const currentText = currentChunkLines.join("\n");
    if (currentText.length >= maxChunkSize) {
      flushChunk();
      chunkStartLine = lineNum + 1;
    }
  }

  // Flush remaining
  flushChunk();

  return chunks;
}

// ============================================================
// Supported formats
// ============================================================

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".doc", ".pptx", ".xlsx",
  ".html", ".htm", ".txt", ".md", ".csv",
]);

const LOCAL_SUPPORTED = new Set([
  ".pdf", ".docx", ".doc", ".html", ".htm", ".txt", ".md", ".csv", ".xlsx",
]);

function isSupported(filePath: string, local: boolean): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return local ? LOCAL_SUPPORTED.has(ext) : SUPPORTED_EXTENSIONS.has(ext);
}

// ============================================================
// Main ingest function
// ============================================================

export async function ingestFile(
  filePath: string,
  options: { local?: boolean } = {},
): Promise<IngestResult> {
  const absPath = path.resolve(filePath);
  const fileName = path.basename(absPath);
  const ext = path.extname(absPath).toLowerCase();

  if (!fs.existsSync(absPath)) {
    throw new Error(`File not found: ${absPath}`);
  }

  if (!isSupported(absPath, !!options.local)) {
    throw new Error(
      `Unsupported format: ${ext}. Supported: ${[...(options.local ? LOCAL_SUPPORTED : SUPPORTED_EXTENSIONS)].join(", ")}`,
    );
  }

  // Check content hash for change detection
  const contentHash = hashFile(absPath);
  const existing = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.filePath, absPath));

  if (existing.length > 0 && existing[0].contentHash === contentHash) {
    return {
      filePath: absPath,
      fileName,
      chunkCount: existing[0].chunkCount,
      source: existing[0].source as "llamaparse" | "local",
      skipped: true,
      skipReason: "unchanged (hash match)",
    };
  }

  // Parse document to markdown
  let markdown: string;
  let source: "llamaparse" | "local";

  if (options.local) {
    markdown = await parseLocal(absPath);
    source = "local";
  } else {
    // Get LlamaParse API key from credential vault or env
    const credential = await getCredential("__system__", "llamaparse");
    const apiKey = credential?.value ?? process.env.LLAMAPARSE_API_KEY;

    if (!apiKey) {
      throw new Error(
        "LlamaParse API key not configured. Run: ditto credential add llamaparse --process __system__\n" +
        "Or use --local flag for local parsing.",
      );
    }

    markdown = await parseLlamaParse(absPath, apiKey);
    source = "llamaparse";
  }

  // Store full parsed markdown for document viewer (Layer 3)
  const pageBreaks = (markdown.match(/^---+$/gm) || []).length +
    (markdown.match(/^#+\s*Page\s+\d+/gim) || []).length;
  const pageCount = pageBreaks + 1;

  await db
    .insert(schema.documentContent)
    .values({
      documentHash: contentHash,
      parsedMarkdown: markdown,
      pageCount,
    })
    .onConflictDoUpdate({
      target: schema.documentContent.documentHash,
      set: { parsedMarkdown: markdown, pageCount },
    });

  // Chunk the markdown
  const chunks = chunkMarkdown(markdown, fileName);

  // Store in LanceDB
  const store = await getKnowledgeStore();
  const chunkRecords: ChunkRecord[] = chunks.map((chunk, i) => ({
    id: `${contentHash}-${i}`,
    text: chunk.text,
    filePath: absPath,
    fileName,
    page: chunk.page,
    section: chunk.section,
    lineRange: JSON.stringify(chunk.lineRange),
    documentHash: contentHash,
  }));

  // Delete old chunks if re-ingesting
  if (existing.length > 0) {
    await store.deleteByDocumentHash(existing[0].contentHash);
  }

  await store.addChunks(chunkRecords);

  // Update documents table
  if (existing.length > 0) {
    await db
      .update(schema.documents)
      .set({
        contentHash,
        chunkCount: chunks.length,
        format: ext.slice(1),
        source,
        lastIndexed: new Date(),
      })
      .where(eq(schema.documents.id, existing[0].id));
  } else {
    await db.insert(schema.documents).values({
      filePath: absPath,
      fileName,
      format: ext.slice(1),
      contentHash,
      chunkCount: chunks.length,
      source,
    });
  }

  return {
    filePath: absPath,
    fileName,
    chunkCount: chunks.length,
    source,
    skipped: false,
  };
}

/**
 * Ingest all supported files in a directory.
 */
export async function ingestDirectory(
  dirPath: string,
  options: { local?: boolean } = {},
): Promise<IngestResult[]> {
  const absDir = path.resolve(dirPath);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    throw new Error(`Not a directory: ${absDir}`);
  }

  const files = fs.readdirSync(absDir)
    .filter((f) => isSupported(path.join(absDir, f), !!options.local))
    .map((f) => path.join(absDir, f));

  const results: IngestResult[] = [];
  for (const file of files) {
    try {
      const result = await ingestFile(file, options);
      results.push(result);
    } catch (err) {
      console.error(`  Failed to ingest ${path.basename(file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return results;
}
