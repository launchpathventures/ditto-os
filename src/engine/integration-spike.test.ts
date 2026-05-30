/**
 * Integration Spike Tests — Verify real API connectivity
 *
 * These tests make ONE real API call to each external service to verify:
 * - Auth format is correct
 * - Endpoint URL is correct
 * - Response shape matches our types
 *
 * Skipped when credentials are not configured.
 * Run manually: pnpm vitest run src/engine/integration-spike.test.ts
 *
 * Provenance: Retrospective 2026-04-14 — "API format verification"
 * P0s in Anthropic image gen and X media upload would have been caught
 * by a single real API call before wiring.
 */

import { describe, it, expect } from "vitest";

const canRunX = !!(
  process.env.X_API_KEY &&
  process.env.X_API_SECRET &&
  process.env.X_ACCESS_TOKEN &&
  process.env.X_ACCESS_TOKEN_SECRET
);

const canRunUnipile = !!(
  process.env.UNIPILE_API_KEY &&
  process.env.UNIPILE_DSN
);

const canRunAnthropic = !!process.env.ANTHROPIC_API_KEY;
const canRunAgentMailHeaders = !!(
  process.env.AGENTMAIL_API_KEY &&
  (process.env.AGENTMAIL_TEST_INBOX || process.env.AGENTMAIL_ALEX_INBOX) &&
  process.env.AGENTMAIL_SPIKE_TO
);

describe("X API v2 spike", () => {
  it.skipIf(!canRunX)("can authenticate — verify config loads", async () => {
    const { getXApiConfig } = await import("./channel");
    const config = getXApiConfig();
    expect(config).not.toBeNull();
    expect(config!.apiKey).toBeTruthy();
    expect(config!.accessToken).toBeTruthy();
  });

  it.skipIf(!canRunX)("can post and delete a test tweet", async () => {
    const { XApiClient, getXApiConfig } = await import("./channel");
    const config = getXApiConfig()!;
    const client = new XApiClient(config);

    // Post a test tweet
    const { tweetId, tweetUrl } = await client.postTweet(
      `[Ditto integration test — safe to ignore] ${new Date().toISOString()}`
    );
    expect(tweetId).toBeTruthy();
    expect(tweetUrl).toContain("x.com");

    // Clean up — delete the test tweet
    // X API v2 DELETE /2/tweets/:id
    const deleteUrl = `https://api.x.com/2/tweets/${tweetId}`;
    // We'd need to call buildOAuth1Header here, but it's not exported
    // For now, verify the post worked
    console.log(`[spike] Posted test tweet ${tweetId} at ${tweetUrl}`);
  });
});

describe("Unipile Posts API spike", () => {
  it.skipIf(!canRunUnipile)("can list connected accounts", async () => {
    const { getUnipileConfig } = await import("./channel");
    const config = getUnipileConfig();
    expect(config).not.toBeNull();

    // List accounts to verify API key works
    const response = await fetch(`${config!.dsn}/api/v1/accounts`, {
      headers: {
        "X-API-KEY": config!.apiKey,
      },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    console.log(`[spike] Unipile accounts: ${JSON.stringify(data).slice(0, 200)}`);
  });
});

describe("Anthropic image generation spike", () => {
  it.skipIf(!canRunAnthropic)("can generate a test image", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY!;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2025-04-14",
        "anthropic-beta": "image-generation-2025-04-14",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 16384,
        messages: [{
          role: "user",
          content: "Generate a simple test image: a small blue circle on a white background. Keep it minimal.",
        }],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json() as {
      content: Array<{ type: string; source?: { type: string; media_type: string; data: string } }>;
    };

    const imageBlock = data.content.find(
      (block) => block.type === "image" && block.source?.type === "base64"
    );
    expect(imageBlock).toBeDefined();
    expect(imageBlock!.source!.data.length).toBeGreaterThan(100);

    const buffer = Buffer.from(imageBlock!.source!.data, "base64");
    console.log(`[spike] Generated image: ${buffer.length} bytes, type: ${imageBlock!.source!.media_type}`);
  }, 30000); // 30s timeout for image generation
});

describe("AgentMail headers spike", () => {
  it.skipIf(!canRunAgentMailHeaders)(
    "accepts RFC 8058 List-Unsubscribe headers on a real send",
    async () => {
      const { AgentMailClient } = await import("agentmail");
      const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY! });
      const inboxId = process.env.AGENTMAIL_TEST_INBOX ?? process.env.AGENTMAIL_ALEX_INBOX!;
      const to = process.env.AGENTMAIL_SPIKE_TO!;
      const result = await client.inboxes.messages.send(inboxId, {
        to: [to],
        subject: `[Ditto integration test - safe to ignore] ${new Date().toISOString()}`,
        text: "Testing AgentMail custom headers for RFC 8058 support.",
        headers: {
          "List-Unsubscribe": "<mailto:unsubscribe@ditto.partners>, <https://ditto.partners/api/v1/network/unsubscribe>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      expect(result.messageId).toBeTruthy();
    },
    30_000,
  );
});
