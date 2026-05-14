# Brief 271: Network Doctrine, IA, and Superconnector Copy

**Date:** 2026-05-14
**Status:** draft
**Depends on:** Brief 270
**Unlocks:** Briefs 272-279

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** Establish the product doctrine, information architecture, glossary, and copy system that make Ditto Network legible as an AI superconnector.

## Context

The existing `/network` surface has useful lanes and working primitives, but the product language still leans toward lane mechanics: expert profile, client opportunity, candidates, scout, intro. That is not enough. Users need to understand the strategic promise:

- Ditto gives everyone access to a superconnector.
- Ditto makes professional networking less noisy and more human.
- Ditto works for both individual needs and community health.
- Ditto can search now or quietly keep watching.
- Ditto exists to create concrete professional and economic outcomes: useful introductions, client work, hires, funding, partnerships, advisory relationships, and collaborations.

This brief rewrites the top-level IA and copy system before deeper workflow work begins.

## Objective

`/network` becomes a clear Network home/workspace with four primary entry points: "Help Ditto understand me", "Find someone now", "Create a request", and "Keep watch for me." The page explains why Ditto exists, what it does, and how it works without drifting into marketing fluff or internal process language. The first-viewport frame must make clear that the outcome is not more networking activity; it is better professional outcomes from higher-trust connections.

## Non-Goals

- No data model changes.
- No new search/ranking behavior.
- No background watch runtime.
- No public directory.
- No share studio changes.
- No onboarding implementation beyond route/CTA/IA wiring needed to point at future flows.

## Inputs

1. `docs/briefs/270-network-superconnector-reframe-parent.md` - parent thesis and object model.
2. `docs/briefs/254-network-two-sided-conversational-front-door.md` - current Network parent and constraints.
3. `packages/web/components/marketing/network-landing.tsx` - current `/network` landing surface.
4. `packages/web/components/marketing/network-card-preview.tsx` - current animated preview.
5. `packages/web/app/network/chat/` - current lane chat surfaces.
6. `.impeccable.md` - design direction: precise, warm, artifact-first, restrained, progressive disclosure.
7. `docs/dictionary.md` - canonical glossary destination.

## Constraints

- Copy must answer **why**, **what**, and **how** without over-explaining.
- "Superconnector" must be visible in the first viewport.
- "Professional network of the future" should be clear, but avoid hype-heavy replacement claims in UI body copy until the trust/privacy/discovery loop is proven.
- Economic outcomes must be visible in product copy: introductions should be framed as a path to work, hiring, investment, partnerships, advice, customers, collaborators, or other concrete value.
- Manual search and background watch must be visibly distinct.
- Expert/client language may remain where useful, but the primary frame is member/request/search/watch.
- Do not say or imply Ditto will spam, scrape private accounts, or contact people without approval.
- Avoid copy that sounds like a marketplace, recruiting platform, or lead database.
- No visible instructional paragraphs explaining app mechanics unless the text reduces a real user uncertainty.
- Preserve existing public-mode deployment routing.
- Keep mobile first viewport free of overlapping fixed controls.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Four-job IA | Original to Ditto | original | Maps directly to user intent: be understood, search now, create need, keep watch. |
| Superconnector metaphor | Original to Ditto | original | User supplied the canonical metaphor and product thesis. |
| Artifact-first layout | Existing Ditto design direction in `.impeccable.md` | adopt | Keeps Network as a working surface, not a marketing page. |
| Profile-as-chat orientation | Brief 259 | adopt | The representative chat proves Ditto can speak about members with context. |
| Background operating language | Briefs 115-118 operating cycles | adopt | "Watching quietly" maps to existing continuous process model. |
| Economic-outcome framing | Brief 270 + Brief 119 | adopt | Keeps the superconnector promise tied to value creation and preserves the later paid-successful-outcome path. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/dictionary.md` | Modify: add canonical definitions for Superconnector, Member Signal, Need Signal, Active Request, Manual Search, Background Watch, Possible Connection, Introduction Proposal, Network Health, Source Provenance. |
| `packages/web/components/marketing/network-landing.tsx` | Rewrite: make `/network` first viewport a superconnector command surface with four entry points and clear why/what/how copy. |
| `packages/web/components/marketing/network-card-preview.tsx` | Modify: preview should demonstrate "understand me", "request", "search", and "watch" states instead of only expert/client lane cards. |
| `packages/web/app/network/page.tsx` | Modify if needed: pass entry intent into chat/setup routes. |
| `packages/web/app/network/chat/network-chat-shell.tsx` | Modify lightly: accept new entry intent labels without breaking existing `mode=expert|client` paths. |
| `packages/web/app/network/chat/mode-toggle.tsx` | Rename/copy update: move from "expert/client" as top-level identity split to "profile/request" or "understand/search" where appropriate. |
| `packages/web/lib/marketing-analytics.ts` | Modify if present: track `network_entry_selected` with values `member-signal`, `manual-search`, `request`, `background-watch`. |

## User Experience

- **Jobs affected:** Orient, Capture, Define, Delegate.
- **Primitives involved:** Network home, chat entry, live artifact preview, entry-intent state.
- **Process-owner perspective:** The user should know immediately that Ditto can understand them, find people now, turn a need into a request, and keep watching.
- **Interaction states:** first visit, returning member with signal, returning seeker with active requests, unauthenticated visitor, mobile.
- **Designer input:** Required. The first viewport and entry cards are the product's mental model.

## Copy System

### Hero copy candidates

Primary:

> A superconnector for everyone.

Supporting:

> Ditto understands what people are excellent at, what they need, and when a thoughtful introduction could create value.

Alternate:

> The professional network that works while you're not scrolling.

Outcome-led alternate:

> A quieter way to find the people who change the outcome.

### Entry labels

- **Help Ditto understand me**
  Build a living signal from your links, work, and context.

- **Find someone now**
  Search for the person who can change the outcome, with evidence, not guesswork.

- **Create a request**
  Turn a need, opportunity, or target economic outcome into a brief Ditto can work from.

- **Keep watch for me**
  Let Ditto quietly look for strong-fit people and timing.

### Principles

- Use "possible connection", not "candidate", when the relationship is not employment/recruiting.
- Use "request", not "job post", unless the user explicitly frames a job.
- Use "outcome", "useful introduction", and "connection that creates value" where it clarifies why the user is here.
- Use "source", "evidence", and "why this fits", not "AI score" alone.
- Use "ask if they are open", not "contact them".
- Use "watching quietly", not "automating outreach".

## Acceptance Criteria

1. [ ] `/network` first viewport includes the word "superconnector" and communicates the professional-network-of-the-future thesis.
1a. [ ] `/network` first viewport communicates that Ditto is for concrete professional/economic outcomes, not networking activity for its own sake.
2. [ ] `/network` presents the four entry jobs: help Ditto understand me, find someone now, create a request, keep watch for me.
3. [ ] First-time users can distinguish manual search from background watch without reading a long explainer.
4. [ ] Copy explicitly states or implies that Ditto makes fewer, better, consent-based introductions.
5. [ ] Copy avoids marketplace/recruiting/lead-gen framing except where user intent clearly requires "opportunity".
6. [ ] `docs/dictionary.md` includes all canonical terms named in this brief.
7. [ ] Entry intent is tracked in analytics or route state so downstream flows can adapt.
8. [ ] Existing direct links to `/network/chat?mode=expert` and `/network/chat?mode=client` continue to work.
9. [ ] Mobile first viewport has no overlapping fixed CTA/toggle elements at 375px wide and 667px tall.
10. [ ] Empty/loading/error states use the same language system: "reading sources", "drafting signal", "watch active", "needs approval", not generic spinner/error copy.
11. [ ] Focused component tests cover entry rendering, route intent selection, and legacy lane compatibility.
12. [ ] Playwright desktop and mobile screenshots verify the first viewport, entry selection, and route handoff.

## Review Process

1. Spawn review agent with Briefs 270-271, `docs/architecture.md`, `docs/review-checklist.md`, and screenshots of `/network` desktop/mobile.
2. Review agent checks copy clarity, IA, legacy route compatibility, mobile fit, and whether marketplace language leaked in.
3. Human approves or revises before Brief 272/273 build starts.

## Smoke Test

```bash
pnpm --filter @ditto/web test -- network-landing
pnpm --filter @ditto/web type-check
pnpm --filter @ditto/web dev

# Manual:
# 1. Open /network at desktop.
# 2. Verify four entry jobs are visible.
# 3. Click each entry and verify the chat/setup route receives the right intent.
# 4. Open /network at 375x667 and 390x844.
# 5. Verify no overlap, no clipped buttons, and purpose is clear in first viewport.
```

## After Completion

1. Update `docs/state.md`.
2. Update `docs/roadmap.md` row 271 to ready/complete.
3. Capture any durable copy doctrine as a design insight if reviewers find it generalizes beyond Network.
