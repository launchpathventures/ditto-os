/**
 * Ditto — Workspace Views API (Brief 154)
 *
 * GET  /api/v1/workspace/views — list all adaptive views for the workspace
 * POST /api/v1/workspace/views — register a new adaptive view
 *
 * Provenance: Brief 154 (Adaptive Workspace Views).
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Default workspace ID for single-user MVP */
const DEFAULT_WORKSPACE_ID = "default";

/**
 * GET /api/v1/workspace/views — list all adaptive views sorted by position
 */
export async function GET() {
  try {
    const { db, schema } = await import("../../../../../../../src/db");
    const { eq } = await import("drizzle-orm");

    const views = await db
      .select({
        id: schema.workspaceViews.id,
        slug: schema.workspaceViews.slug,
        label: schema.workspaceViews.label,
        icon: schema.workspaceViews.icon,
        description: schema.workspaceViews.description,
        position: schema.workspaceViews.position,
        sourceProcessId: schema.workspaceViews.sourceProcessId,
        sourceProcessSlug: schema.processes.slug,
        schema: schema.workspaceViews.schema,
      })
      .from(schema.workspaceViews)
      .leftJoin(
        schema.processes,
        eq(schema.workspaceViews.sourceProcessId, schema.processes.id),
      )
      .where(eq(schema.workspaceViews.workspaceId, DEFAULT_WORKSPACE_ID))
      .orderBy(schema.workspaceViews.position);

    return NextResponse.json({ views });
  } catch (error) {
    console.error("[/api/v1/workspace/views] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workspace views" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/workspace/views — register a new adaptive view
 *
 * Body: { slug, label, icon?, description?, schema, sourceProcessId? }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { slug, label, icon, description, schema: viewSchema, sourceProcessId } = body;

    // Basic field validation
    if (!slug || typeof slug !== "string") {
      return NextResponse.json(
        { error: "slug is required and must be a string" },
        { status: 400 },
      );
    }
    if (!label || typeof label !== "string") {
      return NextResponse.json(
        { error: "label is required and must be a string" },
        { status: 400 },
      );
    }
    if (!viewSchema || typeof viewSchema !== "object") {
      return NextResponse.json(
        { error: "schema is required and must be an object" },
        { status: 400 },
      );
    }

    // Validate composition schema
    const { validateCompositionSchema } = await import(
      "../../../../../lib/compositions/composition-schema"
    );
    const validationErrors = validateCompositionSchema(viewSchema, slug);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Schema validation failed", details: validationErrors },
        { status: 400 },
      );
    }

    const { db, schema: dbSchema } = await import("../../../../../../../src/db");
    const { eq, and } = await import("drizzle-orm");

    // Check for existing view with same slug in workspace
    const [existing] = await db
      .select({ id: dbSchema.workspaceViews.id })
      .from(dbSchema.workspaceViews)
      .where(
        and(
          eq(dbSchema.workspaceViews.workspaceId, DEFAULT_WORKSPACE_ID),
          eq(dbSchema.workspaceViews.slug, slug),
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: `A view with slug "${slug}" already exists in this workspace` },
        { status: 409 },
      );
    }

    // Get next position
    const allViews = await db
      .select({ position: dbSchema.workspaceViews.position })
      .from(dbSchema.workspaceViews)
      .where(eq(dbSchema.workspaceViews.workspaceId, DEFAULT_WORKSPACE_ID));
    const nextPosition = allViews.length > 0
      ? Math.max(...allViews.map((v) => v.position)) + 1
      : 0;

    // Insert
    const [view] = await db
      .insert(dbSchema.workspaceViews)
      .values({
        workspaceId: DEFAULT_WORKSPACE_ID,
        slug: slug as string,
        label: label as string,
        icon: (icon as string) ?? null,
        description: (description as string) ?? null,
        schema: viewSchema as Record<string, unknown>,
        sourceProcessId: (sourceProcessId as string) ?? null,
        position: nextPosition,
      })
      .returning({
        id: dbSchema.workspaceViews.id,
        slug: dbSchema.workspaceViews.slug,
        label: dbSchema.workspaceViews.label,
      });

    return NextResponse.json({ view }, { status: 201 });
  } catch (error) {
    console.error("[/api/v1/workspace/views] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create workspace view" },
      { status: 500 },
    );
  }
}
