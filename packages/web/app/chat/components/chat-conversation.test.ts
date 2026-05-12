import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("ChatConversation authorization block handling", () => {
  it("reconciles returned authorization blocks by authorizationId", () => {
    const source = readFileSync(join(__dirname, "chat-conversation.tsx"), "utf8");
    expect(source).toContain("function replaceAuthorizationBlock");
    expect(source).toContain("authorizationBlockId(block)");
    expect(source).toContain("messagesRef.current");
    expect(source).toContain("updateMessages((prev) => replaceAuthorizationBlock(prev, block))");
  });
});
