import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Confirmation } from "@/components/ai-elements/confirmation";
import type { AuthorizationRequestBlock } from "@/lib/engine";
import { AuthorizationRequestBlockComponent } from "./authorization-request-block";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function baseBlock(overrides: Partial<AuthorizationRequestBlock> = {}): AuthorizationRequestBlock {
  return {
    type: "authorization-request",
    state: "pending",
    header: "Want me to send this to ops@example.com?",
    preview: [{ type: "text", text: "Subject: Pricing sweep\n\nThree SKUs need attention." }],
    recipientLabel: "ops@example.com",
    actionClass: "email-send",
    executionResult: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    authorizationId: "auth-1",
    toolName: "gmail-authorized-send",
    toolInput: {
      to: ["ops@example.com"],
      subject: "Pricing sweep",
      body: "Three SKUs need attention.",
    },
    ...overrides,
  };
}

function render(block: AuthorizationRequestBlock): string {
  return renderToStaticMarkup(
    React.createElement(AuthorizationRequestBlockComponent, { block }),
  );
}

describe("AuthorizationRequestBlockComponent", () => {
  it("renders pending trio affordances", () => {
    const html = render(baseBlock());
    expect(html).toContain("Want me to send this to ops@example.com?");
    expect(html).toContain("Send it");
    expect(html).toContain("Edit first");
    expect(html).toContain("Not yet");
  });

  it("renders costLabel when present and hides it for legacy blocks", () => {
    const html = render(baseBlock({ costLabel: "1st of 2 free intros (1 left after this)" }));
    expect(html).toContain("1st of 2 free intros (1 left after this)");
    expect(render(baseBlock({ costLabel: null }))).not.toContain("free intros");
  });

  it("renders executing state", () => {
    const html = render(baseBlock({ state: "executing", expiresAt: null }));
    expect(html).toContain("Sending...");
    expect(html).not.toContain("Send it");
  });

  it("renders succeeded state", () => {
    const html = render(baseBlock({
      state: "succeeded",
      expiresAt: null,
      executionResult: {
        status: "sent",
        messageId: "msg-1",
        sentAt: "2026-05-05T07:43:00.000Z",
        recipients: ["ops@example.com"],
      },
    }));
    expect(html).toContain("Sent to ops@example.com");
  });

  it("renders failed state with visitor reason and retry affordances", () => {
    const html = render(baseBlock({
      state: "failed",
      expiresAt: null,
      executionResult: {
        status: "failed",
        reasonForVisitor: "Gmail asked me to reconnect.",
        reasonForLog: "oauth_error_raw",
      },
    }));
    expect(html).toContain("Gmail asked me to reconnect.");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Tell me more");
    expect(html).not.toContain("oauth_error_raw");
  });

  it("renders rejected state", () => {
    const html = render(baseBlock({ state: "rejected", expiresAt: null }));
    expect(html).toContain("Got it - paused this.");
    expect(html).not.toContain("Send it");
  });

  it("renders edit-requested state with actions hidden", () => {
    const html = render(baseBlock({ state: "edit-requested", expiresAt: null }));
    expect(html).toContain("Draft held. Tell me what to change.");
    expect(html).not.toContain("Send it");
  });

  it("renders partial state with retry-failed affordance", () => {
    const html = render(baseBlock({
      state: "partial",
      expiresAt: null,
      actionClass: "multi-recipient-send",
      executionResult: {
        status: "partial",
        partial: [
          { id: "a", recipient: "a@example.com", status: "sent" },
          { id: "b", recipient: "b@example.com", status: "failed", reasonForVisitor: "Bounced" },
        ],
      },
    }));
    expect(html).toContain("Sent 1 of 2.");
    expect(html).toContain("a@example.com");
    expect(html).not.toContain("Retry failed");
  });

  it("renders expired state with disabled actions", () => {
    const html = render(baseBlock({ state: "expired", expiresAt: null }));
    expect(html).toContain("This paused while you were away.");
    expect(html).toContain("disabled");
  });

  it("uses a local expiresAt timer that also notifies the server", () => {
    const source = readFileSync(join(__dirname, "authorization-request-block.tsx"), "utf8");
    expect(source).toContain("window.setTimeout");
    expect(source).toContain('setLocalState("expired")');
    expect(source).toContain('onAction?.("authorization-request:expired"');
    const timerBody = source.slice(source.indexOf("window.setTimeout"), source.indexOf("return () => window.clearTimeout"));
    expect(timerBody).not.toContain("send-it");
  });

  it("does not echo private tool wiring back to the server from the browser", () => {
    const source = readFileSync(join(__dirname, "authorization-request-block.tsx"), "utf8");
    expect(source).not.toContain("toolName: block.toolName");
    expect(source).not.toContain("toolInput: block.toolInput");
    expect(source).toContain("request: block.request ?? null");
    expect(source).toContain("draft: block.draft ?? null");
    expect(source).toContain("requesterId: block.requesterId ?? null");
    expect(source).toContain("costLabel: block.costLabel ?? null");
  });

  it("keeps the legacy Confirmation two-button callsite intact", () => {
    const html = renderToStaticMarkup(
      React.createElement(Confirmation, {
        toolCallId: "tool-1",
        toolName: "knowledge_search",
        onApprove: () => undefined,
        onReject: () => undefined,
      }),
    );
    expect(html).toContain("Go ahead");
    expect(html).toContain("Hold on");
    expect(html).not.toContain("Edit first");
  });
});
