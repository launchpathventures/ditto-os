import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

async function loadMiddleware() {
  vi.resetModules();
  return import("./middleware");
}

function req(path: string, cookie?: string) {
  return new NextRequest(`https://workspace.example.com${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function signedCookie(email: string, secret: string) {
  const sig = createHmac("sha256", secret).update(email.toLowerCase()).digest("hex");
  return `ditto_workspace_session=${email.toLowerCase()}|${sig}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("workspace auth middleware", () => {
  it("keeps local self-hosted workspace without Network URL unauthenticated", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    const { middleware } = await loadMiddleware();

    const res = await middleware(req("/"));
    expect(res.status).toBe(200);
  });

  it("fails closed when a managed workspace is missing owner auth env", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://ditto.partners");
    const { middleware } = await loadMiddleware();

    const res = await middleware(req("/"));
    expect(res.status).toBe(503);
  });

  it("fails closed when a managed workspace is missing a session secret", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://ditto.partners");
    vi.stubEnv("WORKSPACE_OWNER_EMAIL", "owner@example.com");
    const { middleware } = await loadMiddleware();

    const res = await middleware(req("/"));
    expect(res.status).toBe(503);
  });

  it("rejects legacy unsigned owner-email cookies", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://ditto.partners");
    vi.stubEnv("WORKSPACE_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("SESSION_SECRET", "workspace-secret");
    const { middleware } = await loadMiddleware();

    const res = await middleware(req("/", "ditto_workspace_session=owner@example.com"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://workspace.example.com/login?redirect=%2F");
  });

  it("accepts HMAC-signed workspace cookies", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://ditto.partners");
    vi.stubEnv("WORKSPACE_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("SESSION_SECRET", "workspace-secret");
    const { middleware } = await loadMiddleware();

    const res = await middleware(req("/", signedCookie("owner@example.com", "workspace-secret")));
    expect(res.status).toBe(200);
  });

  it("allows /people in public mode without workspace auth", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "public");
    const { middleware } = await loadMiddleware();

    const res = await middleware(req("/people/timhgreen"));
    expect(res.status).toBe(200);
  });

  it("does not expose /people as public in workspace mode", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://ditto.partners");
    vi.stubEnv("WORKSPACE_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("SESSION_SECRET", "workspace-secret");
    const { middleware } = await loadMiddleware();

    const res = await middleware(req("/people/timhgreen"));
    expect(res.status).not.toBe(200);
  });

  it("allows /api/healthz on a fully-configured managed workspace without auth", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://ditto.partners");
    vi.stubEnv("WORKSPACE_OWNER_EMAIL", "owner@example.com");
    vi.stubEnv("SESSION_SECRET", "workspace-secret");
    const { middleware } = await loadMiddleware();

    const res = await middleware(req("/api/healthz?deep=true&mode=provisioning"));
    expect(res.status).toBe(200);
  });
});
