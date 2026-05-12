import reservedHandles from "./reserved-handles.json";

export interface HandleValidationResult {
  ok: boolean;
  normalized: string;
  reason?: "empty" | "too-short" | "invalid-format" | "reserved" | "taken";
}

export type ReserveHandleResult = {
  ok: true;
  handle: string;
  userId: string;
} | {
  ok: false;
  conflict: string[];
  reason: Exclude<HandleValidationResult["reason"], undefined>;
};

const RESERVED = new Set([
  ...reservedHandles.reserved,
  ...reservedHandles.profanity,
  ...reservedHandles.impersonation,
].map((handle) => handle.toLowerCase()));
const PROFANITY = reservedHandles.profanity.map((handle) => handle.toLowerCase());

export function normalizeHandle(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
}

function existingSet(existingHandles: Iterable<string>): Set<string> {
  return new Set(
    Array.from(existingHandles, (handle) => normalizeHandle(handle)).filter(Boolean),
  );
}

export function validateHandle(
  handle: string,
  existingHandles: Iterable<string> = [],
): HandleValidationResult {
  const normalized = normalizeHandle(handle);
  if (!normalized) return { ok: false, normalized, reason: "empty" };
  if (normalized.length < 3) return { ok: false, normalized, reason: "too-short" };
  if (!/^[a-z0-9][a-z0-9]{2,31}$/.test(normalized)) {
    return { ok: false, normalized, reason: "invalid-format" };
  }
  if (RESERVED.has(normalized) || PROFANITY.some((term) => normalized.includes(term))) {
    return { ok: false, normalized, reason: "reserved" };
  }
  if (existingSet(existingHandles).has(normalized)) {
    return { ok: false, normalized, reason: "taken" };
  }
  return { ok: true, normalized };
}

function candidatePool(name: string): string[] {
  const compact = normalizeHandle(name);
  const parts = name
    .split(/\s+/)
    .map((part) => normalizeHandle(part))
    .filter(Boolean);
  const first = parts[0] ?? compact;
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const initial = first.slice(0, 1);

  return Array.from(new Set([
    compact,
    first && last ? `${first}${last}` : "",
    initial && last ? `${initial}${last}` : "",
    last && first ? `${last}${first}` : "",
    compact ? `${compact}works` : "",
    compact ? `${compact}hq` : "",
    compact ? `${compact}01` : "",
  ].filter(Boolean)));
}

export function suggestHandle(name: string, existingHandles: Iterable<string> = []): string {
  const taken = existingSet(existingHandles);
  for (const candidate of candidatePool(name)) {
    const validation = validateHandle(candidate, taken);
    if (validation.ok) return validation.normalized;
  }

  const base = normalizeHandle(name) || "expert";
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}${i}`;
    const validation = validateHandle(candidate, taken);
    if (validation.ok) return validation.normalized;
  }

  return `expert${Date.now().toString(36).slice(-6)}`;
}

export function suggestHandleAlternatives(
  name: string,
  existingHandles: Iterable<string> = [],
  count = 2,
): string[] {
  const taken = existingSet(existingHandles);
  const suggestions: string[] = [];
  const base = normalizeHandle(name) || "expert";
  for (const candidate of [...candidatePool(name), ...Array.from({ length: 50 }, (_, i) => `${base}${i + 2}`)]) {
    const validation = validateHandle(candidate, new Set([...taken, ...suggestions]));
    if (validation.ok) suggestions.push(validation.normalized);
    if (suggestions.length >= count) break;
  }
  return suggestions;
}

export async function reserveHandle(
  userId: string,
  handle: string,
  existingHandles: Iterable<string> = [],
): Promise<ReserveHandleResult> {
  const validation = validateHandle(handle, existingHandles);
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason ?? "invalid-format",
      conflict: suggestHandleAlternatives(validation.normalized || userId, existingHandles, 2),
    };
  }
  return {
    ok: true,
    handle: validation.normalized,
    userId,
  };
}
