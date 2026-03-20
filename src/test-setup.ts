/**
 * Vitest global setup — mocks external API clients to prevent
 * import-time failures without API keys.
 *
 * This mocks the Anthropic SDK only — NOT the database.
 * Tests use real SQLite via better-sqlite3.
 */

import { vi } from "vitest";

// Mock @anthropic-ai/sdk to prevent import-time `new Anthropic()` failures
// in review-pattern.ts and claude.ts when ANTHROPIC_API_KEY is not set.
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "mock response" }],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      };
    },
  };
});
