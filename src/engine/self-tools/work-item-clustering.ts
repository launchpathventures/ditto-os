/**
 * Ditto — Work Item Clustering Detector (MP-10.2)
 *
 * Scans recent work items for recurring patterns. When 3+ similar
 * items are detected, proposes formalizing into a process.
 *
 * Uses token-based similarity (not vector embeddings) to keep the
 * detection deterministic and fast. Clusters are identified by
 * comparing each work item's content tokens against all others.
 *
 * Provenance: Brief 165, MP-10.2. Pattern: Zapier "recommended apps."
 */

import { db, schema } from "../../db";
import { eq, desc, and, notInArray } from "drizzle-orm";
import { findProcessModelSync } from "../system-agents/process-model-lookup";

const CLUSTER_THRESHOLD = 3; // Minimum items to form a cluster
const SIMILARITY_THRESHOLD = 0.4; // Token overlap ratio to consider similar
const LOOKBACK_ITEMS = 50; // How many recent work items to scan

interface ProcessInfo {
  slug: string;
  name: string;
  description: string | null;
}

export interface WorkItemCluster {
  /** Human-readable label for the cluster */
  label: string;
  /** Number of similar items found */
  count: number;
  /** Suggested process name based on common tokens */
  suggestedProcessName: string;
  /** Matching template slug from process model library (for generate_process) */
  templateSlug: string | null;
  /** Representative work item IDs */
  itemIds: string[];
  /** Common tokens across cluster members */
  commonTokens: string[];
}

/**
 * Detect clusters of similar work items that aren't assigned to any process.
 * Returns clusters of 3+ similar unassigned items, filtered against
 * existing active processes to avoid suggesting what already exists.
 */
export async function detectWorkItemClusters(
  activeProcesses: ProcessInfo[],
): Promise<WorkItemCluster[]> {
  // Load recent unassigned work items (not routed, not system-generated)
  const items = await db
    .select({
      id: schema.workItems.id,
      content: schema.workItems.content,
      type: schema.workItems.type,
      status: schema.workItems.status,
      assignedProcess: schema.workItems.assignedProcess,
      source: schema.workItems.source,
    })
    .from(schema.workItems)
    .where(
      and(
        // Only look at ad-hoc items (not spawned by system)
        notInArray(schema.workItems.source, ["system_generated"]),
      ),
    )
    .orderBy(desc(schema.workItems.createdAt))
    .limit(LOOKBACK_ITEMS);

  if (items.length < CLUSTER_THRESHOLD) return [];

  // Tokenize all items
  const tokenized = items.map((item) => ({
    id: item.id,
    content: item.content,
    tokens: tokenize(item.content.toLowerCase()),
    assigned: !!item.assignedProcess,
  }));

  // Build clusters using greedy merging
  const clusters: WorkItemCluster[] = [];
  const used = new Set<string>();

  for (let i = 0; i < tokenized.length; i++) {
    if (used.has(tokenized[i].id)) continue;

    const cluster: typeof tokenized = [tokenized[i]];

    for (let j = i + 1; j < tokenized.length; j++) {
      if (used.has(tokenized[j].id)) continue;

      const sim = tokenSimilarity(tokenized[i].tokens, tokenized[j].tokens);
      if (sim >= SIMILARITY_THRESHOLD) {
        cluster.push(tokenized[j]);
      }
    }

    if (cluster.length >= CLUSTER_THRESHOLD) {
      // Find common tokens across cluster members
      const commonTokens = findCommonTokens(cluster.map((c) => c.tokens));

      if (commonTokens.length === 0) continue;

      // Build a suggested process name from common tokens
      const suggestedProcessName = commonTokens.slice(0, 3).join("-");
      const label = commonTokens.slice(0, 3).join(" ");

      // AC6: Match against template library for generate_process
      const templateMatch = findProcessModelSync(label);
      const templateSlug = templateMatch?.slug ?? null;

      // Check if this cluster overlaps with an existing process
      const existingText = activeProcesses
        .map((p) => `${p.slug} ${p.name} ${p.description ?? ""}`.toLowerCase())
        .join(" ");
      const coveredTokens = commonTokens.filter((t) => existingText.includes(t));
      if (coveredTokens.length >= commonTokens.length * 0.5) {
        // Cluster already covered by existing process — skip
        continue;
      }

      for (const member of cluster) {
        used.add(member.id);
      }

      clusters.push({
        label,
        count: cluster.length,
        suggestedProcessName,
        templateSlug,
        itemIds: cluster.map((c) => c.id),
        commonTokens,
      });
    }
  }

  return clusters;
}

/** Compute Jaccard-like token similarity between two token sets. */
function tokenSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

/** Find tokens that appear in at least 60% of the token lists. */
function findCommonTokens(tokenLists: string[][]): string[] {
  const freq = new Map<string, number>();
  for (const tokens of tokenLists) {
    const unique = new Set(tokens);
    for (const token of unique) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }

  const threshold = Math.ceil(tokenLists.length * 0.6);
  return [...freq.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);
}

/** Tokenize text, removing stop words and short tokens. */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "can", "to", "of", "in",
    "for", "on", "with", "at", "by", "from", "as", "and", "but",
    "or", "not", "so", "just", "need", "want", "please", "help",
    "this", "that", "it", "my", "me", "we", "our", "i",
  ]);
  return text
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}
