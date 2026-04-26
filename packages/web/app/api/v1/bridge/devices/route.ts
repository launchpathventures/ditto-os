/**
 * Bridge Devices API — Brief 212.
 *
 * GET  /api/v1/bridge/devices   — list paired devices for the workspace.
 * POST /api/v1/bridge/devices   — issue a 6-char pairing code (15-min TTL,
 *                                  bcrypt-hashed, single-use). Returns the
 *                                  raw code ONCE — the UI surfaces it with
 *                                  a "you'll only see this once" warning.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
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

const createCodeBody = z.object({
  workspaceId: z.string().min(1).max(120).default("default"),
  deviceNameHint: z.string().min(1).max(120).optional(),
});

export async function GET(req: Request) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? "default";

  const { db } = await import("../../../../../../../src/db");
  const { bridgeDevices } = await import("../../../../../../../src/db/schema");
  const rows = await db
    .select({
      id: bridgeDevices.id,
      deviceName: bridgeDevices.deviceName,
      status: bridgeDevices.status,
      pairedAt: bridgeDevices.pairedAt,
      lastDialAt: bridgeDevices.lastDialAt,
      revokedAt: bridgeDevices.revokedAt,
      revokedReason: bridgeDevices.revokedReason,
      protocolVersion: bridgeDevices.protocolVersion,
    })
    .from(bridgeDevices)
    .where(eq(bridgeDevices.workspaceId, workspaceId));

  return NextResponse.json({ devices: rows });
}

export async function POST(req: Request) {
  const authErr = await checkWorkspaceAuth();
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const parsed = createCodeBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const {
    generatePairingCode,
    hashPairingCode,
    PAIRING_CODE_TTL_MS,
    computeDialUrl,
  } = await import("../../../../../../../src/engine/bridge-credentials");
  const { db } = await import("../../../../../../../src/db");
  const { bridgePairingCodes } = await import("../../../../../../../src/db/schema");

  const code = generatePairingCode();
  const codeHash = await hashPairingCode(code);
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

  await db.insert(bridgePairingCodes).values({
    workspaceId: parsed.data.workspaceId,
    codeHash,
    deviceNameHint: parsed.data.deviceNameHint ?? null,
    expiresAt,
  });

  return NextResponse.json(
    {
      code,
      expiresAt: expiresAt.toISOString(),
      dialUrl: computeDialUrl(),
      // The UI's "you'll only see this once" warning gets driven by this flag.
      warning: "Code is shown once. Save it now or generate a new one.",
    },
    { status: 201 },
  );
}

