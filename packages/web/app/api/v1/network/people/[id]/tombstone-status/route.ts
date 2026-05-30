/**
 * Public-profile tombstone-status endpoint (Brief 284, R-Q11).
 *
 * Lightweight read-only check used by middleware to decide whether
 * `/people/[handle]` should render the profile or return HTTP 410 Gone.
 * The endpoint is intentionally unauthenticated and discloses only
 * `{ tombstoned: boolean }` — never the prior identity, name, or any
 * other content from the deleted profile.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { networkDb } from "../../../../../../../../../src/db/network-db";
import { isSubjectTombstoned } from "../../../../../../../../../src/engine/network-tombstones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  // Next.js requires the dynamic-segment name to match the directory, so the
  // ctx param is `id`. We resolve it against the `handle` column — the slug
  // semantically still IS the public handle.
  params: Promise<{ id: string }>;
}

function normalizeHandle(raw: string): string {
  return decodeURIComponent(raw).trim().toLowerCase();
}

export async function GET(_request: Request, ctx: Params) {
  try {
    const { id } = await ctx.params;
    const normalized = normalizeHandle(id);
    if (!normalized) {
      return NextResponse.json({ tombstoned: false, handle: null }, { status: 200 });
    }
    const [user] = await networkDb
      .select({
        id: networkSchema.networkUsers.id,
        status: networkSchema.networkUsers.status,
      })
      .from(networkSchema.networkUsers)
      .where(eq(networkSchema.networkUsers.handle, normalized))
      .limit(1);
    if (!user) {
      return NextResponse.json({ tombstoned: false, handle: normalized });
    }
    const tombstoned =
      user.status === "deleted" ||
      (await isSubjectTombstoned("public-profile", user.id));
    return NextResponse.json({ tombstoned, handle: normalized });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) return networkUnavailableResponse();
    console.error("[/api/v1/network/people/[id]/tombstone-status] Error:", error);
    return NextResponse.json({ tombstoned: false }, { status: 200 });
  }
}
