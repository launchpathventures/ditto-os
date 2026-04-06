/**
 * CLI Command: knowledge
 * Manage the knowledge base — ingest documents and search.
 *
 * ditto knowledge ingest --file <path> [--local]  — ingest a file
 * ditto knowledge ingest --dir <path> [--local]   — ingest a directory
 * ditto knowledge search <query>                  — search the knowledge base
 *
 * Provenance: Brief 079, citty command pattern.
 */

import { defineCommand } from "citty";
import { ingestFile, ingestDirectory } from "../../engine/knowledge/ingest";
import { searchKnowledge } from "../../engine/knowledge/search";

const ingestCommand = defineCommand({
  meta: {
    name: "ingest",
    description: "Ingest documents into the knowledge base",
  },
  args: {
    file: {
      type: "string",
      description: "Path to a single file to ingest",
    },
    dir: {
      type: "string",
      description: "Path to a directory of files to ingest",
    },
    local: {
      type: "boolean",
      description: "Use local parsers instead of LlamaParse (for sensitive docs)",
      default: false,
    },
  },
  async run({ args }) {
    if (!args.file && !args.dir) {
      console.error("Error: provide either --file <path> or --dir <path>");
      process.exit(1);
    }

    const options = { local: args.local };

    if (args.file) {
      try {
        const result = await ingestFile(args.file, options);
        if (result.skipped) {
          console.log(`${result.fileName} unchanged (hash match). Skipping.`);
        } else {
          console.log(`Ingested ${result.fileName}: ${result.chunkCount} chunks indexed. Source: ${result.source}${result.source === "local" ? ` (${getParserName(result.fileName)})` : ""}.`);
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }

    if (args.dir) {
      try {
        const results = await ingestDirectory(args.dir, options);
        const ingested = results.filter((r) => !r.skipped);
        const skipped = results.filter((r) => r.skipped);
        const totalChunks = ingested.reduce((sum, r) => sum + r.chunkCount, 0);

        for (const r of ingested) {
          console.log(`  ✓ ${r.fileName}: ${r.chunkCount} chunks`);
        }
        for (const r of skipped) {
          console.log(`  — ${r.fileName}: unchanged, skipped`);
        }

        console.log(`\nIngested ${ingested.length} files (${totalChunks} chunks). Skipped ${skipped.length} unchanged.`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }
  },
});

const searchCommand = defineCommand({
  meta: {
    name: "search",
    description: "Search the knowledge base",
  },
  args: {
    query: {
      type: "positional",
      description: "Search query",
      required: true,
    },
    limit: {
      type: "string",
      description: "Number of results (default: 5)",
      default: "5",
    },
  },
  async run({ args }) {
    try {
      const topK = parseInt(args.limit, 10) || 5;
      const results = await searchKnowledge(args.query, topK);

      if (results.length === 0) {
        console.log("No results found. Have documents been ingested?");
        return;
      }

      for (const [i, r] of results.entries()) {
        const score = Math.round(r.score * 100);
        console.log(`\n[${i + 1}] ${r.fileName} — Page ${r.page}, ${r.section} (${score}% relevance)`);
        console.log(`    Lines ${r.lineRange[0]}-${r.lineRange[1]}`);
        console.log(`    ${r.text.slice(0, 200)}${r.text.length > 200 ? "..." : ""}`);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  },
});

function getParserName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf": return "pdf-parse";
    case "docx": case "doc": return "mammoth";
    case "html": case "htm": return "cheerio";
    default: return "text";
  }
}

export const knowledgeCommand = defineCommand({
  meta: {
    name: "knowledge",
    description: "Manage the knowledge base — ingest documents and search",
  },
  subCommands: {
    ingest: ingestCommand,
    search: searchCommand,
  },
});
