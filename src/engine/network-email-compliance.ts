/**
 * Network Email Compliance (Brief 283)
 *
 * Pure pre-send classifier for claim-invite and intro email preparation.
 * It does not send email; send tools consume the returned header/footer map.
 */

import { createHash } from "crypto";
import type { NetworkDbLike } from "./network-kb-storage";
import {
  isSuppressed,
  type NetworkSuppressionScope,
} from "./network-suppression";
import { writeNetworkAuditEvent } from "./network-audit";

export type NetworkEmailKind = "claim-invite" | "intro";
export type EmailComplianceBlockedReason =
  | "sender-identity"
  | "suppression"
  | "suppression-store-unavailable"
  | "misleading-subject";

export interface NetworkEmailComplianceConfig {
  defaultFrom: string;
  defaultReplyTo: string;
  allowedMailboxes: string[];
  unsubscribeMailto: string;
  unsubscribeUrl: string;
  canSpamFooterEnabled: boolean;
  physicalAddress: string;
}

export interface ClassifyAndPrepareEmailInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  kind: NetworkEmailKind;
  to: string;
  subject: string;
  body: string;
  scope?: NetworkSuppressionScope;
  scopeUserId?: string | null;
  fromOverride?: string | null;
  replyToOverride?: string | null;
  config?: Partial<NetworkEmailComplianceConfig>;
  now?: Date;
  suppressionCheck?: typeof isSuppressed;
}

export type ClassifyAndPrepareEmailResult =
  | {
      ok: true;
      kind: NetworkEmailKind;
      to: string;
      subject: string;
      body: string;
      footer: string | null;
      headers: Record<string, string>;
    }
  | {
      ok: false;
      kind: NetworkEmailKind;
      blockedReason: EmailComplianceBlockedReason;
      footer: string | null;
      headers: Record<string, string>;
    };

const IMPERSONATION_PATTERNS = [
  /\bacting as\b/i,
  /\bon behalf of your\b/i,
  /\byour assistant\b/i,
];
const FAKE_THREAD_PATTERNS = [
  /^\s*(re|fwd):\s*(case|ticket|thread|ref)\s*#?\d+/i,
  /^\s*\[(case|ticket|thread|ref)[\s:-]*\d+\]/i,
];
const DECEPTIVE_URGENCY_PATTERNS = [
  /\burgent action required\b/i,
  /\bfinal notice\b/i,
  /\bsecurity alert\b/i,
];

function normalizeEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

function configuredMailboxes(config?: Partial<NetworkEmailComplianceConfig>) {
  const defaultFrom =
    config?.defaultFrom ??
    process.env.DITTO_NETWORK_EMAIL_FROM ??
    process.env.AGENTMAIL_NETWORK_FROM ??
    "network@ditto.partners";
  const defaultReplyTo =
    config?.defaultReplyTo ??
    process.env.DITTO_NETWORK_EMAIL_REPLY_TO ??
    process.env.AGENTMAIL_NETWORK_REPLY_TO ??
    defaultFrom;
  const envAllowed = (process.env.DITTO_NETWORK_MAILBOXES ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
  const allowed = new Set([
    normalizeEmail(defaultFrom),
    normalizeEmail(defaultReplyTo),
    ...envAllowed,
    ...(config?.allowedMailboxes ?? []).map(normalizeEmail),
  ]);
  return { defaultFrom, defaultReplyTo, allowedMailboxes: [...allowed] };
}

function resolveConfig(
  config?: Partial<NetworkEmailComplianceConfig>,
): NetworkEmailComplianceConfig {
  const mailboxes = configuredMailboxes(config);
  const unsubscribeMailto =
    config?.unsubscribeMailto ??
    process.env.DITTO_NETWORK_UNSUBSCRIBE_MAILTO ??
    `mailto:${mailboxes.defaultReplyTo}?subject=unsubscribe`;
  return {
    ...mailboxes,
    unsubscribeMailto,
    unsubscribeUrl:
      config?.unsubscribeUrl ??
      process.env.DITTO_NETWORK_UNSUBSCRIBE_URL ??
      "https://ditto.partners/api/v1/network/unsubscribe",
    canSpamFooterEnabled:
      config?.canSpamFooterEnabled ??
      process.env.DITTO_CAN_SPAM_FOOTER_ENABLED !== "false",
    physicalAddress:
      config?.physicalAddress ??
      process.env.DITTO_NETWORK_PHYSICAL_ADDRESS ??
      "Launch Path Ventures, 2261 Market Street #4814, San Francisco, CA 94114",
  };
}

function hasMisleadingSubject(subject: string): boolean {
  return [
    ...IMPERSONATION_PATTERNS,
    ...FAKE_THREAD_PATTERNS,
    ...DECEPTIVE_URGENCY_PATTERNS,
  ].some((pattern) => pattern.test(subject));
}

function recipientHash(to: string): string {
  return createHash("sha256")
    .update(`network-email-compliance:v1:${normalizeEmail(to)}`)
    .digest("hex");
}

function validateMailbox(
  value: string,
  allowed: string[],
): string | null {
  const normalized = normalizeEmail(value);
  return allowed.includes(normalized) ? value.trim() : null;
}

function buildFooter(config: NetworkEmailComplianceConfig): string | null {
  if (!config.canSpamFooterEnabled) return null;
  return [
    "",
    "---",
    `You can unsubscribe with one click: ${config.unsubscribeUrl}`,
    config.physicalAddress,
  ].join("\n");
}

function buildHeaders(
  input: ClassifyAndPrepareEmailInput,
  config: NetworkEmailComplianceConfig,
  from: string,
  replyTo: string,
): Record<string, string> {
  const url = new URL(config.unsubscribeUrl, "https://ditto.partners");
  url.searchParams.set("kind", input.kind);
  url.searchParams.set("recipient_hash", recipientHash(input.to));
  return {
    From: from,
    "Reply-To": replyTo,
    "List-Unsubscribe": `<${config.unsubscribeMailto}>, <${url.toString()}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function auditSuppressionRefusal(
  input: ClassifyAndPrepareEmailInput,
): Promise<void> {
  await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "operator_suppressed",
    subjectType: "outbound_email",
    subjectId: recipientHash(input.to),
    actorType: "system",
    reasonCode: "suppression",
    metadata: {
      kind: input.kind,
      scope: input.scope ?? "global",
      scopeUserId: input.scopeUserId ?? null,
    },
    now: input.now,
  });
}

export async function classifyAndPrepare(
  input: ClassifyAndPrepareEmailInput,
): Promise<ClassifyAndPrepareEmailResult> {
  const config = resolveConfig(input.config);
  const footer = buildFooter(config);
  const from = input.fromOverride
    ? validateMailbox(input.fromOverride, config.allowedMailboxes)
    : config.defaultFrom;
  const replyTo = input.replyToOverride
    ? validateMailbox(input.replyToOverride, config.allowedMailboxes)
    : config.defaultReplyTo;
  const headers = buildHeaders(
    input,
    config,
    from ?? config.defaultFrom,
    replyTo ?? config.defaultReplyTo,
  );

  if (!from || !replyTo) {
    return {
      ok: false,
      kind: input.kind,
      blockedReason: "sender-identity",
      footer,
      headers,
    };
  }

  if (hasMisleadingSubject(input.subject)) {
    return {
      ok: false,
      kind: input.kind,
      blockedReason: "misleading-subject",
      footer,
      headers,
    };
  }

  const check = input.suppressionCheck ?? isSuppressed;
  let suppressed: boolean;
  try {
    suppressed = await check(input.to, {
      db: input.db,
      scope: input.scope ?? "global",
      scopeUserId: input.scopeUserId ?? null,
      now: input.now,
      failClosed: false,
    });
  } catch {
    return {
      ok: false,
      kind: input.kind,
      blockedReason: "suppression-store-unavailable",
      footer,
      headers,
    };
  }
  if (suppressed) {
    await auditSuppressionRefusal(input);
    return {
      ok: false,
      kind: input.kind,
      blockedReason: "suppression",
      footer,
      headers,
    };
  }

  return {
    ok: true,
    kind: input.kind,
    to: input.to,
    subject: input.subject,
    body: footer ? `${input.body.trimEnd()}\n${footer}` : input.body,
    footer,
    headers,
  };
}
