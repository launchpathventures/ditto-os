/**
 * Brief 227 — `classifyScope` pill-variant logic tests.
 *
 * Note: full React rendering tests (per AC #7 / brief §What Changes) require
 * @testing-library/react + jsdom which are not yet installed in
 * packages/web. Those rendering tests are flagged as a follow-on gap; the
 * pure-logic classifier is exhaustively covered here.
 */

import { describe, it, expect } from "vitest";
import { classifyScope } from "./memory-scope";

describe("classifyScope", () => {
  it("returns null when memoryScopeType is absent", () => {
    expect(classifyScope({})).toBeNull();
  });

  it("returns project pill for process-scope memories with a slug", () => {
    const variant = classifyScope({
      memoryScopeType: "process",
      memoryProjectSlug: "agent-crm",
    });
    expect(variant).toEqual({ kind: "project", label: "agent-crm" });
  });

  it("falls back to placeholder label when slug is missing", () => {
    const variant = classifyScope({ memoryScopeType: "process" });
    expect(variant).toEqual({ kind: "project", label: "this project" });
  });

  it("returns 'all' pill for self-scope with null appliedProjectIds (non-personal type)", () => {
    const variant = classifyScope({
      memoryScopeType: "self",
      memoryAppliedProjectIds: null,
      memoryType: "correction",
    });
    expect(variant).toEqual({ kind: "all" });
  });

  it("returns 'personal' pill for self-scope user_model memories", () => {
    const variant = classifyScope({
      memoryScopeType: "self",
      memoryAppliedProjectIds: null,
      memoryType: "user_model",
    });
    expect(variant).toEqual({ kind: "personal" });
  });

  it("returns 'personal' pill for self-scope preference memories", () => {
    const variant = classifyScope({
      memoryScopeType: "self",
      memoryAppliedProjectIds: null,
      memoryType: "preference",
    });
    expect(variant).toEqual({ kind: "personal" });
  });

  it("returns multi-project pill for self-scope with non-empty appliedProjectIds", () => {
    const variant = classifyScope({
      memoryScopeType: "self",
      memoryAppliedProjectIds: ["p1", "p2", "p3"],
      memoryType: "correction",
    });
    expect(variant).toEqual({ kind: "multi", count: 3 });
  });

  it("returns 'all' for self-scope with empty appliedProjectIds array", () => {
    // Empty array should be treated as null (no restrictions)
    const variant = classifyScope({
      memoryScopeType: "self",
      memoryAppliedProjectIds: [],
      memoryType: "correction",
    });
    expect(variant).toEqual({ kind: "all" });
  });
});
