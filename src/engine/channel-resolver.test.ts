/**
 * Channel Resolver Tests — Brief 152
 *
 * Tests: identity × channel matrix, backward compatibility for
 * legacy identity values, fallback behavior, activity logging.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies before importing the module under test
vi.mock("./integration-availability", () => ({
  hasIntegration: vi.fn(),
  getGoogleCredential: vi.fn(),
}));

vi.mock("./channel", async (importOriginal) => {
  const original = await importOriginal<typeof import("./channel")>();

  class MockGmailApiAdapter {
    channel = "email" as const;
    userId: string;
    fromAddress: string;
    displayName: string;
    constructor(userId: string, fromAddress: string, displayName: string) {
      this.userId = userId;
      this.fromAddress = fromAddress;
      this.displayName = displayName;
    }
    async send() { return { success: true, messageId: "mock-gmail-msg" }; }
    async search() { return []; }
  }

  return {
    ...original,
    createAgentMailAdapterForPersona: vi.fn(() => ({
      channel: "email",
      send: vi.fn(),
      search: vi.fn(),
    })),
    GmailApiAdapter: MockGmailApiAdapter,
  };
});

vi.mock("../db", () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn() })),
  },
  schema: {
    activities: "activities",
  },
}));

import { resolveEmailChannel } from "./channel-resolver";
import { hasIntegration, getGoogleCredential } from "./integration-availability";

const mockHasIntegration = vi.mocked(hasIntegration);
const mockGetGoogleCredential = vi.mocked(getGoogleCredential);

const MOCK_GOOGLE_TOKENS = {
  access_token: "ya29.mock-access-token",
  refresh_token: "1//mock-refresh-token",
  token_type: "Bearer",
  expiry_date: Date.now() + 3600 * 1000,
  email: "user@example.com",
};

describe("resolveEmailChannel (Brief 152)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasIntegration.mockResolvedValue(false);
    mockGetGoogleCredential.mockResolvedValue(null);
  });

  // ============================================================
  // Principal identity — always AgentMail
  // ============================================================

  it("principal identity → AgentMail regardless of Gmail connection", async () => {
    mockHasIntegration.mockResolvedValue(true);
    mockGetGoogleCredential.mockResolvedValue(MOCK_GOOGLE_TOKENS);

    const result = await resolveEmailChannel("principal", "founder");

    expect(result.channel).toBe("agentmail");
    expect(result.fallbackReason).toBeUndefined();
  });

  it("null identity defaults to principal → AgentMail", async () => {
    const result = await resolveEmailChannel(null, "founder");

    expect(result.channel).toBe("agentmail");
    expect(result.fromIdentity.personaId).toBe("alex");
  });

  it("undefined identity defaults to principal → AgentMail", async () => {
    const result = await resolveEmailChannel(undefined, "founder");

    expect(result.channel).toBe("agentmail");
  });

  // ============================================================
  // User identity — Gmail when connected, AgentMail fallback
  // ============================================================

  it("user identity + Gmail connected → Gmail API adapter", async () => {
    mockHasIntegration.mockResolvedValue(true);
    mockGetGoogleCredential.mockResolvedValue(MOCK_GOOGLE_TOKENS);

    const result = await resolveEmailChannel("user", "founder");

    expect(result.channel).toBe("gmail-api");
    expect(result.fromIdentity.fromAddress).toBe("user@example.com");
    expect(result.fallbackReason).toBeUndefined();
  });

  it("user identity + Gmail NOT connected → AgentMail fallback", async () => {
    mockHasIntegration.mockResolvedValue(false);

    const result = await resolveEmailChannel("user", "founder");

    expect(result.channel).toBe("agentmail");
    expect(result.fallbackReason).toBe("gmail_not_connected");
  });

  it("user identity + hasIntegration true but getGoogleCredential returns null → AgentMail fallback", async () => {
    mockHasIntegration.mockResolvedValue(true);
    mockGetGoogleCredential.mockResolvedValue(null);

    const result = await resolveEmailChannel("user", "founder");

    expect(result.channel).toBe("agentmail");
    expect(result.fallbackReason).toBe("gmail_not_connected");
  });

  // ============================================================
  // Backward compatibility: agent-of-user and ghost → user routing
  // ============================================================

  it("agent-of-user identity + Gmail connected → Gmail API (backward compat)", async () => {
    mockHasIntegration.mockResolvedValue(true);
    mockGetGoogleCredential.mockResolvedValue(MOCK_GOOGLE_TOKENS);

    const result = await resolveEmailChannel("agent-of-user", "founder");

    expect(result.channel).toBe("gmail-api");
  });

  it("agent-of-user identity + Gmail NOT connected → AgentMail fallback", async () => {
    const result = await resolveEmailChannel("agent-of-user", "founder");

    expect(result.channel).toBe("agentmail");
    expect(result.fallbackReason).toBe("gmail_not_connected");
  });

  it("ghost identity + Gmail connected → Gmail API (backward compat)", async () => {
    mockHasIntegration.mockResolvedValue(true);
    mockGetGoogleCredential.mockResolvedValue(MOCK_GOOGLE_TOKENS);

    const result = await resolveEmailChannel("ghost", "founder");

    expect(result.channel).toBe("gmail-api");
  });

  it("ghost identity + Gmail NOT connected → AgentMail fallback", async () => {
    const result = await resolveEmailChannel("ghost", "founder");

    expect(result.channel).toBe("agentmail");
    expect(result.fallbackReason).toBe("gmail_not_connected");
  });

  // ============================================================
  // Unknown identity values → principal routing
  // ============================================================

  it("unknown identity value → AgentMail (treated as principal)", async () => {
    const result = await resolveEmailChannel("some-unknown-value", "founder");

    expect(result.channel).toBe("agentmail");
    expect(result.fallbackReason).toBeUndefined();
  });

  // ============================================================
  // Return shape
  // ============================================================

  it("returns adapter, fromIdentity, and channel in resolved result", async () => {
    const result = await resolveEmailChannel("principal", "founder");

    expect(result).toHaveProperty("adapter");
    expect(result).toHaveProperty("fromIdentity");
    expect(result).toHaveProperty("channel");
    expect(result.fromIdentity).toHaveProperty("personaId");
    expect(result.fromIdentity).toHaveProperty("fromAddress");
    expect(result.fromIdentity).toHaveProperty("displayName");
  });
});
