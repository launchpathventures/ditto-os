/**
 * Bridge Device-by-id API — Brief 212 AC #11.
 *
 * DELETE /api/v1/bridge/devices/[id]   — revoke a device. Closes the WebSocket
 *                                         and marks status=revoked. In-flight
 *                                         and queued jobs transition to revoked.
 *                                         Daemon's next dial fails HTTP 401.
 * PATCH  /api/v1/bridge/devices/[id]   — { action: "rotate" } — at MVP this is
 *                                         a revoke + a fresh pairing code (the
 *                                         daemon must re-pair). In-band rotation
 *                                         is a follow-on (documented in README).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_SESSION_COOKIE = "ditto_workspace_session";

async function checkWorkspaceAuth(): Promise<NextResponse | null> {
  if (!process.env.WORKSPACE_OWNER_EMAIL) return null;
  const cookieStore = await cookies();
  const session = cookieStore.get(WORKSPACE_SESSION_COOKIE);
  if (!session?.value) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sepIdx = session.value.lastIndexOf("|");
  const email = sepIdx === -1 ? session.value : session.value.substring(0, sepIdx);
  if (email.toLowerCase() !== process.env.WORKSPACE_OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const patchBody = z.object({
  action: z.enum(["rotate"]),
  reason: z.string().min(1).max(240).optional(),
});

const deleteQuery = z.object({
  reason: z.string().min(1).max(240).optional(),
});

async function revokeDevice(deviceId: string, reason: string) {
  const { db } = await import("../../../../../../../../src/db");
  const { bridgeDevices, bridgeJobs } = await import("../../../../../../../../src/db/schema");

  const rows = await db.select().from(bridgeDevices).where(eq(bridgeDevices.id, deviceId));
  const row = rows[0];
  if (!row) {
    return { ok: false as const, status: 404, message: "Device not found" };
  }
  if (row.status === "revoked") {
    return { ok: false as const, status: 409, message: "Device already revoked" };
  }

  const now = new Date();
  await db
    .update(bridgeDevices)
    .set({ status: "revoked", revokedAt: now, revokedReason: reason })
    .where(eq(bridgeDevices.id, deviceId));

  // Mark non-terminal jobs as revoked so the dispatcher's queue replay loop
  // skips them on reconnect.
  await db
    .update(bridgeJobs)
    .set({ state: "revoked", completedAt: now })
    .where(
      and(
        eq(bridgeJobs.deviceId, deviceId),
        inArray(bridgeJobs.state, ["queued", "dispatched", "running"]),
      ),
    );

  // Notify the in-process bridge-server that the device's WebSocket should
  // be closed (idempotent — no-op if not connected).
  try {
    const { revokeDeviceConnection } = await import(
      "../../../../../../../../src/engine/bridge-server"
    );
    revokeDeviceConnection(deviceId, reason);
  } catch {
    // Module unavailable in some environments (e.g., during tests); fine.
  }

  return { ok: true as const, deviceId };
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const parsed = deleteQuery.safeParse({
    reason: url.searchParams.get("reason") ?? undefined,
  });
  const reason = parsed.success ? parsed.data.reason ?? "manual-revocation" : "manual-revocation";

  const result = await revokeDevice(id, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json({ revoked: true, deviceId: id });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }

  // MVP rotation = revoke + emit a fresh pairing code. Caller pairs the
  // daemon again with the new code. In-band rotation is a follow-on brief.
  const reason = parsed.data.reason ?? "rotation";
  const revoke = await revokeDevice(id, reason);
  if (!revoke.ok) {
    return NextResponse.json({ error: revoke.message }, { status: revoke.status });
  }

  // Issue a new code in the same workspace.
  const { generatePairingCode, hashPairingCode, PAIRING_CODE_TTL_MS, computeDialUrl } = await import(
    "../../../../../../../../src/engine/bridge-credentials"
  );
  const { db } = await import("../../../../../../../../src/db");
  const { bridgePairingCodes, bridgeDevices } = await import(
    "../../../../../../../../src/db/schema"
  );
  const deviceRows = await db.select().from(bridgeDevices).where(eq(bridgeDevices.id, id));
  const workspaceId = deviceRows[0]?.workspaceId ?? "default";
  const code = generatePairingCode();
  const codeHash = await hashPairingCode(code);
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
  await db.insert(bridgePairingCodes).values({
    workspaceId,
    codeHash,
    deviceNameHint: deviceRows[0]?.deviceName,
    expiresAt,
  });

  return NextResponse.json({
    rotated: true,
    revokedDeviceId: id,
    code,
    expiresAt: expiresAt.toISOString(),
    dialUrl: computeDialUrl(),
    warning: "Code is shown once. Re-pair the daemon now.",
  });
}
