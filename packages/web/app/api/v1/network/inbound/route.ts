/**
 * POST /api/v1/network/inbound — AgentMail inbound webhook (Brief 098b AC1-2).
 *
 * Returns 200 immediately, processes the email asynchronously.
 * Validates AgentMail signature header — rejects unsigned/invalid with 401.
 *
 * Layer classification: L6 (Human/entry point).
 * Provenance: AgentMail webhook-agent example (pattern), Brief 098b.
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Validate the AgentMail webhook signature.
 * AgentMail signs payloads with HMAC-SHA256 using the webhook secret.
 * The signature is sent in the x-agentmail-signature header.
 */
function validateSignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.AGENTMAIL_WEBHOOK_SECRET;

  // AC2: Validate signature — reject unsigned/invalid requests
  if (!webhookSecret) {
    console.error("[/api/v1/network/inbound] AGENTMAIL_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-agentmail-signature");

  if (!validateSignature(rawBody, signature, webhookSecret)) {
    console.warn("[/api/v1/network/inbound] Invalid or missing signature");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  // AC1: Return 200 immediately
  // Parse the payload and process asynchronously
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 },
    );
  }

  // Fire-and-forget async processing — don't block the response
  // Use dynamic import to avoid bundling engine code at route level
  processAsync(payload).catch((err) => {
    console.error("[/api/v1/network/inbound] Async processing error:", err);
  });

  return NextResponse.json({ ok: true });
}

async function processAsync(payload: unknown): Promise<void> {
  const { processInboundEmail } = await import(
    "@engine/inbound-email"
  );

  const result = await processInboundEmail(
    payload as import("@engine/inbound-email").InboundEmailPayload,
  );

  console.log(
    `[/api/v1/network/inbound] Processed: action=${result.action}` +
    (result.personId ? ` person=${result.personId.slice(0, 8)}` : "") +
    (result.details ? ` details=${result.details}` : ""),
  );
}
