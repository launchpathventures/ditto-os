/**
 * Ditto — Health Check Endpoint
 *
 * GET /healthz — Liveness check: process up + DB connected.
 * GET /healthz?deep=true — Readiness check: liveness + seed imported + Network reachable.
 *
 * Used by container orchestrators, load balancers, provisioner health checks, and monitoring.
 *
 * Provenance: Brief 086, Brief 090 (deep health check), ADR-018, Kubernetes liveness/readiness pattern.
 */

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache version from package.json at module load time (Brief 091, AC15)
let cachedVersion: string | undefined;
function getVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf-8"),
    );
    cachedVersion = pkg.version || "unknown";
  } catch {
    cachedVersion = "unknown";
  }
  return cachedVersion!;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "true";

  try {
    const { db } = await import("../../../../../src/db");
    const { sql } = await import("drizzle-orm");

    // Liveness: verify DB connectivity
    const result = db.all<{ ok: number }>(sql`SELECT 1 as ok`);

    if (!result?.[0]?.ok) {
      return NextResponse.json(
        { status: "degraded", db: "query failed" },
        { status: 503 },
      );
    }

    if (!deep) {
      return NextResponse.json({ status: "ok", db: "connected", version: getVersion() });
    }

    // Deep/readiness checks
    const response: {
      status: string;
      db: string;
      version: string;
      seed: string;
      network: string;
    } = {
      status: "ok",
      db: "connected",
      version: getVersion(),
      seed: "skipped",
      network: "skipped",
    };

    const networkUrl = process.env.DITTO_NETWORK_URL;

    // Check seed imported: self-scoped memories exist
    // Only check if DITTO_NETWORK_URL is set (managed workspace)
    if (networkUrl) {
      try {
        const { schema } = await import("../../../../../src/db");
        const { eq } = await import("drizzle-orm");

        const selfMemories = db
          .select({ id: schema.memories.id })
          .from(schema.memories)
          .where(eq(schema.memories.scopeType, "self"))
          .limit(1)
          .all();

        response.seed = selfMemories.length > 0 ? "imported" : "not_imported";

        if (selfMemories.length === 0) {
          response.status = "degraded";
        }
      } catch (error) {
        console.error("[/healthz] Seed check failed:", error);
        response.seed = "error";
        response.status = "degraded";
      }

      // Check Network Service reachable
      try {
        const networkRes = await fetch(`${networkUrl}/healthz`, {
          signal: AbortSignal.timeout(5_000),
        });

        response.network = networkRes.ok ? "reachable" : "unreachable";

        if (!networkRes.ok) {
          response.status = "degraded";
        }
      } catch (error) {
        console.error("[/healthz] Network check failed:", error);
        response.network = "unreachable";
        response.status = "degraded";
      }
    }

    const httpStatus = response.status === "ok" ? 200 : 503;
    return NextResponse.json(response, { status: httpStatus });
  } catch (error) {
    console.error("[/healthz] DB check failed:", error);
    return NextResponse.json(
      { status: "error", db: "disconnected", version: getVersion() },
      { status: 503 },
    );
  }
}
