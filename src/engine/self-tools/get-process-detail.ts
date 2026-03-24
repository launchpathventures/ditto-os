/**
 * Ditto — Self Tool: Get Process Detail
 *
 * Returns process steps, trust data, recent runs, and correction rates.
 * Output is structured JSON for inline data rendering.
 *
 * Provenance: Existing process-loader + trust.ts + schema queries.
 */

import { db, schema } from "../../db";
import { eq, desc } from "drizzle-orm";
import { computeTrustState, formatTrustState } from "../trust";
import type { DelegationResult } from "../self-delegation";

interface GetProcessDetailInput {
  processSlug: string;
}

export async function handleGetProcessDetail(
  input: GetProcessDetailInput,
): Promise<DelegationResult> {
  const { processSlug } = input;

  if (!processSlug) {
    return {
      toolName: "get_process_detail",
      success: false,
      output: "Process slug is required.",
    };
  }

  try {
    // Look up the process
    const [proc] = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, processSlug))
      .limit(1);

    if (!proc) {
      return {
        toolName: "get_process_detail",
        success: false,
        output: `Process not found: ${processSlug}`,
      };
    }

    // Get trust state
    const trustState = await computeTrustState(proc.id);
    const trustSummary = formatTrustState(proc.name, proc.trustTier as "supervised" | "spot_checked" | "autonomous" | "critical", trustState);

    // Get recent runs (last 5)
    const recentRuns = await db
      .select({
        id: schema.processRuns.id,
        status: schema.processRuns.status,
        createdAt: schema.processRuns.createdAt,
        completedAt: schema.processRuns.completedAt,
      })
      .from(schema.processRuns)
      .where(eq(schema.processRuns.processId, proc.id))
      .orderBy(desc(schema.processRuns.createdAt))
      .limit(5);

    // Parse step definitions from the stored definition
    const definition = proc.definition as Record<string, unknown> | null;
    const steps = definition && Array.isArray((definition as Record<string, unknown>).steps)
      ? ((definition as Record<string, unknown>).steps as Array<Record<string, unknown>>).map(
          (s) => ({
            id: s.id ?? s.parallel_group,
            name: s.name ?? s.id ?? s.parallel_group,
            executor: s.executor,
          }),
        )
      : [];

    const result = {
      name: proc.name,
      slug: proc.slug,
      status: proc.status,
      trustTier: proc.trustTier,
      trust: {
        approvalRate: trustState.approvalRate,
        correctionRate: trustState.correctionRate,
        runsInWindow: trustState.runsInWindow,
        trend: trustState.trend,
        consecutiveClean: trustState.consecutiveCleanRuns,
        summary: trustSummary,
      },
      steps,
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        status: r.status,
        created: r.createdAt,
        completed: r.completedAt,
      })),
    };

    return {
      toolName: "get_process_detail",
      success: true,
      output: JSON.stringify(result),
    };
  } catch (err) {
    return {
      toolName: "get_process_detail",
      success: false,
      output: `Failed to get process detail: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
