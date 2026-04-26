/**
 * GitHub webhook receiver — Brief 216 §D4.
 *
 *   POST /api/v1/integrations/github/webhook
 *
 * Verifies HMAC-SHA256 signature against `GITHUB_WEBHOOK_SECRET`, routes
 * events by the `X-GitHub-Event` header to the cloud-runner fallback
 * handler. The fallback provides terminal-state resolution for cloud
 * runners (claude-code-routine and friends) when in-prompt callbacks
 * fail.
 *
 * Configuration: in the GitHub repo settings → Webhooks → Add webhook,
 * set Payload URL to `https://<workspace-host>/api/v1/integrations/github/webhook`,
 * Content type `application/json`, Secret to the `GITHUB_WEBHOOK_SECRET`
 * env var, and select events: pull_request, workflow_run, deployment_status.
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_EVENTS = new Set([
  "pull_request",
  "workflow_run",
  "deployment_status",
  "ping",
]);

function verifySignature(
  rawBody: string,
  presented: string | null,
  secret: string,
): boolean {
  if (!presented || !presented.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const presentedHex = presented.slice("sha256=".length);
  if (presentedHex.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(presentedHex, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: webhook isn't configured, refuse the call. The infra
    // is the gate, not the runtime.
    return NextResponse.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured" },
      { status: 503 },
    );
  }

  const event = req.headers.get("x-github-event");
  if (!event || !SUPPORTED_EVENTS.has(event)) {
    return NextResponse.json({ ok: true, ignored: event ?? "unknown" });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    handlePullRequestEvent,
    handleWorkflowRunEvent,
    handleDeploymentStatusEvent,
  } = await import(
    "../../../../../../../../src/engine/github-events/cloud-runner-fallback"
  );

  try {
    if (event === "pull_request") {
      const outcome = await handlePullRequestEvent(
        payload as Parameters<typeof handlePullRequestEvent>[0],
      );
      return NextResponse.json({ ok: true, outcome });
    }
    if (event === "workflow_run") {
      const outcome = await handleWorkflowRunEvent(
        payload as Parameters<typeof handleWorkflowRunEvent>[0],
      );
      return NextResponse.json({ ok: true, outcome });
    }
    if (event === "deployment_status") {
      const outcome = await handleDeploymentStatusEvent(
        payload as Parameters<typeof handleDeploymentStatusEvent>[0],
      );
      return NextResponse.json({ ok: true, outcome });
    }
  } catch (e) {
    // GitHub retries on 5xx but not 4xx. Return 500 only on genuine failures
    // so transient handler errors get retried; payload-shape errors return 200.
    return NextResponse.json(
      {
        error: "Handler failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ignored: event });
}
