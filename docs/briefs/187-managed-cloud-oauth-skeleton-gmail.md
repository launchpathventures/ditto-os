# Brief 187: Managed-Cloud OAuth — Skeleton + Google Workspace (Gmail, Calendar, Drive)

**Date:** 2026-04-17 (widened to Calendar + Drive: 2026-04-20)
**Status:** ready
**Depends on:** ADR-031 (OAuth credential platform), ADR-025 (Centralised Network Service), ADR-005 (integration architecture), Insight-090 (integration auth is a conversation moment), Insight-186 (non-blocking integration upgrade offers)
**Unlocks:** Next OAuth provider briefs (Slack, Notion — TBD numbers per Insight-200 hygiene; original 188–190 numbers are taken by RSI/autopilot work), refresh-worker productionisation + revocation UX

## Goal

- **Roadmap phase:** Phase 10 / 11 (integration auth — per `docs/research/integration-auth-reality.md` phasing; not the roadmap's "Phase 11: Intelligent Discovery")
- **Capabilities delivered:** One seam + one provider family (Google Workspace). The Network Service OAuth consent handler (`/v1/network/oauth/start` and `/v1/network/oauth/callback`), the `oauth-grant` vault payload discriminator, the workspace-to-Network bridge for token-backed calls, and **Google Workspace connected end-to-end** — one consent flow grants Gmail + Calendar + Drive scopes in a single grant, with three broker endpoints proving each scope family works: `gmail/send`, `calendar/create-event`, `drive/upload-file`. Other providers (Slack, Notion, etc.) remain in follow-up briefs.

## Context

ADR-031 closes the long-open question on integration credential platform: build core inside the Network Service for the top-5 providers; defer Nango to Phase 12 re-evaluation. This brief starts the build.

Following Insight-004 (one integration seam per brief), this brief delivers the OAuth seam **end-to-end for exactly one provider family — Google Workspace** — rather than stubbing unrelated providers. "Provider family" here means one consent flow, one OAuth grant, one refresh cycle: Google returns a single grant whose scopes cover Gmail, Calendar, and Drive simultaneously, so adding Calendar + Drive alongside Gmail is incremental scope on a shared grant, not a second OAuth integration. The seam is still proved once. Follow-up briefs (Slack, Notion, etc.) add new provider *families* using the same pattern.

Google Workspace is chosen as the proof provider family because (a) Gmail is the highest-value integration for Alex (sending outreach on behalf of the user per Insight-186); (b) Google's OAuth semantics are well-documented and non-unusual; (c) `google-workspace.yaml` already declares Gmail + Calendar tools — extending it with OAuth metadata is incremental, not new-service work; and (d) Calendar and Drive share the same OAuth grant and refresh cycle as Gmail, so proving those scope families in the same brief costs one extra scope entry per service plus one broker endpoint each — and crucially de-risks the "does multi-scope consent actually work?" question once rather than deferring it to a follow-up.

**Note on Insight-004 tension:** this widens the original "one seam, one provider" shape. The widening is architecturally justified because Calendar + Drive share a grant with Gmail (not a new OAuth flow), but it does pull the brief closer to the size limit. The mitigation is that the three broker endpoints are structurally identical (same auth, same guard, same activity-row shape) — each is a thin wrapper around a different Google API call. If the build grows beyond ~3 days or the brokers start needing service-specific logic beyond a method signature, split Calendar and Drive into a follow-up brief.

## Objective

Stand up the Network Service's OAuth subsystem, prove it end-to-end with Google Workspace (Gmail + Calendar + Drive in a single grant), and leave the provider-extension seam clean enough that follow-up briefs add Slack/Notion without touching the handler.

Exit criterion: Rob (the persona) clicks "Connect Google" in his workspace, completes one Google consent screen covering Gmail + Calendar + Drive scopes, and:
- the next outreach email Alex drafts sends successfully from `rob@hendersonplumbing.com.au` via `POST /v1/network/gmail/send`;
- Alex can create a calendar event on Rob's primary calendar via `POST /v1/network/calendar/create-event`;
- Alex can upload a generated document to Rob's Drive via `POST /v1/network/drive/upload-file`.

The workspace never touches the access token; the Network's vault holds it. The refresh worker rotates it before expiry. Revoking access in Google triggers a non-blocking reconnect offer, not a hard block.

## Non-Goals

- **No provider families beyond Google Workspace in this brief.** Slack, Notion, and any non-Google OAuth provider are in follow-up briefs. Google Workspace (Gmail + Calendar + Drive — one grant) is the seam proof.
- **No broker operations beyond the three named proof operations.** Gmail `send`, Calendar `create-event`, Drive `upload-file` are the proof. Additional operations (Gmail `search`/`read`, Calendar `list`/`update`, Drive `list`/`download`/`share`) are deferred; the CLI path still covers them where `gws` tools exist.
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
- **Engine-core boundary:** OAuth types (`OAuthGrant`, `OAuthGrantHandle`, `OAuthClient`, `OAuthProviderConfig`) live in `packages/core/src/oauth/` (reusable primitives, per `@ditto/core` charter). The Network Service's HTTP handlers and refresh worker live in `src/engine/network/oauth/` (Ditto product layer). The Google-specific brokers (`gmail/send`, `calendar/create-event`, `drive/upload-file`) live in `src/engine/network/brokers/{gmail,calendar,drive}.ts`.
- **Scope-narrowing on broker calls.** Every broker MUST assert that the resolved grant contains the scope its operation requires. Missing scope → 403. This prevents a future grant whose user declined part of the consent screen from succeeding on operations it didn't authorise. `drive.file` (not `drive`) is used so Ditto can only touch files it created — user's existing Drive content is never accessible.
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
| `integrations/google-workspace.yaml` | Modify — add `oauth:` block under the `rest` interface with scopes for all three services: `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/calendar.events`, `https://www.googleapis.com/auth/drive.file` (drive.file grants access only to files created or explicitly opened by Ditto — narrower than `drive`, consistent with principle of least privilege). `app_handle: ditto-google-workspace`, `login_hint_field: email`. CLI path unchanged. |
| `packages/core/src/db/schema.ts` (or migration file) | Modify — no column changes. Document `credentials.payload` now accepts `kind: "oauth-grant"` with sub-fields `{ access_token, refresh_token, expires_at, scopes, revision }`. Drizzle migration journal needs no entry (no schema change). Add type tests to enforce discriminator shape. |
| `src/engine/credential-vault.ts` | Modify — add `getOAuthGrant(service, userId)` read helper: decrypts, validates `kind === "oauth-grant"`, returns typed grant. Throws on mismatch. Add `putOAuthGrant(service, userId, grant)` write helper. Both Network-only — workspace cannot call. |
| `src/engine/network/oauth/handlers.ts` | Create — HTTP handlers: `POST /v1/network/oauth/start` (build redirect URL, persist state with PKCE verifier, return URL), `GET /v1/network/oauth/callback` (validate state, exchange code, persist grant, emit SSE `oauth.connected` to workspace, redirect to workspace success URL). |
| `src/engine/network/oauth/state-store.ts` | Create — signed state + PKCE verifier store. Keyed by opaque state token. 10-min TTL. In-memory for MVP; swappable interface for future Redis. |
| `src/engine/network/oauth/client-google.ts` | Create — `OAuthClient` implementation for Google. Uses `googleapis` or raw `fetch` against Google's OAuth endpoints. Reads client secret from `GOOGLE_OAUTH_CLIENT_SECRET` env var; never logged. |
| `src/engine/network/oauth/client-fake.ts` | Create — test double. Returns deterministic grants; advances clock for refresh tests. |
| `src/engine/network/oauth/refresh-worker.ts` | Create — cron-style job. Every 60s: SELECT grants where `expires_at < now() + 5m` AND `status = 'ACTIVE'`; refresh; update vault; on failure backoff; after 6 failures flip to `REVOKED` + SSE event. |
| `src/engine/network/brokers/gmail.ts` | Create — `POST /v1/network/gmail/send` handler. Validates workspace API token, resolves user, validates `stepRunId` against active `stepRuns` row (Insight-180 guard), reads grant, asserts grant has `gmail.send` scope, calls Gmail API, redacts body in logs, writes activity row, returns result. Trust-gate enforcement happens in the workspace pipeline before the HTTP call — broker does not re-check. |
| `src/engine/network/brokers/gmail.test.ts` | Create — covers: unauthenticated rejected (401), missing `stepRunId` rejected (400), `stepRunId` not resolving to active stepRuns row rejected (400), token refresh on 401 from Google, revoked grant → `TOKEN_REVOKED` SSE, successful send writes activity row, body never appears in log sink (including error paths), missing `gmail.send` scope in grant → 403. |
| `src/engine/network/brokers/calendar.ts` | Create — `POST /v1/network/calendar/create-event` handler. Same invocation/guard/refresh/activity-row shape as `gmail.ts`. Asserts grant has `calendar.events` scope. Redacts attendee email addresses and event description from logs (only length + count logged). Returns `{ event_id, html_link }` on success. |
| `src/engine/network/brokers/calendar.test.ts` | Create — covers: same auth/guard/refresh/revocation paths as Gmail broker; plus missing `calendar.events` scope → 403; attendee emails + description body never appear in log sink. |
| `src/engine/network/brokers/drive.ts` | Create — `POST /v1/network/drive/upload-file` handler. Same invocation/guard/refresh/activity-row shape. Asserts grant has `drive.file` scope. Accepts file content via multipart or base64 body. Redacts file content bytes from logs (only filename + mime-type + size logged). Returns `{ file_id, web_view_link }` on success. |
| `src/engine/network/brokers/drive.test.ts` | Create — covers: same auth/guard/refresh/revocation paths; plus missing `drive.file` scope → 403; file content bytes never appear in log sink; oversized uploads (>25MB) rejected with 413 before any Google call. |
| `src/engine/network/oauth/handlers.test.ts` | Create — covers: state validated, PKCE verifier round-trip, callback without matching state rejected, expired state rejected, successful callback persists grant and emits SSE. |
| `src/engine/network/oauth/refresh-worker.test.ts` | Create — covers: refreshes before expiry, backoff on transient failure, flips to `REVOKED` after 6 consecutive failures, fires SSE event on flip. Uses `client-fake.ts`. |
| `src/engine/self-tools/connect-service.ts` | Modify — add `oauth_start` action. Given `service`, returns workspace redirect URL (obtained from Network via `/v1/network/oauth/start`). Existing `check | guide | verify` actions unchanged. |
| `src/engine/self-tools/self-tools.test.ts` | Modify — add test for `oauth_start` action (uses fake Network). |
| `src/engine/google-workspace-integration.ts` | Modify — send path can now resolve credentials via OAuth grant (call through Network broker) OR CLI. Resolution order: OAuth grant → CLI → error. |
| `src/engine/google-workspace-integration.test.ts` | Modify — add test covering OAuth-backed send path. |
| `packages/web/components/integrations/connect-button.tsx` | Create — minimal component. Button → fetch Network OAuth URL → window.open → poll for `oauth.connected` SSE → update UI. |
| `packages/web/app/(workspace)/integrations/connected.tsx` | Create — success page the Network callback redirects to. Shows "Gmail connected" + returns to conversation. |
| `.env.example` | Modify — add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` under a new "Network Service — Managed OAuth" section. Stubs for Slack/Notion (Briefs 189/190) commented out. Redirect URI documented as `https://ditto.partners/v1/network/oauth/callback`. Already staged during the brief-drafting pass (2026-04-17) so this row is effectively a check-in, not net-new. |
| `src/cli/commands/network-debug.ts` | Create — admin CLI group under `pnpm cli network debug *`. Two subcommands: (1) `pnpm cli network debug oauth-revoke --service <name> --user <id>` force-flips a vault grant to `REVOKED` and fires SSE; used by smoke test and for ops-driven revocation testing. (2) `pnpm cli network debug step-run seed --process <slug> --json` creates a minimal active `stepRuns` row and prints `{"stepRunId": "<id>"}` to stdout; used by smoke test to exercise the gmail/send Insight-180 guard path without running a full process. Both subcommands guarded by `DITTO_ADMIN=1` env — refuse to run without it. |
| `src/engine/network/oauth/module-boundary.test.ts` | Create — asserts no file under `src/` outside `src/engine/network/` imports from `packages/core/src/oauth/internal/*`. Covers the "workspace never holds a token" invariant at the module level. |
| `src/engine/network/oauth/response-shape.test.ts` | Create — asserts no Network HTTP response or SSE event fixture payload contains `access_token` or `refresh_token` substrings. Runs against representative fixtures for every endpoint the Network exposes. |
| `docs/state.md` | Modify — record Brief 187 complete, OAuth skeleton + Gmail live. |
| `docs/roadmap.md` | Modify — mark "OAuth for managed cloud (top 5)" row as partially done (Gmail). |
| `docs/landscape.md` | Modify — Nango entry annotated with ADR-031 deferral note. |

**Not modified in 187** (lands in follow-up briefs): Calendar, Drive, Slack, Notion broker endpoints. Settings UI for managing connections. Refresh-worker HA. Browser-session integration (Brief 184 unrelated). Self-hoster documentation for OAuth BYO apps.

## User Experience

- **Jobs affected:** "send outreach email as Alex on behalf of the user" (Insight-186 pattern); "schedule follow-up meetings on the user's calendar"; "save generated artefacts (quotes, briefings) to the user's Drive."
- **Primitives involved:**
  - Conversational auth moment (Insight-090) — Self asks, user consents in-context, one consent covers all three scope families
  - Non-blocking upgrade offer (Insight-186) — if Google isn't connected yet, outreach still sends via AgentMail, calendar operations stay in Ditto-internal state, and Drive uploads defer; Self offers Google upgrade once, respects silence after
  - Connect button (new) — one click opens Google consent, returns to conversation on success
  - Reconnect prompt (new) — on `TOKEN_REVOKED`, Self offers reconnect non-blockingly; operations fall back to their Ditto-internal alternatives for that run
- **Process-owner perspective (Rob, SMB owner):**
  1. Rob: "I want Alex to send emails from my Gmail, schedule follow-ups on my calendar, and save quotes to my Drive."
  2. Self: "One sec — I'll open Google's sign-in. One screen covers Gmail, Calendar, and Drive. Takes about 15 seconds."
  3. [Connect button opens Google consent popup. Rob signs in, approves three scopes in one screen: send Gmail, manage Calendar events, create + manage files Ditto uploads to Drive.]
  4. [Callback lands on Ditto. SSE `oauth.connected` fires. Workspace updates.]
  5. Self: "Connected — rob@hendersonplumbing.com.au. I can now send Gmail on your behalf, create Calendar events, and upload files to Drive. I can't read your inbox, I can't see Calendar events I didn't create, and I can't touch any Drive file I didn't upload."
  6. [Alex drafts and sends the next outreach; creates a follow-up calendar invite; uploads the generated quote PDF. Three activity rows recorded.]
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
4. [ ] `integrations/google-workspace.yaml` declares all three OAuth scopes (`gmail.send`, `calendar.events`, `drive.file`) under `rest.oauth`. Loads without validator error. `drive.file` (not `drive`) is the deliberate choice — narrow scope documented inline in the YAML comment.
5. [ ] `POST /v1/network/oauth/start?service=google-workspace` returns a Google consent URL with valid PKCE challenge + signed state nonce. State persisted with 10-min TTL.
6. [ ] `GET /v1/network/oauth/callback` with valid state exchanges the code, persists grant with `kind: "oauth-grant"` discriminator, fires SSE `oauth.connected` event to the originating workspace, redirects to workspace success page. Mismatched / expired state returns 400.
7. [ ] `getOAuthGrant(service, userId)` returns typed grant on success; throws on discriminator mismatch; throws on missing row.
8. [ ] `refresh-worker.ts` refreshes grants at `expires_at - 5m`; exponential backoff on transient failure (max 1h); flips grant to `REVOKED` + fires SSE event after 6 consecutive failures.
9. [ ] All three broker endpoints — `POST /v1/network/gmail/send`, `POST /v1/network/calendar/create-event`, `POST /v1/network/drive/upload-file` — share the same guard/refresh/activity-row shape and each: (a) rejects unauthenticated calls (no valid workspace API token → 401); (b) rejects calls missing `stepRunId` (Insight-180 guard → 400 unless `DITTO_TEST_MODE=1`); (c) rejects calls whose `stepRunId` does not resolve to an active `stepRuns` row → 400; (d) asserts the grant contains the required scope (`gmail.send` / `calendar.events` / `drive.file` respectively) and returns 403 on missing scope; (e) refreshes token on 401 from Google and retries once; (f) writes activity row with actor/service/operation/scopes/timestamp/result on every call (success or failure); (g) redacts service-specific sensitive content from every logger sink (Gmail body text; Calendar attendee emails + description; Drive file content bytes) — asserted via test that captures all log output, including error paths. Trust-gate enforcement happens in the workspace's integration pipeline before the HTTP call — Network brokers do not second-guess.
10. [ ] `connect_service` Self tool `oauth_start` action returns the Network redirect URL given a service name. Existing `check | guide | verify` actions continue to work.
11. [ ] Workspace `connect-button.tsx` opens the OAuth URL, listens for `oauth.connected` SSE, updates UI on success. Success page lands and returns to conversation.
12. [ ] End-to-end smoke test against **a real Google test account** (one-time-setup Google Cloud project in Ditto's dev org; test account credentials in 1Password under "Ditto OAuth — dev test accounts"): user completes **one** consent screen and the grant covers all three scope families; Alex then (a) sends an email through the Gmail broker → email arrives in the test recipient inbox; (b) creates a calendar event through the Calendar broker → event visible on the test account's primary calendar; (c) uploads a small generated document through the Drive broker → file visible in the test account's Drive under the `drive.file`-created set. All three produce activity rows; no raw token appears in workspace logs; no service-specific sensitive content (Gmail body, Calendar attendees/description, Drive file bytes) appears in any log sink. Recorded-fixture path is explicitly NOT acceptable — the only proof that multi-scope consent + refresh + per-service call work end-to-end is real Google calls. CI gates this behind `INTEGRATION_TEST_GOOGLE=1` so normal PR runs don't require the credential.
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
   - **Invocation guard (Insight-180):** does the broker correctly refuse when `stepRunId` is missing or does not resolve to an active `stepRuns` row? Is trust-gate enforcement correctly left to the workspace pipeline (same as Brief 184), with no re-check in the broker? Are the four entry points (oauth/start, oauth/callback, gmail/send, refresh-worker tick) each using the anchor the brief specifies?
   - **Schema validation:** does the validator genuinely reject malformed OAuth configs, or only warn? Covered by negative tests?
   - **Insight-186 adherence:** on `TOKEN_REVOKED`, does the system fall back rather than block? Is the "offer once per cycle type" flag actually scoped correctly?
3. Fresh-context reviewer re-reads: does this brief hold to "one integration seam per brief" (Insight-004)? The deliberate widening to three Google Workspace scope families on one grant is argued in §Context — does the reviewer agree the three brokers share enough structure (auth / guard / refresh / activity row) that the brief is still "one seam," or should Calendar and Drive split into a follow-up? Any hidden dependencies on not-yet-built pieces? Scope-narrowing enforcement (`drive.file` not `drive`) actually implemented everywhere the grant is resolved?
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

# OAuth start — real Google call using dev test account (INTEGRATION_TEST_GOOGLE=1 required)
curl -X POST http://localhost:${NETWORK_PORT}/v1/network/oauth/start \
  -H "Authorization: Bearer $WORKSPACE_API_TOKEN" \
  -d '{"service":"google-workspace"}'
# Expect: JSON { redirect_url: "https://accounts.google.com/o/oauth2/v2/auth?..." }

# Manual: open redirect_url in browser, complete consent, verify callback lands
# Expect: success page, workspace receives SSE oauth.connected event, Self confirms

# Broker send
# Seed a stepRun for the smoke test (or reuse an active one from a real process run)
STEP_RUN_ID=$(DITTO_ADMIN=1 pnpm cli network debug step-run seed --process gmail-smoke --json | jq -r .stepRunId)

curl -X POST http://localhost:${NETWORK_PORT}/v1/network/gmail/send \
  -H "Authorization: Bearer $WORKSPACE_API_TOKEN" \
  -d "{\"to\":\"test@example.com\",\"subject\":\"Hi\",\"body\":\"Test\",\"stepRunId\":\"$STEP_RUN_ID\"}"
# Expect: 200 + message_id. Activity row visible via `pnpm cli activities --service gmail`.
# Expect: grep $WORKSPACE_LOG $GMAIL_BODY_TEXT → no matches.

# Calendar broker — create event on primary calendar
curl -X POST http://localhost:${NETWORK_PORT}/v1/network/calendar/create-event \
  -H "Authorization: Bearer $WORKSPACE_API_TOKEN" \
  -d "{\"calendar\":\"primary\",\"summary\":\"Follow-up with Acme\",\"start\":\"2026-05-01T10:00:00Z\",\"end\":\"2026-05-01T10:30:00Z\",\"attendees\":[\"test@example.com\"],\"stepRunId\":\"$STEP_RUN_ID\"}"
# Expect: 200 + { event_id, html_link }. Activity row visible via `pnpm cli activities --service calendar`.
# Expect: grep $WORKSPACE_LOG "test@example.com" → no matches (attendee addresses redacted).

# Drive broker — upload a small generated artefact
curl -X POST http://localhost:${NETWORK_PORT}/v1/network/drive/upload-file \
  -H "Authorization: Bearer $WORKSPACE_API_TOKEN" \
  -F "filename=quote.txt" \
  -F "mime=text/plain" \
  -F "stepRunId=$STEP_RUN_ID" \
  -F "content=@/tmp/smoke-quote.txt"
# Expect: 200 + { file_id, web_view_link }. Activity row visible via `pnpm cli activities --service drive`.
# Expect: grep $WORKSPACE_LOG "<file body contents>" → no matches (file bytes never logged).

# Negative: any broker call without stepRunId
curl -X POST http://localhost:${NETWORK_PORT}/v1/network/gmail/send \
  -H "Authorization: Bearer $WORKSPACE_API_TOKEN" \
  -d '{"to":"test@example.com","subject":"Hi","body":"Test"}'
# Expect: 400 — missing stepRunId (Insight-180 guard). DITTO_TEST_MODE=1 bypasses. Same guard applies to calendar + drive.

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

1. Update `docs/state.md` — Brief 187 complete; OAuth skeleton + Google Workspace (Gmail + Calendar + Drive on one grant) live; follow-up briefs next to add non-Google provider families (Slack, Notion) and refresh-worker productionisation.
2. Update `docs/roadmap.md` — "OAuth for managed cloud (top 5)" row marked partial (Google Workspace done — 1 of ~5 provider families). (The Nango-deferral annotation is already landed from the ADR-031 acceptance commit.)
3. Phase retrospective note in `state.md`:
   - Did `OAuthClient` interface shape survive first-contact with Google's quirks, or did we leak Google-isms into the interface?
   - How much of Brief 187's scope would have been avoided by Nango adoption? (Honest answer informs Phase 12 trigger calibration.)
   - Did widening to Google-Workspace-family (Gmail + Calendar + Drive) in one brief hold to Insight-004, or did the three brokers pull the brief over the size limit? (Retrospective informs whether future provider-family widenings are safe.)
   - Did the three brokers actually share structure (auth / guard / refresh / activity row) as predicted, or did Calendar or Drive need service-specific logic that should have been its own brief?
4. Next briefs to open if this ships clean: Slack OAuth (new provider family), Notion OAuth (new provider family), refresh-worker productionisation + revocation UX, Google Workspace additional operations (Gmail `search`/`read`, Calendar `list`/`update`, Drive `list`/`download`) if demand surfaces.
