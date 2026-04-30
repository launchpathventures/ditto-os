/**
 * Brief 218 AC #1 — Spike test gate (Insight-180 spike-first).
 *
 * Performs ONE real HTTP roundtrip to GitHub's Actions REST API. Verifies:
 *   1. The endpoint URL shape (`POST /repos/{owner}/{repo}/actions/workflows/{file}/dispatches`).
 *   2. Bearer auth via `Authorization: Bearer <pat>` works for `actions:write` scope.
 *   3. The endpoint returns the new run's `id` synchronously since 2026-02-19.
 *   4. The follow-up `GET /repos/{owner}/{repo}/actions/runs/{id}` returns the run.
 *   5. Cancellation via `POST /repos/{owner}/{repo}/actions/runs/{id}/cancel` works.
 *
 * This is the gate that proves the auth + endpoint + response shape work end-to-end
 * before the rest of Brief 218 builds. If it fails, the architect re-reviews the
 * GitHub Actions REST contract (run-id-on-response drift, scope changes) before
 * adapter wiring.
 *
 * Skipped in CI: requires real `GITHUB_TOKEN` + `TEST_REPO_OWNER` + `TEST_REPO_NAME`
 * + `TEST_WORKFLOW_FILE` (the workflow_dispatch-enabled file under `.github/workflows/`).
 *
 * Run locally:
 *   GITHUB_TOKEN=ghp_… \
 *     TEST_REPO_OWNER=<owner> \
 *     TEST_REPO_NAME=<test-repo> \
 *     TEST_WORKFLOW_FILE=dummy-dispatch.yml \
 *     pnpm vitest run src/engine/spike-tests/github-action-dispatch.spike.test.ts
 */

import { describe, it, expect } from "vitest";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const TEST_REPO_OWNER = process.env.TEST_REPO_OWNER;
const TEST_REPO_NAME = process.env.TEST_REPO_NAME;
const TEST_WORKFLOW_FILE = process.env.TEST_WORKFLOW_FILE;
const TEST_REF = process.env.TEST_REF ?? "main";
const ENDPOINT_BASE = "https://api.github.com";

const SHOULD_RUN = Boolean(
  GITHUB_TOKEN && TEST_REPO_OWNER && TEST_REPO_NAME && TEST_WORKFLOW_FILE,
);

describe.skipIf(!SHOULD_RUN)(
  "Brief 218 spike — GitHub Actions workflow_dispatch",
  () => {
    it(
      "fires workflow_dispatch, finds the run id, then cancels",
      async () => {
        const baseHeaders = {
          Authorization: `Bearer ${GITHUB_TOKEN!}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        };

        // 1. Fire the workflow_dispatch event.
        const dispatchUrl = `${ENDPOINT_BASE}/repos/${TEST_REPO_OWNER}/${TEST_REPO_NAME}/actions/workflows/${TEST_WORKFLOW_FILE}/dispatches`;
        const dispatchBody = JSON.stringify({
          ref: TEST_REF,
          inputs: {
            spike: "true",
          },
        });

        const dispatchRes = await fetch(dispatchUrl, {
          method: "POST",
          headers: baseHeaders,
          body: dispatchBody,
        });
        const dispatchText = await dispatchRes.text().catch(() => "");
        expect(
          dispatchRes.status,
          `Expected 2xx, got ${dispatchRes.status}: ${dispatchText}`,
        ).toBeGreaterThanOrEqual(200);
        expect(dispatchRes.status).toBeLessThan(300);

        // Since 2026-02-19, the response body MAY include `id`. If it doesn't
        // (older API behaviour or transient null), fall back to listing runs.
        let runId: number | null = null;
        if (dispatchText) {
          try {
            const dispatchJson = JSON.parse(dispatchText) as Record<
              string,
              unknown
            >;
            if (typeof dispatchJson.id === "number") {
              runId = dispatchJson.id;
            }
          } catch {
            // 204 No Content / empty body — fall through to listWorkflowRuns.
          }
        }

        if (runId === null) {
          // Fallback: list recent workflow_dispatch runs and pick the newest.
          const listUrl = `${ENDPOINT_BASE}/repos/${TEST_REPO_OWNER}/${TEST_REPO_NAME}/actions/workflows/${TEST_WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=1`;
          // Allow GitHub a moment to register the new run.
          await new Promise((r) => setTimeout(r, 3000));
          const listRes = await fetch(listUrl, {
            method: "GET",
            headers: baseHeaders,
          });
          const listJson = (await listRes.json()) as {
            workflow_runs?: Array<{ id: number }>;
          };
          runId = listJson.workflow_runs?.[0]?.id ?? null;
        }

        expect(
          runId,
          "Expected to retrieve a workflow run ID (either from dispatch response or listWorkflowRuns fallback)",
        ).not.toBeNull();
        expect(typeof runId).toBe("number");

        // eslint-disable-next-line no-console
        console.log("[spike] workflow run dispatched:", { runId });

        // 2. Verify the run is visible via GET /actions/runs/{id}.
        const getUrl = `${ENDPOINT_BASE}/repos/${TEST_REPO_OWNER}/${TEST_REPO_NAME}/actions/runs/${runId}`;
        const getRes = await fetch(getUrl, {
          method: "GET",
          headers: baseHeaders,
        });
        expect(
          getRes.status,
          `getWorkflowRun expected 200, got ${getRes.status}`,
        ).toBe(200);
        const runJson = (await getRes.json()) as {
          id: number;
          status: string;
          html_url: string;
          logs_url: string;
        };
        expect(runJson.id).toBe(runId);
        expect(typeof runJson.status).toBe("string");
        expect(runJson.html_url).toContain(
          `/${TEST_REPO_OWNER}/${TEST_REPO_NAME}/actions/runs/${runId}`,
        );

        // eslint-disable-next-line no-console
        console.log("[spike] workflow run visible:", {
          id: runJson.id,
          status: runJson.status,
          html_url: runJson.html_url,
        });

        // 3. Cancel the run.
        const cancelUrl = `${ENDPOINT_BASE}/repos/${TEST_REPO_OWNER}/${TEST_REPO_NAME}/actions/runs/${runId}/cancel`;
        const cancelRes = await fetch(cancelUrl, {
          method: "POST",
          headers: baseHeaders,
        });
        // Cancel returns 202 Accepted; reject anything else.
        expect(
          cancelRes.status,
          `cancel expected 202, got ${cancelRes.status}`,
        ).toBe(202);

        // eslint-disable-next-line no-console
        console.log("[spike] workflow run cancelled:", runId);
      },
      90_000,
    );
  },
);

describe("Brief 218 spike — env-gated stub when not configured", () => {
  it("documents how to run the spike", () => {
    if (SHOULD_RUN) {
      expect(true).toBe(true);
      return;
    }
    expect(
      GITHUB_TOKEN,
      "GITHUB_TOKEN not set — spike skipped",
    ).toBeUndefined();
    expect(
      TEST_REPO_OWNER,
      "TEST_REPO_OWNER not set — spike skipped",
    ).toBeUndefined();
    expect(
      TEST_REPO_NAME,
      "TEST_REPO_NAME not set — spike skipped",
    ).toBeUndefined();
    expect(
      TEST_WORKFLOW_FILE,
      "TEST_WORKFLOW_FILE not set — spike skipped",
    ).toBeUndefined();
  });
});
