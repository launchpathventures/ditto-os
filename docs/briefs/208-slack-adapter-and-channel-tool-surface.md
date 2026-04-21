# Brief 208: Slack Adapter + Agent Channel Tool Surface

**Date:** 2026-04-20
**Status:** draft
**Depends on:** ADR-005 (Integration architecture), ADR-031 (OAuth credential platform), existing `ChannelAdapter` interface in `src/engine/channel.ts`
**Unlocks:** Slack-native channel access for Jordan persona (mid-size orgs), closes Slack-shaped gap from Hermes coverage-check, surfaces existing WhatsApp/Telegram/Instagram Unipile adapters as first-class agent tools
**Surfaced by:** Hermes coverage-check 2026-04-20 — Slack is a missing adapter; WhatsApp/Telegram/Instagram exist as adapters but may not be fully tool-surfaced for hired agents

## Goal

- **Roadmap phase:** Cross-cutting channel expansion — adjacent to Hire-a-Specialist (Brief 201). Not a new phase; extends existing ChannelAdapter infrastructure.
- **Capabilities delivered:**
  - Slack channel adapter implementing the existing `ChannelAdapter` interface (`src/engine/channel.ts`)
  - Tool-surface audit + gap-fill for existing Unipile channels (WhatsApp, Telegram, Instagram): every adapter-layer capability is reachable as a named tool in `tool-resolver.ts`
  - Clean extension of `SocialPlatform` enum to include `slack`
  - Channel-adapter documentation updates so future channels (Discord, Signal) can be added as single-PR contributions

## Context

Ditto already has a mature `ChannelAdapter` pattern (`src/engine/channel.ts` — 900+ LOC with AgentMail, Gmail, Unipile, Voice adapters). The Unipile adapter covers LinkedIn, WhatsApp, Instagram, Telegram, X (via separate `XApiClient`). What exists at the adapter layer is NOT fully surfaced as tools an agent can call:

- `crm.send_email` ✓ (covers email)
- `crm.send_social_dm` ✓ (covers LinkedIn, X)
- `social.publish_post` ✓ (covers LinkedIn, X)
- **`messaging.send_whatsapp`** — adapter supports it (Unipile), no tool ✗
- **`messaging.send_telegram`** — adapter supports it (Unipile), no tool ✗
- **`messaging.send_instagram`** — adapter supports it (Unipile), no tool ✗

And Slack is not covered at any layer — adapter missing, tool missing.

The persona argument: **Jordan's use case (50-200 person org, IT/digital-transformation lead) requires Slack.** Rob (tradie) may prefer WhatsApp (already adapter-supported, just tool-surfaced). Nadia's team exchange is Slack-shaped.

This brief is narrower than a full "channel expansion phase" because the infrastructure exists. It's two pieces of focused work: one new adapter, plus tool-surface wiring for what already exists.

## Objective

A hired agent can send a Slack message as a first-class tool call; a hired agent can send a WhatsApp / Telegram / Instagram message via named tool calls that route through the existing Unipile adapter. The `ChannelAdapter` pattern remains the substrate; no new abstraction is introduced.

## Non-Goals

- **New adapter abstraction.** The existing `ChannelAdapter` interface is sufficient. Any temptation to "rethink the adapter contract" is out of scope. If it's not broken, don't rebuild it.
- **Discord adapter.** LOW priority per Hermes coverage-check. Named-triggered (see §After Completion). Not in this brief.
- **Signal adapter.** LOW priority, protocol-complex (Signal has no simple bot API). Named-triggered. Not in this brief.
- **Slack app distribution / marketplace listing.** This brief ships the adapter capability; users bring their own Slack workspace + bot token. Public app distribution is a separate marketing decision.
- **Interactive Slack messages (buttons, modals, block kit).** v1 ships text-message send. Rich interaction is a follow-up if demand surfaces.
- **Inbound Slack (receive + route to Self).** v1 is outbound only. Inbound + event subscription is a larger piece of work, scoped separately.
- **Slack OAuth app flow for hosted deployments.** v1 uses bot-token credentials per workspace (ADR-031 credential store pattern). Full OAuth install flow is follow-up if hosted multi-tenant Slack demand surfaces.
- **New channel abstraction for agent-to-agent messaging.** Agents don't talk to each other (ADR-037 explicit).
- **Paperclip adapter-plugin loader pattern adoption.** Studied in the Paperclip deep-dive as a future option, not adopted here. When Ditto has > 4 channel adapters and community contributions emerge, revisit.

## Inputs

1. `src/engine/channel.ts` — existing `ChannelAdapter` interface, `UnipileAdapter` implementation (primary reference)
2. `src/engine/tool-resolver.ts` — `crm.send_email`, `crm.send_social_dm`, `social.publish_post` tool shapes (pattern reference)
3. `docs/adrs/005-integration-architecture.md` — credential resolution
4. `docs/adrs/031-oauth-credential-platform.md` — credential storage patterns
5. `docs/landscape.md` Paperclip entry — HTTP-adapter pattern as a future extension model (referenced, not adopted)
6. Slack Web API documentation — specifically `chat.postMessage` (the only endpoint v1 uses)
7. Slack SDK for Node (`@slack/web-api`) — evaluate depend vs. minimal fetch-based client

## Constraints

- **Engine-first discipline:** The `SlackAdapter` class goes in `src/engine/channel.ts` alongside the other adapters (which is where `AgentMailAdapter`, `UnipileAdapter`, etc. live). It's Ditto-product code, not `@ditto/core` — channels are a product concept, not an engine primitive.
- **`ChannelAdapter` interface is the contract.** `SlackAdapter implements ChannelAdapter`. Do not depart from the interface; any method that doesn't fit the interface is a signal to reconsider, not to extend.
- **Credential resolution per ADR-031.** Slack bot token stored in `credentials` table, resolved at invocation time, never logged. Per-workspace scoping (one Slack workspace per Ditto workspace in v1).
- **Rate limiting.** Add a row to the rate-limit table matching the existing pattern (`PLATFORM_DAILY_LIMITS[slack] = 300`). Tier selected from Slack's published rate limits (Tier 2 for `chat.postMessage` = 20/min conservatively = ~600/hour; cap at 300/day per workspace for v1 safety).
- **SSRF / injection:** Slack message content may contain user-supplied text. Escape per Slack's mrkdwn rules if needed; do not eval or interpolate into URLs.
- **`sendAndRecord` integration.** All Slack sends go through the existing `sendAndRecord()` function in channel.ts. No parallel send path. Atomic send + record + interaction logging is non-negotiable.
- **Invocation guard (Insight-180).** `messaging.send_slack`, `messaging.send_whatsapp`, `messaging.send_telegram`, `messaging.send_instagram` all produce external side effects. MUST require `stepRunId` at the tool boundary.
- **Terminology lock (from Brief 201 / ADR-037).** User-facing references to these channels use channel names ("Slack," "WhatsApp") — never "IM," "messaging platform," or generic "chat." Tool names use the `messaging.*` namespace for personal/DM channels and the `social.*` namespace for public-post channels, consistent with existing convention.
- **Credential MUST NOT appear in any log output, error message, or activity record.** Slack bot tokens begin with `xoxb-`; linter pattern must catch this shape if it appears on disk or in logs.

## Provenance

| What | Source | Level | Why this source |
|---|---|---|---|
| ChannelAdapter interface | Ditto `src/engine/channel.ts` | extend | Existing, proven pattern; 5 adapters already implement it |
| `sendAndRecord()` atomic send + log | Ditto `src/engine/channel.ts` | extend | All channel sends must use this |
| Slack Web API `chat.postMessage` | Slack (https://api.slack.com/methods/chat.postMessage) | depend | The single endpoint needed for v1 outbound |
| Slack SDK (`@slack/web-api`) | Slack official SDK | evaluate: depend vs minimal fetch | Pattern: Ditto prefers minimal fetch clients (see `XApiClient` in channel.ts); defer dep decision to build |
| Rate-limit table pattern | Ditto `PLATFORM_DAILY_LIMITS` | extend | Consistent with other channels |
| Credential resolution | ADR-031 OAuth credential platform | extend | Per-workspace bot token storage |
| `crm.send_social_dm` tool shape | Ditto `src/engine/tool-resolver.ts` line 362 | extend | Identical shape for new messaging tools |
| Paperclip `http` adapter pattern | `packages/adapters/openclaw-gateway/` | pattern | Studied for future community-adapter extensibility; not adopted now |

## What Changes (Work Products)

| File | Action |
|---|---|
| `src/engine/channel.ts` | Modify: (a) extend `SocialPlatform` type to include `"slack"`; (b) add `SlackAdapter implements ChannelAdapter` class (~150 LOC); (c) add `slack` to `PLATFORM_DAILY_LIMITS` + rate-limit enforcement; (d) ensure `sendAndRecord` routes Slack platform through the new adapter |
| `src/engine/channel.test.ts` | Modify: add Slack send tests + rate-limit tests + credential-resolution tests |
| `src/engine/tool-resolver.ts` | Modify: add 4 new tools: `messaging.send_slack`, `messaging.send_whatsapp`, `messaging.send_telegram`, `messaging.send_instagram`. Each routes through `sendAndRecord()` with the appropriate platform enum. Requires `stepRunId` per Insight-180. |
| `src/engine/tool-resolver.test.ts` | Modify: add ~8 tests covering each new tool's happy path + invocation-guard enforcement |
| `src/db/schema/*` or existing credentials table | No change — Slack bot token stored via existing `credentials` table schema; `credentialType: "slack_bot_token"` value added to existing union |
| `src/db/schema/product.ts` (or wherever credentialType enum lives) | Modify: add `"slack_bot_token"` to union |
| `drizzle/NNNN_slack_credential_type.sql` | New (small) migration: no table changes, but credentialType text-union gets a new value documented |
| `docs/landscape.md` | Modify: Paperclip entry's channel-adapter-related lines don't need change, but a brief note under "New since landscape entry" that Ditto has a local equivalent pattern may be worth recording |
| `docs/adrs/040-channel-adapter-extensibility.md` (optional) | Decide at build start: do we need an ADR for the channel-adapter extensibility pattern, or is it already sufficiently documented in code + existing ADR-005? **Default: no ADR** — extension is mechanical, pattern is established. Revisit if contributors emerge or Discord/Signal work reveals seams. |

No new schema migrations beyond a text-union value.

## User Experience

- **Jobs affected:** Delegate (user can now delegate Slack / WhatsApp / Telegram / Instagram actions to hired agents), Capture (inbound work flowing via these channels — deferred to future inbound brief)
- **Primitives involved:** None directly user-facing in this brief. Tools are invoked by hired agents / process steps. The Agent Detail → Configuration tab (Brief 205) lists which channels an agent is permitted to use via its `scope` field (ADR-037); this brief makes those channels real for Slack.
- **Process-owner perspective:** The user connects a Slack workspace via an admin setup flow (bot token paste, outside v1 scope — documented as a manual onboarding step). Once connected, the user tells their hired agent *"send a quick note to #sales about the quarterly review"* and the agent invokes `messaging.send_slack`.
- **Interaction states:** N/A — tool-layer work. User-facing states emerge in future composition briefs (e.g., a Slack-inbox routing brief) that consume these tools.
- **Designer input:** Not required for this brief. Slack connection UI + channel-picker affordance for hired agents is follow-up work; would invoke `/dev-designer` when a dedicated "connect a channel" UI emerges.

## Acceptance Criteria

1. [ ] `SlackAdapter implements ChannelAdapter` is registered and callable; `sendAndRecord` with `platform: "slack"` routes through it.
2. [ ] `messaging.send_slack` tool in `tool-resolver.ts` accepts `to` (channel id or user id), `body` (text); rejects missing fields with a structured error.
3. [ ] Slack bot token is resolved from the `credentials` table with `credentialType: "slack_bot_token"`; never appears in logs, activities, or error messages.
4. [ ] Rate limit of 300 messages/day per Slack workspace enforced via existing `checkRateLimit` pattern; exceeded limit returns a structured error without attempting the API call.
5. [ ] Send failures (API error, network error, rate-limit exceeded) are recorded in the `interactions` table with the correct failure reason.
6. [ ] `messaging.send_whatsapp`, `messaging.send_telegram`, `messaging.send_instagram` tools in `tool-resolver.ts` each route through `UnipileAdapter` via `sendAndRecord`; each has validation + happy-path test coverage.
7. [ ] All four new tools (`messaging.send_slack` + 3 Unipile ones) require `stepRunId` per Insight-180; calls without `stepRunId` throw at runtime.
8. [ ] `DITTO_TEST_MODE=true` suppresses outbound sends across all four new tools (consistent with existing channel test-mode pattern).
9. [ ] `sendAndRecord` records interactions for all four channels with the correct `channel` enum value.
10. [ ] No credential value appears in any file scan of `activities` table content, log output, or error messages.
11. [ ] Linter or pre-commit hook (or test-level pattern check) rejects any commit containing a raw `xoxb-` token.
12. [ ] Type-check passes cleanly at root (`pnpm run type-check`).
13. [ ] Smoke test: connect a dev Slack workspace (bot token manually provisioned), send a message to a test channel via `messaging.send_slack` invoked through Self or CLI, verify message appears in Slack + `interactions` row recorded.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `src/engine/channel.ts` (existing patterns) + this brief
2. Review agent checks:
   - `ChannelAdapter` contract honored; no new methods sneak in
   - Rate limits match Slack's documented limits (conservative, not optimistic)
   - Credential handling: no leakage in any output path
   - `sendAndRecord` used for all sends; no parallel path
   - `stepRunId` invocation guard enforced for each new tool
   - Tool-naming convention (`messaging.*` for DM, `social.*` for public post, `crm.*` retained for existing email surface) is consistent
   - `SocialPlatform` union expansion doesn't break existing exhaustiveness checks
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Prerequisite: Slack bot token manually provisioned in dev
# Store via CLI: pnpm ditto credential set slack_bot_token xoxb-...

# 1. Type-check
pnpm run type-check

# 2. Unit tests
pnpm test src/engine/channel.test.ts
pnpm test src/engine/tool-resolver.test.ts

# 3. Smoke — real Slack send (requires DITTO_TEST_MODE=false + real token)
# Invoke via Self: "Send a test message to #dev saying 'Brief 208 smoke test successful'"
# Verify:
#   - Message appears in Slack #dev channel
#   - `select * from interactions order by id desc limit 1` shows the send record
#   - `select * from cost_events order by id desc limit 1` shows no row (no LLM cost for a send)
#   - Logs contain no substring matching /xoxb-\S+/

# 4. Smoke — WhatsApp / Telegram / Instagram (each requires respective Unipile account id)
# Repeat pattern per channel
```

## After Completion

1. Update `docs/state.md` — Recently Completed; Slack gap closed; WhatsApp/Telegram/Instagram now tool-surfaced
2. Update `docs/landscape.md` — add a note to Paperclip entry's "already adopted" row that Slack is now locally supported via the same ChannelAdapter pattern
3. Retrospective
4. **Discord / Signal — named-trigger parking:**
   - Discord: write a brief when the first hired-agent spec declares `requires: discord` OR a user requests it in dogfood feedback. No speculative work.
   - Signal: write a brief when the first user requests it. Likely requires deeper protocol work; may trigger an ADR on messaging-protocol-specific adapters.
5. Move brief to `docs/briefs/complete/`

## Sizing Note (Insight-004 Compliance)

13 acceptance criteria, one subsystem (channel/tool-resolver), extends existing patterns. Within the 8-17 AC band. One build session. No sub-brief split needed.
