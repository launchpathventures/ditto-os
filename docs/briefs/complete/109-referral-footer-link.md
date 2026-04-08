# Brief 109: Referral Footer Link — Two-Sided Acquisition in Every Email

**Date:** 2026-04-08
**Status:** draft
**Depends on:** None (can be built independently)
**Unlocks:** Two-sided acquisition loop (Insight-155), network effect growth

## Goal

- **Roadmap phase:** Phase 14 (Network Agent — growth loop)
- **Capabilities:** Every outgoing Alex email includes a "Want your own advisor?" referral link, tracked as an acquisition channel

## Context

Insight-155 identifies every outreach email as a two-sided acquisition channel: the sender gets value (introductions, connections), and the recipient experiences Alex's quality. If impressed, the recipient can become a user — completing the network effect loop.

The referred visitor path (`/welcome/referred`) already exists and provides a warmer conversion experience. The missing piece is the link FROM Alex's emails TO the referred path.

## Objective

Add a referral footer link to every outgoing Alex email. Track referral clicks as a first-class acquisition metric.

## Non-Goals

- **Referral incentives** — no rewards, credits, or discounts for referrals. The quality of Alex's work is the incentive.
- **Customisable footer text** — one standard footer for V1.
- **Referral tracking dashboard** — tracked in funnel events, viewable via admin. No dedicated UI.

## Inputs

1. `src/engine/channel.ts` — `sendAndRecord()` email sending function
2. `docs/insights/155-outreach-is-two-sided-acquisition.md` — the acquisition insight
3. `packages/web/app/welcome/referred/` — existing referred visitor page

## Constraints

- Footer must not compete with the email's primary purpose — subtle, one line, below the opt-out link
- Footer appears in EVERY Alex email (connector, CoS briefings, status updates, follow-ups)
- Referral link must include a tracking parameter so we know which email drove the click
- Footer text must be warm and on-brand, not salesy

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Email footer referral | Standard SaaS growth loop (Dropbox, Superhuman) | pattern | Every touchpoint is a potential acquisition moment |
| Referral tracking via URL parameter | UTM tracking pattern | pattern | Standard attribution mechanism |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/channel.ts` | Modify: `sendAndRecord()` appends referral footer to every email body. Footer: "---\nKnow someone who'd benefit from an advisor like me? [link]" with `?ref=[userId]` tracking parameter |
| `packages/web/app/welcome/referred/page.tsx` | Modify: Extract `ref` query parameter, store in funnel event for attribution |
| `src/engine/channel.test.ts` | Modify: Add test verifying referral footer is appended to outgoing emails |

## User Experience

- **Jobs affected:** None for sender. For recipient: Orient (discovers Ditto exists)
- **Process-owner perspective:** Invisible to the sender. Recipients see a small footer below Alex's email: "Know someone who'd benefit from an advisor like me? dittoai.com/welcome/referred?ref=..." Clicking it lands them on the warmer referred visitor page.
- **Designer input:** Not invoked — one line of footer text, no UI design needed

## Acceptance Criteria

1. [ ] Every email sent via `sendAndRecord()` includes a referral footer line after the opt-out line (when present) or at the end of the body
2. [ ] Footer text: `"---\nKnow someone who'd benefit from an advisor like me? [BASE_URL]/welcome/referred?ref=[userId]"` — warm, one line, not salesy
3. [ ] `ref` parameter tracked: when a referred visitor loads `/welcome/referred?ref=xxx`, the ref value is stored in a funnel event with `event: "referred_click"` and `metadata.referredBy: userId`
4. [ ] Referral footer uses `NETWORK_BASE_URL` env var for the link domain
5. [ ] Footer does not appear if `includeOptOut` is explicitly `false` AND the email is internal (prevents footer on system-to-system emails, if any)
6. [ ] Unit test verifies footer is appended to outgoing email body
7. [ ] Unit test verifies referral link includes userId parameter

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: footer doesn't break email formatting, tracking parameter doesn't leak PII (userId is an opaque UUID), opt-out and referral footer ordering is correct
3. Present work + review findings to human for approval

## Smoke Test

```bash
pnpm test -- --grep "channel|referral"
pnpm run type-check
```

## After Completion

1. Update `docs/state.md`
2. Insight-155's acquisition loop is now implemented end-to-end

Reference docs checked: Insight-155 consistent, no drift.
