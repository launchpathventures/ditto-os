/**
 * Tests for channel abstraction and email adapter.
 *
 * Covers: email formatting with persona sign-off, opt-out footer,
 * opt-out signal detection, Gmail adapter send/search.
 *
 * Provenance: Brief 079/081.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock agentmail SDK before importing channel
const mockSend = vi.fn();
const mockReply = vi.fn();
const mockList = vi.fn();
const mockGet = vi.fn();
const mockCreate = vi.fn();

vi.mock("agentmail", () => {
  return {
    AgentMailClient: class MockAgentMailClient {
      inboxes = {
        messages: {
          send: mockSend,
          reply: mockReply,
          list: mockList,
          get: mockGet,
        },
        create: mockCreate,
      };
    },
  };
});

import {
  formatEmailBody,
  isOptOutSignal,
  GmailChannelAdapter,
  AgentMailAdapter,
} from "./channel";
import type { OutboundMessage } from "./channel";

// ============================================================
// formatEmailBody
// ============================================================

describe("formatEmailBody", () => {
  it("adds Alex sign-off to email body", () => {
    const msg: OutboundMessage = {
      to: "test@example.com",
      subject: "Hello",
      body: "Just wanted to reach out about a potential connection.",
      personaId: "alex",
      mode: "selling",
    };
    const formatted = formatEmailBody(msg);
    expect(formatted).toContain("Alex\nDitto");
  });

  it("adds Mira sign-off to email body", () => {
    const msg: OutboundMessage = {
      to: "test@example.com",
      subject: "Hello",
      body: "I'd like to connect you with someone.",
      personaId: "mira",
      mode: "connecting",
    };
    const formatted = formatEmailBody(msg);
    expect(formatted).toContain("Mira\nDitto");
  });

  it("does not duplicate sign-off if already present", () => {
    const msg: OutboundMessage = {
      to: "test@example.com",
      subject: "Hello",
      body: "Some text.\n\nAlex\nDitto",
      personaId: "alex",
      mode: "selling",
    };
    const formatted = formatEmailBody(msg);
    // Should only appear once
    const count = (formatted.match(/Alex\nDitto/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("includes opt-out footer by default", () => {
    const msg: OutboundMessage = {
      to: "test@example.com",
      subject: "Hello",
      body: "Outreach text.",
      personaId: "alex",
      mode: "selling",
    };
    const formatted = formatEmailBody(msg);
    expect(formatted).toContain("unsubscribe");
  });

  it("excludes opt-out footer when includeOptOut is false", () => {
    const msg: OutboundMessage = {
      to: "test@example.com",
      subject: "Hello",
      body: "Follow-up text.",
      personaId: "alex",
      mode: "selling",
      includeOptOut: false,
    };
    const formatted = formatEmailBody(msg);
    expect(formatted).not.toContain("unsubscribe");
  });
});

// ============================================================
// isOptOutSignal
// ============================================================

describe("isOptOutSignal", () => {
  it("detects 'unsubscribe'", () => {
    expect(isOptOutSignal("unsubscribe")).toBe(true);
  });

  it("detects 'Unsubscribe' (case insensitive)", () => {
    expect(isOptOutSignal("Unsubscribe")).toBe(true);
  });

  it("detects 'stop'", () => {
    expect(isOptOutSignal("stop")).toBe(true);
  });

  it("detects 'remove me'", () => {
    expect(isOptOutSignal("remove me")).toBe(true);
  });

  it("detects 'please remove me from your list'", () => {
    expect(isOptOutSignal("please remove me from your list")).toBe(true);
  });

  it("detects 'don't contact me again'", () => {
    expect(isOptOutSignal("don't contact me again")).toBe(true);
  });

  it("does NOT flag normal replies", () => {
    expect(isOptOutSignal("Thanks for reaching out, tell me more")).toBe(false);
  });

  it("does NOT flag empty strings", () => {
    expect(isOptOutSignal("")).toBe(false);
  });
});

// ============================================================
// GmailChannelAdapter
// ============================================================

describe("GmailChannelAdapter", () => {
  it("calls send_message tool with formatted body", async () => {
    const mockExecute = vi.fn().mockResolvedValue('{"id": "msg-123"}');
    const adapter = new GmailChannelAdapter(mockExecute);

    const result = await adapter.send({
      to: "recipient@example.com",
      subject: "Intro",
      body: "Hi there.",
      personaId: "alex",
      mode: "selling",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("msg-123");
    expect(mockExecute).toHaveBeenCalledWith("send_message", {
      to: "recipient@example.com",
      subject: "Intro",
      body: expect.stringContaining("Alex\nDitto"),
    });
  });

  it("returns error on send failure", async () => {
    const mockExecute = vi.fn().mockRejectedValue(new Error("Auth failed"));
    const adapter = new GmailChannelAdapter(mockExecute);

    const result = await adapter.send({
      to: "test@example.com",
      subject: "Test",
      body: "Test",
      personaId: "mira",
      mode: "connecting",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Auth failed");
  });

  it("parses search results", async () => {
    const mockExecute = vi.fn().mockResolvedValue(JSON.stringify({
      messages: [
        { id: "msg-1", from: "sender@test.com", subject: "Re: Hello", body: "Reply text", date: "2026-04-06T00:00:00Z" },
      ],
    }));

    const adapter = new GmailChannelAdapter(mockExecute);
    const results = await adapter.search("from:sender@test.com");

    expect(results).toHaveLength(1);
    expect(results[0].from).toBe("sender@test.com");
    expect(results[0].subject).toBe("Re: Hello");
  });

  it("returns empty array on search failure", async () => {
    const mockExecute = vi.fn().mockRejectedValue(new Error("Network error"));
    const adapter = new GmailChannelAdapter(mockExecute);

    const results = await adapter.search("query");
    expect(results).toHaveLength(0);
  });
});

// ============================================================
// AgentMailAdapter
// ============================================================

describe("AgentMailAdapter", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockReply.mockReset();
    mockList.mockReset();
    mockGet.mockReset();
  });

  it("sends a new message via AgentMail", async () => {
    mockSend.mockResolvedValue({
      messageId: "am-msg-123",
      threadId: "am-thread-456",
    });

    const adapter = new AgentMailAdapter("test-api-key", "inbox-1");
    const result = await adapter.send({
      to: "recipient@example.com",
      subject: "Hello from Alex",
      body: "I'd like to connect you with someone.",
      personaId: "alex",
      mode: "connecting",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("am-msg-123");
    expect(result.threadId).toBe("am-thread-456");

    expect(mockSend).toHaveBeenCalledWith("inbox-1", {
      to: ["recipient@example.com"],
      subject: "Hello from Alex",
      text: expect.stringContaining("Alex\nDitto"),
    });
  });

  it("replies to an existing message (threading)", async () => {
    mockReply.mockResolvedValue({
      messageId: "am-reply-789",
      threadId: "am-thread-456",
    });

    const adapter = new AgentMailAdapter("test-api-key", "inbox-1");
    const result = await adapter.send({
      to: "recipient@example.com",
      subject: "Re: Hello",
      body: "Thanks for getting back to me.",
      personaId: "mira",
      mode: "selling",
      inReplyToMessageId: "am-msg-123",
    });

    expect(result.success).toBe(true);
    expect(result.threadId).toBe("am-thread-456");
    expect(mockReply).toHaveBeenCalledWith(
      "inbox-1",
      "am-msg-123",
      { text: expect.stringContaining("Mira\nDitto") },
    );
  });

  it("returns error on send failure", async () => {
    mockSend.mockRejectedValue(new Error("Rate limited"));

    const adapter = new AgentMailAdapter("test-api-key", "inbox-1");
    const result = await adapter.send({
      to: "test@example.com",
      subject: "Test",
      body: "Test",
      personaId: "alex",
      mode: "selling",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Rate limited");
  });

  it("lists inbound messages with preview", async () => {
    mockList.mockResolvedValue({
      messages: [
        {
          messageId: "am-msg-1",
          threadId: "am-thread-1",
          from: "sender@test.com",
          subject: "Re: Intro",
          preview: "Thanks, I'd love to connect!",
          createdAt: "2026-04-06T10:00:00Z",
        },
      ],
    });

    const adapter = new AgentMailAdapter("test-api-key", "inbox-1");
    const messages = await adapter.listInbound(10);

    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Thanks, I'd love to connect!");
    expect(messages[0].threadId).toBe("am-thread-1");
  });

  it("replies to a specific message", async () => {
    mockReply.mockResolvedValue({
      messageId: "am-reply-2",
      threadId: "am-thread-1",
    });

    const adapter = new AgentMailAdapter("test-api-key", "inbox-1");
    const result = await adapter.reply!("am-msg-1", "Great to hear!", "alex");

    expect(result.success).toBe(true);
    expect(mockReply).toHaveBeenCalledWith(
      "inbox-1",
      "am-msg-1",
      { text: expect.stringContaining("Alex\nDitto") },
    );
  });
});
