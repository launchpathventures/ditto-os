/**
 * Ditto — Self Tool: Search Workspace (Brief 281)
 *
 * Read-only recall over durable workspace artifacts — projects,
 * processes, memories, work items, reviews, recent activity. Lets Mira
 * answer "where did that go?" inline instead of telling the user to go
 * navigate primitive tabs.
 *
 * Calls the shared `recallWorkspace()` helper IN-PROCESS. It must never
 * self-HTTP to `/api/v1/workspace/archive` (Insight-211) — the route and
 * this tool are two thin surfaces over the one helper.
 *
 * This tool builds NO content blocks itself: it returns a plain-text
 * summary for the model's context window plus the structured recall
 * payload in `metadata.recall`. `self-stream.ts` maps that payload to
 * existing blocks (InteractiveTableBlock / RecordBlock /
 * KnowledgeCitationBlock / AlertBlock) — block shaping lives in one place.
 *
 * Provenance: Brief 281; search-knowledge.ts (self-tool contract).
 */

import type { DelegationResult } from "../self-delegation";
import {
  recallWorkspace,
  ALL_RECALL_KINDS,
  RECALL_KIND_LABEL,
  type RecallKind,
  type RecallResponse,
} from "../workspace-recall";

interface SearchWorkspaceInput {
  query?: string;
  kinds?: string[];
  projectSlug?: string;
  status?: string;
  includeArchived?: boolean;
  limit?: number;
}

function normalizeKinds(kinds: string[] | undefined): RecallKind[] | undefined {
  if (!kinds || kinds.length === 0) return undefined;
  const valid = kinds.filter((k): k is RecallKind =>
    (ALL_RECALL_KINDS as readonly string[]).includes(k),
  );
  return valid.length > 0 ? valid : undefined;
}

/** Compact plain-text rendering for the LLM context window. */
function summarizeForPrompt(resp: RecallResponse): string {
  if (resp.results.length === 0) {
    const scanned = resp.kinds.map((k) => RECALL_KIND_LABEL[k]).join(", ");
    return `No workspace artifacts matched${
      resp.query ? ` "${resp.query}"` : ""
    }. Searched: ${scanned}. Suggest two narrower or different filters; do not dead-end.`;
  }

  const byKind = new Map<RecallKind, string[]>();
  for (const r of resp.results) {
    const line = `- ${r.title}${r.status ? ` (${r.status})` : ""}${
      r.route ? ` → ${r.route}` : ""
    }`;
    const arr = byKind.get(r.kind) ?? [];
    arr.push(line);
    byKind.set(r.kind, arr);
  }

  const blocks: string[] = [];
  for (const [kind, lines] of byKind) {
    const total = resp.counts[kind];
    const shown = lines.length;
    const more = total > shown ? ` (showing ${shown} of ${total})` : "";
    blocks.push(`${RECALL_KIND_LABEL[kind]}${more}:\n${lines.join("\n")}`);
  }

  let out = `Found ${resp.results.length} workspace artifact(s)${
    resp.query ? ` for "${resp.query}"` : ""
  }:\n\n${blocks.join("\n\n")}`;
  if (resp.truncated) {
    out +=
      "\n\nMore results exist. Offer the user a narrower query or a kind/status filter rather than dumping the full list.";
  }
  return out;
}

export async function handleSearchWorkspace(
  input: SearchWorkspaceInput,
): Promise<DelegationResult> {
  try {
    const resp = await recallWorkspace({
      query: input.query,
      kinds: normalizeKinds(input.kinds),
      projectSlug: input.projectSlug,
      status: input.status,
      includeArchived: input.includeArchived === true,
      limit: input.limit,
    });

    return {
      toolName: "search_workspace",
      success: true,
      output: summarizeForPrompt(resp),
      metadata: {
        resultCount: resp.results.length,
        truncated: resp.truncated,
        counts: resp.counts,
        // self-stream.ts reads this to build content blocks.
        recall: resp,
      },
    };
  } catch (err) {
    return {
      toolName: "search_workspace",
      success: false,
      output: `Workspace recall failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
