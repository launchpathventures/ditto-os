/**
 * Discovery Source Policy (Brief 283)
 *
 * In-code policy registry for collect/store/invite-use gates. This mirrors
 * Ditto's ADR-029 precedent of encoding platform policy in product code when
 * the rule surface is small and reviewable.
 */

import type { NetworkDbLike } from "./network-kb-storage";
import { writeNetworkAuditEvent } from "./network-audit";

export type DiscoverySourceOperation = "collect" | "store" | "invite-use";

export const discoverySourceClassValues = [
  "ditto-member",
  "user-provided",
  "imported-contact",
  "public-web",
  "member-signal",
  "user-provided-url",
  "public-search-result",
  "public-website",
  "public-professional-post",
  "opportunity-portal",
  "referral-list",
  "linkedin-pointer",
  "linkedin-api",
  "linkedin-scrape",
  "private-dataset",
  "unknown",
] as const;
export type DiscoverySourceClass = (typeof discoverySourceClassValues)[number];

export interface DiscoverySourcePolicy {
  collect: boolean;
  store: boolean;
  inviteUse: boolean;
  notes: string;
}

export interface AssertSourcePolicyInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  actorId?: string | null;
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
  now?: Date;
}

export interface SourcePolicyAllowedResult {
  ok: true;
  sourceClass: DiscoverySourceClass;
  operation: DiscoverySourceOperation;
  policy: DiscoverySourcePolicy;
}

export class SourcePolicyError extends Error {
  readonly sourceClass: DiscoverySourceClass;
  readonly operation: DiscoverySourceOperation;
  readonly policy: DiscoverySourcePolicy;

  constructor(
    sourceClass: DiscoverySourceClass,
    operation: DiscoverySourceOperation,
    policy: DiscoverySourcePolicy,
  ) {
    super(`source_policy_blocked:${sourceClass}:${operation}`);
    this.name = "SourcePolicyError";
    this.sourceClass = sourceClass;
    this.operation = operation;
    this.policy = policy;
  }
}

const SOURCE_CLASS_SET = new Set<string>(discoverySourceClassValues);

export const DISCOVERY_SOURCE_POLICY: Record<
  DiscoverySourceClass,
  DiscoverySourcePolicy
> = {
  "ditto-member": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "First-party Network member data; still subject to privacy scrub/suppression.",
  },
  "user-provided": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "User supplied the contact/source directly for this workflow.",
  },
  "imported-contact": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "Imported by the user; suppression and consent checks still gate outreach.",
  },
  "public-web": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "Public web discovery may produce claim invites after policy/compliance gates.",
  },
  "user-provided-url": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "A user-provided public URL may seed a Discovery Profile when source-backed and compliant.",
  },
  "public-search-result": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "Public search result snippets are usable only when not from a blocked platform class.",
  },
  "public-website": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "Public websites may provide source-backed claims and contact paths.",
  },
  "public-professional-post": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "Public professional posts may inform claims when platform terms allow retrieval.",
  },
  "opportunity-portal": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "Opportunity portals are allowed only when source terms permit public discovery.",
  },
  "referral-list": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "Referral lists require provider permission and still pass suppression/compliance gates.",
  },
  "member-signal": {
    collect: true,
    store: true,
    inviteUse: false,
    notes: "Signal claims inform matching; they are not a standalone invitation source.",
  },
  "linkedin-pointer": {
    collect: true,
    store: true,
    inviteUse: false,
    notes: "User-provided LinkedIn URLs may be stored as pointers, not scraped or used directly for invites.",
  },
  "linkedin-api": {
    collect: true,
    store: true,
    inviteUse: true,
    notes: "Allowed only through approved API access; downstream suppression/compliance still applies.",
  },
  "linkedin-scrape": {
    collect: false,
    store: false,
    inviteUse: false,
    notes: "Scraping LinkedIn is forbidden by the Network source policy.",
  },
  "private-dataset": {
    collect: false,
    store: false,
    inviteUse: false,
    notes: "Unconsented private datasets are forbidden.",
  },
  unknown: {
    collect: false,
    store: false,
    inviteUse: false,
    notes: "Unknown sources fail closed until explicitly classified.",
  },
};

function asPolicyKey(operation: DiscoverySourceOperation): keyof DiscoverySourcePolicy {
  return operation === "invite-use" ? "inviteUse" : operation;
}

export function normalizeDiscoverySourceClass(value: string): DiscoverySourceClass {
  const normalized = value.trim().toLowerCase();
  if (SOURCE_CLASS_SET.has(normalized)) return normalized as DiscoverySourceClass;
  return "unknown";
}

export async function assertSourcePolicy(
  sourceClass: DiscoverySourceClass | string,
  operation: DiscoverySourceOperation,
  input: AssertSourcePolicyInput = {},
): Promise<SourcePolicyAllowedResult> {
  const normalized = normalizeDiscoverySourceClass(sourceClass);
  const policy = DISCOVERY_SOURCE_POLICY[normalized];
  if (policy[asPolicyKey(operation)]) {
    return { ok: true, sourceClass: normalized, operation, policy };
  }

  await writeNetworkAuditEvent({
    db: input.db,
    rootDir: input.rootDir,
    stepRunId: input.stepRunId,
    eventClass: "operator_suppressed",
    subjectType: "source_policy",
    subjectId: input.subjectId ?? `${normalized}:${operation}`,
    actorType: "system",
    actorId: input.actorId ?? null,
    reasonCode: "source_policy_block",
    metadata: {
      sourceClass: normalized,
      operation,
      policy: {
        collect: policy.collect,
        store: policy.store,
        inviteUse: policy.inviteUse,
      },
      notes: policy.notes,
      ...input.metadata,
    },
    now: input.now,
  });

  throw new SourcePolicyError(normalized, operation, policy);
}

export function sourcePolicyAllows(
  sourceClass: DiscoverySourceClass | string,
  operation: DiscoverySourceOperation,
): boolean {
  const normalized = normalizeDiscoverySourceClass(sourceClass);
  return Boolean(DISCOVERY_SOURCE_POLICY[normalized][asPolicyKey(operation)]);
}
