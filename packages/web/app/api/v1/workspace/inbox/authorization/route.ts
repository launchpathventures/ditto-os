import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import {
  authorizationGateHandler,
  createHarnessContext,
  type AuthorizationActionClass,
  type AuthorizationGateRequest,
  type AuthorizationResult,
} from "@ditto/core";
import type { AuthorizationRequestBlock, ContentBlock } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTHORIZATION_EVENTS = new Set<AuthorizationGateRequest["event"]>([
  "send-it",
  "edit-first",
  "not-yet",
  "expired",
  "retry",
]);

function readEvent(value: unknown): AuthorizationGateRequest["event"] | null {
  return typeof value === "string" && AUTHORIZATION_EVENTS.has(value as AuthorizationGateRequest["event"])
    ? value as AuthorizationGateRequest["event"]
    : null;
}

function readActionClass(value: unknown): AuthorizationActionClass {
  return value === "sms-send" ||
    value === "calendar-invite" ||
    value === "list-share" ||
    value === "multi-recipient-send"
    ? value
    : "email-send";
}

function isAuthorizationRequestBlock(value: unknown): value is AuthorizationRequestBlock {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { type?: unknown }).type === "authorization-request",
  );
}

async function updateImportedAuthorizationBlock(
  authorizationId: string,
  block: ContentBlock,
): Promise<void> {
  if (!isAuthorizationRequestBlock(block)) return;

  const { db, schema } = await import("../../../../../../../../src/db");
  const rows = await db
    .select({
      id: schema.activities.id,
      metadata: schema.activities.metadata,
      contentBlock: schema.activities.contentBlock,
      description: schema.activities.description,
    })
    .from(schema.activities)
    .where(eq(schema.activities.action, "workspace_inbox_delivery"))
    .orderBy(desc(schema.activities.createdAt))
    .limit(200);

  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const blocks = Array.isArray(metadata.blocks) ? metadata.blocks : [];
    const blockIndex = blocks.findIndex(
      (candidate) =>
        isAuthorizationRequestBlock(candidate) &&
        candidate.authorizationId === authorizationId,
    );
    if (blockIndex === -1) continue;

    const nextBlocks = blocks.map((candidate, index) => (index === blockIndex ? block : candidate));
    const currentContentBlock = row.contentBlock as ContentBlock | null;
    const nextContentBlock =
      isAuthorizationRequestBlock(currentContentBlock) &&
      currentContentBlock.authorizationId === authorizationId
        ? block
        : currentContentBlock;
    await db
      .update(schema.activities)
      .set({
        description: `${row.description ?? block.header} (${block.state})`,
        metadata: {
          ...metadata,
          blocks: nextBlocks,
          authorizationState: block.state,
          authorizationResolvedAt: new Date().toISOString(),
        },
        contentBlock: nextContentBlock as unknown as Record<string, unknown> | null,
      })
      .where(eq(schema.activities.id, row.id));
    return;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.authorizationAction && typeof body.authorizationAction === "object"
    ? body.authorizationAction as Record<string, unknown>
    : null;
  if (!action) {
    return NextResponse.json({ error: "authorization_action_required" }, { status: 400 });
  }

  const authorizationId = typeof action.authorizationId === "string" ? action.authorizationId : null;
  const event = readEvent(action.event);
  if (!authorizationId || !event) {
    return NextResponse.json({ error: "invalid_authorization_action" }, { status: 400 });
  }

  const recipientLabel = typeof action.recipientLabel === "string" ? action.recipientLabel : null;
  const header = typeof action.header === "string" ? action.header : "Visitor intro request";
  const preview = Array.isArray(action.preview) ? action.preview as ContentBlock[] : null;
  const actionClass = readActionClass(action.actionClass);

  const authRequest: AuthorizationGateRequest = {
    authorizationId,
    event,
    header,
    preview,
    recipientLabel,
    actionClass,
    expiresAt: typeof action.expiresAt === "string" ? action.expiresAt : null,
    createdAt: typeof action.createdAt === "string" ? action.createdAt : new Date().toISOString(),
    toolCall: {
      toolName: "visitor_intro_request",
      input: {
        authorizationId,
        recipientLabel,
        preview,
      },
      execute: async (): Promise<AuthorizationResult> => ({
        status: "sent",
        sentAt: new Date().toISOString(),
        recipients: recipientLabel ? [recipientLabel] : [],
        reasonForVisitor: "Intro request approved for follow-up.",
      }),
    },
  };

  const ctx = createHarnessContext({
    processRun: {
      id: `workspace-inbox:${authorizationId}`,
      processId: "visitor-intro-request",
      inputs: {},
    },
    stepDefinition: {
      id: "visitor-intro-authorization",
      name: "Visitor intro authorization",
      executor: "workspace-inbox",
    },
    processDefinition: {
      id: "visitor-intro-request",
      name: "Visitor intro request",
      version: 1,
      status: "active",
      description: "Owner approval for a public profile visitor intro request",
      inputs: [],
      steps: [],
      outputs: [],
      quality_criteria: [],
      feedback: { metrics: [], capture: [] },
      trust: { initial_tier: "supervised", upgrade_path: [], downgrade_triggers: [] },
    },
    trustTier: "supervised",
    stepRunId: `workspace-inbox-auth-${randomUUID()}`,
  });

  ctx.recordAuthorizationOutcome = async (record) => {
    const { db, schema } = await import("../../../../../../../../src/db");
    await db.insert(schema.activities).values({
      action: "workspace_inbox_authorization_action",
      description: `Visitor intro authorization ${record.state}`,
      actorType: "workspace-user",
      actorId: process.env.DITTO_WORKSPACE_USER_ID ?? null,
      entityType: "authorization-request",
      entityId: authorizationId,
      metadata: {
        state: record.state,
        actionClass: record.actionClass,
        recipientLabel: record.recipientLabel,
        processRunId: record.processRunId,
        stepRunId: record.stepRunId,
      },
    });
  };
  ctx.authorizationRequest = authRequest;

  await authorizationGateHandler.execute(ctx);
  const blocks = ctx.stepResult?.outputs.contentBlocks;
  const block = Array.isArray(blocks) ? blocks[0] : null;
  if (!block) {
    return NextResponse.json({ error: "authorization_failed" }, { status: 500 });
  }
  await updateImportedAuthorizationBlock(authorizationId, block);
  return NextResponse.json({ block });
}
