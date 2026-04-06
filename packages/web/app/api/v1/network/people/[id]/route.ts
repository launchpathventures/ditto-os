/**
 * GET /api/v1/network/people/:id — Person detail + person memories (protected).
 * PATCH /api/v1/network/people/:id — Update a person record (protected).
 *
 * Provenance: Brief 088, ADR-025.
 */

import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    const { getPersonById, getPersonMemoriesForUser } = await import(
      "../../../../../../../../src/engine/people"
    );

    const person = await getPersonById(id);
    if (!person || person.userId !== auth.userId) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    const memories = await getPersonMemoriesForUser(id, auth.userId);

    return NextResponse.json({ person, memories });
  } catch (error) {
    console.error("[/api/v1/network/people/:id] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch person." },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json();
    const { getPersonById, updatePerson } = await import(
      "../../../../../../../../src/engine/people"
    );

    const person = await getPersonById(id);
    if (!person || person.userId !== auth.userId) {
      return NextResponse.json({ error: "Person not found." }, { status: 404 });
    }

    // Only allow updating safe fields
    const allowedFields = ["name", "organization", "role", "email", "phone"] as const;
    const updates: Record<string, string> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const updated = await updatePerson(id, updates);
    return NextResponse.json({ person: updated });
  } catch (error) {
    console.error("[/api/v1/network/people/:id] PATCH Error:", error);
    return NextResponse.json(
      { error: "Failed to update person." },
      { status: 500 },
    );
  }
}
