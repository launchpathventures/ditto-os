/**
 * Brief 228 — rerun_project_retrofit Self tool tests.
 *
 * Verifies:
 *   - Insight-180 stepRunId guard rejects calls without stepRunId in production mode.
 *   - Test mode (DITTO_TEST_MODE=true) bypasses the guard.
 *   - Missing projectId returns a structured error.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_TEST_MODE = process.env.DITTO_TEST_MODE;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_TEST_MODE === undefined) {
    delete process.env.DITTO_TEST_MODE;
  } else {
    process.env.DITTO_TEST_MODE = ORIGINAL_TEST_MODE;
  }
});

describe("handleRerunProjectRetrofit — Insight-180 guard", () => {
  it("rejects when stepRunId is missing in production mode", async () => {
    delete process.env.DITTO_TEST_MODE;
    const dbCalls: string[] = [];
    vi.doMock("../../db", () => ({
      db: {
        select: () => {
          dbCalls.push("select");
          throw new Error("DB should not be touched before guard");
        },
      },
      schema: {},
    }));
    const { handleRerunProjectRetrofit } = await import("./rerun-project-retrofit");
    const result = await handleRerunProjectRetrofit({ projectId: "proj-1" });
    expect(result.success).toBe(false);
    expect(result.output).toMatch(/Insight-180/);
    expect(dbCalls).toEqual([]);
  });

  it("test mode (DITTO_TEST_MODE=true) bypasses the guard", async () => {
    process.env.DITTO_TEST_MODE = "true";
    // Mock the DB to return no project — we just need to verify the guard
    // does NOT fire (we get past it).
    vi.doMock("../../db", () => ({
      db: {
        select: () => ({
          from: () => ({
            limit: () => ({
              where: () => Promise.resolve([]),
            }),
          }),
        }),
      },
      schema: {
        projects: { id: "id", slug: "slug" },
      },
    }));
    const { handleRerunProjectRetrofit } = await import("./rerun-project-retrofit");
    const result = await handleRerunProjectRetrofit({ projectId: "missing" });
    // Got past the guard → reached the project-not-found error
    expect(result.success).toBe(false);
    expect(result.output).toMatch(/Project not found/);
  });

  it("rejects when projectId is missing", async () => {
    process.env.DITTO_TEST_MODE = "true";
    const { handleRerunProjectRetrofit } = await import("./rerun-project-retrofit");
    const result = await handleRerunProjectRetrofit({ projectId: "" });
    expect(result.success).toBe(false);
    expect(result.output).toMatch(/projectId is required/);
  });
});
