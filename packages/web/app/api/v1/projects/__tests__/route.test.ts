/**
 * Brief 223 — projects CRUD route tests.
 *
 * Uses vi.mock to swap the singleton `src/db` import for a per-test
 * fresh-SQLite database (real DB, no mocks for queries).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../../../../../src/test-utils";

let testDb: TestDb;
let cleanup: () => void;

vi.mock("../../../../../../../src/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

beforeEach(() => {
  delete process.env.WORKSPACE_OWNER_EMAIL;
  const t = createTestDb();
  testDb = t.db;
  cleanup = t.cleanup;
});

afterEach(() => {
  cleanup();
});

async function loadRoute() {
  vi.resetModules();
  const route = await import("../route");
  return route;
}

async function loadDetailRoute() {
  vi.resetModules();
  const route = await import("../[id]/route");
  return route;
}

function jsonReq(url: string, init?: RequestInit & { body?: unknown }): Request {
  const opts: RequestInit = { ...init };
  if (init?.body && typeof init.body !== "string") {
    opts.body = JSON.stringify(init.body);
    opts.headers = {
      ...(init.headers || {}),
      "Content-Type": "application/json",
    };
  }
  return new Request(url, opts);
}

describe("POST /api/v1/projects", () => {
  it("creates a project, returns the bearer token ONCE", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: {
          slug: "alpha",
          name: "Alpha",
          githubRepo: "x/y",
          harnessType: "native",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.project.slug).toBe("alpha");
    expect(typeof body.bearerToken).toBe("string");
    expect(body.bearerToken.length).toBeGreaterThan(40);
    expect(body.bearerOnceWarning).toBe(true);
    // bearer hash is stored, plaintext is not on the project row.
    expect(body.project.runnerBearerHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("returns 400 on invalid slug", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: { slug: "ALPHA!", name: "X" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate slug", async () => {
    const { POST } = await loadRoute();
    await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: { slug: "dup", name: "First" },
      }),
    );
    const res2 = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: { slug: "dup", name: "Second" },
      }),
    );
    expect(res2.status).toBe(409);
  });

  it("creates first project_runners row when runnerConfig is provided", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: {
          slug: "beta",
          name: "Beta",
          defaultRunnerKind: "github-action",
          runnerConfig: {
            kind: "github-action",
            config: { repo: "x/y", workflowFile: "ci.yml" },
            credentialIds: [],
          },
        },
      }),
    );
    expect(res.status).toBe(201);
    const { projectRunners } = await import(
      "../../../../../../../src/db/schema"
    );
    const rows = await testDb.select().from(projectRunners);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("github-action");
    expect(rows[0].mode).toBe("cloud");
  });

  // Brief 223 AC #13 — per-kind discriminated-union validation.
  it("AC #13: rejects claude-code-routine runnerConfig missing endpoint", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: {
          slug: "ccr-bad",
          name: "X",
          defaultRunnerKind: "claude-code-routine",
          runnerConfig: { kind: "claude-code-routine", config: {} },
        },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/runnerConfig/i);
    expect(body.kind).toBe("claude-code-routine");
  });

  it("AC #13: accepts claude-code-routine runnerConfig with valid endpoint", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: {
          slug: "ccr-ok",
          name: "Y",
          defaultRunnerKind: "claude-code-routine",
          runnerConfig: {
            kind: "claude-code-routine",
            config: { endpoint: "https://routine.example/fire" },
          },
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("AC #13: rejects local-mac-mini runnerConfig missing deviceId", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: {
          slug: "lmm-bad",
          name: "Z",
          defaultRunnerKind: "local-mac-mini",
          runnerConfig: { kind: "local-mac-mini", config: {} },
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("AC #13: accepts local-mac-mini runnerConfig with deviceId", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: {
          slug: "lmm-ok",
          name: "W",
          defaultRunnerKind: "local-mac-mini",
          runnerConfig: {
            kind: "local-mac-mini",
            config: { deviceId: "dev-123" },
          },
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("AC #13: rejects github-action runnerConfig missing workflowFile", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: {
          slug: "gha-bad",
          name: "Q",
          defaultRunnerKind: "github-action",
          runnerConfig: {
            kind: "github-action",
            config: { repo: "x/y" }, // missing workflowFile
          },
        },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/projects", () => {
  it("filters out archived projects by default", async () => {
    const { POST, GET } = await loadRoute();
    await POST(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: { slug: "active", name: "A", defaultRunnerKind: "local-mac-mini" },
      }),
    );
    // Direct insert of an archived project for the test.
    const { projects } = await import("../../../../../../../src/db/schema");
    await testDb
      .insert(projects)
      .values({ slug: "old", name: "Old", status: "archived" });

    const res = await GET(jsonReq("http://t/api/v1/projects"));
    const body = await res.json();
    const slugs = body.projects.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain("active");
    expect(slugs).not.toContain("old");
  });

  it("includes archived when ?includeArchived=true", async () => {
    const { GET } = await loadRoute();
    const { projects } = await import("../../../../../../../src/db/schema");
    await testDb
      .insert(projects)
      .values({ slug: "archived-one", name: "A", status: "archived" });
    const res = await GET(
      jsonReq("http://t/api/v1/projects?includeArchived=true"),
    );
    const body = await res.json();
    expect(
      body.projects.some((p: { slug: string }) => p.slug === "archived-one"),
    ).toBe(true);
  });
});

describe("GET /api/v1/projects/:id", () => {
  it("returns 404 on missing slug", async () => {
    const { GET } = await loadDetailRoute();
    const res = await GET(jsonReq("http://t/x"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns the project + project_runners on hit", async () => {
    const { POST: createPost } = await loadRoute();
    await createPost(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: {
          slug: "gamma",
          name: "Gamma",
          defaultRunnerKind: "claude-code-routine",
          runnerConfig: {
            kind: "claude-code-routine",
            config: { endpoint: "https://r.example/fire" },
            credentialIds: [],
          },
        },
      }),
    );
    const { GET } = await loadDetailRoute();
    const res = await GET(jsonReq("http://t/x"), {
      params: Promise.resolve({ id: "gamma" }),
    });
    const body = await res.json();
    expect(body.project.slug).toBe("gamma");
    expect(body.runners).toHaveLength(1);
    expect(body.runners[0].kind).toBe("claude-code-routine");
  });
});

describe("PATCH /api/v1/projects/:id", () => {
  it("rotates the bearer atomically and writes an audit activity", async () => {
    const { POST: createPost } = await loadRoute();
    const created = await createPost(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: { slug: "rot", name: "Rot" },
      }),
    );
    const createdJson = await created.json();
    const oldBearer = createdJson.bearerToken;
    const oldHash = createdJson.project.runnerBearerHash;

    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(
      jsonReq("http://t/x", {
        method: "PATCH",
        body: { rotateBearer: true },
      }),
      { params: Promise.resolve({ id: "rot" }) },
    );
    const body = await res.json();
    expect(body.bearerToken).toBeTruthy();
    expect(body.bearerToken).not.toBe(oldBearer);
    expect(body.project.runnerBearerHash).not.toBe(oldHash);

    const { activities } = await import(
      "../../../../../../../src/db/schema"
    );
    const acts = await testDb.select().from(activities);
    const rotation = acts.find((a) => a.action === "project_bearer_rotated");
    expect(rotation).toBeTruthy();
    expect(rotation?.actorType).toBe("admin-cookie");
  });

  it("rejects active when default runner not enabled (validateStatusTransition)", async () => {
    const { POST: createPost } = await loadRoute();
    await createPost(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: { slug: "needs-runner", name: "X" },
      }),
    );
    const { PATCH } = await loadDetailRoute();
    const res = await PATCH(
      jsonReq("http://t/x", {
        method: "PATCH",
        body: { status: "active" },
      }),
      { params: Promise.resolve({ id: "needs-runner" }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("needs-default-runner");
  });
});

describe("DELETE /api/v1/projects/:id", () => {
  it("soft-deletes by setting status='archived' (does NOT remove the row)", async () => {
    const { POST: createPost } = await loadRoute();
    await createPost(
      jsonReq("http://t/api/v1/projects", {
        method: "POST",
        body: { slug: "to-archive", name: "X" },
      }),
    );
    const { DELETE } = await loadDetailRoute();
    const res = await DELETE(jsonReq("http://t/x"), {
      params: Promise.resolve({ id: "to-archive" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.project.status).toBe("archived");

    const { projects } = await import(
      "../../../../../../../src/db/schema"
    );
    const rows = await testDb.select().from(projects);
    // Row still exists.
    expect(rows.some((p) => p.slug === "to-archive")).toBe(true);
  });

  it("returns 404 when slug does not exist", async () => {
    const { DELETE } = await loadDetailRoute();
    const res = await DELETE(jsonReq("http://t/x"), {
      params: Promise.resolve({ id: "ghost" }),
    });
    expect(res.status).toBe(404);
  });
});
