import type { NetworkSignalSourceType } from "@ditto/core/db/network";

export type MemberSignalUserSourceType = Exclude<NetworkSignalSourceType, "web_search" | "inference">;

export interface MemberSignalSourceInput {
  type?: MemberSignalUserSourceType | "text" | "url" | null;
  value?: string | null;
  url?: string | null;
  text?: string | null;
  label?: string | null;
  originalFilename?: string | null;
}

export interface NormalizedMemberSignalSource {
  sourceType: NetworkSignalSourceType;
  sourceLabel: string;
  sourceUrl: string | null;
  originalInput: string;
  text: string | null;
  limited: boolean;
  accessNote: string | null;
}

const CONSTRAINED_ACCESS_NOTE =
  "Could not read beyond public bio. Paste text or upload screenshots if you want Ditto to consider more.";

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed;
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function typeFromUrl(url: URL): NetworkSignalSourceType {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostMatches(host, "linkedin.com")) return "linkedin";
  if (hostMatches(host, "x.com") || hostMatches(host, "twitter.com")) return "x";
  if (hostMatches(host, "instagram.com")) return "instagram";
  if (hostMatches(host, "github.com")) return "github";
  if (hostMatches(host, "substack.com")) return "substack";
  if (hostMatches(host, "youtube.com") || hostMatches(host, "youtu.be")) return "youtube";
  return "website";
}

function labelForSource(type: NetworkSignalSourceType, url: URL | null, explicit?: string | null): string {
  const label = cleanText(explicit);
  if (label) return label.slice(0, 120);
  if (type === "pasted_text") return "Pasted text";
  if (type === "upload") return "Uploaded text";
  if (type === "linkedin") return "LinkedIn";
  if (type === "x") return "X";
  if (type === "instagram") return "Instagram";
  if (type === "github") return "GitHub";
  if (type === "substack") return "Substack";
  if (type === "youtube") return "YouTube";
  if (url) return url.hostname.replace(/^www\./, "");
  return "Source";
}

function isLimitedPlatform(type: NetworkSignalSourceType): boolean {
  return type === "linkedin" || type === "x" || type === "instagram";
}

function explicitType(value: MemberSignalSourceInput["type"]): MemberSignalUserSourceType | null {
  if (
    value === "linkedin" ||
    value === "website" ||
    value === "x" ||
    value === "instagram" ||
    value === "github" ||
    value === "substack" ||
    value === "youtube" ||
    value === "portfolio" ||
    value === "other_url" ||
    value === "pasted_text" ||
    value === "upload"
  ) {
    return value;
  }
  return null;
}

export function normalizeMemberSignalSource(input: MemberSignalSourceInput): NormalizedMemberSignalSource {
  const rawValue = cleanText(input.value ?? input.url ?? input.text);
  const text = cleanText(input.text ?? (input.url ? null : input.value));
  const requestedType = explicitType(input.type);
  const parsedUrl = rawValue ? normalizeUrl(rawValue) : null;

  if (parsedUrl) {
    const sourceType = requestedType && requestedType !== "pasted_text" && requestedType !== "upload"
      ? requestedType
      : typeFromUrl(parsedUrl);
    const limited = isLimitedPlatform(sourceType);
    return {
      sourceType,
      sourceLabel: labelForSource(sourceType, parsedUrl, input.label),
      sourceUrl: parsedUrl.toString(),
      originalInput: rawValue,
      text: null,
      limited,
      accessNote: limited ? CONSTRAINED_ACCESS_NOTE : null,
    };
  }

  if (!text) {
    throw new Error("Member Signal source requires a URL or pasted text");
  }

  const sourceType = requestedType === "upload" ? "upload" : "pasted_text";
  return {
    sourceType,
    sourceLabel: labelForSource(sourceType, null, input.label ?? input.originalFilename),
    sourceUrl: null,
    originalInput: text,
    text,
    limited: false,
    accessNote: null,
  };
}

export function normalizeMemberSignalSources(
  inputs: MemberSignalSourceInput[],
): NormalizedMemberSignalSource[] {
  const seen = new Set<string>();
  return inputs.flatMap((input) => {
    const normalized = normalizeMemberSignalSource(input);
    const key = [
      normalized.sourceType,
      normalized.sourceUrl ?? normalized.text?.toLowerCase(),
      normalized.sourceLabel.toLowerCase(),
    ].join(":");
    if (seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

export function memberSignalLimitedAccessNote(sourceType: NetworkSignalSourceType): string | null {
  return isLimitedPlatform(sourceType) ? CONSTRAINED_ACCESS_NOTE : null;
}
