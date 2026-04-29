/**
 * Brief 216 AC #1 — Spike test gate (Insight-180 spike-first).
 *
 * Performs ONE real HTTP roundtrip to Anthropic's Claude Code Routines `/fire`
 * endpoint with a real configured Routine + bearer. Verifies:
 *   1. The endpoint URL shape (`/v1/claude_code/routines/{trigger_id}/fire`).
 *   2. Bearer auth via `Authorization: Bearer …` works.
 *   3. The required `experimental-cc-routine-2026-04-01` beta header is honoured.
 *   4. Body shape `{ "text": "..." }` is accepted.
 *   5. Response payload contains `claude_code_session_id` + `claude_code_session_url`.
 *
 * This is the gate that proves the auth + endpoint + response shape work end-to-end
 * before the rest of Brief 216 builds. If it fails, the architect re-reviews the
 * Anthropic contract (beta-header drift, shape change) before adapter wiring.
 *
 * Skipped in CI: requires real `ROUTINE_BEARER` + `ROUTINE_TRIGGER_ID` env vars.
 * Run locally:
 *   ROUTINE_BEARER=sk-ant-oat01-… ROUTINE_TRIGGER_ID=trig_01… \
 *     pnpm vitest run src/engine/spike-tests/routine-dispatch.spike.test.ts
 */

import { describe, it, expect } from "vitest";

const BEARER = process.env.ROUTINE_BEARER;
const TRIGGER_ID = process.env.ROUTINE_TRIGGER_ID;
const BETA_HEADER = "experimental-cc-routine-2026-04-01";
const ENDPOINT_BASE = "https://api.anthropic.com";

const SHOULD_RUN = Boolean(BEARER && TRIGGER_ID);

describe.skipIf(!SHOULD_RUN)("Brief 216 spike — Anthropic Routine /fire", () => {
  it("fires a Routine and receives a session id + url", async () => {
    const url = `${ENDPOINT_BASE}/v1/claude_code/routines/${TRIGGER_ID}/fire`;
    const body = JSON.stringify({
      text: "Ditto Brief 216 spike test — please respond with a no-op acknowledgement and exit.",
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BEARER}`,
        "anthropic-beta": BETA_HEADER,
        "Content-Type": "application/json",
      },
      body,
    });

    expect(res.status, `Expected 200, got ${res.status}`).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toHaveProperty("claude_code_session_id");
    expect(json).toHaveProperty("claude_code_session_url");
    expect(typeof json.claude_code_session_id).toBe("string");
    expect(typeof json.claude_code_session_url).toBe("string");

    // Surface real values for the operator running the spike.
    // eslint-disable-next-line no-console
    console.log("[spike] Routine fired:", {
      sessionId: json.claude_code_session_id,
      sessionUrl: json.claude_code_session_url,
    });
  }, 30_000);
});

describe("Brief 216 spike — env-gated stub when not configured", () => {
  it("documents how to run the spike", () => {
    if (SHOULD_RUN) {
      // Real path runs above; this case is a no-op when env vars are present.
      expect(true).toBe(true);
      return;
    }
    expect(BEARER, "ROUTINE_BEARER not set — spike skipped").toBeUndefined();
    expect(TRIGGER_ID, "ROUTINE_TRIGGER_ID not set — spike skipped").toBeUndefined();
  });
});
