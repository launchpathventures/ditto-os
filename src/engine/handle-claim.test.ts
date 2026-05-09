import { describe, expect, it } from "vitest";
import {
  normalizeHandle,
  reserveHandle,
  suggestHandle,
  suggestHandleAlternatives,
  validateHandle,
} from "./handle-claim";

describe("handle claim helpers", () => {
  it("normalizes human names into compact handles", () => {
    expect(normalizeHandle("Tim H. Green")).toBe("timhgreen");
    expect(normalizeHandle("Élodie & Co")).toBe("elodieandco");
  });

  it("suggests the first available handle and skips taken values", () => {
    expect(suggestHandle("Tim Green", [])).toBe("timgreen");
    expect(suggestHandle("Tim Green", ["timgreen", "tgreen"])).toBe("greentim");
  });

  it("returns two alternatives for conflicts", () => {
    const alternatives = suggestHandleAlternatives("Tim Green", ["timgreen"], 2);

    expect(alternatives).toHaveLength(2);
    expect(alternatives).not.toContain("timgreen");
  });

  it("rejects reserved, brand, profane, single-letter, and two-letter handles", () => {
    expect(validateHandle("ditto").reason).toBe("reserved");
    expect(validateHandle("ethos").reason).toBe("reserved");
    expect(validateHandle("openai").reason).toBe("reserved");
    expect(validateHandle("a").reason).toBe("too-short");
    expect(validateHandle("ab").reason).toBe("too-short");
    expect(validateHandle("fuckthis").reason).toBe("reserved");
  });

  it("rejects taken handles and returns alternatives from reserveHandle", async () => {
    const result = await reserveHandle("user-1", "timhgreen", ["timhgreen"]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected conflict");
    expect(result.reason).toBe("taken");
    expect(result.conflict).toHaveLength(2);
  });

  it("reserves a normalized handle without touching the database", async () => {
    const result = await reserveHandle("user-1", "Tim H Green", []);

    expect(result).toEqual({
      ok: true,
      handle: "timhgreen",
      userId: "user-1",
    });
  });
});
