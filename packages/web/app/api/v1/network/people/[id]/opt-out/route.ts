/**
 * POST /api/v1/network/people/:id/opt-out — Opt out a person (protected).
 *
 * Provenance: Brief 088, ADR-025.
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    const { getPersonById, optOutPerson } = await import(
      "../../../../../../../../../src/engine/people"
    );

    const person = await getPersonById(id);
    if (!person || person.userId !== auth.userId) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    await optOutPerson(id);
    return NextResponse.json({ success: true, personId: id });
  } catch (error) {
    console.error("[/api/v1/network/people/:id/opt-out] Error:", error);
    return NextResponse.json(
      { error: "Failed to opt out person." },
      { status: 500 },
    );
  }
}
