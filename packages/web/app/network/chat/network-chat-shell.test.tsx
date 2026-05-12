import { describe, expect, it } from "vitest";
import { clientEditAnswerKey, clientPreviewProgress } from "./network-chat-shell";

describe("clientPreviewProgress", () => {
  it("keeps the local Q6-complete preview at the pre-match opacity step", () => {
    expect(clientPreviewProgress(0)).toBe(1);
    expect(clientPreviewProgress(4)).toBe(5);
    expect(clientPreviewProgress(5)).toBe(6);
    expect(clientPreviewProgress(6)).toBe(6);
  });

  it("advances the client preview to the match-return opacity step after matching", () => {
    expect(clientPreviewProgress(6, true)).toBe(7);
  });

  it("maps mobile edit chips back to client intake answer keys", () => {
    expect(clientEditAnswerKey("outcome")).toBe("jtbd");
    expect(clientEditAnswerKey("reference")).toBe("referenceShape");
    expect(clientEditAnswerKey("bad fit")).toBe("antiPersonaMd");
    expect(clientEditAnswerKey("success criteria")).toBe("successCriteria");
    expect(clientEditAnswerKey("budget")).toBe("budgetShape");
    expect(clientEditAnswerKey("scout preference")).toBe("scoutOptIn");
  });
});
