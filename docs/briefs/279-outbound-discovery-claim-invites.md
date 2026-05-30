# Brief 279: Outbound Discovery, Public Search, and Claim Invites

**Date:** 2026-05-14
**Status:** implemented & fresh-context reviewed APPROVE; pending human approval
**Depends on:** Brief 274; Brief 272; Brief 273; Brief 261; Brief 278 foundation checkpoint
**Unlocks:** Brief 275 refinement; Brief 276 recipient invitation paths; Brief 278 trust/privacy/admin closeout

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Build the viral loop by letting Ditto search LinkedIn/public web and other approved public sources for the right kinds of people, build internal source-backed Discovery Profiles, and invite high-fit people to claim their profile or respond to a request.

## Context

Member-led onboarding is necessary but not enough. Ditto must also grow the network by finding the right people before they are members:

- superconnectors,
- people already making introductions,
- people publicly listing availability,
- people posting opportunities,
- people asking for help,
- experts with clear proof and public contact paths,
- operators whose public work suggests unusually strong fit for active requests.

This is how the viral loop compounds:

1. Ditto discovers a high-signal person from public/provided sources.
2. Ditto builds a private, source-backed Discovery Profile.
3. Ditto scores whether they are the right kind of person to invite.
4. Ditto sends a respectful claim invite or request-specific "are you open?" message through an allowed channel.
5. The person claims, edits, and approves their Member Signal.
6. They share it or create their own requests.
7. Their network pulls in more high-signal people.

The implementation must be aggressive about fit and conservative about data rights, platform constraints, and attention. The goal is not volume. The goal is the right nodes entering the network.

## Objective

Ditto can run targeted public discovery jobs from strategic segments, Active Requests, and Member Signal opportunity watches. It searches approved sources: user-provided URLs, public websites, public posts/pages where source policy allows collection, portfolios, newsletters, event/community pages, opportunity portals, and referrals. LinkedIn is constrained to URL pointers, user-provided/consented input, or future formal API access; v1 must not fetch, scrape, copy, or store LinkedIn profile content as evidence. Ditto builds internal Discovery Profiles with provenance from allowed sources, filters for superconnector/high-fit signals, queues candidates for operator review in v1, and sends low-volume claim invites through allowed public contact paths only after Brief 278 foundation checks pass.

## Non-Goals

- No unauthorized LinkedIn scraping, credentialed browser automation, cookie-based scraping, fake accounts, or bypassing platform restrictions.
- No claim that Ditto has access to LinkedIn People Search API unless formal partner/API access exists.
- No storing LinkedIn authenticated member data beyond what the authenticated member has consented to provide.
- No auto-publication of discovered profiles. Discovery Profiles remain internal until claimed or explicitly permissioned.
- No mass cold email campaigns.
- No direct LinkedIn DM automation in v1.
- No HTTP fetching, browser automation, cached-page scraping, or snippet-to-claim conversion for LinkedIn profile pages in v1 unless formal approval/legal review explicitly changes the source registry.
- No enrichment from sensitive personal categories.
- No inferred protected-class targeting.
- No invite to people without a plausible professional reason and a public/permissioned contact path.
- No dark-pattern "someone is looking for you" copy unless the request is real and shareable.

## Inputs

1. `docs/briefs/274-manual-search-connection-proposals.md` - Possible Connection and manual search result model.
2. `docs/briefs/272-member-signal-onboarding-research-provenance.md` - Member Signal claim/provenance model.
3. `docs/briefs/273-need-request-onboarding-manual-search-entry.md` - Active Request model that seeds discovery.
4. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` - existing introduction/refusal gates.
5. `docs/briefs/275-background-watch-network-health.md` - watches that consume discovered candidates.
6. `src/engine/web-search.ts` - Perplexity/public web search helper.
7. `src/engine/network-scout.ts` - existing source-grounded scout pattern.
8. `docs/landscape.md` - existing Network introduction platforms, X API, Unipile/social-channel notes.
9. LinkedIn official docs: Profile API (`https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api`) and API access (`https://learn.microsoft.com/linkedin/shared/authentication/getting-access`) docs. These currently indicate profile/member data access is permissioned and primarily consent/partner scoped.
10. LinkedIn User Agreement / prohibited software guidance (`https://www.linkedin.com/legal/user-agreement`, `https://www.linkedin.com/help/linkedin/answer/a1341387/prohibited-software-and-extensions`) - forbids scraping/copying LinkedIn services, bots, fake accounts, and unauthorized automated access.
11. Public web crawling norms: robots.txt/REP behavior (`https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec`) and source-specific usage policies.
12. FTC CAN-SPAM compliance guide (`https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business`) - claim invite email compliance, opt-out, sender identity, and responsibility for outbound sends.

## Constraints

- **Source registry required.** Every discovery source type must be declared with allowed use, collection method, storage policy, rate limit, and invite policy.
- **Brief 278 foundation is a hard dependency.** No production discovery job may send a claim invite or store a new production Discovery Profile until scrubber, audit, suppression, retention/delete, email compliance, source-policy enforcement, and admin approval queue exist.
- **LinkedIn is constrained.** Treat LinkedIn as:
  - user-provided URL/input,
  - public URL pointer discovered through search engine results where allowed,
  - consented authenticated-member data if user connects/imports,
  - formal API/partner access if approved in future.
  Do not implement logged-in scraping, unauthenticated profile fetching, cached-page extraction, snippet-to-claim conversion, browser automation, or people-search automation.
- **Discovery Profile is internal.** It can inform search/proposal/invite decisions but cannot be public until claimed/approved.
- **Claim before public.** A discovered person must claim or consent before a public Ditto profile is created for them.
- **Contact path must be allowed.** Invite only via public email/contact form, user-provided referral path, or future approved channel. If no allowed contact path exists, save as "not inviteable yet."
- **Operator review in v1.** Until complaint rate, claim rate, and source quality are proven, outbound invites queue for human/operator approval.
- **Fit threshold is high.** A candidate must have clear evidence of excellence, relevance, or superconnector behavior before invite.
- **Negative filters are strict.** Suppress sensitive categories, personal-only profiles, minors, no professional signal, no contact path, low source confidence, obvious spam/agency farms, and high-risk regulated contexts without review.
- **Network health applies before invite.** Rate limits, suppression lists, prior declines, and community fit are applied before any outbound message.
- **All discovery/invite tools require `stepRunId`.**
- **Every invite is auditable.** Store source, reason, message, reviewer, send channel, reply, complaint, claim result.
- **Every invite is suppressible.** Prior decline, complaint, opt-out, delete request, blocked domain/person, paused source, or paused segment prevents send.
- **Outbound email compliance applies.** Claim invites must pass Brief 278's email compliance helper before send.
- **Economic outcome relevance required.** Invite reason must connect to a plausible professional/economic outcome, not generic "join our network" copy.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Source-grounded public scout | Brief 258 | adopt | Existing scout already requires public source URLs and graceful search failure. |
| Possible Connection | Brief 274 | adopt | Discovery output should become a possible connection before invite. |
| Member Signal claim review | Brief 272 | adopt | Discovered people claim and approve their signal before public listing. |
| LinkedIn API limitations | LinkedIn/Microsoft Learn Profile API and API access docs | pattern | Official docs indicate profile APIs are permissioned and authenticated-member/partner scoped; this shapes conservative implementation. |
| LinkedIn anti-scraping policy | LinkedIn User Agreement + prohibited software guidance | pattern | Official policy forbids scraping/copying services, bots, fake accounts, and unauthorized automation; v1 treats LinkedIn as pointer/consented/API only. |
| Claim invite email compliance | FTC CAN-SPAM guide | pattern | Outbound claim invites need sender accuracy, opt-out handling, suppression, and compliance accountability. |
| Source registry | Original to Ditto | original | Required to manage platform, privacy, and source-quality constraints per source. |
| Discovery Profile | Original to Ditto | original | Internal pre-claim profile lets Ditto reason without falsely representing non-members. |
| Superconnector scoring | Original to Ditto | original | Growth thesis requires finding network nodes, not just individual experts. |
| Claim invite loop | Original to Ditto | original | Converts public discovery into consented member onboarding. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/landscape.md` | Modify: add discovery-source registry notes for LinkedIn/public web/portals and the official-API limitation stance. LinkedIn v1 entry must be "URL pointer/user-provided/consented/API only; no fetch/scrape/store profile content." |
| `packages/core/src/db/network/schema.ts` | Modify: add `network_discovery_sources`, `network_discovered_profiles`, `network_discovery_claims`, `network_invitation_candidates`, `network_invitation_events`, `network_claim_tokens` unless existing schema can safely absorb them. |
| `drizzle/network/{NEXT}_outbound_discovery.sql` | Create if schema changes. |
| `src/engine/discovery-source-registry.ts` | Create: typed registry for allowed sources, collection method, storage rules, rate limits, contact policy. |
| `src/engine/public-people-discovery.ts` | Create: guarded `discover_public_people(stepRunId, discoveryInput)` using approved source registry and `webSearch`; blocks LinkedIn fetch/snippet-to-claim paths per registry. |
| `src/engine/discovery-profile.ts` | Create: builds internal Discovery Profiles with source-backed claims and no public publication. |
| `src/engine/invitation-candidate-score.ts` | Create: scores superconnector fit, active-opportunity fit, active-request fit, source confidence, and invite risk. |
| `src/engine/claim-invite.ts` | Create: guarded `compose_claim_invite(stepRunId, candidateId)` and `send_claim_invite(stepRunId, candidateId, approvedBy)`; v1 requires operator approval, suppression pass, source-policy pass, and email compliance pass. |
| `src/engine/tool-resolver.ts` | Modify: register discovery and invite tools with exact prompt-name parity tests. |
| `src/engine/network-chat-prompt.ts` | Modify: teach Greeter to distinguish discovered non-members from members and never imply a discovered person has joined Ditto. |
| `packages/web/app/admin/network/discovery/page.tsx` | Create: operator queue for discovery candidates and invites. |
| `packages/web/components/admin/discovery-candidate-card.tsx` | Create: source evidence, fit reason, risk flags, invite copy, approve/suppress actions. |
| `packages/web/app/api/v1/network/discovery/route.ts` | Create: start/list discovery jobs; admin-gated or system-gated. |
| `packages/web/app/api/v1/network/invites/[token]/claim/route.ts` | Create: claim token route that lands discovered person in Brief 272 Member Signal review. |
| `packages/web/app/network/claim/[token]/page.tsx` | Create: claim flow showing what Ditto found, why invited, source controls, approve/edit/delete. |

## Discovery Sources

### Allowed v1 source classes

1. **User-provided URLs**
   - Provided by an existing Ditto user or discovered person.
   - Highest trust for profile building.

2. **Public search engine results**
   - Perplexity/web search returns URLs/snippets.
   - Store source URL, title, snippet, retrieval time.
   - Respect source registry and robots/source policy before fetching deeper.
   - For LinkedIn results, store at most the URL pointer and retrieval metadata unless consent/formal access exists; do not use search snippets as profile claims or invite evidence without source-policy/legal approval.

3. **Public personal/company websites**
   - Best for proof, contact path, work focus.
   - Fetch only allowed public pages.

4. **Public professional posts/pages**
   - X posts, newsletters, Substack, GitHub, YouTube, podcasts, event pages, and other registered pages where source policy allows collection.
   - LinkedIn URLs are pointer-only in v1 unless user-provided/consented/formal API.
   - Treat social snippets cautiously; use as signals, not final truth.

5. **Opportunity/work portals**
   - Examples: portfolio platforms, freelancer/consultant marketplaces, founder/job boards, event speaker pages, community directories where allowed.
   - Must be source-registered before use.

6. **Referral/user-provided lists**
   - A member can upload or nominate people.
   - Invite copy should mention the referral only if permitted.

### Disallowed v1 source classes

- Logged-in LinkedIn scraping.
- Unauthenticated automated fetching of LinkedIn profile pages.
- Search-result snippet conversion into LinkedIn-derived claims.
- Scraping behind auth walls.
- Cookie/session replay.
- Fake accounts.
- Captcha bypass.
- Sensitive personal data brokers.
- Personal social accounts with no professional intent.
- Sources whose robots/terms/source registry entry disallows the intended use.

## Targeting Strategy

### Superconnector signals

Score up when a person:

- publicly introduces people or communities,
- runs a network, community, fund, studio, agency, accelerator, newsletter, event, or talent collective,
- curates opportunities,
- posts "who should I meet", "hiring", "looking for", "introducing", "open to help",
- has cross-domain credibility,
- has public proof that others trust their recommendations,
- has a clear professional contact path,
- is likely to understand why quality matters.

### Active opportunity/request signals

Score up when a person:

- publicly lists availability,
- posts a job/opportunity/request,
- says they are looking for experts/collaborators/advisors/clients,
- runs a project that maps to active Ditto requests,
- has a profile on a work/opportunity portal,
- has recent activity and clear timing.

### Expert supply signals

Score up when a person:

- has a specific niche with evidence,
- has proof of outcomes,
- appears active and reachable,
- has public writing/work/case studies,
- maps to repeated active requests.

### Suppression signals

Suppress when:

- no professional signal,
- no allowed contact path,
- personal/private account only,
- evidence stale or unverifiable,
- sensitive/protected-class inference would be needed,
- likely minor,
- prior decline/complaint,
- source trust low,
- candidate looks like a spammer/list broker,
- invite reason is weak or generic.

## Discovery Flow

1. **Seed**
   - Active Request, Member Signal opportunity watch, strategic segment, or operator-supplied query.

2. **Search**
   - Use source registry.
   - Query public web/Perplexity and approved source classes.
   - For LinkedIn, collect only URL pointers or user-provided/consented/API data; do not fetch LinkedIn pages, login-scrape, use People Search, or convert snippets into claims.

3. **Extract**
   - Build source-backed Discovery Profile with claims, evidence, contact path, and confidence.

4. **Score**
   - Score for superconnector fit, request fit, opportunity signal, source confidence, invite risk, network health.

5. **Review**
   - Queue top candidates for operator approval in v1.
   - Show evidence, invite reason, risk flags, and proposed copy.

6. **Invite**
   - Send only if contact path is allowed, operator approves, suppression passes, source-policy passes, and Brief 278 email compliance passes.
   - Invite should say why Ditto noticed them and give control: claim/edit, decline, delete data, ask what Ditto found.

7. **Claim**
   - Claim token opens a review flow.
   - Discovered person sees all sources and claims.
   - They can approve, edit, hide, delete, or continue.

8. **Learn**
   - Record claim, decline, complaint, source quality, reply sentiment, and segment performance.

## Invite Copy Rules

Invite copy must:

- be specific,
- cite the public reason Ditto found them,
- make clear they are not already publicly listed as a Ditto member,
- offer control,
- avoid manipulative urgency,
- avoid "someone is looking for you" unless tied to a real approved request,
- include one clear action: review/claim or decline.

Example superconnector invite:

> We found your work curating climate operators and investors. Ditto is building a professional network where introductions are made by fit, not follower count, and where the goal is useful professional outcomes. I drafted a private signal from public sources so you can review, edit, or delete it before anything is public.

Example active-request invite:

> Someone on Ditto is looking for a marketplace operations expert with evidence of scaling supply quality. Your public work at {source} looks unusually relevant. Want to review the context and decide whether an introduction makes sense?

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write/no-send assertion |
|----------------|-------------|-------------------|--------------------------|--------------------------------|
| `discover_public_people(stepRunId, ...)` | External search, source metadata write, discovery job write | Required; source-policy pass before fetch/write. | Discovery route or scheduled process creates wrapper run. | Missing guard makes no external call and writes no discovery job/source rows. |
| Discovery Profile builder | Internal profile/claim creation | Required; internal-only state and retention set. | Discovery job step propagates wrapper run. | Missing guard creates no Discovery Profile, public handle, or public claim. |
| Invitation Candidate scoring | Candidate score/risk write | Required; suppression/source-policy/network-health pass. | Discovery/scoring step propagates wrapper run. | Missing guard writes no score/risk row and cannot enqueue invite review. |
| `compose_claim_invite(stepRunId, ...)` | LLM token spend and invite draft write | Required; copy compliance checks. | Operator/review route or process step creates wrapper run. | Missing guard makes no LLM call and writes no invite draft. |
| `send_claim_invite(stepRunId, ...)` | External email/contact send | Required; operator approval, suppression, source-policy, and email compliance pass. | Admin approve/send route creates wrapper run. | Missing guard or caller-supplied run id sends no email/contact and writes no sent state. |
| `/api/v1/network/discovery/*` and invite routes | Job start/list/approval/send wrappers | Must not accept client-provided run ids; admin/system auth required. | Route mints wrapper run server-side. | Reject caller `stepRunId`, including `null`, `""`, `0`, `false`; guarded tool is not invoked and no job/send row is written. |

## Acceptance Criteria

1. [x] Source registry exists and every discovery source class has allowed use, collection method, storage policy, rate limit, and invite policy.
1a. [x] Brief 278 foundation checkpoint is implemented and reviewed before production discovery sends claim invites or stores new production Discovery Profiles.
2. [x] LinkedIn source policy explicitly forbids logged-in scraping, unauthenticated profile fetching, cached-page extraction, credentialed automation, fake accounts, cookie replay, browser automation, search-result snippet-to-claim conversion, and People Search automation without formal access.
3. [x] Discovery supports public search results, user-provided URLs, public websites, X/public posts where allowed, opportunity portals where registered, and referral lists.
4. [x] `discover_public_people(stepRunId, ...)` refuses without `stepRunId` outside `DITTO_TEST_MODE`.
5. [x] `compose_claim_invite(stepRunId, ...)` and `send_claim_invite(stepRunId, ...)` refuse without `stepRunId`.
6. [x] HTTP discovery/invite routes reject caller-supplied `stepRunId`.
7. [x] Discovered profiles remain internal and cannot render as public `/people/[handle]` pages until claimed/approved.
8. [x] Discovery Profile claims have source URL/id, evidence snippet, confidence, source type, and retrieval time.
9. [x] Invitation Candidate scoring includes superconnector fit, active-opportunity fit, active-request fit, source confidence, invite risk, and network health.
10. [x] Suppression rules block candidates with no professional signal, no allowed contact path, sensitive/protected-class inference, stale/unverifiable evidence, prior decline/complaint/opt-out/delete request, paused source/segment, or weak/generic invite reason.
11. [x] v1 invite sending requires operator approval, source-policy pass, suppression pass, email compliance pass, and network-health pass.
12. [x] Operator queue shows evidence, source links, fit reason, risk flags, proposed invite copy, and approve/suppress controls.
13. [x] Invite copy makes clear the person is not publicly listed on Ditto until they claim/approve, and ties the invite to a plausible professional/economic outcome rather than generic network growth.
14. [x] Claim token flow shows what Ditto found, source list, editable claims, delete/decline controls, and approval path into Member Signal onboarding.
15. [x] A discovered person can decline and suppress future invites.
16. [x] A discovered person can request deletion of the Discovery Profile.
17. [x] Active Request can seed discovery and invite a relevant non-member only via approved path.
18. [x] Background Watch can consume discovered candidates but cannot invite/contact without the same approval path.
19. [x] Metrics track search source, candidate score, operator approval rate, invite sent, claim rate, decline, complaint, and intro conversion.
20. [x] Tests cover LinkedIn policy guard, source registry enforcement, internal-only profile rendering, scoring/suppression, operator approval, email compliance/suppression, claim token, decline/delete, and stepRunId guards.
21. [x] HTTP routes reject caller-supplied `stepRunId`, including falsy values, and tests assert no discovery rows, invite drafts, or sends are created on bypass.

## Completion Notes (2026-05-19)

- Implemented with network discovery schema migration idx 13, the source registry, guarded discovery/compose/send tools, internal Discovery Profiles, source-backed candidate scoring/suppression, admin operator queue, claim-token route/page, claim-token identity verification, and privacy export/delete/retention coverage for Discovery Profiles, source rows, and tokens.
- Fresh-context review initially found LinkedIn snippet persistence, arbitrary-email claim redemption, claim-token review loading/update, source-row privacy export/delete/purge, send durability, and prompt/tool parity gaps. Fixes were applied; the final fresh-context review returned APPROVE.
- Verification: focused Brief-279/privacy vitest 161/161 across 17 files, adjacent privacy/policy/retention vitest 94/94, `pnpm type-check`, and `git diff --check`.
- Residual follow-up: `sendClaimInvite()` records a prepared token/event before the external send and revokes on known failure, but it is not a full outbox. A process crash after provider acceptance and before the final sent update can leave a prepared token/event without the final sent event.

## Retrospective

- What worked: the review loop found real privacy/source-row and durable-send issues before handoff; the source registry kept the LinkedIn pointer-only posture concrete.
- What surprised: source rows needed explicit profile association even when no claims exist, and claim-token review needed a token-backed session path rather than a generic profile path.
- Change next time: specify durable source association and outbox/attempt semantics in the brief acceptance criteria before build starts.

## Review Process

1. Spawn review agent with Briefs 270-279, Brief 258, Brief 261, `docs/architecture.md`, `docs/review-checklist.md`, and LinkedIn official API/access docs.
2. Review agent checks compliance posture, source registry completeness, no unauthorized LinkedIn automation, internal-only discovered profiles, invite copy ethics, operator review, and claim/delete controls.
3. Present unresolved legal/platform questions to human before build. If needed, require legal review before sending production invites.

## Smoke Test

```bash
pnpm vitest run src/engine/discovery-*.test.ts src/engine/claim-invite*.test.ts
pnpm --filter @ditto/web test -- discovery
pnpm run type-check

# Manual in test mode:
# 1. Create Active Request for "marketplace operations expert".
# 2. Start discovery with public-web source only.
# 3. Verify discovered candidates have source evidence and contact policy.
# 4. Approve one invite in admin queue.
# 5. Open claim token as recipient.
# 6. Edit one claim, hide one claim, approve signal.
# 7. Verify public profile is created only after claim approval.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 279.
3. Update `docs/landscape.md` with the source registry stance.
4. Feed outbound discovery privacy/admin controls into Brief 278 before closing parent Brief 270.
