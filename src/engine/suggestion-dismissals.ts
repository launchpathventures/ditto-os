/**
 * Ditto — Suggestion Dismissal Tracking
 *
 * Records dismissed suggestions so they aren't repeated for 30 days.
 * Used by suggest_next tool and the coverage-agent to respect user choices.
 *
 * Provenance: Insight-142, cognitive/self.md proactive guidance spec.
 */

import { createHash } from "crypto";
import { db, schema } from "../db";
import { and, eq, gt } from "drizzle-orm";

const DISMISSAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Hash suggestion content for deduplication */
function hashContent(content: string): string {
  return createHash("sha256").update(content.toLowerCase().trim()).digest("hex");
}

/** Record a suggestion dismissal (30-day cooldown) */
export async function recordDismissal(
  userId: string,
  suggestionType: string,
  content: string,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DISMISSAL_WINDOW_MS);

  await db.insert(schema.suggestionDismissals).values({
    userId,
    suggestionType: suggestionType,
    contentHash: hashContent(content),
    content,
    dismissedAt: now,
    expiresAt,
  });
}

/** Check if a suggestion was recently dismissed */
export async function isDismissed(
  userId: string,
  content: string,
): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .select({ id: schema.suggestionDismissals.id })
    .from(schema.suggestionDismissals)
    .where(
      and(
        eq(schema.suggestionDismissals.userId, userId),
        eq(schema.suggestionDismissals.contentHash, hashContent(content)),
        gt(schema.suggestionDismissals.expiresAt, now),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/** Get all active (non-expired) dismissal content hashes for a user */
export async function getActiveDismissalHashes(
  userId: string,
): Promise<Set<string>> {
  const now = new Date();
  const rows = await db
    .select({ contentHash: schema.suggestionDismissals.contentHash })
    .from(schema.suggestionDismissals)
    .where(
      and(
        eq(schema.suggestionDismissals.userId, userId),
        gt(schema.suggestionDismissals.expiresAt, now),
      ),
    );

  return new Set(rows.map((r) => r.contentHash));
}

/** Exported for use in suggest-next filtering */
export { hashContent };
