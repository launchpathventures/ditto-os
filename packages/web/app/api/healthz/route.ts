/**
 * Ditto — Health Check Endpoint
 *
 * GET /healthz — Liveness check: process up + DB connected.
 * GET /healthz?deep=true — Strict readiness check.
 * GET /healthz?deep=true&mode=provisioning — Bootstrap readiness for provisioner.
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
  const healthMode = url.searchParams.get("mode") === "provisioning"
    ? "provisioning"
    : "strict";
  const deploymentMode =
    (process.env.DITTO_DEPLOYMENT ?? "workspace").trim().toLowerCase() === "public"
      ? "public"
      : "workspace";

  try {
    const { db, getWorkspaceSchemaHealth } = await import("../../../../../src/db");
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
      return NextResponse.json({
        status: "ok",
        db: "connected",
        mode: healthMode,
        version: getVersion(),
      });
    }

    const workspaceSchema = getWorkspaceSchemaHealth();

    // Deep/readiness checks
    const response: {
      status: string;
      db: string;
      mode: "strict" | "provisioning";
      version: string;
      schema: {
        workspace: typeof workspaceSchema;
        network?: {
          status: "ok" | "behind" | "error";
          applied: number;
          expected: number;
          error?: string;
        };
      };
      seed: string;
      network: string;
    } = {
      status: "ok",
      db: "connected",
      mode: healthMode,
      version: getVersion(),
      schema: {
        workspace: workspaceSchema,
      },
      seed: "skipped",
      network: "skipped",
    };

    if (workspaceSchema.status !== "ok") {
      response.status = "degraded";
    }

    const networkUrl = process.env.DITTO_NETWORK_URL;

    // Check seed imported/attempted. Only check if DITTO_NETWORK_URL is set
    // (managed workspace); local/self-hosted workspaces stay unaffected.
    if (networkUrl) {
      try {
        const { getSeedAttemptState } = await import("../../../../../src/engine/network-seed");
        const seedState = await getSeedAttemptState();
        response.seed =
          seedState === "imported"
            ? "imported"
            : seedState === "attempted"
              ? "attempted"
              : "not_imported";

        if (seedState === "not_attempted") {
          response.status = "degraded";
        }
      } catch (error) {
        console.error("[/healthz] Seed check failed:", error);
        response.seed = "error";
        response.status = "degraded";
      }

      // Check Network Service reachable. Strict workspace health treats an
      // outage as degraded. Provisioning health accepts a bootstrapped local
      // workspace whose Network is temporarily unavailable.
      try {
        const networkRes = await fetch(`${networkUrl}/api/healthz`, {
          signal: AbortSignal.timeout(5_000),
        });

        response.network = networkRes.ok ? "reachable" : "unreachable";

        if (!networkRes.ok && healthMode === "strict") {
          response.status = "degraded";
        }
      } catch (error) {
        console.error("[/healthz] Network check failed:", error);
        response.network = "unreachable";
        if (healthMode === "strict") {
          response.status = "degraded";
        }
      }
    }

    if (deploymentMode === "public") {
      try {
        const { getNetworkSchemaHealth } = await import("../../../../../src/db/network-db");
        const networkSchema = await getNetworkSchemaHealth();
        response.schema.network = networkSchema;
        response.network = networkSchema.status === "ok" ? "ready" : "unavailable";
        if (networkSchema.status !== "ok") {
          response.status = "degraded";
        }
      } catch (error) {
        response.schema.network = {
          status: "error",
          applied: 0,
          expected: 0,
          error: error instanceof Error ? error.message : String(error),
        };
        response.network = "unavailable";
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
