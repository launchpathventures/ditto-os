/**
 * POST /api/v1/network/chat/verify
 *
 * Two actions:
 * - action: "send" — send a verification code to the email
 * - action: "validate" — validate a code the user entered
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, sessionId, email, code, visitorName } = body as {
      action: "send" | "validate";
      sessionId: string;
      email: string;
      code?: string;
      visitorName?: string;
    };

    if (!sessionId || !email) {
      return NextResponse.json({ error: "Missing sessionId or email" }, { status: 400 });
    }

    // Load env vars from root .env (needed for AGENTMAIL_API_KEY, AGENTMAIL_ALEX_INBOX, etc.)
    if (!process.env.AGENTMAIL_API_KEY || !process.env.ANTHROPIC_API_KEY) {
      try {
        const { config } = await import("dotenv");
        const path = await import("path");
        config({ path: path.resolve(process.cwd(), "../../.env") });
      } catch { /* env vars may be set via platform */ }
    }

    const { sendVerificationCode, validateVerificationCode } = await import(
      "../../../../../../../../src/engine/email-verification"
    );

    if (action === "send") {
      const result = await sendVerificationCode(sessionId, email, visitorName);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 429 });
      }
      return NextResponse.json({ sent: true });
    }

    if (action === "validate") {
      if (!code) {
        return NextResponse.json({ error: "Missing code" }, { status: 400 });
      }
      const result = await validateVerificationCode(sessionId, email, code);
      if (!result.valid) {
        return NextResponse.json({ valid: false, error: result.error }, { status: 200 });
      }
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[/api/v1/network/chat/verify] Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
