# Brief: Unipile Social Channel Spike + Adapter

**Date:** 2026-04-11
**Status:** complete
**Depends on:** Brief 124 (ghost mode email infrastructure), Brief 132 (parent design)
**Unlocks:** Ghost-mode LinkedIn DMs, WhatsApp messages, social channel process templates

## Goal

- **Roadmap phase:** Phase 9: Network Agent Continuous Operation
- **Capabilities:** Unified social channel sending via Unipile, LinkedIn DM ghost mode, multi-channel ghost process templates

## Context

Ghost mode email (Brief 124) proved the harness infrastructure is channel-agnostic: identity resolution, voice calibration, cognitive mode, and trust gate all work without knowing the delivery channel. The missing piece is a social channel adapter.

Research identified Unipile (€5/connected account/month) as a unified messaging API covering LinkedIn, WhatsApp, Instagram, Messenger, Telegram, and X — with a Node.js SDK (`unipile-node-sdk` on npm, TypeScript). This brief validates Unipile via a time-boxed spike, then builds the production adapter if validation passes.

If Unipile fails validation, the fallback is HeyReach ($79/mo) for LinkedIn-only. The adapter interface remains the same — only the backend changes.

## Objective

Alex can send ghost-mode LinkedIn DMs (and optionally WhatsApp/Instagram messages) via Unipile, with all existing harness infrastructure working unchanged. The user connects their LinkedIn account once via Unipile, and Alex can send as them.

## Non-Goals

- Browser automation for sending (separate concern — Brief 134)
- Voice/video calls on social platforms
- Social content publishing (posts, stories — different from DMs)
- Multi-platform campaign orchestration (one message at a time, not batch)
- Custom domain or branding on social platforms (platforms control display)

## Inputs

1. `docs/research/linkedin-ghost-mode-and-browser-automation.md` — Unipile evaluation and alternatives
2. `docs/insights/174-unified-channel-apis-over-per-platform-automation.md` — design rationale
3. `src/engine/channel.ts` — existing ChannelAdapter interface and AgentMail adapter pattern
4. `packages/core/src/harness/handlers/identity-router.ts` — identity resolution (already supports ghost)
5. `packages/core/src/harness/handlers/voice-calibration.ts` — voice model loading (channel-agnostic)
6. `src/engine/harness-handlers/memory-assembly.ts` — ghost mode cognitive injection (channel-agnostic)
7. Unipile Node SDK docs: https://developer.unipile.com/docs/nodejs-sdk

## Constraints

- Time-box the spike to 1 day. If Unipile can't send a LinkedIn DM via API in 1 day, switch to HeyReach fallback.
- Unipile API key and connected accounts stored in credential vault per ADR-005 — never exposed to agents.
- Social ghost sends MUST traverse the full harness pipeline (identity-router → voice-calibration → trust-gate → outbound-quality-gate → send). No shortcutting.
- Ghost mode trust tier stays critical for social channels — same as email. No auto-upgrade.
- User must explicitly connect their LinkedIn (and other social accounts) via Unipile's auth flow before ghost mode is available on that channel.
- LinkedIn daily limits (~50 DMs/day) must be respected. Adapter must track and enforce rate limits.
- No storing LinkedIn session cookies or tokens directly — Unipile manages sessions.
- `DITTO_TEST_MODE` must suppress social sends the same way it suppresses email sends. Allowlisting uses platform-specific identifiers (LinkedIn profile URL or Unipile ID) instead of email addresses.
- `ChannelAdapter.search()` and `reply()` are out of scope for v1 — adapter stubs should return empty results / throw not-implemented.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Unified messaging API | Unipile (`unipile-node-sdk`) | depend (candidate) | Clean REST API, multi-channel, handles session management and anti-detection |
| Channel adapter pattern | `src/engine/channel.ts` AgentMailAdapter | adopt | Proven pattern — extend for social channels |
| Ghost mode identity | Brief 124 infrastructure | adopt | Channel-agnostic, works as-is |
| Credential vault | ADR-005 | adopt | Existing pattern for integration credentials |
| Rate limiting | LinkedIn platform limits | pattern | Enforce ~50 DMs/day to avoid account restriction |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/channel.ts` | Modify: extend `ChannelAdapter.channel` union to include `"social"`. Add `UnipileAdapter implements ChannelAdapter`. Add `createUnipileAdapterForUser(userId)` factory. |
| `src/engine/channel.ts` | Modify: update `OutboundMessage` — make `subject` optional (social DMs have no subject), add optional `platform` field (`"linkedin" \| "whatsapp" \| "instagram" \| "telegram"`) for social routing, document that `to` is a platform-specific identifier for social (Unipile recipient ID or handle, not email) |
| `src/engine/channel.ts` | Modify: update `sendAndRecord()` — route to UnipileAdapter when `mode === "ghost"` and platform is social |
| `src/engine/channel-social.test.ts` | Create: tests for UnipileAdapter — message formatting (no branding), platform routing, rate limit enforcement |
| `src/engine/unipile-spike.test.ts` | Create: spike validation tests — can connect, can send LinkedIn DM, can receive delivery confirmation |
| `processes/templates/ghost-linkedin-dm.yaml` | Create: ghost mode LinkedIn DM process — validate-eligibility → draft → trust-gate → send. Same structure as ghost-follow-up.yaml but for LinkedIn. |
| `.env.example` | Modify: add `UNIPILE_API_KEY`, `UNIPILE_DSN` environment variables |

## User Experience

- **Jobs affected:** Delegate (ghost mode on social channels), Review (social DM drafts in trust gate), Orient (daily brief includes social sending activity)
- **Primitives involved:** TrustControl (critical tier for social ghost), Review Queue (social drafts surface here), Activity Feed (sent/delivered/replied events)
- **Process-owner perspective:** "Alex, send Sarah a LinkedIn message following up on our call." Alex drafts in the user's voice, presents for approval (first time to new recipient), sends via LinkedIn. User sees the message in their LinkedIn Sent. No setup beyond connecting LinkedIn via Unipile once.
- **Interaction states:**
  - LinkedIn not connected → "Connect your LinkedIn account to enable ghost mode on LinkedIn" (one-time setup link)
  - Ghost DM pending approval → same trust gate review as email ghost mode
  - Ghost DM sent → confirmation in activity feed
  - Rate limit reached → "I've hit LinkedIn's daily message limit. I'll send the remaining messages tomorrow."
- **Designer input:** Not invoked — ghost mode surfaces through existing review queue and activity feed

## Acceptance Criteria

1. [ ] Spike: Unipile SDK can connect to a test LinkedIn account and send a DM via API
2. [ ] Spike: delivery confirmation is received (webhook or polling) after DM is sent
3. [ ] Spike: rate limit information is available from Unipile API
4. [ ] `UnipileAdapter` implements `ChannelAdapter` with `channel: "social"`
5. [ ] Social ghost messages have NO Ditto branding (same rules as email ghost)
6. [ ] Social ghost messages traverse full harness pipeline (identity-router → voice-calibration → trust-gate → outbound-quality-gate → send)
7. [ ] `OutboundMessage` has optional `platform` field for social channel routing
8. [ ] `sendAndRecord()` routes to UnipileAdapter when sendingIdentity is ghost and platform is social
9. [ ] Rate limiting: adapter tracks daily send count per platform and refuses when limit reached
10. [ ] Unipile credentials stored in env vars (vault pattern per ADR-005), never exposed to agents
11. [ ] Ghost LinkedIn DM process template has `initial_tier: critical` with empty `upgrade_path`
12. [ ] First ghost DM to a new recipient pauses for user approval (trust gate)
13. [ ] If Unipile spike fails (AC1-3), document findings and switch to HeyReach fallback plan
14. [ ] `pnpm run type-check` passes

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks: Harness pipeline traversal (no shortcuts), trust enforcement (critical tier), credential handling (ADR-005), rate limiting, channel abstraction clean separation
3. Present work + review to human

## Smoke Test

```bash
# Type check
pnpm run type-check

# Unit tests
pnpm vitest run src/engine/channel-social.test.ts

# Spike validation (requires UNIPILE_API_KEY)
pnpm vitest run src/engine/unipile-spike.test.ts

# Manual: connect LinkedIn via Unipile, send test DM
# Verify: message appears in recipient's LinkedIn inbox, no Ditto branding
```

## After Completion

1. Update `docs/state.md`: "Social channel ghost mode: Unipile adapter, LinkedIn DM ghost process"
2. Update Insight-174 status from "provisional" to "active" (or "rejected" if Unipile failed)
3. Update `docs/landscape.md`: add Unipile evaluation
4. If Unipile validated: write ADR for unified messaging API pattern
5. Retrospective: Unipile reliability, API ergonomics, rate limit handling
