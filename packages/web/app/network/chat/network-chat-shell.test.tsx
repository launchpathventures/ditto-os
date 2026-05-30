import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clientEditAnswerKey, clientPreviewProgress } from "./network-chat-shell";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  it("fires the expert workspace upsell from the Q6 completion save seam", () => {
    const source = readFileSync(join(__dirname, "network-chat-shell.tsx"), "utf8");
    expect(source).toContain("if (expertStep === 5)");
    expect(source).toContain("const completedCard = buildNetworkProfileCard");
    expect(source).toContain("persistCard({ visible, triggerUpsell: true, card: completedCard })");
    expect(source).toContain('context={currentMode === "client" ? "client" : "expert"}');
  });
});
