/**
 * Scrub module tests (Brief 171).
 *
 * Covers recursive walking, overlap handling, short-secret filtering, and
 * the structural invariants (shape preserved, non-string leaves untouched).
 */

import { describe, it, expect } from "vitest";
import { scrubCredentialsFromValue, secretsFromAuthEnv } from "./scrub";

describe("scrubCredentialsFromValue", () => {
  it("redacts a known secret in a top-level string", () => {
    const out = scrubCredentialsFromValue("token=sk-live-12345", ["sk-live-12345"], "github");
    expect(out).toBe("token=[REDACTED:github]");
  });

  it("redacts inside a nested object", () => {
    const result = {
      data: {
        user: "alex",
        auth: { bearer: "ghp_VERY_SECRET_TOKEN_1234" },
      },
      error: "ghp_VERY_SECRET_TOKEN_1234 is invalid",
    };
    const out = scrubCredentialsFromValue(result, ["ghp_VERY_SECRET_TOKEN_1234"], "github");
    expect(out).toEqual({
      data: {
        user: "alex",
        auth: { bearer: "[REDACTED:github]" },
      },
      error: "[REDACTED:github] is invalid",
    });
  });

  it("redacts inside arrays", () => {
    const result = ["ok", { msg: "tok_SECRET in message" }, "tok_SECRET"];
    const out = scrubCredentialsFromValue(result, ["tok_SECRET"], "svc");
    expect(out).toEqual(["ok", { msg: "[REDACTED:svc] in message" }, "[REDACTED:svc]"]);
  });

  it("ignores short secrets (≤4 chars) to avoid false positives", () => {
    const result = { value: "abc-xyz" };
    const out = scrubCredentialsFromValue(result, ["abc", ""], "svc");
    // neither "abc" (3 chars) nor "" (empty) should trigger redaction
    expect(out).toEqual({ value: "abc-xyz" });
  });

  it("preserves non-string leaf values (numbers, booleans, null)", () => {
    const result = { n: 42, b: true, nil: null, s: "sk_VERY_LONG_TOKEN" };
    const out = scrubCredentialsFromValue(result, ["sk_VERY_LONG_TOKEN"], "svc");
    expect(out).toEqual({ n: 42, b: true, nil: null, s: "[REDACTED:svc]" });
  });

  it("leaves Date instances untouched", () => {
    const d = new Date("2026-01-01");
    const result = { when: d, token: "sk_VERY_LONG_TOKEN" };
    const out = scrubCredentialsFromValue(result, ["sk_VERY_LONG_TOKEN"], "svc");
    expect(out.when).toBe(d);
    expect(out.token).toBe("[REDACTED:svc]");
  });

  it("is a no-op when no active secrets remain after filtering", () => {
    const value = { token: "anything" };
    const out = scrubCredentialsFromValue(value, ["", "xy"], "svc");
    expect(out).toBe(value); // reference equality — no copy
  });

  it("redacts multiple secrets in a single string", () => {
    const out = scrubCredentialsFromValue(
      "A=sk_FIRST_SECRET B=sk_SECOND_SECRET",
      ["sk_FIRST_SECRET", "sk_SECOND_SECRET"],
      "svc",
    );
    expect(out).toBe("A=[REDACTED:svc] B=[REDACTED:svc]");
  });

  it("handles overlapping secrets (longest-first ordering not required)", () => {
    // If one secret is a substring of another, both still get redacted.
    // The order of iteration shouldn't break correctness for this use case
    // since both are known credential values.
    const out = scrubCredentialsFromValue(
      "prefix_long_secret_xyz",
      ["prefix_long_secret_xyz", "long_secret"],
      "svc",
    );
    // First replace kills the whole thing; second pass finds nothing.
    expect(out).toBe("[REDACTED:svc]");
  });

  it("scrubs a large (>1MB) string leaf without throwing", () => {
    const huge = "abc".repeat(400_000) + "sk_LEAK_1234567890" + "xyz".repeat(400_000);
    expect(huge.length).toBeGreaterThan(1 * 1024 * 1024);
    const out = scrubCredentialsFromValue(
      { big: huge },
      ["sk_LEAK_1234567890"],
      "svc",
    );
    expect(out.big).toContain("[REDACTED:svc]");
    expect(out.big).not.toContain("sk_LEAK_1234567890");
  });

  it("preserves primitive passthrough for non-object/array values", () => {
    expect(scrubCredentialsFromValue(42, ["sk_SECRET_LONG"])).toBe(42);
    expect(scrubCredentialsFromValue(null, ["sk_SECRET_LONG"])).toBe(null);
    expect(scrubCredentialsFromValue(undefined, ["sk_SECRET_LONG"])).toBe(undefined);
  });
});

describe("secretsFromAuthEnv", () => {
  it("returns just the values, ignoring names", () => {
    const secrets = secretsFromAuthEnv({
      GH_TOKEN: "ghp_VERY_LONG_TOKEN_12345",
      GH_USER: "alex_user",
    });
    expect(secrets).toContain("ghp_VERY_LONG_TOKEN_12345");
    expect(secrets).toContain("alex_user");
    expect(secrets).not.toContain("GH_TOKEN");
  });

  it("skips empty values", () => {
    const secrets = secretsFromAuthEnv({ A: "sk_real_value", B: "" });
    expect(secrets).toEqual(["sk_real_value"]);
  });

  it("filters out short values below MIN_CREDENTIAL_LENGTH (Brief 179 P0-2)", () => {
    // Harmonised with scrubCredentialsFromValue — if the scrubber won't
    // redact them, the collector shouldn't emit them either.
    const secrets = secretsFromAuthEnv({
      A: "abc", // 3 chars — below threshold
      B: "abcd", // 4 chars — below threshold
      C: "abcde", // 5 chars — at threshold
      D: "long_real_secret",
    });
    expect(secrets).not.toContain("abc");
    expect(secrets).not.toContain("abcd");
    expect(secrets).toContain("abcde");
    expect(secrets).toContain("long_real_secret");
  });
});
