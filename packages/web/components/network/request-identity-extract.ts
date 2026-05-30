import type { RequestIdentity } from "./request-identity-card";

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/i;
const SITE_PATTERN = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\/[\w\-./]*)?)\b/i;

const NAME_INTRO_PATTERNS: RegExp[] = [
  /\b[Ii]['’]?m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
  /\b[Mm]y name is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
  /\b[Tt]his is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
];

const COMMA_NAME_PATTERN = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*,/;

export interface IdentityExtractionResult {
  identity: RequestIdentity;
  changed: Array<keyof RequestIdentity>;
}

export function extractIdentityFromMessage(
  message: string,
  current: RequestIdentity,
  options: { inIdentityStep: boolean } = { inIdentityStep: false },
): IdentityExtractionResult {
  const next = { ...current };
  const changed: Array<keyof RequestIdentity> = [];

  const emailMatch = message.match(EMAIL_PATTERN)?.[0];
  const hasEmail = Boolean(emailMatch);

  // Only run identity extraction when the user is on the identity step OR they
  // included clear identity markers (email, or "I'm X" / "my name is X").
  const hasIntroPattern = NAME_INTRO_PATTERNS.some((pattern) => pattern.test(message));
  const eligible = options.inIdentityStep || hasEmail || hasIntroPattern;
  if (!eligible) {
    return { identity: next, changed };
  }

  if (!current.email.trim() && emailMatch) {
    next.email = emailMatch;
    changed.push("email");
  }

  if (!current.orgSite.trim()) {
    const messageWithoutEmail = message.replace(EMAIL_PATTERN, " ");
    const site = messageWithoutEmail.match(SITE_PATTERN)?.[1];
    if (site && !site.toLowerCase().includes("ditto")) {
      next.orgSite = site;
      changed.push("orgSite");
    }
  }

  if (!current.name.trim()) {
    let extractedName: string | null = null;
    for (const pattern of NAME_INTRO_PATTERNS) {
      const match = message.match(pattern);
      if (match?.[1]) {
        extractedName = match[1].trim();
        break;
      }
    }
    // The bare "Alex Rivers, ..." pattern only fires when we're confident
    // (identity step active or email also present).
    if (!extractedName && (options.inIdentityStep || hasEmail)) {
      const commaMatch = message.match(COMMA_NAME_PATTERN);
      if (commaMatch?.[1]) extractedName = commaMatch[1].trim();
    }
    if (extractedName) {
      next.name = extractedName;
      changed.push("name");
    }
  }

  if (!current.credibility.trim()) {
    const credibilityMatch = message.match(
      /\b(?:i['’]m\s+(?:a|the)|founder|gtm|ceo|cto|cmo|head of|director of|operator|raising|building)[^.\n]*/i,
    );
    if (credibilityMatch?.[0]) {
      const phrase = credibilityMatch[0].trim();
      if (phrase.length >= 6 && phrase.length <= 200) {
        next.credibility = phrase;
        changed.push("credibility");
      }
    }
  }

  return { identity: next, changed };
}
