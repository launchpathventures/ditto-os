/**
 * Ditto — YAML Round-Trip Validation (Brief 173)
 *
 * `generate_process` and `edit_process` serialise an LLM-composed
 * `ProcessDefinition` via `YAML.stringify` and then persist the string. A
 * definition tree that passes structural validation can still serialise to
 * YAML that fails parsing — embedded `\0`, characters that force flow-style
 * emission with mismatched quotes, etc. The failure mode was "first
 * heartbeat tick on this process crashes on parse".
 *
 * This helper does the final guard: stringify → parse → deep-equal →
 * re-run loader validators. Returns the YAML string on success or a
 * structured reason on failure so the Self can relay it verbatim.
 *
 * Pure; no DB, no side effects.
 */

import YAML from "yaml";
import type { ProcessDefinition } from "../process-loader";
import {
  validateDependencies,
  validateIntegrationSteps,
  validateStepTools,
  validateModelHints,
} from "../process-loader";

export type RoundTripResult =
  | { ok: true; yaml: string }
  | { ok: false; reason: string; path?: string };

export function roundTripValidate(
  definition: ProcessDefinition | Record<string, unknown>,
): RoundTripResult {
  // Reject NUL bytes up-front — some YAML emitters escape them to `\0`
  // sequences that the parser reads back as empty, which makes round-trip
  // appear OK but storage ambiguous. Explicit is better than silent.
  const nulPath = findNulByte(definition);
  if (nulPath !== null) {
    return {
      ok: false,
      reason: "Definition contains a NUL (\\0) byte. Remove it from the step/field that produced this definition.",
      path: nulPath || undefined,
    };
  }

  let yaml: string;
  try {
    yaml = YAML.stringify(definition);
  } catch (err) {
    return {
      ok: false,
      reason: `YAML.stringify failed: ${(err as Error).message}`,
    };
  }

  let reparsed: unknown;
  try {
    reparsed = YAML.parse(yaml);
  } catch (err) {
    return {
      ok: false,
      reason: `Serialised YAML did not parse cleanly: ${(err as Error).message}`,
    };
  }

  // Deep-equal check between original tree and reparsed tree. Falsies/undefined
  // normalise to absent keys in YAML, so we compare JSON canonical forms.
  const a = canonicalJson(definition);
  const b = canonicalJson(reparsed);
  if (a !== b) {
    const firstDiff = diffPath(definition, reparsed);
    return {
      ok: false,
      reason:
        "Serialised YAML round-trip lost information — the parsed tree does not equal the original. This usually means a non-serialisable value (Date, Function, Map, etc.) or non-JSON-safe content in a field.",
      path: firstDiff ?? undefined,
    };
  }

  // Re-run loader validators on the reparsed value, in case the loader is
  // stricter than the object-tree validators the caller already ran.
  const asDef = reparsed as ProcessDefinition;
  const errors = [
    ...validateDependencies(asDef),
    ...validateIntegrationSteps(asDef),
    ...validateStepTools(asDef),
    ...validateModelHints(asDef),
  ];
  if (errors.length > 0) {
    return {
      ok: false,
      reason: `Re-validated definition failed loader checks:\n${errors.join("\n")}`,
    };
  }

  return { ok: true, yaml };
}

/** Walk the tree and return the dot-path to the first NUL-containing string, or null. */
function findNulByte(value: unknown, prefix = ""): string | null {
  if (typeof value === "string") {
    return value.includes("\0") ? prefix || "(root)" : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const p = findNulByte(value[i], `${prefix}[${i}]`);
      if (p !== null) return p;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = findNulByte(v, prefix ? `${prefix}.${k}` : k);
      if (p !== null) return p;
    }
  }
  return null;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, sortKeys);
}

function sortKeys(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/** Return a dot-path to the first divergence between two JSON-ish values. */
function diffPath(a: unknown, b: unknown, prefix = ""): string | null {
  if (a === b) return null;
  if (
    a === null ||
    b === null ||
    typeof a !== typeof b ||
    (typeof a !== "object" && a !== b)
  ) {
    return prefix || "(root)";
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = diffPath(a[i], b[i], `${prefix}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const keys = new Set([
    ...Object.keys(a as Record<string, unknown>),
    ...Object.keys(b as Record<string, unknown>),
  ]);
  for (const k of keys) {
    const d = diffPath(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      prefix ? `${prefix}.${k}` : k,
    );
    if (d) return d;
  }
  return null;
}
