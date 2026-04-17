# Brief 187: Managed-Cloud OAuth — Skeleton + Gmail Proof Provider

**Date:** 2026-04-17
**Status:** draft
**Depends on:** ADR-031 (OAuth credential platform), ADR-025 (Centralised Network Service), ADR-005 (integration architecture), Insight-090 (integration auth is a conversation moment), Insight-186 (non-blocking integration upgrade offers)
**Unlocks:** Brief 188 (Google Calendar + Drive reuse of same OAuth grant), Brief 189 (Slack OAuth), Brief 190 (Notion OAuth), Brief 191 (refresh worker productionisation + revocation UX)

## Goal

- **Roadmap phase:** Phase 10 / 11 (integration auth — per `docs/research/integration-auth-reality.md` phasing; not the roadmap's "Phase 11: Intelligent Discovery")
- **Capabilities delivered:** One seam + one provider. The Network Service OAuth consent handler (`/v1/network/oauth/start` and `/v1/network/oauth/callback`), the `oauth-grant` vault payload discriminator, the workspace-to-Network bridge for token-backed calls, and **Gmail connected end-to-end** — from the workspace "Connect Gmail" affordance to a successful send via the Network's brokered `gmail/send` endpoint. Other providers (Calendar, Drive, Slack, Notion) in follow-up briefs.

## Context

ADR-031 closes the long-open question on integration credential platform: build core inside the Network Service for the top-5 providers; defer Nango to Phase 12 re-evaluation. This brief starts the build.

Following Insight-004 (one integration seam per brief) and the 183/184 phasing pattern, this brief delivers the OAuth seam **end-to-end for exactly one provider (Gmail)** rather than stubbing five providers. The payoff of proving the full path once — consent redirect → code exchange → vault write → refresh schedule → workspace call → broker response → revocation detection — is much higher than parallel half-finished providers. Follow-up briefs 188–190 each add a provider using the same pattern; they are small by design.

Gmail is chosen as the proof provider because (a) it's the highest-value integration for Alex (sending outreach on behalf of the user per Insight-186), (b) Google's OAuth semantics are well-documented and non-unusual, and (c) `google-workspace.yaml` already declares the service — extending it with OAuth metadata is incremental, not new-service work.

## Objective

Stand up the Network Service's OAuth subsystem, prove it end-to-end with Gmail, and leave the provider-extension seam clean enough that Briefs 188–190 add Calendar/Drive/Slack/Notion without touching the handler.

Exit criterion: Rob (the persona) clicks "Connect Gmail" in his workspace, completes Google consent, and the next outreach email Alex drafts sends successfully from `rob@hendersonplumbing.com.au` via `POST /v1/network/gmail/send`. The workspace never touches the access token; the Network's vault holds it. The refresh worker rotates it before expiry. Revoking access in Google triggers a non-blocking reconnect offer, not a hard block.

## Non-Goals

- **No providers beyond Gmail in this brief.** Calendar, Drive, Slack, Notion are in Briefs 188–190. Gmail is the seam proof.
- **No BYO OAuth apps.** The Ditto-owned OAuth app is the only path in this brief.
- **No self-hoster OAuth story.** Track B OAuth (BYO apps vs auth proxy) is explicitly deferred (ADR-031). Self-hosters remain on API-key path or use the Ditto Network as auth proxy with a scoped API token — which is the same bridge the managed-cloud path uses, so no extra work.
- **No per-user OAuth app override.** User wanting their own Google Cloud project is out of scope.
- **No Nango handler.** Handler stays provider-agnostic in shape to preserve the ADR-031 escape hatch, but no Nango code lands.
- **No refresh-worker high availability.** Single-instance cron in this brief; HA/multi-region deferred to Brief 191.
- **No multi-scope consent dance.** One scope set per provider, all-or-nothing. Incremental scope adds deferred.
- **No OAuth scope revocation UX beyond "reconnect".** Partial-scope revoke / re-grant-narrower is deferred.
- **No workspace-side UI beyond the "Connect Gmail" affordance and the post-consent success state.** Settings page for managing connections deferred to Brief 192.
- **No reconnection automation inside process runs.** When `TOKEN_REVOKED` fires mid-run, the step enters `needs_connection` and Self prompts the user (Insight-186 non-blocking) — process does not silently retry OAuth.

## Inputs

1. `docs/adrs/031-oauth-credential-platform.md` — decision record being executed.
2. `docs/adrs/025-centralized-network-service.md` — Network Service contract and SSE bridge.
3. `docs/adrs/005-integration-architecture.md` — broader integration model.
4. `docs/research/integration-auth-reality.md` — auth-type analysis and connection-lifecycle design (§Registry Extension, §Connection States, §`connect_service` tool).
5. `docs/insights/archived/090-integration-auth-is-a-conversation-moment.md` — conversational auth flow.
6. `docs/insights/186-non-blocking-integration-upgrade-offers.md` — fallback-first, upgrade-in-context pattern.
7. `integrations/00-schema.yaml` — integration registry schema; gains OAuth metadata fields.
8. `integrations/google-workspace.yaml` — existing service file; gains OAuth app handle + scopes.
9. `packages/core/src/db/schema.ts` §`credentials` — vault table; gains `oauth-grant` payload discriminator support.
10. `src/engine/credential-vault.ts` — vault read/write helpers.
11. `src/engine/self-tools/connect-service.ts` — existing `check | guide | verify` actions; gains `oauth_start` action.
12. `src/engine/integration-handlers/rest.ts` — existing REST handler pattern; Gmail `send` goes through this via Network broker.
13. `src/engine/google-workspace-integration.ts` (and its `.test.ts`) — existing Google Workspace wiring; gains OAuth-backed path alongside existing CLI path.

## Constraints

- **Workspace MUST NOT hold the access token.** Workspace code may import the `OAuthGrantHandle` type (opaque `{ kind: "oauth-grant"; service: string; userId: string; revision: number }`) but MUST NOT import anything that resolves to a raw bearer string. Enforcement is **two concrete layers**: (a) a **module-boundary test** (`src/engine/network/oauth/module-boundary.test.ts`) that asserts no file under `src/` outside `src/engine/network/` imports from `packages/core/src/oauth/internal/*` where the Network-only types live; (b) a **Network-response-shape test** asserting no Network HTTP response or SSE event payload contains an `access_token` or `refresh_token` field — enforced by serialising fixture responses and grepping the wire bytes. The TypeScript brand type (`OAuthAccessToken`) is a compile-time convenience, not the enforcement mechanism.
- **OAuth client secret never leaves Network config.** Config loaded from environment at Network Service boot; secret never written to DB, never logged, never sent over the bridge.
- **State parameter MUST use PKCE** (RFC 7636) + a signed random nonce, with 10-minute expiry. Prevents CSRF and authorisation-code interception.
- **Callback URL is fixed at `https://ditto.partners/v1/network/oauth/callback`** (per ADR-025 resolution, 2026-04-17 — the Network Service is the front door; no sub-domain split). Every Ditto-owned OAuth app (Google Cloud project, Slack app, Notion integration, etc.) registers exactly this redirect URI. Do not add per-provider callback paths.
- **Every OAuth'd external call MUST write an `activity` row** with actor (user), service, operation, scopes used, timestamp, result code. Non-negotiable audit invariant per ADR-005 §4.
- **Gmail `send` through the Network MUST NOT pass the email body through logging or tracing in plaintext.** Body is redacted before any observability hook sees it. Only metadata (to, from, subject length, body length, success code) logs.
- **Refresh scheduling MUST NOT busy-refresh.** Per-grant refresh fires at `expires_at - 5m`, not continuously. Failed refresh (network error) backs off exponentially, max 1h; after 6 consecutive failures flips grant to `REVOKED` and fires SSE event.
- **Insight-180 guards on every side-effecting entry point.** The `OAuthClient` interface is a plumbing boundary, not an invocation guard — it is not sufficient. Each side-effecting function MUST require a concrete invocation anchor validated at entry (test-mode bypass via `DITTO_TEST_MODE` per Insight-180):
  - `POST /v1/network/oauth/start` (Self-tool path) — writes synthetic `activities` row `{ actorType: "workspace_user", action: "oauth_consent_begin", service, status: "in_progress" }` BEFORE returning the redirect URL. Returned activity id is embedded in the opaque state token.
  - `GET /v1/network/oauth/callback` — anchor is the signed state token itself: validates the matching `activities` row exists with status `in_progress`, updates to `complete` on success, `failed` on error. No new invocation proof required beyond state validation.
  - `POST /v1/network/gmail/send` — REQUIRES `stepRunId` in the request body; guard validates the `stepRuns` row exists and is active. Calls without `stepRunId` rejected with 400 (except in `DITTO_TEST_MODE`). This is the standard Insight-180 pattern.
  - Refresh-worker tick — writes synthetic `activities` row `{ actorType: "network_service", action: "oauth_refresh_tick", service, status: "in_progress" }` per tick, passes the id to the refresh call, updates status on completion. Provides an audit anchor for every refresh attempt.
- **Trust gate inherited, not reinvented.** Following Brief 184's pattern (`docs/briefs/184-browser-session-capture-and-execution.md:67`): trust-gate enforcement is inherited from the workspace's integration pipeline — the Gmail-send step goes through the trust gate in the workspace BEFORE the `gmail/send` HTTP call is made. The Network broker does NOT implement a separate trust-gate check or require any `approved_at` proof; the `stepRunId` anchor (above) is sufficient proof that the call originated from a trust-gated step execution. No new trust concept introduced; no signed approval token invented. A consolidated ADR covering trust-gate shape for write integrations is tracked as a follow-up but does NOT block this brief.
- **Engine-core boundary:** OAuth types (`OAuthGrant`, `OAuthGrantHandle`, `OAuthClient`, `OAuthProviderConfig`) live in `packages/core/src/oauth/` (reusable primitives, per `@ditto/core` charter). The Network Service's HTTP handlers and refresh worker live in `src/engine/network/oauth/` (Ditto product layer). The Gmail-specific broker (`POST /v1/network/gmail/send`) lives in `src/engine/network/brokers/gmail.ts`.
- **Vault payload discriminator:** `credentials.payload` JSON blob gains `kind: "oauth-grant"` tag. Existing `kind: "api-key"` and `kind: "browser-session"` (Brief 183) remain valid. Discriminator-mismatch on read throws. No migration needed — new column would break backward compatibility; discriminator inside the encrypted payload is additive.
- **Escape-hatch shape:** `OAuthProviderConfig` is the only provider-specific surface. Adding a provider means adding one config entry and registering its broker (e.g., `brokers/slack.ts`). No changes to handlers, refresh worker, or vault layer. A future Nango-backed `OAuthClient` implementation would drop into the same interface without shape change.
- **Trust-gate integration:** covered above under "Trust gate inherited, not reinvented." Trust gate fires in the workspace's step executor (same path as any other integration call); Network broker just requires `stepRunId` as proof of invocation context and does not second-guess the workspace's trust decision.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| OAuth 2.1 + PKCE consent flow | RFC 7636, OAuth 2.1 draft (IETF) | pattern | Standard; no reason to deviate |
| State parameter + signed nonce | OWASP OAuth2 cheat sheet | pattern | CSRF protection |
| Brokered-credentials invariant (agent never sees tokens) | Composio (`composio.dev`) | pattern | Already the stated Ditto invariant (ADR-005 §3); this brief is where we first enforce it for OAuth |
| Refresh-before-expiry pattern | Nango's token lifecycle (`nango.dev`) | pattern | Standard refresh-N-minutes-before-expiry; no Nango code |
| Vault payload discriminator | Existing `kind:` tag in Ditto vault (Brief 183 extended this from `api-key` to `browser-session`) | adopt | Consistent with established pattern |
| Network Service HTTP surface shape | `docs/adrs/025-centralized-network-service.md` §"Network API" | adopt | Versioned URL path, API token auth, SSE event delivery |
| `connect_service` `oauth_start` action | Extends existing tool (`src/engine/self-tools/connect-service.ts`) | adopt | Conversational auth per Insight-090 |
| Non-blocking reconnect on revoke | Insight-186 | adopt | Offer in context, don't block workflow |
| Scope declaration in registry | `docs/research/integration-auth-reality.md` §"Registry Extension" | adopt | Schema designed there; this brief implements it |
| Trust-gate inheritance (Gmail send goes through workspace's integration pipeline trust gate; Network broker does not re-check) | Brief 184 §Constraints (`docs/briefs/184-browser-session-capture-and-execution.md:67`) | adopt | Same pattern as browser-write: trust gate fires once, in the workspace step executor, before any external call. No new trust concept. |
| Invocation guards (`stepRunId` for gmail/send; synthetic `activities` rows for oauth_start, refresh-worker tick; state-token validation for oauth/callback) | Insight-180 + Brief 184's activity-row-anchor extension (`docs/briefs/184-...md:21,63,65`) | adopt | Direct application of the established pattern — `stepRunId` for in-step calls, activity-row anchor for non-step side-effect entry points |
| Provider-agnostic handler seam (Nango escape hatch) | Original to Ditto — informed by ADR-031 | pattern | Keep shape compatible with future Nango handler without importing Nango |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/core/src/oauth/types.ts` | Create — `OAuthGrant`, `OAuthGrantHandle`, `OAuthProviderConfig`, `OAuthAccessToken` (branded type), `OAuthScopeSet`, `OAuthCallbackState`. `OAuthGrantHandle` is the workspace-safe shape. `OAuthAccessToken` and full `OAuthGrant` are Network-only. |
| `packages/core/src/oauth/client.ts` | Create — `OAuthClient` interface: `buildAuthorisationUrl(provider, state)`, `exchangeCode(provider, code, verifier)`, `refresh(provider, refreshToken)`, `revoke(provider, token)`. All return `Promise<Result<T>>`. |
| `packages/core/src/oauth/index.ts` | Create — barrel exports of the above. Workspace imports only the workspace-safe types. |
| `integrations/00-schema.yaml` | Modify — add `oauth2` to `auth_methods`; add optional `oauth:` block per interface with required fields `scopes` (non-empty array), `app_handle` (string ref to Network config), optional `login_hint_field`. Schema validator rejects `oauth2` auth without an `oauth:` block. |
| `integrations/google-workspace.yaml` | Modify — add `oauth:` block under the `rest` interface with Gmail scopes (`https://www.googleapis.com/auth/gmail.send`), `app_handle: ditto-google-workspace`, `login_hint_field: email`. CLI path unchanged. |
| `packages/core/src/db/schema.ts` (or migration file) | Modify — no column changes. Document `credentials.payload` now accepts `kind: "oauth-grant"` with sub-fields `{ access_token, refresh_token, expires_at, scopes, revision }`. Drizzle migration journal needs no entry (no schema change). Add type tests to enforce discriminator shape. |
| `src/engine/credential-vault.ts` | Modify — add `getOAuthGrant(service, userId)` read helper: decrypts, validates `kind === "oauth-grant"`, returns typed grant. Throws on mismatch. Add `putOAuthGrant(service, userId, grant)` write helper. Both Network-only — workspace cannot call. |
| `src/engine/network/oauth/handlers.ts` | Create — HTTP handlers: `POST /v1/network/oauth/start` (build redirect URL, persist state with PKCE verifier, return URL), `GET /v1/network/oauth/callback` (validate state, exchange code, persist grant, emit SSE `oauth.connected` to workspace, redirect to workspace success URL). |
| `src/engine/network/oauth/state-store.ts` | Create — signed state + PKCE verifier store. Keyed by opaque state token. 10-min TTL. In-memory for MVP; swappable interface for future Redis. |
| `src/engine/network/oauth/client-google.ts` | Create — `OAuthClient` implementation for Google. Uses `googleapis` or raw `fetch` against Google's OAuth endpoints. Reads client secret from `GOOGLE_OAUTH_CLIENT_SECRET` env var; never logged. |
| `src/engine/network/oauth/client-fake.ts` | Create — test double. Returns deterministic grants; advances clock for refresh tests. |
| `src/engine/network/oauth/refresh-worker.ts` | Create — cron-style job. Every 60s: SELECT grants where `expires_at < now() + 5m` AND `status = 'ACTIVE'`; refresh; update vault; on failure backoff; after 6 failures flip to `REVOKED` + SSE event. |
| `src/engine/network/brokers/gmail.ts` | Create — `POST /v1/network/gmail/send` handler. Validates workspace API token, resolves user, reads grant, checks trust-gate state in payload, calls Gmail API, redacts body in logs, writes activity row, returns result. |
| `src/engine/network/brokers/gmail.test.ts` | Create — covers: unauthenticated rejected, trust-gate not-approved rejected, token refresh on 401, revoked grant → `TOKEN_REVOKED` SSE, successful send writes activity row, body never appears in log sink. |
| `src/engine/network/oauth/handlers.test.ts` | Create — covers: state validated, PKCE verifier round-trip, callback without matching state rejected, expired state rejected, successful callback persists grant and emits SSE. |
| `src/engine/network/oauth/refresh-worker.test.ts` | Create — covers: refreshes before expiry, backoff on transient failure, flips to `REVOKED` after 6 consecutive failures, fires SSE event on flip. Uses `client-fake.ts`. |
| `src/engine/self-tools/connect-service.ts` | Modify — add `oauth_start` action. Given `service`, returns workspace redirect URL (obtained from Network via `/v1/network/oauth/start`). Existing `check | guide | verify` actions unchanged. |
| `src/engine/self-tools/self-tools.test.ts` | Modify — add test for `oauth_start` action (uses fake Network). |
| `src/engine/google-workspace-integration.ts` | Modify — send path can now resolve credentials via OAuth grant (call through Network broker) OR CLI. Resolution order: OAuth grant → CLI → error. |
| `src/engine/google-workspace-integration.test.ts` | Modify — add test covering OAuth-backed send path. |
| `packages/web/components/integrations/connect-button.tsx` | Create — minimal component. Button → fetch Network OAuth URL → window.open → poll for `oauth.connected` SSE → update UI. |
| `packages/web/app/(workspace)/integrations/connected.tsx` | Create — success page the Network callback redirects to. Shows "Gmail connected" + returns to conversation. |
| `.env.example` | Modify — add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` under a new "Network Service — Managed OAuth" section. Stubs for Slack/Notion (Briefs 189/190) commented out. Redirect URI documented as `https://ditto.partners/v1/network/oauth/callback`. Already staged during the brief-drafting pass (2026-04-17) so this row is effectively a check-in, not net-new. |
| `src/cli/commands/network-debug.ts` | Create — admin CLI group. First subcommand: `pnpm cli network debug oauth-revoke --service <name> --user <id>` force-flips a vault grant to `REVOKED` and fires SSE. Used by smoke test and for ops-driven revocation testing. Guarded by `DITTO_ADMIN=1` env — refuses to run without it. |
| `src/engine/network/oauth/module-boundary.test.ts` | Create — asserts no file under `src/` outside `src/engine/network/` imports from `packages/core/src/oauth/internal/*`. Covers the "workspace never holds a token" invariant at the module level. |
| `src/engine/network/oauth/response-shape.test.ts` | Create — asserts no Network HTTP response or SSE event fixture payload contains `access_token` or `refresh_token` substrings. Runs against representative fixtures for every endpoint the Network exposes. |
| `docs/state.md` | Modify — record Brief 187 complete, OAuth skeleton + Gmail live. |
| `docs/roadmap.md` | Modify — mark "OAuth for managed cloud (top 5)" row as partially done (Gmail). |
| `docs/landscape.md` | Modify — Nango entry annotated with ADR-031 deferral note. |

**Not modified in 187** (lands in follow-up briefs): Calendar, Drive, Slack, Notion broker endpoints. Settings UI for managing connections. Refresh-worker HA. Browser-session integration (Brief 184 unrelated). Self-hoster documentation for OAuth BYO apps.

## User Experience

- **Job affected:** "send outreach email as Alex on behalf of the user" (Insight-186 pattern)
- **Primitives involved:**
  - Conversational auth moment (Insight-090) — Self asks, user consents in-context
  - Non-blocking upgrade offer (Insight-186) — if Gmail isn't connected yet, outreach still sends via AgentMail; Self offers Gmail upgrade once, respects silence after
  - Connect button (new) — one click opens Google consent, returns to conversation on success
  - Reconnect prompt (new) — on `TOKEN_REVOKED`, Self offers reconnect non-blockingly; outreach falls back to AgentMail for that run
- **Process-owner perspective (Rob, SMB owner):**
  1. Rob: "I want Alex to send the intro email from my Gmail, not from the Ditto address."
  2. Self: "One sec — I'll open Google's sign-in. Takes about 10 seconds."
  3. [Connect button opens Google consent popup. Rob signs in, approves Gmail send scope.]
  4. [Callback lands on Ditto. SSE `oauth.connected` fires. Workspace updates.]
  5. Self: "Connected — rob@hendersonplumbing.com.au. I'll use this for outreach from here on. I won't read your inbox or touch any other scope."
  6. [Alex drafts and sends the next outreach; activity row records the send.]
- **Interaction states:**
  - `DISCONNECTED` — no grant. Fallback (AgentMail) used. Offer visible once per cycle type.
  - `CONNECTING` — consent URL fetched, popup open. Spinner.
  - `CONNECTED` — grant active. Gmail used.
  - `EXPIRED` — refresh failed. Brief window before `REVOKED`; refresh worker retries.
  - `REVOKED` — user revoked in Google, or 6-retry backoff hit. Fallback used. Reconnect offer.
- **Designer input:** Invoke Dev Designer for the connect-button micro-interaction and the post-consent success state. Keep both tiny — the design quality bar is "doesn't feel like a settings page." This is a conversation moment (Insight-090), not a setup flow.

## Acceptance Criteria

1. [ ] `ADR-031` is cited in this brief's header and the build adheres to its constraints (top-5 scope, provider-agnostic shape, no Nango code).
2. [ ] `packages/core/src/oauth/` package exists with `types.ts`, `client.ts`, `index.ts`, and `internal/*` for Network-only types (`OAuthAccessToken`, full `OAuthGrant`). `OAuthGrantHandle` importable from any `src/` file; module-boundary test (`src/engine/network/oauth/module-boundary.test.ts`) asserts no file under `src/` outside `src/engine/network/` imports from `packages/core/src/oauth/internal/*`. Response-shape test (`src/engine/network/oauth/response-shape.test.ts`) asserts no fixture payload for any Network HTTP/SSE response contains `access_token` or `refresh_token` substrings.
3. [ ] `integrations/00-schema.yaml` declares `oauth2` auth method and `oauth:` block with required `scopes` and `app_handle`. Validator rejects `oauth2` without `oauth:` block; rejects empty `scopes`.
4. [ ] `integrations/google-workspace.yaml` declares Gmail OAuth scopes under `rest.oauth`. Loads without validator error.
5. [ ] `POST /v1/network/oauth/start?service=google-workspace` returns a Google consent URL with valid PKCE challenge + signed state nonce. State persisted with 10-min TTL.
6. [ ] `GET /v1/network/oauth/callback` with valid state exchanges the code, persists grant with `kind: "oauth-grant"` discriminator, fires SSE `oauth.connected` event to the originating workspace, redirects to workspace success page. Mismatched / expired state returns 400.
7. [ ] `getOAuthGrant(service, userId)` returns typed grant on success; throws on discriminator mismatch; throws on missing row.
8. [ ] `refresh-worker.ts` refreshes grants at `expires_at - 5m`; exponential backoff on transient failure (max 1h); flips grant to `REVOKED` + fires SSE event after 6 consecutive failures.
9. [ ] `POST /v1/network/gmail/send` rejects unauthenticated calls (no valid workspace API token → 401), rejects calls missing `stepRunId` (Insight-180 guard → 400 unless `DITTO_TEST_MODE=1`), rejects calls whose `stepRunId` does not resolve to an active `stepRuns` row → 400, refreshes token on 401 from Google and retries once, writes activity row with actor/service/operation/scopes/timestamp/result on every call (success or failure). Body text does not appear in any logger sink (asserted via test that captures all log output, including error paths). Trust-gate enforcement happens in the workspace's integration pipeline before the HTTP call — Network broker does not second-guess.
10. [ ] `connect_service` Self tool `oauth_start` action returns the Network redirect URL given a service name. Existing `check | guide | verify` actions continue to work.
11. [ ] Workspace `connect-button.tsx` opens the OAuth URL, listens for `oauth.connected` SSE, updates UI on success. Success page lands and returns to conversation.
12. [ ] End-to-end smoke test (integration-level, real Google OAuth sandbox or recorded-fixture equivalent): user connects Gmail, Alex sends an email through the Network broker, email is sent, activity row written, no raw token appears in workspace logs.
13. [ ] `TOKEN_REVOKED` path tested: revoking the grant in the vault triggers SSE, next Alex send falls back to AgentMail (Insight-186), Self surfaces non-blocking reconnect offer exactly once.
14. [ ] `pnpm run type-check` passes at repo root. All existing integration tests continue to pass.
15. [ ] ADR-031 "Closes Out" bullets verified: ADR-005 follow-up line updated, `docs/architecture.md` Open Decisions row moved to Resolved Questions.

## Review Process

1. Spawn review agent with `docs/architecture.md`, `docs/review-checklist.md`, ADR-005, ADR-025, ADR-031, Insight-090, Insight-186, and this brief.
2. Review agent specifically checks:
   - **Escape hatch preserved:** is the `OAuthClient` interface narrow enough that a Nango-backed implementation could drop in without signature changes? Any Google-specific shape leaked into `packages/core/src/oauth/`?
   - **Token never in workspace:** does any workspace-side file import anything that resolves to a raw access token? Module-boundary test present?
   - **Audit invariant:** does every path that uses a token write an activity row? Any early-return that could skip it?
   - **Body redaction:** is the test for "body never appears in log sink" actually capturing all sinks, or just the primary logger? Does it cover error paths (where people often log requests for debugging)?
   - **Refresh worker correctness:** does the backoff-then-revoke path actually fire SSE? Does the 6-failure threshold handle concurrent refresh attempts on the same grant?
   - **PKCE + state:** is the state-store interface abstracted enough to swap in Redis later without changing handlers? Does the 10-min TTL have a test?
   - **Trust-gate integration:** does the broker correctly refuse when `approved_at` is missing? Is the trust concept extended anywhere, or just applied?
   - **Schema validation:** does the validator genuinely reject malformed OAuth configs, or only warn? Covered by negative tests?
   - **Insight-186 adherence:** on `TOKEN_REVOKED`, does the system fall back rather than block? Is the "offer once per cycle type" flag actually scoped correctly?
3. Fresh-context reviewer re-reads: does this brief hold to "one integration seam per brief" (Insight-004), or has it quietly grown into a multi-provider brief? Any hidden dependencies on not-yet-built pieces?
4. Present work + review findings to human.

## Smoke Test

```bash
pnpm run type-check
# Expect: clean

pnpm cli sync
pnpm cli inspect integration google-workspace
# Expect: oauth block visible; scopes listed; app_handle resolved from Network config

# Start Network Service + workspace locally (dev mode)
pnpm dev:network &
pnpm dev:workspace &

# Simulate OAuth start (real network call to Google sandbox OR recorded fixture)
curl -X POST http://localhost:${NETWORK_PORT}/v1/network/oauth/start \
  -H "Authorization: Bearer $WORKSPACE_API_TOKEN" \
  -d '{"service":"google-workspace"}'
# Expect: JSON { redirect_url: "https://accounts.google.com/o/oauth2/v2/auth?..." }

# Manual: open redirect_url in browser, complete consent, verify callback lands
# Expect: success page, workspace receives SSE oauth.connected event, Self confirms

# Broker send
curl -X POST http://localhost:${NETWORK_PORT}/v1/network/gmail/send \
  -H "Authorization: Bearer $WORKSPACE_API_TOKEN" \
  -d '{"to":"test@example.com","subject":"Hi","body":"Test","approved_at":"2026-04-17T00:00:00Z"}'
# Expect: 200 + message_id. Activity row visible via `pnpm cli activities --service gmail`.
# Expect: grep $WORKSPACE_LOG $GMAIL_BODY_TEXT → no matches.

# Refresh worker
pnpm vitest run src/engine/network/oauth/refresh-worker.test.ts
# Expect: refresh-before-expiry, backoff, revoke-after-6-failures paths pass.

# Revocation path
DITTO_ADMIN=1 pnpm cli network debug oauth-revoke --service google-workspace --user $USER_ID
# Expect: SSE TOKEN_REVOKED delivered to workspace within 5s. Next send falls back to AgentMail.
# Self surfaces reconnect offer (captured in conversation log).
# Without DITTO_ADMIN=1, command refuses to run (guard check).
```

## Open Decisions (Forces surfaced by this brief)

1. **OAuth app registration ownership.** Which human/role owns the Google Cloud project, Slack app, Notion integration? Ops task, not engineering — needs a named owner before Brief 188+ ship more providers.
2. **State store backend.** In-memory for MVP is fine; Redis or vault-backed needed before horizontal scaling. Out of scope for 187; flagged for Brief 191.
3. **Consolidated trust-gate ADR for write integrations (non-blocking).** Brief 187 and Brief 184 both inherit trust-gate enforcement from the workspace's integration pipeline with `stepRunId` as the invocation anchor — no new trust token invented. A follow-up ADR could formalise the shared shape across write integrations, but it is NOT blocking this brief or Brief 184.

**Resolved at drafting time (2026-04-17):**
- ~~Network Service callback domain~~ → `ditto.partners`; callback URL pinned to `https://ditto.partners/v1/network/oauth/callback`. The Network Service is the front door, not a separate sub-domain (ADR-025).
- ~~Trust-gate approval token shape~~ → inherited from the existing integration pipeline trust gate (same as Brief 184). `stepRunId` is the invocation anchor (Insight-180); no new trust token invented. No `approved_at` field.
- ~~`.env.example` + OAuth env vars~~ → `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` staged; redirect URI documented. Slack/Notion stubs commented out for Briefs 189/190.
- ~~landscape.md + roadmap.md annotations (ADR-031 deferral)~~ → done 2026-04-17 as part of ADR-031's acceptance commit; not deferred to "After Completion."

## After Completion

1. Update `docs/state.md` — Brief 187 complete; OAuth skeleton + Gmail live; Briefs 188–190 next to add Calendar/Drive/Slack/Notion.
2. Update `docs/roadmap.md` — "OAuth for managed cloud (top 5)" row marked partial (Gmail done). (The Nango-deferral annotation is already landed from the ADR-031 acceptance commit.)
3. Phase retrospective note in `state.md`:
   - Did `OAuthClient` interface shape survive first-contact with Google's quirks, or did we leak Google-isms into the interface?
   - How much of Brief 187's scope would have been avoided by Nango adoption? (Honest answer informs Phase 12 trigger calibration.)
   - Did the "one provider proven end-to-end" split actually keep the brief reviewable, or did reviewers ask for the other 4 providers anyway?
5. If Gmail broker works, open Briefs 188 (Google Calendar + Drive — same OAuth grant, different scopes), 189 (Slack), 190 (Notion), 191 (refresh-worker productionisation).
