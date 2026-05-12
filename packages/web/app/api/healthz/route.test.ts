import { afterEach, describe, expect, it, vi } from "vitest";

type SchemaHealth = {
  status: "ok" | "behind" | "error";
  applied: number;
  expected: number;
  error?: string;
};

let workspaceSchemaMock: SchemaHealth = { status: "ok", applied: 2, expected: 2 };
let seedStateMock: "not_attempted" | "attempted" | "imported" = "not_attempted";
let networkSchemaMock: SchemaHealth = { status: "ok", applied: 2, expected: 2 };

vi.mock("../../../../../src/db", () => ({
  db: {
    all: () => [{ ok: 1 }],
  },
  getWorkspaceSchemaHealth: () => workspaceSchemaMock,
}));

vi.mock("../../../../../src/engine/network-seed", () => ({
  getSeedAttemptState: vi.fn(async () => seedStateMock),
}));

vi.mock("../../../../../src/db/network-db", () => ({
  getNetworkSchemaHealth: vi.fn(async () => networkSchemaMock),
}));

async function loadRoute(opts: {
  workspaceSchema?: SchemaHealth;
  seedState?: "not_attempted" | "attempted" | "imported";
  networkSchema?: SchemaHealth;
} = {}) {
  workspaceSchemaMock = opts.workspaceSchema ?? { status: "ok", applied: 2, expected: 2 };
  seedStateMock = opts.seedState ?? "not_attempted";
  networkSchemaMock = opts.networkSchema ?? { status: "ok", applied: 2, expected: 2 };
  vi.resetModules();
  return import("./route");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /healthz", () => {
  it("strict workspace health returns 503 when the Network is unreachable", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://network.example.com");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const { GET } = await loadRoute({ seedState: "attempted" });
    const res = await GET(new Request("http://workspace.test/healthz?deep=true"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      mode: "strict",
      seed: "attempted",
      network: "unreachable",
      schema: { workspace: { status: "ok" } },
    });
  });

  it("provisioning workspace health accepts seed-attempted when the Network is unreachable", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://network.example.com");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const { GET } = await loadRoute({ seedState: "attempted" });
    const res = await GET(
      new Request("http://workspace.test/healthz?deep=true&mode=provisioning"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      mode: "provisioning",
      seed: "attempted",
      network: "unreachable",
    });
  });

  it("provisioning workspace health still returns 503 when local schema is behind", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    vi.stubEnv("DITTO_NETWORK_URL", "https://network.example.com");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    const { GET } = await loadRoute({
      workspaceSchema: { status: "behind", applied: 1, expected: 2 },
      seedState: "attempted",
    });
    const res = await GET(
      new Request("http://workspace.test/healthz?deep=true&mode=provisioning"),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.schema.workspace).toMatchObject({ status: "behind", applied: 1, expected: 2 });
  });

  it("strict Network Service health returns 503 when Network Postgres schema is behind", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "public");

    const { GET } = await loadRoute({
      networkSchema: { status: "behind", applied: 1, expected: 2 },
    });
    const res = await GET(new Request("http://network.test/healthz?deep=true"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      mode: "strict",
      network: "unavailable",
      schema: { network: { status: "behind", applied: 1, expected: 2 } },
    });
  });

  it("provisioning mode cannot mask Network Service Postgres schema failure", async () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "public");

    const { GET } = await loadRoute({
      networkSchema: { status: "error", applied: 0, expected: 2, error: "connection refused" },
    });
    const res = await GET(
      new Request("http://network.test/healthz?deep=true&mode=provisioning"),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      mode: "provisioning",
      network: "unavailable",
      schema: { network: { status: "error" } },
    });
  });
});
