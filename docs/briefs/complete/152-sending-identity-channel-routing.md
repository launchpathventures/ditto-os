# Brief 152: Sending Identity Channel Routing

**Date:** 2026-04-14
**Status:** complete
**Depends on:** Brief 116 (operating cycle handlers — identity-router, outbound-quality-gate), Brief 124 (ghost mode), Brief 151 (outreach dedup + staged dispatch)
**Unlocks:** End-to-end outreach cycles with correct sending identity, Google Workspace OAuth integration, workspace graduation credential handoff

## Goal

- **Roadmap phase:** Phase 12: Network Agent at Scale
- **Capabilities:** Sending identity resolution at runtime, multi-channel email routing, Google Workspace OAuth for ditto-network users, credential migration on workspace graduation

## Context

Alex's outreach cycles (selling, connecting, nurture) are running end-to-end via AgentMail (`crm.send_email`). Three sending identities exist (Insight-166): **principal** (Alex at Ditto), **agent-of-user** (user's branded agent), **ghost** (Alex-as-user). The identity-router handler (Brief 116) resolves which identity to use per step. The outbound-quality-gate (Brief 129) enforces house values post-execution.

The gap: **there is no runtime bridge between the resolved sending identity and the actual email delivery channel.** The `crm.send_email` built-in tool always sends via AgentMail as Alex — it ignores the `sendingIdentity` on `HarnessContext`. The sub-process templates originally referenced `google-workspace.send_message` for LAND steps, but nobody has connected Google Workspace and the integration requires OAuth credentials that don't exist yet.

The federated deployment model (ADR-025) adds a constraint: Google OAuth tokens are scoped to redirect URIs. A token issued to `ditto.network/callback` cannot be used by `workspace-abc.railway.app/callback`. Re-auth is unavoidable at workspace graduation, but it should feel seamless.

## Objective

Make the harness resolve the correct email delivery channel at runtime based on the step's sending identity and the user's connected integrations — without changing process template YAML. AgentMail is the universal fallback; Google Workspace is the upgrade path for `agent-of-user` and `ghost` identities.

## Non-Goals

- **Building the Google Workspace OAuth flow end-to-end.** This brief designs the architecture and the channel routing. The OAuth implementation (consent screen, callback handler, token refresh) is a separate builder brief.
- **Multi-user credential management.** MVP is single-user (`userId: "founder"`). Multi-user credential scoping is deferred.
- **Calendar or Sheets integration.** Only Gmail send scope is required for sending identity routing. Calendar/Sheets are future.
- **Per-message display name on AgentMail.** AgentMail sets display name at inbox level, not per-message. Ghost mode via AgentMail uses Alex's inbox display name — a known limitation documented in Brief 124.
- **Workspace graduation automation.** This brief designs the credential migration experience; the workspace provisioning system (Brief 089) is separate.

## Inputs

1. `docs/adrs/025-centralized-network-service.md` — deployment topology, workspace seed, Network → Workspace boundary
2. `docs/insights/166-connection-first-commerce-follows.md` — three sending identities definition
3. `docs/insights/161-email-workspace-boundary.md` — email/workspace boundary, notification routing
4. `src/engine/channel.ts` — `sendAndRecord()`, `OutboundMessage.sendingIdentity`, `ChannelAdapter` interface
5. `src/engine/tool-resolver.ts` — built-in tools, `crm.send_email` implementation (currently ignores sendingIdentity)
6. `packages/core/src/harness/harness.ts` — `HarnessContext.sendingIdentity`, identity-router handler
7. `processes/cycles/*.yaml` — cycle definitions with `defaultIdentity` fields
8. `processes/templates/selling-outreach.yaml` — LAND step using `crm.send_email`
9. `integrations/google-workspace.yaml` — existing integration definition (CLI-based, needs OAuth extension)
10. `packages/core/src/db/schema.ts:640` — `credentials` table (processId + service scoped, encrypted)
11. `docs/briefs/035-credential-vault-auth-unification.md` — credential vault architecture

## Constraints

- **No process template changes for channel routing.** Templates declare `crm.send_email` — the routing layer resolves the actual delivery channel. Templates should not need to know which channel is available.
- **AgentMail is always available.** It's the default, the fallback, and the only channel that works without user integration setup. All three identities must work (perhaps degraded) via AgentMail alone.
- **Identity-router handler is engine (core).** Channel routing is Ditto product layer. The harness sets `sendingIdentity` on context; the product layer's tool execution reads it to pick the channel.
- **Credentials table is engine (core).** But the OAuth flow that populates it is Ditto product. The credential query (`hasIntegration(userId, service)`) belongs in the product layer.
- **Side-effecting functions must require `stepRunId` parameter per Insight-180.** Any new send function must receive `stepRunId` from the harness.
- **Google OAuth tokens stored encrypted.** Use the existing `credentials` table with AES-256-GCM encryption (ADR-005, Brief 035). Service key: `google-workspace`. Scope: `(processId, service)` — for network-level credentials, use a synthetic `processId` like `__network__`.
- **Token refresh must be transparent.** Google access tokens expire after 1 hour. The channel adapter must handle refresh using the stored refresh token, updating the credential row atomically. MVP is single-user/single-process, so no concurrent refresh contention. For multi-user, add optimistic locking (version column) — deferred.
- **Decrypted tokens confined to adapter internals.** Decrypted Google OAuth tokens must never appear in tool return values, agent messages, logs, or `HarnessContext`. They exist only inside `GmailApiAdapter` method scope. The `executeIntegrationTool` context parameter passes only `sendingIdentity`, `userId`, `stepRunId` — never credentials or the full `HarnessContext`.
- **Channel routing decisions must be logged.** When `resolveEmailChannel()` selects a channel (and especially when it falls back from preferred to fallback), log the decision as an activity for the learning layer. This enables: "How often does agent-of-user fall back to AgentMail?" and "Did the user connect Google Workspace after seeing fallback behavior?"
- **HKDF key derivation consistency.** Google Workspace credentials must use the same key derivation pattern as existing credential vault (Brief 035). Verify the existing implementation and match it.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Identity → channel resolution at tool execution | Composio entity-based tool resolution | pattern | Composio resolves per-user tool instances at execution time based on connected accounts — same concept |
| OAuth token storage in encrypted credential vault | ADR-005, Brief 035 | depend | Existing infrastructure, just adding a new service key |
| Fallback chain (preferred → fallback) for tool execution | Vercel AI SDK provider fallback | pattern | Provider fallback is a solved pattern — apply to channels |
| Gmail API via googleapis SDK | Google APIs Node.js Client | depend | Mature, official SDK. CLI (`gws`) is inappropriate for server-side OAuth — SDK gives programmatic token management |
| Re-auth UX on context change | Slack workspace migration, HubSpot portal transfer | pattern | Both prompt re-auth with pre-filled account when moving between organizational contexts |

## What Changes (Work Products)

### Sub-brief 153: Channel Resolution Layer (builds the routing)

| File | Action |
|------|--------|
| `src/engine/channel-resolver.ts` | Create: `resolveEmailChannel(sendingIdentity, userId)` — returns `{ adapter: ChannelAdapter, fromAddress: string, displayName: string }` based on identity + available integrations |
| `src/engine/tool-resolver.ts` | Modify: `crm.send_email` execute function reads `sendingIdentity` from execution context and calls `resolveEmailChannel()` to pick the adapter. Pass `sendingIdentity` through to `sendAndRecord()` |
| `src/engine/channel.ts` | Modify: Add `GmailApiAdapter` implementing `ChannelAdapter` using `googleapis` SDK (not CLI). Add `resolveAdapter(sendingIdentity, userId)` that checks credential availability |
| `src/engine/integration-availability.ts` | Create: `hasIntegration(userId, service): Promise<boolean>` — checks `credentials` table for a non-expired credential for the given service. `getGoogleCredential(userId): Promise<GoogleTokens | null>` — decrypts and returns tokens, handles refresh |
| `packages/core/src/db/schema.ts` | Modify: Make `credentials.processId` nullable, add `credentials.userId` column. Migration in `drizzle/` |

### Sub-brief 154: Google Workspace OAuth for Network (builds the auth flow)

| File | Action |
|------|--------|
| `src/engine/google-oauth.ts` | Create: Google OAuth2 flow — `getAuthUrl(userId, scopes)`, `handleCallback(code, userId)`, `refreshAccessToken(userId)`. Uses `googleapis` SDK. Stores tokens in `credentials` table |
| `packages/web/app/api/integrations/google/route.ts` | Create: OAuth initiation endpoint — redirects to Google consent screen with correct scopes |
| `packages/web/app/api/integrations/google/callback/route.ts` | Create: OAuth callback — exchanges code for tokens, stores in credential vault, redirects to success page |
| `integrations/google-workspace.yaml` | Modify: Add `rest` interface with OAuth2 auth type alongside existing CLI interface |
| `src/engine/self-tools/connect-service.ts` | Modify: Add `auth_type: 'oauth2'` handling — for OAuth services, return a `connectionUrl` instead of a `credentialRequest` field. The URL initiates the OAuth flow directly |
| `packages/core/src/content-blocks.ts` | Modify: Add `SendingIdentityChoiceBlock` content block type — three-card choice (principal, agent-of-user, ghost) with descriptions and trade-offs |
| `packages/web/components/blocks/sending-identity-choice.tsx` | Create: UI renderer for `SendingIdentityChoiceBlock` — three cards, tap to select, clear descriptions |
| `src/engine/self-tools/cycle-tools.ts` | Modify: `ActivateCycleInput` gains optional `sendingIdentity` field. When omitted and cycle requires identity choice, return `pendingIdentityChoice: true` in result so Self knows to ask |
| `src/engine/self.ts` | Modify: Delegation guidance adds identity choice awareness — when `activate_cycle` returns `pendingIdentityChoice`, Self presents the `SendingIdentityChoiceBlock` and waits for user selection before proceeding |
| `src/engine/surface-actions.ts` | Modify: Handle `identity-choice` action — user taps a card, action routes to `activate_cycle` with the chosen `sendingIdentity` |
| `docs/landscape.md` | Modify: Add `googleapis` (Google APIs Node.js Client) evaluation |

### Sub-brief 155: Credential Migration on Workspace Graduation (builds the handoff)

| File | Action |
|------|--------|
| `src/engine/workspace-seed.ts` | Modify: Include `pendingIntegrations` in seed export — list of services the user had connected on the network, with account hints (email address, not tokens) |
| `packages/web/app/setup/integrations/page.tsx` | Create: Post-graduation integration reconnection page — shows which integrations need reconnecting with pre-filled account hints and explains why |

## Architecture: Channel Resolution Design

### The Simplified Identity Model

**Two sending identities, not three.** The original design (Insight-166) defined three identities: principal, agent-of-user, and ghost. In practice, agent-of-user and ghost are the same thing from the user's perspective — if Alex sends from your email, Alex should sound like you. The distinction was an engineering abstraction that leaked into UX.

| Identity | Meaning | Email Channel | Voice |
|----------|---------|---------------|-------|
| **Send as Alex** (`principal`) | Alex sends from Alex's inbox in Alex's voice | AgentMail | Alex's professional voice |
| **Send from my email** (`user`) | Alex sends from user's Gmail in user's voice | Gmail API | User's learned voice |

The `agent-of-user` and `ghost` values in existing code are **collapsed into a single `user` identity.** Internally, the harness still supports the values for backward compatibility with existing cycle YAML, but they resolve identically: Gmail + user's voice.

### Gmail as Intelligence Source, Not Just Send Channel

When the user connects Gmail for "send from my email," the OAuth scope includes read access to sent mail. This is not scope creep — it's the minimum viable integration:

1. **Voice learning** — Alex scans the user's sent folder to learn their writing style (tone, formality, greeting patterns, sign-offs, typical length). No manual voice samples needed.
2. **Contact extraction** — Alex builds the people graph from email history (who does the user email, how often, what's the relationship pattern). Enriches the network with real relationships rather than cold imports.
3. **Context understanding** — recent conversations, ongoing threads, who introduced whom. Alex arrives informed, not cold.

**Scopes required:**
- `gmail.send` — send email as user
- `gmail.readonly` — read sent mail for voice learning + contact extraction
- `userinfo.email` — verify account identity

**Privacy boundary:** Alex reads sent mail for learning, never forwards content, never includes raw email text in logs or agent context. Voice model is a statistical summary (patterns, not content). Contact extraction stores names/emails/frequency, not message bodies.

### The Resolution Chain

```
Process template (YAML)
  └── step.tools: [crm.send_email]
        └── tool-resolver.ts: crm.send_email.execute()
              └── reads HarnessContext.sendingIdentity (set by identity-router handler)
              └── calls resolveEmailChannel(sendingIdentity, userId)
                    ├── principal → AgentMail (Alex sends as Alex)
                    └── user → Gmail API if connected, else AgentMail fallback
              └── calls sendAndRecord() with resolved adapter + identity
```

### Identity × Channel Matrix

| Sending Identity | Gmail Connected | Gmail NOT Connected |
|-----------------|----------------|---------------------|
| **principal** (Send as Alex) | AgentMail (Alex's inbox) | AgentMail (Alex's inbox) |
| **user** (Send from my email) | Gmail API (user's inbox, user's learned voice) | AgentMail fallback (Alex's inbox, explains limitation to user) |

### Key Design Decision: `crm.send_email` Becomes Identity-Aware

Rather than creating a new virtual tool (`channel.send_email`) or modifying process templates, **`crm.send_email` itself becomes identity-aware.** The tool resolver already has access to execution context. The change:

**Before (current):**
```typescript
// tool-resolver.ts — crm.send_email.execute()
const result = await sendAndRecord({
  personaId: "alex",           // hardcoded
  mode: input.mode,
  // sendingIdentity: not passed
});
```

**After:**
```typescript
// tool-resolver.ts — crm.send_email.execute()
const { adapter, fromIdentity } = await resolveEmailChannel(
  executionContext.sendingIdentity,  // from HarnessContext
  executionContext.userId,
);
const result = await sendAndRecord({
  personaId: fromIdentity.personaId,
  mode: input.mode,
  sendingIdentity: executionContext.sendingIdentity,
  adapter,                           // injected adapter (AgentMail or Gmail API)
});
```

This means `sendAndRecord()` gains an optional `adapter` parameter. When provided, it uses that adapter instead of always creating an AgentMail adapter. When omitted (backward compatible), it falls back to AgentMail.

### Why NOT a New Tool

Creating `channel.send_email` as a separate tool would require:
1. Updating all process templates to reference the new tool name
2. Maintaining two tools that do the same thing (crm.send_email and channel.send_email)
3. Deciding when to use which — adding cognitive load for the AI agent

Making `crm.send_email` identity-aware is the simpler, backward-compatible approach. The tool name stays the same. Templates don't change. The routing is invisible to the AI agent executing the step — it just calls `crm_send_email` and the harness figures out the rest.

### Execution Context Threading

The `crm.send_email` built-in tool currently receives `(input, stepRunId)`. To access `sendingIdentity`, it needs the `HarnessContext`. The tool resolver's `executeIntegrationTool` dispatch function must be extended:

```typescript
// Current signature
executeIntegrationTool: (name: string, input: Record<string, unknown>) => Promise<string>

// Extended signature (backward compatible — context is optional)
executeIntegrationTool: (
  name: string,
  input: Record<string, unknown>,
  context?: { sendingIdentity?: string; userId?: string; stepRunId?: string }
) => Promise<string>
```

The harness step-execution handler already has `HarnessContext` — it passes the relevant fields when calling `executeIntegrationTool`.

## Architecture: Google Workspace OAuth

### Scopes Required

| Scope | Purpose | Why |
|-------|---------|-----|
| `https://www.googleapis.com/auth/gmail.send` | Send email as user | Required for `user` sending identity |
| `https://www.googleapis.com/auth/gmail.readonly` | Read sent mail | Voice learning (writing style extraction from sent folder) + contact extraction (people graph from email history) |
| `https://www.googleapis.com/auth/userinfo.email` | Read user's email address | Pre-fill on re-auth, verify account matches |

**Why `gmail.readonly` and not `gmail.metadata`:** Metadata-only access gives headers (to/from/subject/date) which is enough for contact extraction, but not enough for voice learning — Alex needs to read actual email bodies to learn tone, formality, and writing patterns. `gmail.readonly` covers both needs.

**Privacy boundary:** Alex reads sent mail for voice model training and contact extraction. Raw email content is never stored verbatim, never forwarded, never included in agent context or logs. The voice model is a statistical summary (patterns, not content). Contact extraction stores names, emails, interaction frequency, and inferred relationship type — not message bodies.

**User consent framing:** Alex explains this clearly before the user connects: "I'll scan your sent emails to learn how you write and pick up on your contacts. I can only read and send — I won't modify anything in your inbox."

Calendar and other scopes are deferred — not needed for sending identity routing.

### OAuth Flow Location

**Network service** hosts the OAuth flow. Rationale:
- Layer 2 users (no workspace) need Google Workspace for agent-of-user/ghost sending
- The network service has a stable public URL (`ditto.network`) for the redirect URI
- One Google Cloud project, one OAuth client, one redirect URI: `https://ditto.network/api/integrations/google/callback`

### Token Storage

Stored in the existing `credentials` table:
- `processId`: `__network__` (synthetic — network-level credential, not process-scoped)
- `service`: `google-workspace`
- `encryptedValue`: JSON `{ access_token, refresh_token, token_type, expiry_date, email }` encrypted with AES-256-GCM
- `iv`, `authTag`: per-credential random IV

**Token refresh:** The `GmailApiAdapter` checks `expiry_date` before each send. If expired, it calls `refreshAccessToken()` which uses the refresh token to get a new access token and updates the credential row atomically.

### Credential Scoping Extension

The current `credentials` table is scoped `(processId, service)` with a foreign key from `processId` to `processes.id`. For user-level integrations (not process-scoped like Google Workspace OAuth), we need to store credentials outside the process scope.

**Approach:** Add an optional `userId` column to the `credentials` table and make `processId` nullable. This is a schema migration but it's the correct long-term shape — multi-user will need `userId` anyway, and using a sentinel process row would pollute the process table with non-process data.

```sql
-- Migration: add userId, make processId nullable
ALTER TABLE credentials ADD COLUMN user_id TEXT;
-- processId stays NOT NULL for now to avoid breaking existing rows,
-- but new user-scoped credentials use processId = NULL, userId = 'founder'
```

Schema change in `packages/core/src/db/schema.ts`:
```typescript
credentials = sqliteTable("credentials", {
  // ... existing fields ...
  processId: text("process_id").references(() => processes.id),  // nullable (was .notNull())
  userId: text("user_id"),  // new — for user-scoped credentials
  // unique constraint changes to: (userId, service) for user-scoped, (processId, service) for process-scoped
});
```

The `hasIntegration(userId, service)` function queries:

```sql
SELECT 1 FROM credentials
WHERE userId = :userId
AND service = 'google-workspace'
AND (expiresAt IS NULL OR expiresAt > :now)
LIMIT 1
```

This is a core schema change (`packages/core/`) because the `credentials` table lives in core. The migration must preserve existing `(processId, service)` credentials.

## Architecture: Credential Migration on Workspace Graduation

### The Problem

Google OAuth tokens are bound to redirect URIs. A token issued via `ditto.network/callback` cannot be used by `workspace-abc.railway.app/callback`. Re-auth is technically unavoidable.

### The Experience

1. **Workspace seed** (`GET /network/seed`) includes a `pendingIntegrations` array:
   ```json
   {
     "pendingIntegrations": [
       {
         "service": "google-workspace",
         "accountHint": "tim@example.com",
         "scopes": ["gmail.send", "userinfo.email"],
         "connectedAt": "2026-03-15T10:00:00Z"
       }
     ]
   }
   ```

2. **Workspace setup flow** shows an integration reconnection step:
   > "You connected Google Workspace as tim@example.com on the network. Your workspace needs its own connection to send emails from your account. This takes 30 seconds."
   > [Reconnect Google Workspace →]

3. **OAuth flow** pre-fills `login_hint=tim@example.com` in the Google consent URL, skipping account selection for the user.

4. **After reconnection,** the workspace stores its own credential in its local `credentials` table. The network credential remains active for network-side operations.

### Why This Feels Seamless

- The user sees **one click** ("Reconnect"), not a from-scratch setup
- Google pre-fills the account (same `login_hint`)
- Everything else (memories, people, processes, trust) transferred via seed — Google is the only thing that needs reconnecting
- The explanation is honest and brief: "your workspace needs its own connection"

## User Experience

- **Jobs affected:** Delegate (user delegates outreach to Alex, identity routing determines how it's sent)
- **Primitives involved:** `ConnectionSetupBlock` (existing, Brief 072), notification email for Layer 2 users
- **Process-owner perspective:** When Google Workspace is not connected, outreach goes out as Alex (principal). When connected, agent-of-user outreach goes from the user's Gmail. The user doesn't configure this per-step — it's automatic based on cycle `defaultIdentity` + available integrations.
- **Interaction states:** N/A for channel routing (invisible). For Google OAuth: contextual offer → one-click initiate → Google consent → callback → confirmation.
- **Designer input:** Not invoked — lightweight UX section only. The OAuth consent flow uses Google's standard UI.

### Identity Choice: The User Decides How They Show Up

Choosing how outreach gets sent is a **trust-building conversation**, not a technical default. The user is telling Alex "this is how I want to show up to the world." Alex must ask, not assume.

**When the question arises:**

During cycle activation (e.g., user says "help me fill my pipeline"), Alex frames the identity choice as a natural part of planning — the same way a human BDR would ask "do you want me to email from my address or yours?"

**Layer 3 users (workspace, conversational):**

> Alex: "I'll start working your pipeline. Quick question — how do you want outreach to go out?"
>
> **[Send as Alex]** — "I'll email on your behalf as your business advisor. Recipients know they're talking to Alex at Ditto. Works right now, no setup needed."
>
> **[Send from my email]** — "I'll connect to your Gmail, learn how you write, and send as you. Better response rates — looks like it's personally from you. I'll need one-time access to your Gmail."

This is rendered as a `SendingIdentityChoiceBlock` (new ContentBlock type) — two cards with clear descriptions. The user taps one.

**If they choose "Send from my email" and Gmail isn't connected:**

Alex immediately follows up with the connection flow — no separate settings page:

> Alex: "To send from your Gmail, I need a quick one-time connection. I'll also scan your sent emails to learn how you write — so outreach sounds like you, not me. I can only send and read sent mail — I won't touch your inbox."
>
> **[Connect my Gmail →]**

One click → Google consent screen (pre-filled via `login_hint`) → one click "Allow" → done. Alex confirms:

> "Connected! I can now send from rob@hendersonplumbing.com.au. Give me a few minutes to read through your sent emails — I'll learn your tone and pick up on your key contacts too."

**If they choose "Send as Alex":**

No connection needed. Outreach starts immediately via AgentMail. Alex may revisit the question later (once, after 2+ successful cycles) if the user seems established:

> "Your pipeline is running well — 3 meetings booked this month. Want to switch to sending from your own email? Response rates tend to be 15-20% higher, and I'll learn your writing style so it sounds like you."

**Layer 2 users (email-only, no workspace):**

Same conversation but via email. Alex asks the identity question in the plan confirmation email:

> "Here's the plan for your outreach. Before I start — how should emails go out?
>
> **Reply 'as you'** — I'll send as Alex, your business advisor at Ditto. Works immediately.
> **Reply 'from mine'** — I'll connect your Gmail, learn your writing style, and send as you. I'll send you a link to connect — takes 30 seconds."

If they reply "from mine," Alex sends the OAuth link. If they reply "as you" or don't reply within 24h, Alex starts with principal identity. This respects the user's agency while having a sensible default for silence.

**Key design decisions:**
- The identity choice is **part of the cycle activation conversation**, not a separate settings flow
- Alex **explains the trade-offs** in plain language (response rates, recipient perception, what access is needed)
- The user's choice is stored on the cycle run as `userChosenIdentity` and persisted to user memory — Alex remembers their preference for future cycles
- Ghost mode is **gated on voice calibration** (Brief 124): if the user hasn't provided enough writing samples, Alex explains this and offers to collect samples first
- The `defaultIdentity` in cycle YAML becomes a **suggestion**, not a mandate — it's what Alex recommends, but the user overrides it

### Connection Flow: Zero-Friction OAuth (Insight-090)

When the user chooses an identity that requires Gmail and it's not connected, the OAuth flow must be dead easy:

1. **One click to start** — Alex shows a direct link/button to Google's consent screen
2. **Pre-filled account** — `login_hint` parameter skips Google's account selector
3. **Minimal scope** — only `gmail.send` + `userinfo.email`. Alex explains: "I can only send emails — I can't read your inbox."
4. **Instant confirmation** — callback redirects to a "Connected!" page (workspace) or Alex sends a confirmation email (Layer 2)
5. **Non-blocking fallback** — if OAuth fails or user cancels, Alex says "No problem — I'll send as Alex for now. You can connect Gmail anytime by asking me."

**Why this is dead easy:**
1. **Zero navigation** — the user never leaves the conversation to find a settings page
2. **Two clicks total** — click the link, click "Allow" on Google's consent screen
3. **Context-aware** — only offered when the user chooses an identity that needs it
4. **Honest about scope** — "send only, can't read your inbox" builds trust
5. **No penalty for declining** — Alex works either way, Gmail is an upgrade
6. **Remembers the choice** — future cycles use the same identity without re-asking

## Acceptance Criteria

### Sub-brief 153: Channel Resolution Layer

1. [ ] `resolveEmailChannel(sendingIdentity, userId)` returns AgentMail adapter for `principal` identity regardless of Gmail connection status
2. [ ] `resolveEmailChannel(sendingIdentity, userId)` returns Gmail API adapter for `user` identity when Gmail credentials exist and are not expired
3. [ ] `resolveEmailChannel(sendingIdentity, userId)` returns AgentMail adapter (fallback) for `user` identity when Gmail is not connected
4. [ ] Legacy `agent-of-user` and `ghost` values in existing cycle YAML resolve identically to `user` (backward compatible)
6. [ ] `crm.send_email` built-in tool passes `sendingIdentity` from execution context to `sendAndRecord()`
7. [ ] `sendAndRecord()` accepts optional `adapter` parameter and uses it instead of default AgentMail adapter when provided
8. [ ] `hasIntegration(userId, service)` checks `credentials` table for non-expired credential
9. [ ] `GmailApiAdapter` implements `ChannelAdapter.send()` using `googleapis` SDK `gmail.users.messages.send`
10. [ ] `GmailApiAdapter` auto-refreshes expired access tokens using stored refresh token
11. [ ] Existing process templates work unchanged — no YAML modifications required
12. [ ] All identity × channel combinations have unit tests
13. [ ] `stepRunId` invocation guard applied to any new side-effecting send paths (Insight-180)
14. [ ] `credentials` table schema updated: `processId` nullable, `userId` column added, migration preserves existing rows
15. [ ] Channel routing decision (selected channel, fallback reason if applicable) logged as activity
16. [ ] Decrypted Google tokens never appear in tool return values, agent messages, logs, or `HarnessContext`
17. [ ] `ActivateCycleInput` accepts optional `sendingIdentity` field that overrides cycle YAML `defaultIdentity`
18. [ ] When `sendingIdentity` is not provided and cycle type is `sales-marketing` or `network-connecting`, `activate_cycle` returns `pendingIdentityChoice: true` instead of auto-starting
19. [ ] `SendingIdentityChoiceBlock` content block type exists with two options (principal, user) and plain-language descriptions of trade-offs
20. [ ] User's identity choice is stored on the cycle run (`userChosenIdentity` field on `processRuns.cycleConfig`) and persisted to user memory for future cycles
21. [ ] Self delegation guidance instructs Alex to present identity choice during cycle activation and explains trade-offs in plain language
22. [ ] When user chooses `user` identity and connects Gmail, Alex initiates voice learning from sent folder and contact extraction — confirms to user when complete

### Sub-brief 154: Google Workspace OAuth for Network

1. [ ] OAuth initiation endpoint redirects to Google consent screen with `gmail.send` + `gmail.readonly` + `userinfo.email` scopes
2. [ ] OAuth callback exchanges authorization code for tokens and stores encrypted in `credentials` table
3. [ ] Redirect URI is `https://ditto.network/api/integrations/google/callback`
4. [ ] Stored credential includes `refresh_token` (requires `access_type=offline` + `prompt=consent` on first auth)
5. [ ] `refreshAccessToken()` uses refresh token to get new access token and updates credential row
6. [ ] Token refresh is atomic — no window where a concurrent request sees a partially-updated credential
7. [ ] OAuth error states (user denies, token exchange fails) handled gracefully with user-facing error message
8. [ ] Spike test in `src/engine/integration-spike.test.ts` makes one real Gmail API call (send to test address) to verify auth format and endpoint
9. [ ] `docs/landscape.md` `googleapis` SDK evaluation exists (completed at design time — verify still accurate at build time)
10. [ ] When user chooses `user` identity and Gmail is not connected, Alex presents the OAuth connection flow inline (workspace: `ConnectionSetupBlock` with link; email: reply with OAuth link)
11. [ ] OAuth initiation link includes `login_hint` pre-filled from user's known email
12. [ ] If user declines to connect Gmail, cycle proceeds with `principal` identity via AgentMail — Alex confirms the fallback explicitly ("No problem — I'll send as Alex for now")
13. [ ] `connect_service` tool handles `auth_type: 'oauth2'` by returning a `connectionUrl` field instead of `credentialRequest`
14. [ ] After successful Gmail connection, Alex initiates a background voice learning job (scan sent folder, build voice model) and contact extraction job (build people graph from email history)
15. [ ] Voice learning processes sent emails only — never reads inbox/received mail beyond headers for contact extraction
16. [ ] Raw email content is never stored verbatim — voice model is a statistical summary (patterns, not content). Contact extraction stores names, emails, frequency, inferred relationship type
17. [ ] Alex confirms to user when voice learning and contact extraction are complete: "I've learned your writing style and found X contacts in your email history"

### Sub-brief 155: Credential Migration on Workspace Graduation

1. [ ] Workspace seed export includes `pendingIntegrations` array with service, account hint, scopes, and connection date
2. [ ] Workspace setup flow shows reconnection prompt for each pending integration
3. [ ] Google OAuth initiation uses `login_hint` parameter pre-filled from seed account hint
4. [ ] Reconnection page explains why re-auth is needed (honest, brief copy)
5. [ ] After successful reconnection, workspace has its own credential independent of network credential

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Channel resolution respects identity-router handler's output (no bypass)
   - Credential storage follows ADR-005 encryption pattern
   - No credential values leak to agent context (Brief 035 constraint)
   - Fallback chain is safe (AgentMail fallback never fails silently)
   - Workspace seed extension is backward compatible
   - Engine vs product layer boundary respected (core provides identity, product resolves channel)
3. Present work + review findings to human for approval

## Smoke Test

### Channel Resolution (Sub-brief 153)
```bash
# Run unit tests for channel resolver
pnpm vitest run src/engine/channel-resolver.test.ts

# Run existing channel tests to verify backward compatibility
pnpm vitest run src/engine/channel.test.ts

# Type check
pnpm run type-check
```

### Google OAuth (Sub-brief 154)
```bash
# Spike test — requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET env vars
pnpm vitest run src/engine/integration-spike.test.ts -t "google-workspace"
```

### Integration (all sub-briefs)
```bash
# End-to-end: start a selling outreach cycle, verify email routes through correct channel
# With Google Workspace not connected: expect AgentMail delivery
# With Google Workspace connected: expect Gmail API delivery for agent-of-user steps
```

## After Completion

1. Update `docs/state.md` with channel resolution layer, Google OAuth flow, credential migration design
2. Update `docs/roadmap.md` — mark sending identity routing as complete
3. Update `docs/architecture.md` — document channel resolution in Layer 3 (Harness) section
4. Update ADR-005 if credential scoping convention (`__network__` processId) warrants an amendment
5. Phase retrospective: evaluate whether `crm.send_email` identity-awareness is the right long-term pattern vs a dedicated `channel.send` abstraction
