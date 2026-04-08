/**
 * POST /api/v1/network/budget/webhook — Stripe webhook handler (Brief 107 AC5).
 *
 * Validates Stripe signature, records successful payment as a
 * "load" budget transaction, sets budget status to "funded".
 *
 * Signature validation uses Stripe SDK's constructEventAsync()
 * (timing-safe HMAC comparison with timestamp replay protection).
 *
 * Requires: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
 *
 * Layer classification: L6 (Human/entry point).
 * Provenance: Stripe webhook best practices, Brief 107,
 * AgentMail inbound webhook pattern (same HMAC validation principle).
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    console.error("[budget/webhook] Stripe keys not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.warn("[budget/webhook] Missing Stripe signature header");
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 401 },
    );
  }

  const stripe = new Stripe(stripeKey);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.warn("[budget/webhook] Invalid Stripe signature:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 },
    );
  }

  // Only process completed checkout sessions
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const budgetId = session.metadata?.budgetId;
  const amountCents = session.metadata?.amountCents
    ? parseInt(session.metadata.amountCents, 10)
    : null;

  if (!budgetId || !amountCents) {
    console.error("[budget/webhook] Missing metadata on checkout session:", session.id);
    return NextResponse.json({ received: true });
  }

  // Dynamic imports to avoid build-time SQLite initialization
  const { db, schema } = await import("../../../../../../../../src/db");
  const { eq } = await import("drizzle-orm");
  const { recordLoad } = await import("../../../../../../../../src/engine/budget");

  // Verify budget exists
  const [budget] = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.id, budgetId))
    .limit(1);

  if (!budget) {
    console.error(`[budget/webhook] Budget ${budgetId} not found`);
    return NextResponse.json({ received: true });
  }

  // Idempotency: check if this payment was already recorded
  const existing = await db
    .select({ id: schema.budgetTransactions.id })
    .from(schema.budgetTransactions)
    .where(eq(schema.budgetTransactions.stripePaymentId, session.payment_intent as string || session.id))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[budget/webhook] Payment already recorded for budget ${budgetId.slice(0, 8)}, skipping`);
    return NextResponse.json({ received: true });
  }

  // Record load via budget module (single source of truth)
  const stripePaymentId = session.payment_intent as string || session.id;
  await recordLoad(budgetId, amountCents, stripePaymentId);

  console.log(`[budget/webhook] Budget ${budgetId.slice(0, 8)} funded: ${amountCents} cents`);

  return NextResponse.json({ received: true });
}
