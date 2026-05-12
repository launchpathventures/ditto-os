import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import * as networkSchema from "@ditto/core/db/network";
import {
  isNetworkDbConnectionError,
  networkUnavailableResponse,
} from "@/lib/network-availability";
import { networkDb } from "../../../../../../../../src/db/network-db";
import { createNetworkLaneStepRun } from "../../../../../../../../src/engine/network-step-run";
import {
  manualAddKbFact,
  updateKbFactWithAudit,
} from "../../../../../../../../src/engine/network-kb-extract";
import {
  upsertAntiPersonaRule,
  isSafeKbEntityId,
  type FactVisibility,
} from "../../../../../../../../src/engine/network-kb-storage";
import { recordNetworkKbFeedback } from "../../../../../../../../src/engine/network-kb-feedback";
import { resolveNetworkLaneSession } from "../session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function visibility(value: unknown): FactVisibility {
  return value === "public" || value === "off" ? value : "on-request";
}

function factStatus(value: unknown): networkSchema.NetworkKbFactStatus | undefined {
  return value === "active" || value === "archived" ? value : undefined;
}

function eventType(value: unknown) {
  if (
    value === "fact_edited" ||
    value === "fact_visibility_changed" ||
    value === "fact_archived"
  ) {
    return value;
  }
  return undefined;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const session = await resolveNetworkLaneSession({
      sessionId: url.searchParams.get("sessionId"),
      context: "expert",
      fallbackUserId: url.searchParams.get("userId"),
    });
    if (!session) {
      return NextResponse.json(
        { error: "expert_session_required" },
        { status: 403 },
      );
    }

    const [facts, privateFilters] = await Promise.all([
      networkDb
        .select()
        .from(networkSchema.networkUserKbFacts)
        .where(
          and(
            eq(networkSchema.networkUserKbFacts.userId, session.userId),
            eq(networkSchema.networkUserKbFacts.status, "active"),
          ),
        ),
      networkDb
        .select()
        .from(networkSchema.networkUserAntiPersona)
        .where(
          and(
            eq(networkSchema.networkUserAntiPersona.userId, session.userId),
            eq(networkSchema.networkUserAntiPersona.status, "active"),
          ),
        ),
    ]);

    return NextResponse.json({ facts, privateFilters });
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return networkUnavailableResponse();
    }
    console.error("[/api/v1/network/kb/visibility] GET Error:", error);
    return NextResponse.json(
      { error: "kb_list_failed" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const session = await resolveNetworkLaneSession({
      sessionId: typeof body.sessionId === "string" ? body.sessionId : null,
      context: "expert",
      fallbackUserId: typeof body.userId === "string" ? body.userId : null,
    });
    if (!session) {
      return NextResponse.json(
        { error: "expert_session_required" },
        { status: 403 },
      );
    }

    const stepRunId = await createNetworkLaneStepRun({
      route: "network-kb-visibility",
      sessionId: session.sessionId,
      actorId: session.actorId,
    });

    if (body.action === "manual_fact") {
      const factMd = typeof body.factMd === "string" ? body.factMd.trim() : "";
      if (!factMd) {
        return NextResponse.json(
          { error: "fact_required" },
          { status: 400 },
        );
      }
      const fact = await manualAddKbFact({
        userId: session.userId,
        factMd,
        visibility: visibility(body.visibility),
        sourceLabel: typeof body.sourceLabel === "string" ? body.sourceLabel : undefined,
        stepRunId,
        actorId: session.actorId,
        sessionId: session.sessionId,
      });
      return NextResponse.json({ fact });
    }

    if (body.action === "update_fact") {
      const factId = typeof body.factId === "string" ? body.factId.trim() : "";
      if (!factId) {
        return NextResponse.json(
          { error: "fact_id_required" },
          { status: 400 },
        );
      }
      const nextStatus = factStatus(body.status);
      const nextVisibility = body.visibility ? visibility(body.visibility) : undefined;
      const fact = await updateKbFactWithAudit({
        userId: session.userId,
        factId,
        factMd: typeof body.factMd === "string" ? body.factMd : undefined,
        visibility: nextVisibility,
        status: nextStatus,
        eventType:
          eventType(body.eventType) ??
          (nextStatus === "archived"
            ? "fact_archived"
            : nextVisibility
              ? "fact_visibility_changed"
              : "fact_edited"),
        stepRunId,
        actorId: session.actorId,
        sessionId: session.sessionId,
      });
      if (!fact) {
        return NextResponse.json(
          { error: "fact_not_found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ fact });
    }

    if (body.action === "private_filter") {
      const ruleMd = typeof body.ruleMd === "string" ? body.ruleMd.trim() : "";
      if (!ruleMd) {
        return NextResponse.json(
          { error: "private_filter_required" },
          { status: 400 },
        );
      }
      const id = typeof body.id === "string" ? body.id.trim() : undefined;
      if (id && !isSafeKbEntityId(id)) {
        return NextResponse.json(
          { error: "invalid_private_filter_id" },
          { status: 400 },
        );
      }
      const [before] = id
        ? await networkDb
            .select()
            .from(networkSchema.networkUserAntiPersona)
            .where(eq(networkSchema.networkUserAntiPersona.id, id))
            .limit(1)
        : [];
      if (before && before.userId !== session.userId) {
        return NextResponse.json(
          { error: "private_filter_not_found" },
          { status: 404 },
        );
      }
      const status = factStatus(body.status) ?? "active";
      const rule = await upsertAntiPersonaRule({
        id,
        userId: session.userId,
        ruleMd,
        status,
        metadata: { source: "kb_shelf" },
      });
      await recordNetworkKbFeedback({
        type: status === "archived" ? "private_filter_archived" : "private_filter_upserted",
        userId: session.userId,
        targetId: rule.id,
        actorId: session.actorId,
        sessionId: session.sessionId,
        stepRunId,
        before: before
          ? { ruleMd: before.ruleMd, status: before.status }
          : null,
        after: { ruleMd: rule.ruleMd, status: rule.status },
      });
      return NextResponse.json({ rule });
    }

    return NextResponse.json(
      { error: "invalid_kb_action" },
      { status: 400 },
    );
  } catch (error) {
    if (isNetworkDbConnectionError(error)) {
      return networkUnavailableResponse();
    }
    console.error("[/api/v1/network/kb/visibility] Error:", error);
    return NextResponse.json(
      { error: "kb_visibility_update_failed" },
      { status: 500 },
    );
  }
}
