# Brief 270: Network Superconnector Reframe (Parent)

**Date:** 2026-05-14
**Status:** draft
**Depends on:** Brief 254 parent; Briefs 255-261 implemented or in review; Brief 258 KB/scout; Brief 259 public profile-as-chat; Brief 260 share surfaces; Brief 261 introductions primitive
**Unlocks:** Briefs 271-279

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Reframe Ditto Network from a two-lane marketplace-like front door into an AI superconnector: a professional network that understands each member, captures what they need, supports manual search, runs background opportunity/request watches, and facilitates high-trust introductions that produce professional and economic outcomes with consent.

## Context

The current Network work establishes the right raw materials: expert lane, client lane, public profile-as-chat, KB intake, scout, share modal, and introductions. The product frame is still too narrow. It risks reading as "profile builder plus candidate search" when the intended value is larger:

> In the age of AI, being discovered for what you are good at and finding the right talent is harder. The internet is noisy, biased, and time consuming. Ditto gives everyone access to a discerning superconnector that works for the health of the whole community and helps convert professional signal into real outcomes: work, revenue, hires, funding, collaborations, advisory roles, and useful introductions.

The user direction locks the new thesis:

- Ditto is the professional network of the future.
- It initially sits alongside LinkedIn, but should ultimately become the LinkedIn alternative for the AI age.
- Ditto is not a job board, not a lead list, and not a spam engine.
- Ditto is about economic outcomes, not vanity networking. The point is not more connections; the point is the right connection producing value.
- Users can still run manual searches.
- Users can create a specific request or opportunity and let Ditto facilitate the search in a guided flow.
- Users can leave Ditto running in the background, looking for strong-fit connections over time.
- Members onboard by sharing LinkedIn, website, X, Instagram, or other sources; Ditto researches them and builds a living profile that highlights their unique magic.
- The product should make AI feel more human, not less human.

This parent brief creates the new program and splits implementation into buildable sub-briefs.

## Objective

A new user arriving at `/network` understands within seconds that Ditto is an AI superconnector, not a marketplace. They can either help Ditto understand them, search manually, create a request, or set a background watch. Every profile claim and match rationale is provenance-backed. Every introduction is consent-based. Email is the primary async decision surface, chat is the richer refinement surface, and public/share surfaces create a viral loop based on professional recognition and successful outcomes rather than spammy invitations.

The economic thesis must be explicit: Ditto helps people turn professional context into outcomes worth paying for over time. v1 keeps the existing free-intro behavior so the loop can validate without pricing friction, but the product direction is that users eventually pay for successful outcomes, successful introductions, or connection workflows that repeatedly create value. Builders must not add payment code in this program, but they must preserve measurement and copy hooks for a later pricing brief.

## Non-Goals

- No native autoposting to LinkedIn, X, or Instagram in this program. User-led share and share-intent only.
- No scraping commitments that violate platform constraints. LinkedIn, X, and Instagram ingestion must degrade gracefully to URL, pasted text, user-provided exports, screenshots, or public metadata.
- No public browse directory. Manual search is agent-mediated and request-shaped, not a faceted marketplace.
- No automatic third-party outreach. Ditto may propose, ask, and facilitate; it does not contact a target without the right consent gate.
- No payment or pricing code changes in this program. Existing v1 free-intro behavior remains unless a later pricing brief changes it. This is not a statement that outcomes are free forever: a later pricing brief is expected once successful connection/outcome data exists.
- No collapse of Workspace into Network. Network is the superconnector surface; Workspace remains the durable operating environment for deeper work.
- No unproven AI claims shown as facts. Inferences are labeled and editable.

## Inputs

1. `docs/briefs/254-network-two-sided-conversational-front-door.md` - current parent surface and constraints.
2. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` - KB, fact visibility, Perplexity/web-search scout foundation.
3. `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md` - profile-as-chat, representative posture, durable workspace delivery.
4. `docs/briefs/260-network-share-modal-og-and-png.md` - share modal, OG, PNG, three voice variants.
5. `docs/briefs/261-introductions-free-counter-workspace-upsell.md` - introductions primitive, refusal triggers, cost label, workspace upsell.
6. `docs/architecture.md` - Network as front door, Alex/Mira network connector role, operating cycles, channel routing.
7. `docs/human-layer.md` - Layer 6 primitives and user jobs.
8. `docs/landscape.md` - AI SDR/network intro platform research, AgentMail, Unipile, X API, Perplexity/web-search posture.
9. `.context/attachments/pasted_text_2026-05-14_11-46-27.txt` - current UX refinement task and acceptance criteria.

## Constraints

- **Superconnector is the canonical metaphor.** Copy, IA, and workflow naming must orient around a discerning connector, not a marketplace or candidate database.
- **Manual search remains first-class.** Background automation must not hide direct search.
- **Background watch remains first-class.** Ditto's differentiator is continuing to look for fit after the user leaves.
- **Member and request are symmetric.** A user may arrive as supply, demand, or both; the product must make crossover natural.
- **Network health is a product constraint.** Do not optimize for volume of intros. Optimize for fit, timing, consent, and member attention.
- **Economic outcome is the product constraint.** Optimize for introductions and requests that can plausibly create work, revenue, hiring, investment, advisory, partnership, learning, or other concrete professional value.
- **Provenance is mandatory.** Member claims, inferred needs, match rationales, and scout results must carry source labels.
- **Consent is mandatory.** No intro thread, DM, or email to a third party without the relevant approval path.
- **Email plus chat, not email versus chat.** Email carries durable decisions. Chat carries context, edits, and explanations.
- **All side-effecting tools require `stepRunId`.** Existing Insight-180 / Insight-232 rules apply to every new engine tool and HTTP seam.
- **All side-effecting HTTP seams use wrapper step runs.** Any route that invokes a guarded tool, writes state, sends email, creates/deletes/exports user data, starts discovery/watch/search jobs, records share attribution, or performs admin override must reject any caller-supplied `stepRunId` field, including falsy values, and must mint the wrapper step run server-side.
- **Network-tier schema follows Insight-190.** Builder must re-read `drizzle/network/meta/_journal.json` at build time and never assume migration idx.
- **Representative posture remains.** Greeters represent users; they never impersonate them.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Superconnector as product primitive | Original to Ditto | original | The user's framing is specific: Ditto democratizes access to the kind of thoughtful connector only some people historically had. |
| Consent-based professional introductions | Brief 248 + Brief 261 | adopt | Existing AuthorizationRequestBlock and introductions primitive are the right gate. |
| Public profile-as-chat | Brief 259 | adopt | The representative surface is already the strongest expression of "Ditto understands this person." |
| KB and source-grounded scout | Brief 258 | adopt | Existing web-search/Perplexity and per-fact visibility are the foundation for signal research. |
| Continuous background watch | Operating Cycle Archetype, Briefs 115-118 | adopt | Sense -> assess -> act -> gate -> land -> learn -> brief maps directly to background request watching. |
| Email as durable async decision surface | Briefs 098b/099a-c, `notifyUser` | adopt | Existing network communication layer already resolves email/workspace channels and records interactions. |
| Share-as-recognition viral loop | Brief 260 + Original to Ditto | adopt/original | OG/PNG/share modal exists; the recognition/status psychology is a new product layer. |
| Outcome-led pricing path | Brief 119 + Original to Ditto | pattern/original | v1 stays free, but the durable business model is payment for successful outcomes or valuable connection workflows after validation. |
| Network health constraints | Original to Ditto | original | The non-spammy, community-health-preserving connector behavior is central to the product thesis. |

## What Changes (Work Products)

This is a parent brief. It declares the child brief chain.

| Sub-brief | Scope | Depends on |
|-----------|-------|------------|
| **271** | Doctrine, IA, copy, glossary, and `/network` home reframe around "superconnector for everyone." | 270 |
| **272** | Member Signal onboarding: source intake, LinkedIn/website/X/Instagram support, background research, provenance-backed profile draft, user review. | 271 + 258 + 256 |
| **273** | Need/Opportunity Request onboarding: need-first flow, request brief drafting, seeker identity, manual search entry, save as Active Request. | 271 + 257/264-266 |
| **274** | Manual Search and Connection Proposals: search results as reasoned possible connections with evidence, risks, provenance, refine/save actions. | 272 + 273 + 258 |
| **278 foundation checkpoint** | Trust, privacy, source-registry enforcement, audit, suppression, retention/delete, and admin queue scaffold required before any outbound discovery or invite sends. | 272-274 + 261 |
| **279** | Outbound Discovery and Claim Invites: targeted LinkedIn/public-web/source-registry discovery, internal Discovery Profiles, superconnector scoring, operator-reviewed claim invites. | 272 + 274 + 278 foundation checkpoint |
| **275** | Background Watch operating cycle: scheduled request/member-signal watches, digest/proposal queue, network health throttles, and discovered-candidate handoff. | 274 + 278 foundation checkpoint + 279 + operating cycle infrastructure |
| **276** | Consent-based introductions plus email/chat facilitation: two-sided approval, off-platform email intro thread, post-intro feedback. | 275 + 261 + 098/099 |
| **277** | Share and viral loop: share studio, public profile conversion, channel-specific copy/cards for LinkedIn/X/Instagram/email signature/site badge. | 272 + 260 + 259 |
| **278 closeout checkpoint** | Complete trust, privacy, admin, and observability closeout: full scrub regression suite, dashboards, aggregate metrics, dry-run replay, and parent acceptance. | 272-277 + 279 |

**Build order:** 271 -> 272 + 273 in parallel -> 274 -> 278 foundation checkpoint -> 279 -> 275 -> 276 + 277 in parallel -> 278 closeout checkpoint.

## Product Model

### Five first-class user jobs

1. **Help Ditto understand me**
   - Input: URLs, pasted bio, uploads, conversation.
   - Output: Member Signal.
   - Result: user becomes legible and discoverable.

2. **Find someone now**
   - Input: natural language search.
   - Output: possible connections with evidence and next action.
   - Result: manual search stays available.

3. **Create a request**
   - Input: a need, opportunity, or target outcome.
   - Output: Active Request.
   - Result: Ditto can search now or keep watching.

4. **Keep watch for me**
   - Input: request or member intent.
   - Output: periodic proposals/digests.
   - Result: Ditto works quietly in the background.

5. **Find the right people for the network**
   - Input: Active Requests, strategic segments, Member Signals, and public-source discovery jobs.
   - Output: internal Discovery Profiles and operator-reviewed claim invites.
   - Result: Ditto grows by inviting high-signal people who are likely to create value, especially superconnectors and people already posting opportunities or availability.

### Canonical objects

- **Member Signal:** Ditto's living understanding of a person.
- **Need Signal:** a person's current need, goal, or opportunity.
- **Active Request:** a saved Need Signal with search/watch settings.
- **Manual Search:** immediate query against members and public sources.
- **Background Watch:** recurring process that looks for fit over time.
- **Possible Connection:** a non-contacted match candidate with rationale.
- **Introduction Proposal:** a consent-gated recommendation to connect two parties.
- **Network Health:** constraints that protect attention, trust, and community quality.
- **Discovery Profile:** an internal, source-backed pre-claim profile for a non-member discovered from public/provided sources.
- **Claim Invite:** a consent-first invitation asking a discovered person to review, edit, approve, or delete what Ditto found before anything becomes public.

### Canonical lifecycle

The object lifecycle is a product and safety boundary:

| From | To | Allowed by | Rule |
|------|----|------------|------|
| Raw user need | Active Request | Brief 273 | User can save/search/watch before full member onboarding. |
| Manual Search result | Possible Connection | Brief 274 | Search only proposes; it never contacts. |
| Possible Connection | Invitation Candidate | Brief 274/279 | Only high-fit non-members with source evidence and allowed contact path. |
| Invitation Candidate | Discovery Profile | Brief 279 | Internal only; no public handle/profile. |
| Discovery Profile | Claim Invite | Brief 279 + 278 foundation | Operator approval, source-policy pass, suppression pass, email compliance pass. |
| Claim Invite | Member Signal | Brief 272 claim-token path | Claimed person reviews, edits, approves, or deletes before anything public exists. |
| Possible Connection | Introduction Proposal | Brief 276 | Requester approval before recipient is asked; recipient approval before thread. |
| Introduction Proposal | Intro Thread | Brief 276 | Both sides approved; only approved/shareable context is sent. |

Manual Search, Background Watch, and Outbound Discovery are separate modes. Manual Search is immediate and user-initiated. Background Watch is recurring and quiet. Outbound Discovery creates internal Invitation Candidates/Discovery Profiles and may send claim invites only through the approved path.

### Data model guardrails

Before building Brief 272, the Builder must inspect the existing Network schema and produce a short ERD/migration note in the PR description. The expected ownership is:

- `network_user_kb_documents` and `network_user_kb_facts` remain the source-evidence layer.
- Member Signal claims are the curated projection of evidence, not a duplicate raw fact store.
- `network_job_requests` either evolves into Active Requests or receives an explicit migration/backfill path; do not create a competing request table without documenting why.
- Possible Connections, Invitation Candidates, Discovery Profiles, and Introduction Proposals are separate lifecycle states, not interchangeable names for the same row.
- `introductions` remains the durable intro authorization/fulfillment record; Brief 276 may extend it but must not fork intro state into a parallel table without a migration plan.

### Side-effect and HTTP seam matrix

Every child brief must include a concrete matrix for its own seams before build. At minimum each row must list: route/function, side effect, `stepRunId` guard, wrapper-step-run creator, caller-supplied `stepRunId` rejection test, and no-write/no-send assertion on bypass. This applies to LLM calls that spend tokens, external search, DB writes, share attribution, watch/search/discovery job starts, emails, claim invite sends, privacy export/delete, admin overrides, and dry-run replay.

## User Experience

- **Jobs affected:** Orient, Capture, Define, Delegate, Decide, Review.
- **Primitives involved:** Member Signal, Need Signal, Active Request, Background Watch, Possible Connection, Introduction Proposal, Discovery Profile, Claim Invite, public profile-as-chat, share artifact, email decision, chat context.
- **Process-owner perspective:** The user sees Ditto as a working connector that learns from their edits, sends them high-signal decisions by email, and lets them refine context in chat.
- **Interaction states:** source-reading, draft-ready, needs-confirmation, search-running, watch-active, proposal-ready, intro-awaiting-approval, intro-sent, feedback-captured, paused, blocked.
- **Designer input:** Required for 271, 272, 273, 274, and 277. Briefs 275/276/278 need UX review for decision emails, proposal queue, admin, and privacy controls.

## Acceptance Criteria

1. [ ] Briefs 271-279 exist and cover all product questions raised by the user: manual search, request flow, background watch, LinkedIn/website/X/Instagram onboarding, LinkedIn/public discovery, Perplexity search, seeker onboarding, email/chat communication, and off-platform intro facilitation.
2. [ ] The brief chain explicitly positions Ditto as a superconnector and professional network alternative, not as a job board or marketplace.
2a. [ ] The brief chain explicitly states that Ditto exists to produce economic outcomes through successful connections, and that users may later pay for successful outcomes/connections after v1 validation data exists.
3. [ ] The brief chain keeps manual search and background watch as separate first-class modes.
4. [ ] The brief chain requires provenance labels for every AI-generated member claim, request inference, search result, and connection rationale.
5. [ ] The brief chain requires user review/edit/hide controls before unverified source claims become public.
6. [ ] The brief chain supports LinkedIn URL, website URL, X URL, Instagram URL, additional URLs, pasted text, and upload/screenshot fallback where platform access is constrained.
7. [ ] The brief chain uses Perplexity/web search only as enrichment and requires graceful behavior when `PERPLEXITY_API_KEY` is absent.
8. [ ] The brief chain specifies seeker/request onboarding independent of full member onboarding.
9. [ ] The brief chain specifies email as the primary durable decision surface and chat as the context/refinement surface.
10. [ ] The brief chain specifies two-sided consent before introductions and off-platform email intro as v1 fulfillment.
11. [ ] The brief chain specifies post-intro feedback and learning.
12. [ ] The brief chain specifies network health constraints: throttles, user block list, anti-persona, rate limit, and low-fit refusal.
13. [ ] The brief chain includes outbound public discovery and claim invites for high-signal non-members.
14. [ ] The discovery brief requires a source registry, no unauthorized LinkedIn scraping, internal-only Discovery Profiles, operator review in v1, and claim-before-public controls.
15. [ ] The 278 foundation checkpoint lands privacy/audit/source-policy/suppression/admin-queue safeguards before Brief 279 sends any claim invite or stores any new Discovery Profile in production.
16. [ ] Every child brief includes a side-effect/HTTP seam matrix with wrapper-step-run and bypass-rejection tests.
17. [ ] The brief chain includes review instructions for fresh-context architecture review before build.
18. [ ] `docs/roadmap.md` references the new parent and child briefs.
19. [ ] `docs/state.md` records that the superconnector brief chain was authored and corrected by pre-build review.

## Review Process

1. Spawn review agent with `docs/architecture.md`, `docs/review-checklist.md`, parent Brief 254, Briefs 258-261, and Briefs 270-279.
2. Review agent checks:
   - whether the child briefs are collectively complete,
   - whether the Network/Workspace boundary is preserved,
   - whether provenance, consent, and network health gates are explicit,
   - whether every side-effecting tool has `stepRunId` guard language,
   - whether public/social-source ingestion is legally and technically conservative,
   - whether the copy system makes the why/what/how clear.
3. Present review findings to human before Builder work starts.

## Smoke Test

This parent brief has no runtime smoke test. The smoke is document-level:

```bash
test -f docs/briefs/271-network-doctrine-ia-copy-superconnector.md
test -f docs/briefs/272-member-signal-onboarding-research-provenance.md
test -f docs/briefs/273-need-request-onboarding-manual-search-entry.md
test -f docs/briefs/274-manual-search-connection-proposals.md
test -f docs/briefs/275-background-watch-network-health.md
test -f docs/briefs/276-email-chat-consent-introductions.md
test -f docs/briefs/277-share-loop-public-profile-conversion.md
test -f docs/briefs/278-trust-privacy-admin-observability.md
test -f docs/briefs/279-outbound-discovery-claim-invites.md
rg "superconnector|Member Signal|Background Watch|Introduction Proposal|Discovery Profile|Claim Invite" docs/briefs/270-*.md docs/briefs/27{1,2,3,4,5,6,7,8,9}-*.md
```

## After Completion

1. Update `docs/state.md` with the authored brief chain.
2. Update `docs/roadmap.md` Phase 14 with the new Network Superconnector Reframe rows.
3. Run fresh-context review before moving any child brief to `ready`.
4. Move child briefs to `ready` only after human approval.
