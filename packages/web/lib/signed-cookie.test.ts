import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REF_TOKEN_TTL_MS,
  handleFromDittoYouHost,
  signRefToken,
  signValue,
  verifyRefToken,
  verifyRefTokenForHost,
  verifyValue,
} from "./signed-cookie";

const ORIGINAL_SESSION_SECRET = process.env.SESSION_SECRET;
const ORIGINAL_NETWORK_AUTH_SECRET = process.env.NETWORK_AUTH_SECRET;

beforeEach(() => {
  process.env.SESSION_SECRET = "test-session-secret";
  delete process.env.NETWORK_AUTH_SECRET;
});

afterEach(() => {
  if (ORIGINAL_SESSION_SECRET === undefined) {
    delete process.env.SESSION_SECRET;
  } else {
    process.env.SESSION_SECRET = ORIGINAL_SESSION_SECRET;
  }
  if (ORIGINAL_NETWORK_AUTH_SECRET === undefined) {
    delete process.env.NETWORK_AUTH_SECRET;
  } else {
    process.env.NETWORK_AUTH_SECRET = ORIGINAL_NETWORK_AUTH_SECRET;
  }
});

describe("signed-cookie helper", () => {
  it("round-trips signed values", async () => {
    const signed = await signValue("linkedin");
    await expect(verifyValue(signed)).resolves.toBe("linkedin");
  });

  it("rejects tampered values", async () => {
    const signed = await signValue("linkedin");
    const tampered = signed.replace("linkedin", "x");
    await expect(verifyValue(tampered)).resolves.toBeNull();
  });

  it("rejects values signed with another secret", async () => {
    const signed = await signValue("linkedin");
    process.env.SESSION_SECRET = "different-secret";
    await expect(verifyValue(signed)).resolves.toBeNull();
  });

  it("signs and verifies referral tokens", async () => {
    const ts = Date.parse("2026-05-19T00:00:00.000Z");
    const token = await signRefToken({ channel: "linkedin", ph: "timhgreen", ts });
    await expect(verifyRefToken(token, { now: ts + 1_000 })).resolves.toEqual({
      channel: "linkedin",
      ph: "timhgreen",
      ts,
    });
  });

  it("rejects expired and malformed referral tokens without throwing", async () => {
    const ts = Date.parse("2026-05-19T00:00:00.000Z");
    const token = await signRefToken({ channel: "linkedin", ph: "timhgreen", ts });
    await expect(verifyRefToken(token, { now: ts + REF_TOKEN_TTL_MS + 1 })).resolves.toBeNull();
    await expect(verifyRefToken("not-a-token")).resolves.toBeNull();
    await expect(verifyRefToken(`${token}extra`, { now: ts + 1_000 })).resolves.toBeNull();
  });

  it("binds referral tokens to the ditto.you handle host", async () => {
    const ts = Date.parse("2026-05-19T00:00:00.000Z");
    const token = await signRefToken({ channel: "linkedin", ph: "timhgreen", ts });
    expect(handleFromDittoYouHost("timhgreen.ditto.you")).toBe("timhgreen");
    await expect(
      verifyRefTokenForHost(token, "timhgreen.ditto.you", { now: ts + 1_000 }),
    ).resolves.toMatchObject({ ph: "timhgreen" });
    await expect(
      verifyRefTokenForHost(token, "other.ditto.you", { now: ts + 1_000 }),
    ).resolves.toBeNull();
    await expect(
      verifyRefTokenForHost(token, "localhost:3000", { now: ts + 1_000 }),
    ).resolves.toBeNull();
  });
});
