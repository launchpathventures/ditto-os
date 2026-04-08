/**
 * POST /api/v1/network/budget/checkout — Create Stripe Checkout session (Brief 107 AC4).
 *
 * Creates a Stripe Checkout session for loading funds into a goal budget.
 * Redirects the user to Stripe's hosted payment page (PCI-compliant).
 * On success, Stripe webhook records the payment.
 *
 * Requires: STRIPE_SECRET_KEY, NETWORK_BASE_URL or NEXT_PUBLIC_APP_URL.
 *
 * Layer classification: L6 (Human/entry point).
 * Provenance: Stripe Checkout Sessions API, Brief 107.
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { authenticateAdminRequest } from "@/lib/network-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.authenticated) return auth.response;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.error("[budget/checkout] STRIPE_SECRET_KEY not configured");
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 },
    );
  }

  const baseUrl = process.env.NETWORK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    console.error("[budget/checkout] No base URL configured");
    return NextResponse.json(
      { error: "Base URL not configured" },
      { status: 500 },
    );
  }

  let body: { budgetId: string; amountCents: number; goalName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { budgetId, amountCents, goalName } = body;

  if (!budgetId || !amountCents) {
    return NextResponse.json(
      { error: "budgetId and amountCents are required" },
      { status: 400 },
    );
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json(
      { error: "amountCents must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: goalName
                ? `Budget: ${goalName}`
                : "Goal Budget",
              description: "Fund allocation for goal execution",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        budgetId,
        amountCents: String(amountCents),
      },
      success_url: `${baseUrl}/admin?budget=funded&budgetId=${budgetId}`,
      cancel_url: `${baseUrl}/admin?budget=cancelled&budgetId=${budgetId}`,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error("[budget/checkout] Stripe error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
