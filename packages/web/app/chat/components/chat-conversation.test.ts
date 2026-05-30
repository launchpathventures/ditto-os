/**
 * ChatConversation — Brief 280 source-contract guard.
 *
 * Before Brief 280 this surface hand-rolled message-state reconciliation
 * (`replaceAuthorizationBlock` / `authorizationBlockId`) over a manual
 * `/api/v1/network/chat/stream` SSE parse. Brief 280's IA inversion made
 * `/chat` the workspace Self home: it now drives the AI SDK `useChat`
 * transport against `/api/chat`, which owns message reconciliation, and
 * renders processes/reviews/progress as inline ContentBlocks.
 *
 * This test pins the architectural seams that brief reviewers must not
 * see regress. It deliberately does NOT grep for the forbidden strings
 * (`/api/v1/network/chat/stream`, `context: "front-door"`) by raw
 * substring: those legitimately appear in the component's own header
 * comment describing the constraint, so a `not.toContain` check would
 * false-fail. The positive `/api/chat` transport assertion plus the
 * absence of the removed dedup helper capture the same contract safely.
 *
 * Provenance: Brief 280 (Conversational Front Door IA inversion).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "chat-conversation.tsx"), "utf8");

describe("ChatConversation — Brief 280 workspace Self surface", () => {
  it("drives the AI SDK useChat transport (no hand-rolled reconciliation)", () => {
    expect(source).toContain('import { useChat } from "@ai-sdk/react";');
    expect(source).toContain("} = useChat({");
    // The removed Brief-pre-280 hand-rolled dedup helpers are gone — the
    // AI SDK now owns message-state reconciliation.
    expect(source).not.toContain("replaceAuthorizationBlock");
    expect(source).not.toContain("authorizationBlockId");
  });

  it("AC4: talks to the workspace Self stream at /api/chat", () => {
    expect(source).toContain("new DefaultChatTransport({");
    expect(source).toContain('api: "/api/chat",');
  });

  it("renders artifacts inline via the block-aware Message renderer", () => {
    expect(source).toContain(
      'import { Message } from "@/components/ai-elements/message";',
    );
    expect(source).toContain("onAction={handleBlockAction}");
  });

  it("preserves the Brief 157 MP-2.4 harness progress overlay", () => {
    expect(source).toContain("useHarnessEvents");
    expect(source).toContain("ProgressBlockComponent");
  });
});
