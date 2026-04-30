/**
 * Brief 227 — pure scope-classification logic.
 *
 * Extracted from `memory-scope-pill.tsx` so vitest (which runs at repo root
 * without a JSX transform) can import the classifier directly.
 */

export type ScopePillSource = {
  memoryType?: string;
  memoryScopeType?: "process" | "self";
  memoryProjectId?: string | null;
  memoryProjectSlug?: string | null;
  memoryAppliedProjectIds?: string[] | null;
};

const PERSONAL_TYPES = new Set(["user_model", "preference"]);

export type ScopePillVariant =
  | { kind: "project"; label: string }
  | { kind: "all" }
  | { kind: "personal" }
  | { kind: "multi"; count: number };

export function classifyScope(source: ScopePillSource): ScopePillVariant | null {
  if (!source.memoryScopeType) return null;

  if (source.memoryScopeType === "process") {
    return {
      kind: "project",
      label: source.memoryProjectSlug ?? "this project",
    };
  }

  // self-scope
  const applied = source.memoryAppliedProjectIds;
  if (Array.isArray(applied) && applied.length > 0) {
    return { kind: "multi", count: applied.length };
  }

  // appliedProjectIds is null/empty → applies everywhere
  if (source.memoryType && PERSONAL_TYPES.has(source.memoryType)) {
    return { kind: "personal" };
  }

  return { kind: "all" };
}
