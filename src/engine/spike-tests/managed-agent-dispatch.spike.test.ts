/**
 * Brief 217 AC #1 — Spike test gate (Insight-180 spike-first).
 *
 * Performs ONE real HTTP roundtrip to Anthropic's Managed Agents preview API.
 * Verifies:
 *   1. The endpoint URL shape (`POST /v1/sessions`).
 *   2. Bearer auth via `x-api-key` works.
 *   3. The required `managed-agents-2026-04-01` beta header is honoured.
 *   4. Body shape `{ agent: { type: 'agent', id, version? }, environment_id, vault_ids? }` is accepted.
 *   5. Response payload contains `id` (session id) + `status`.
 *   6. The follow-up `POST /v1/sessions/{id}/events` accepts a `user.message` event.
 *   7. The session can be archived via `POST /v1/sessions/{id}/archive`.
 *
 * This is the gate that proves the auth + endpoint + response shape work end-to-end
 * before the rest of Brief 217 builds. If it fails, the architect re-reviews the
 * Anthropic Managed Agents contract (beta-header drift, shape change) before adapter wiring.
 *
 * Skipped in CI: requires real `ANTHROPIC_API_KEY` + `MANAGED_AGENT_ID` + `MANAGED_ENVIRONMENT_ID`.
 * Run locally:
 *   ANTHROPIC_API_KEY=sk-ant-… \
 *     MANAGED_AGENT_ID=agt_… \
 *     MANAGED_ENVIRONMENT_ID=env_… \
 *     pnpm vitest run src/engine/spike-tests/managed-agent-dispatch.spike.test.ts
 */

import { describe, it, expect } from "vitest";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const AGENT_ID = process.env.MANAGED_AGENT_ID;
const ENVIRONMENT_ID = process.env.MANAGED_ENVIRONMENT_ID;
const AGENT_VERSION = process.env.MANAGED_AGENT_VERSION;
const BETA_HEADER =
  process.env.MANAGED_AGENT_BETA_HEADER ?? "managed-agents-2026-04-01";
const ENDPOINT_BASE = "https://api.anthropic.com";

const SHOULD_RUN = Boolean(API_KEY && AGENT_ID && ENVIRONMENT_ID);

describe.skipIf(!SHOULD_RUN)("Brief 217 spike — Anthropic Managed Agents", () => {
  it(
    "creates a session, sends a user.message event, then archives",
    async () => {
      const baseHeaders = {
        "x-api-key": API_KEY!,
        "anthropic-beta": BETA_HEADER,
        "Content-Type": "application/json",
      };

      // 1. Create the session.
      const createBody = JSON.stringify({
        agent: AGENT_VERSION
          ? { type: "agent", id: AGENT_ID, version: Number(AGENT_VERSION) }
          : { type: "agent", id: AGENT_ID },
        environment_id: ENVIRONMENT_ID,
      });

      const createRes = await fetch(`${ENDPOINT_BASE}/v1/sessions`, {
        method: "POST",
        headers: baseHeaders,
        body: createBody,
      });
      const createText = await createRes.text();
      expect(
        createRes.status,
        `Expected 200/201, got ${createRes.status}: ${createText}`,
      ).toBeGreaterThanOrEqual(200);
      expect(createRes.status).toBeLessThan(300);

      const createJson = JSON.parse(createText) as Record<string, unknown>;
      expect(createJson).toHaveProperty("id");
      expect(createJson).toHaveProperty("status");
      const sessionId = createJson.id as string;
      expect(typeof sessionId).toBe("string");
      expect(sessionId.length).toBeGreaterThan(0);

      // eslint-disable-next-line no-console
      console.log("[spike] session created:", {
        id: sessionId,
        status: createJson.status,
      });

      // 2. Send the first user.message event.
      const eventsBody = JSON.stringify({
        events: [
          {
            type: "user.message",
            content: [
              {
                type: "text",
                text: "Ditto Brief 217 spike test — please respond with a no-op acknowledgement and exit.",
              },
            ],
          },
        ],
      });

      const eventsRes = await fetch(
        `${ENDPOINT_BASE}/v1/sessions/${sessionId}/events`,
        {
          method: "POST",
          headers: baseHeaders,
          body: eventsBody,
        },
      );
      const eventsText = await eventsRes.text();
      expect(
        eventsRes.status,
        `Expected 200/201/202, got ${eventsRes.status}: ${eventsText}`,
      ).toBeGreaterThanOrEqual(200);
      expect(eventsRes.status).toBeLessThan(300);

      // 3. Archive the session (lifecycle cleanup per D12).
      const archiveRes = await fetch(
        `${ENDPOINT_BASE}/v1/sessions/${sessionId}/archive`,
        {
          method: "POST",
          headers: baseHeaders,
        },
      );
      // Archive may return 200/202/204 depending on preview behaviour — any 2xx is acceptable.
      const archiveText = await archiveRes.text().catch(() => "");
      expect(
        archiveRes.status,
        `Archive expected 2xx, got ${archiveRes.status}: ${archiveText}`,
      ).toBeGreaterThanOrEqual(200);
      expect(archiveRes.status).toBeLessThan(300);

      // eslint-disable-next-line no-console
      console.log("[spike] session archived:", sessionId);
    },
    60_000,
  );
});

describe("Brief 217 spike — env-gated stub when not configured", () => {
  it("documents how to run the spike", () => {
    if (SHOULD_RUN) {
      expect(true).toBe(true);
      return;
    }
    expect(API_KEY, "ANTHROPIC_API_KEY not set — spike skipped").toBeUndefined();
    expect(AGENT_ID, "MANAGED_AGENT_ID not set — spike skipped").toBeUndefined();
    expect(
      ENVIRONMENT_ID,
      "MANAGED_ENVIRONMENT_ID not set — spike skipped",
    ).toBeUndefined();
  });
});
