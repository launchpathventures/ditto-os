import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../../src/test-utils";
import * as schema from "../../../../../src/db/schema";

let testDb: TestDb;
let cleanup: () => void;
const setCookie = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: setCookie,
  }),
}));

vi.mock("../../../../../src/db", async () => {
  const realSchema = await vi.importActual<typeof import("../../../../../src/db/schema")>(
    "../../../../../src/db/schema",
  );
  return {
    get db() {
      return testDb;
    },
    schema: realSchema,
  };
});

function postToken(token: string) {
  return new Request("https://workspace.example.com/login/auth", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  const result = createTestDb();
  testDb = result.db;
  cleanup = result.cleanup;
  setCookie.mockReset();
  process.env.SESSION_SECRET = "workspace-secret";
  process.env.WORKSPACE_OWNER_EMAIL = "owner@example.com";
  process.env.DITTO_WORKSPACE_USER_ID = "user-1";
});

afterEach(() => {
  cleanup();
  delete process.env.SESSION_SECRET;
  delete process.env.NETWORK_AUTH_SECRET;
  delete process.env.WORKSPACE_OWNER_EMAIL;
  delete process.env.DITTO_WORKSPACE_USER_ID;
});

describe("POST /login/auth", () => {
  it("accepts a workspace bootstrap token, sets the session cookie, and rejects replay", async () => {
    const { createWorkspaceBootstrapLoginLink } = await import(
      "../../../../../src/engine/magic-link"
    );
    const link = createWorkspaceBootstrapLoginLink({
      workspaceUrl: "https://workspace.example.com",
      userId: "user-1",
      email: "owner@example.com",
      secret: "workspace-secret",
      jti: "route-nonce",
    });

    const { POST } = await loadRoute();
    const first = await POST(postToken(link.token));
    const second = await POST(postToken(link.token));

    expect(first.status).toBe(307);
    expect(first.headers.get("location")).toBe("https://workspace.example.com/");
    expect(setCookie).toHaveBeenCalledWith(
      "ditto_workspace_session",
      expect.stringMatching(/^owner@example\.com\|[a-f0-9]{64}$/),
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
    expect(second.headers.get("location")).toBe(
      "https://workspace.example.com/login?error=invalid_or_expired",
    );

    const markers = await testDb.select().from(schema.magicLinks);
    expect(markers).toHaveLength(1);
    expect(markers[0].token).toBe("workspace-bootstrap:route-nonce");
  });

  it("keeps existing DB-backed workspace magic links working", async () => {
    const { createWorkspaceMagicLink } = await import("../../../../../src/engine/magic-link");
    const link = await createWorkspaceMagicLink("owner@example.com");
    expect(link).not.toBeNull();

    const { POST } = await loadRoute();
    const res = await POST(postToken(link!.token));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://workspace.example.com/");
    expect(setCookie).toHaveBeenCalled();
  });

  it("fails closed when no workspace HMAC secret is configured", async () => {
    const { createWorkspaceBootstrapLoginLink } = await import(
      "../../../../../src/engine/magic-link"
    );
    const link = createWorkspaceBootstrapLoginLink({
      workspaceUrl: "https://workspace.example.com",
      userId: "user-1",
      email: "owner@example.com",
      secret: "workspace-secret",
    });
    delete process.env.SESSION_SECRET;
    delete process.env.NETWORK_AUTH_SECRET;

    const { POST } = await loadRoute();
    const res = await POST(postToken(link.token));

    expect(res.headers.get("location")).toBe(
      "https://workspace.example.com/login?error=invalid_or_expired",
    );
    expect(setCookie).not.toHaveBeenCalled();
  });
});
