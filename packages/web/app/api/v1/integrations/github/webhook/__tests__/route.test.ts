/**
 * GitHub webhook receiver tests — Brief 216 §D4 wiring verification.
 *
 * Verifies HMAC validation + event routing + signature/error paths.
 * The fallback handler logic itself is covered by routine-fallback.test.ts;
 * this test focuses on the route-layer concerns (signature, headers, dispatch).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import { createTestDb, type TestDb } from "../../../../../../../../../src/test-utils";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../../../../../../../../src/db", () => ({
  get db() {
    return testDb;
  },
}));

beforeEach(() => {
  process.env.DITTO_TEST_MODE = "true";
  process.env.GITHUB_WEBHOOK_SECRET = "test-secret";
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => {
  cleanup();
  delete process.env.DITTO_TEST_MODE;
  delete process.env.GITHUB_WEBHOOK_SECRET;
  vi.resetModules();
});

async function loadRoute() {
  vi.resetModules();
  const route = await import("../route");
  return route;
}

function signedRequest(opts: {
  event: string;
  body: unknown;
  secret?: string | null;
  badSig?: boolean;
}): Request {
  const rawBody = JSON.stringify(opts.body);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": opts.event,
  };
  if (opts.secret !== null) {
    const sig = opts.badSig
      ? "sha256=deadbeef".padEnd(71, "0")
      : "sha256=" +
        createHmac("sha256", opts.secret ?? "test-secret")
          .update(rawBody, "utf8")
          .digest("hex");
    headers["x-hub-signature-256"] = sig;
  }
  return new Request("http://t/api/v1/integrations/github/webhook", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

describe("POST /api/v1/integrations/github/webhook", () => {
  it("returns 503 when GITHUB_WEBHOOK_SECRET is unset", async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const { POST } = await loadRoute();
    const res = await POST(signedRequest({ event: "ping", body: {} }));
    expect(res.status).toBe(503);
  });

  it("returns 401 on invalid signature", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      signedRequest({ event: "ping", body: { foo: "bar" }, badSig: true }),
    );
    expect(res.status).toBe(401);
  });

  it("ignores unsupported events with 200", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      signedRequest({ event: "issue_comment", body: { x: 1 } }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe("issue_comment");
  });

  it("responds to ping with pong", async () => {
    const { POST } = await loadRoute();
    const res = await POST(signedRequest({ event: "ping", body: { zen: "yo" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pong).toBe(true);
  });

  it("dispatches pull_request to handlePullRequestEvent", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      signedRequest({
        event: "pull_request",
        body: {
          action: "opened",
          pull_request: {
            html_url: "https://github.com/x/y/pull/1",
            head: { ref: "feature/x" },
          },
          repository: { full_name: "x/y" },
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // No matching dispatch in the test DB → no-match outcome.
    expect(json.ok).toBe(true);
    expect(json.outcome.kind).toBe("no-match");
  });

  it("dispatches deployment_status to handleDeploymentStatusEvent", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      signedRequest({
        event: "deployment_status",
        body: {
          action: "created",
          deployment_status: { state: "success", environment: "Preview" },
          deployment: { ref: "claude/x" },
          repository: { full_name: "x/y" },
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.outcome.kind).toBe("no-match"); // No project for x/y in test db
  });

  it("returns 400 on malformed JSON body", async () => {
    const { POST } = await loadRoute();
    const rawBody = "not-json";
    const sig =
      "sha256=" +
      createHmac("sha256", "test-secret").update(rawBody, "utf8").digest("hex");
    const req = new Request("http://t/api/v1/integrations/github/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": sig,
      },
      body: rawBody,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
