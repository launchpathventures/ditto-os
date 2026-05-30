import type * as networkSchema from "@ditto/core/db/network";
import {
  assertSourcePolicy,
  normalizeDiscoverySourceClass,
  sourcePolicyAllows,
  type DiscoverySourceOperation,
} from "./discovery-source-policy";
import type { NetworkDbLike } from "./network-kb-storage";

export type DiscoveryRegistrySourceClass =
  networkSchema.NetworkDiscoverySourceClass;

export interface DiscoverySourceRegistryEntry {
  sourceClass: DiscoveryRegistrySourceClass;
  sourceLabel: string;
  collectionMethod: string;
  storagePolicy: string;
  rateLimitPolicy: string;
  invitePolicy: string;
  allowedUse: {
    collect: boolean;
    store: boolean;
    inviteUse: boolean;
  };
  blocksProfileClaimSnippets: boolean;
  platformPolicyUrl?: string;
  notes: string;
}

export interface AssertDiscoverySourceRegistryAllowsInput {
  db?: NetworkDbLike;
  rootDir?: string;
  stepRunId?: unknown;
  actorId?: string | null;
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
  now?: Date;
}

const LINKEDIN_HELP_URL =
  "https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions";
const LINKEDIN_OAUTH_URL =
  "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication";

const REGISTRY: Record<DiscoveryRegistrySourceClass, DiscoverySourceRegistryEntry> = {
  "ditto-member": {
    sourceClass: "ditto-member",
    sourceLabel: "Ditto Network member",
    collectionMethod: "first_party_member_data",
    storagePolicy: "network_member_profile_and_reviewed_claims",
    rateLimitPolicy: "member_search_policy",
    invitePolicy: "not_a_claim_invite_source",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "Existing Ditto members can be matched, but they are not discovery claim-invite targets.",
  },
  "user-provided": {
    sourceClass: "user-provided",
    sourceLabel: "User-provided source",
    collectionMethod: "user_provided",
    storagePolicy: "source_url_claims_and_user_text",
    rateLimitPolicy: "per_user_low",
    invitePolicy: "allowed_after_operator_and_compliance",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "The user supplied the source or contact path for this workflow.",
  },
  "imported-contact": {
    sourceClass: "imported-contact",
    sourceLabel: "Imported contact",
    collectionMethod: "user_imported_contact",
    storagePolicy: "contact_reference_and_source_metadata",
    rateLimitPolicy: "per_user_low",
    invitePolicy: "allowed_after_suppression_and_compliance",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "Imported contacts require the same suppression and email-compliance gates as public discovery.",
  },
  "public-web": {
    sourceClass: "public-web",
    sourceLabel: "Public web",
    collectionMethod: "public_web_query",
    storagePolicy: "source_url_title_snippet_and_claims",
    rateLimitPolicy: "network_search_policy",
    invitePolicy: "allowed_after_operator_and_compliance",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "Generic public web source. Prefer a more specific class when known.",
  },
  "member-signal": {
    sourceClass: "member-signal",
    sourceLabel: "Member Signal",
    collectionMethod: "first_party_member_reviewed_signal",
    storagePolicy: "reviewed_claim_reference_only",
    rateLimitPolicy: "member_signal_policy",
    invitePolicy: "not_a_standalone_invitation_source",
    allowedUse: { collect: true, store: true, inviteUse: false },
    blocksProfileClaimSnippets: false,
    notes: "Member Signal claims can inform matching, not direct outbound claim invites.",
  },
  "user-provided-url": {
    sourceClass: "user-provided-url",
    sourceLabel: "User-provided URL",
    collectionMethod: "user_provided_url",
    storagePolicy: "source_url_claims_and_user_text",
    rateLimitPolicy: "per_user_low",
    invitePolicy: "allowed_if_contact_path_and_compliance_pass",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "A public URL provided by the user can seed a Discovery Profile.",
  },
  "public-search-result": {
    sourceClass: "public-search-result",
    sourceLabel: "Public search result",
    collectionMethod: "public_search_result",
    storagePolicy: "result_url_title_snippet_and_claims",
    rateLimitPolicy: "network_search_policy",
    invitePolicy: "allowed_unless_platform_subclass_blocks",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "Search snippets are allowed only for sources whose platform terms permit collection.",
  },
  "public-website": {
    sourceClass: "public-website",
    sourceLabel: "Public website",
    collectionMethod: "public_website_fetch_or_search_result",
    storagePolicy: "page_url_snippet_and_source_backed_claims",
    rateLimitPolicy: "network_search_policy",
    invitePolicy: "allowed_after_operator_and_compliance",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "Owned company, portfolio, blog, or personal websites can back Discovery Profile claims.",
  },
  "public-professional-post": {
    sourceClass: "public-professional-post",
    sourceLabel: "Public professional post",
    collectionMethod: "public_post_search_result",
    storagePolicy: "post_url_snippet_and_claims",
    rateLimitPolicy: "network_search_policy",
    invitePolicy: "allowed_after_operator_and_compliance",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "Use only when the source platform permits public indexing and reuse.",
  },
  "opportunity-portal": {
    sourceClass: "opportunity-portal",
    sourceLabel: "Opportunity portal",
    collectionMethod: "registered_public_portal",
    storagePolicy: "portal_listing_reference_and_claims",
    rateLimitPolicy: "portal_specific_low",
    invitePolicy: "allowed_after_operator_and_compliance",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "Allowed for portals whose public listings permit referral or contact.",
  },
  "referral-list": {
    sourceClass: "referral-list",
    sourceLabel: "Referral list",
    collectionMethod: "permissioned_referral_list",
    storagePolicy: "referral_source_metadata_and_claims",
    rateLimitPolicy: "per_referral_provider_low",
    invitePolicy: "allowed_after_operator_and_compliance",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    notes: "The referral provider must have permission to share the list for discovery.",
  },
  "linkedin-pointer": {
    sourceClass: "linkedin-pointer",
    sourceLabel: "LinkedIn pointer",
    collectionMethod: "user_provided_or_search_pointer_only",
    storagePolicy: "url_pointer_only_no_profile_content",
    rateLimitPolicy: "no_linkedin_fetch",
    invitePolicy: "blocked_until_formal_api_or_user_supplied_contact_path",
    allowedUse: { collect: true, store: true, inviteUse: false },
    blocksProfileClaimSnippets: true,
    platformPolicyUrl: LINKEDIN_HELP_URL,
    notes: "LinkedIn URLs may be stored as pointers. Do not fetch, scrape, copy profile text, or use snippets as claims.",
  },
  "linkedin-api": {
    sourceClass: "linkedin-api",
    sourceLabel: "LinkedIn approved API",
    collectionMethod: "linkedin_oauth_or_partner_api",
    storagePolicy: "approved_scope_payload_only",
    rateLimitPolicy: "linkedin_api_terms_and_product_limits",
    invitePolicy: "allowed_only_with_approved_scope_and_compliance",
    allowedUse: { collect: true, store: true, inviteUse: true },
    blocksProfileClaimSnippets: false,
    platformPolicyUrl: LINKEDIN_OAUTH_URL,
    notes: "Requires formal LinkedIn API access and the minimum scopes needed for the use case.",
  },
  "linkedin-scrape": {
    sourceClass: "linkedin-scrape",
    sourceLabel: "LinkedIn scrape",
    collectionMethod: "forbidden_scrape_or_automation",
    storagePolicy: "blocked",
    rateLimitPolicy: "blocked",
    invitePolicy: "blocked",
    allowedUse: { collect: false, store: false, inviteUse: false },
    blocksProfileClaimSnippets: true,
    platformPolicyUrl: LINKEDIN_HELP_URL,
    notes: "LinkedIn scraping, copying profile data, bots, extensions, or automated activity are blocked.",
  },
  "private-dataset": {
    sourceClass: "private-dataset",
    sourceLabel: "Private dataset",
    collectionMethod: "unconsented_private_dataset",
    storagePolicy: "blocked",
    rateLimitPolicy: "blocked",
    invitePolicy: "blocked",
    allowedUse: { collect: false, store: false, inviteUse: false },
    blocksProfileClaimSnippets: true,
    notes: "Unconsented private datasets fail closed.",
  },
  unknown: {
    sourceClass: "unknown",
    sourceLabel: "Unknown source",
    collectionMethod: "unknown",
    storagePolicy: "blocked_until_classified",
    rateLimitPolicy: "blocked_until_classified",
    invitePolicy: "blocked_until_classified",
    allowedUse: { collect: false, store: false, inviteUse: false },
    blocksProfileClaimSnippets: true,
    notes: "Unknown source classes fail closed.",
  },
};

const REGISTRY_SOURCE_SET = new Set<string>(Object.keys(REGISTRY));

export function normalizeDiscoveryRegistrySourceClass(
  value: string | null | undefined,
): DiscoveryRegistrySourceClass {
  const normalized = (value ?? "").trim().toLowerCase();
  if (REGISTRY_SOURCE_SET.has(normalized)) {
    return normalized as DiscoveryRegistrySourceClass;
  }
  const policyNormalized = normalizeDiscoverySourceClass(normalized);
  if (REGISTRY_SOURCE_SET.has(policyNormalized)) {
    return policyNormalized as DiscoveryRegistrySourceClass;
  }
  return "unknown";
}

export function getDiscoverySourceRegistry(): DiscoverySourceRegistryEntry[] {
  return Object.values(REGISTRY);
}

export function getDiscoverySourceRegistryEntry(
  sourceClass: string | null | undefined,
): DiscoverySourceRegistryEntry {
  return REGISTRY[normalizeDiscoveryRegistrySourceClass(sourceClass)];
}

export function isLinkedInUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "linkedin.com" || host.endsWith(".linkedin.com");
  } catch {
    return /\blinkedin\.com\//i.test(value);
  }
}

export function classifyDiscoverySourceUrl(
  url: string | null | undefined,
  fallback: DiscoveryRegistrySourceClass = "public-website",
): DiscoveryRegistrySourceClass {
  if (isLinkedInUrl(url)) return "linkedin-pointer";
  return fallback;
}

export function blocksLinkedInSnippetClaim(
  sourceClass: string | null | undefined,
  sourceUrl?: string | null,
): boolean {
  const entry = getDiscoverySourceRegistryEntry(
    isLinkedInUrl(sourceUrl) ? "linkedin-pointer" : sourceClass,
  );
  return entry.blocksProfileClaimSnippets;
}

export async function assertDiscoverySourceRegistryAllows(
  sourceClass: string,
  operation: DiscoverySourceOperation,
  input: AssertDiscoverySourceRegistryAllowsInput = {},
): Promise<DiscoverySourceRegistryEntry> {
  const entry = getDiscoverySourceRegistryEntry(sourceClass);
  const allowed =
    operation === "invite-use"
      ? entry.allowedUse.inviteUse
      : operation === "collect"
        ? entry.allowedUse.collect
        : entry.allowedUse.store;
  if (!allowed || !sourcePolicyAllows(entry.sourceClass, operation)) {
    await assertSourcePolicy(entry.sourceClass, operation, input);
  }
  return entry;
}
