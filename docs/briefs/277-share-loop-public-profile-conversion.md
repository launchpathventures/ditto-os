# Brief 277: Share Loop and Public Profile Conversion

**Date:** 2026-05-14
**Status:** draft
**Depends on:** Brief 272; Brief 260; Brief 259; Brief 271
**Unlocks:** Brief 278

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Turn the approved Member Signal into a recognition-driven share loop that helps members announce they are on Ditto and converts visitors into their own Member Signal or request flow.

## Context

The viral loop should not be "invite your contacts" or "I joined another network." It should be identity/status driven:

> Ditto saw something specific and valuable about me. I want to share that.

Existing Brief 260 gives the share modal, dynamic OG, PNG, and three voice variants. This brief expands the loop across LinkedIn, X, Instagram, email signatures, website badges, and public profile visitor conversion while preserving user control and avoiding auto-spam.

## Objective

After approving a Member Signal, a user sees a Share Studio with channel-specific variants and visual assets. After a useful connection or reported outcome, the user can also share an outcome-led variant if both privacy and consent checks pass. The public profile includes visitor conversion paths: ask Ditto about this member, request an intro, build your own signal, create a request, or keep watch. Sharing is user-led and never automatic.

## Non-Goals

- No native social autopost in v1.
- No mass invite/address-book import.
- No automatic DMs.
- No dark-pattern referral wall.
- No broad public directory.
- No paid referral incentive.

## Inputs

1. `docs/briefs/272-member-signal-onboarding-research-provenance.md` - approved Member Signal.
2. `docs/briefs/260-network-share-modal-og-and-png.md` - share modal, OG, PNG, three voices.
3. `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md` - public profile-as-chat and visitor intro.
4. `docs/briefs/271-network-doctrine-ia-copy-superconnector.md` - copy system.
5. `packages/web/components/network/share-modal.tsx` - existing share UI.
6. `packages/web/app/people/[handle]/` - public profile visitor surface.
7. `packages/web/components/network/card-silhouette.tsx` - visual asset.

## Constraints

- **Share is user-led.** No autoposting or auto-DM.
- **Recognition beats promotion.** Copy should highlight specific professional magic, not generic membership.
- **Outcome beats vanity.** The strongest loop is "Ditto helped create useful work/connection/outcome", not "I joined another network."
- **Every shared claim must be approved public signal.**
- **Outcome shares require consent and scrub.** Do not reveal the other party, deal details, private request text, or outcome value unless explicitly approved by the relevant user(s).
- **Channel copy must fit the channel.** LinkedIn, X, Instagram story, email signature, and website badge have different constraints.
- **Visitor conversion must be contextual.** A visitor who asks about a member should be invited into the right next flow, not dumped on a generic signup.
- **No visible "growth hack" copy.** Keep the experience refined.
- **Attribution is useful but privacy-safe.** Track share source/referrer without exposing private visitor context.
- **Instagram is asset-first.** Since links are weak in posts/stories, provide PNG/story card and short copy.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Three voice share variants and OG/PNG | Brief 260 | adopt | Existing share primitive. |
| Public profile-as-chat | Brief 259 | adopt | Visitor surface already supports asking about a member. |
| Recognition-led sharing | Original to Ditto | original | User direction: psychological mechanics must make sharing feel valuable and specific. |
| Channel-specific share studio | Original to Ditto | original | Needed to make LinkedIn, X, Instagram, email, and site contexts distinct without native autoposting. |
| Outcome-led sharing | Original to Ditto | original | Connects the viral loop to real economic/professional value instead of generic referral mechanics. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/share-studio-variants.ts` | Create or extend `generate_share_variants`: channel-specific variants for LinkedIn, X, Instagram, email signature, website badge. |
| `src/engine/tool-resolver.ts` | Modify if new guarded tool is added; preserve `stepRunId`. |
| `packages/web/components/network/share-studio.tsx` | Create: full share surface after Member Signal approval. |
| `packages/web/components/network/share-modal.tsx` | Modify: can launch compact modal or full Share Studio. |
| `packages/web/app/api/v1/network/people/[id]/share/route.ts` | Extend: supports channel variant generation and rejects caller `stepRunId`. |
| `packages/web/app/api/v1/network/share-attribution/route.ts` | Create: records share source/referrer/visitor conversion without private leakage. |
| `packages/web/app/people/[handle]/profile-chat-client.tsx` | Modify: visitor conversion CTAs based on visitor intent. |
| `packages/web/components/network/public-profile-visitor-ctas.tsx` | Create: "Ask Ditto about me", "Request intro", "Build your own signal", "Create a request". |
| `packages/web/components/network/website-badge.tsx` | Create: copyable badge/embed snippet if safe and scoped. |
| `packages/web/components/network/email-signature-snippet.tsx` | Create: copyable signature line. |
| `packages/web/components/network/instagram-story-card.tsx` | Create: 9:16 PNG/story card if not already covered by card-silhouette dimensions. |

## Outcome-Led Share Moments

Eligible moments:

- Member Signal approved: recognition-led share.
- Intro accepted by both sides: "Ditto found a thoughtful connection" share, no other party named without consent.
- Post-intro useful outcome reported: outcome-led share, only if the reporting user explicitly opts in and private details are scrubbed.
- Request fulfilled or watch finds a high-fit connection: request/outcome share, only with approved public/request-safe language.

Outcome-led copy must not imply guaranteed results, paid placement, or endorsement by the other party. It should make the product loop clear: Ditto makes fewer, better, consent-based introductions that can produce real professional value.

## Side-Effect and HTTP Seam Matrix

| Route/function | Side effect | `stepRunId` guard | Wrapper-step-run creator | Bypass/no-write assertion |
|----------------|-------------|-------------------|--------------------------|---------------------------|
| Share variant generation | LLM token spend and generated copy | Required through existing share tool; approved public/outcome-safe claims only. | Share Studio route creates wrapper run. | Missing guard makes no LLM call and writes no generated variant. |
| Share attribution route | Visitor/session/referrer event write | Server wrapper run or audited server event; no private text. | Attribution route creates wrapper run when writing durable attribution. | Caller `stepRunId`, including falsy values, is rejected; no attribution row on bypass. |
| Outcome-share generator | LLM token spend and optional outcome copy write | Required; consent/scrub pass; no other-party details without approval. | Outcome-share route creates wrapper run. | Missing guard makes no LLM call and writes no outcome copy/share event. |
| Website badge/email signature routes | Snippet generation/copy event write | Escape user text; guarded tools require `stepRunId`. | Route creates wrapper run if invoking guarded tools. | Caller `stepRunId` is rejected; no snippet event/write if bypass attempted. |

## Share Copy Examples

LinkedIn:

> I'm now on Ditto, where introductions are made by fit, not follower count. Ditto says I'm best introduced for: {specific approved signal}.

X:

> Ditto says I'm best for: {specific signal}. If that's useful, ask Ditto about me: {url}

Instagram story:

> Ask Ditto what I'm best introduced for.

Email signature:

> Ask Ditto about what I'm working on: {url}

Website badge:

> Available through Ditto introductions.

Outcome-led:

> Ditto helped me find a connection that changed the brief. Fewer intros, better fit: {url}

## Visitor Conversion Paths

- Visitor asks about member's expertise -> keep them in profile chat, then offer intro request.
- Visitor appears to have similar expertise -> "Want Ditto to build a signal for you too?"
- Visitor is seeking help -> "Create a request and Ditto can keep watch."
- Visitor came from share link and does nothing -> soft CTA only, no modal takeover.
- Visitor requests intro -> Brief 276 consent path.

## Acceptance Criteria

1. [ ] After Member Signal approval, user sees Share Studio or clear share CTA.
2. [ ] Share Studio supports LinkedIn, X, Instagram story/card, email signature, website badge, PNG, and public URL.
3. [ ] Share copy uses only approved public claims.
4. [ ] Share copy is channel-specific and does not reuse one generic post everywhere.
5. [ ] User can edit generated copy before copying.
6. [ ] No native autopost or auto-DM occurs.
7. [ ] Instagram flow provides image/card-first output and copy, not a broken link-first assumption.
8. [ ] Public profile visitor CTAs are intent-aware and include build-your-own-signal and create-request paths.
9. [ ] Share attribution records source channel, public profile handle, visitor session/referrer, and conversion action without private signal leakage.
9a. [ ] Outcome-led share variants are available after intro/usefulness feedback only when the user opts in and private/other-party details are scrubbed.
10. [ ] Existing Brief 260 OG and PNG routes continue to work.
11. [ ] Website badge/embed snippet cannot execute arbitrary user text as HTML; it is escaped/sanitized.
12. [ ] Email signature copy is plain text and HTML-safe.
13. [ ] Visitor from shared URL can ask Ditto about the member before signup.
14. [ ] Visitor creating their own signal lands in Brief 272 flow with referral context preserved.
15. [ ] Visitor creating request lands in Brief 273 flow with referral context preserved.
16. [ ] Tests cover approved-claim-only generation, channel variants, no autopost, attribution privacy, outcome-share consent/scrub, wrapper bypass rejection including falsy values where guarded tools are invoked, and visitor CTA routing.
17. [ ] Playwright covers Share Studio desktop/mobile and public profile conversion CTAs.

## Review Process

1. Spawn review agent with Briefs 270, 272, 277, Briefs 259-260, architecture/review checklist.
2. Review agent checks claim safety, share psychology, no auto-spam, visitor routing, attribution privacy, and visual asset consistency.
3. Present findings to human.

## Smoke Test

```bash
pnpm vitest run src/engine/share-studio-variants*.test.ts
pnpm --filter @ditto/web test -- share
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual:
# 1. Approve a Member Signal.
# 2. Open Share Studio.
# 3. Generate LinkedIn, X, Instagram, email signature, and website badge variants.
# 4. Edit one variant and copy it.
# 5. Open public profile with ?ref=linkedin.
# 6. Ask about member; then choose "Build your own signal".
# 7. Verify referral context lands in member onboarding.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 277.
3. Consider a design insight for recognition-led sharing if the pattern generalizes.
