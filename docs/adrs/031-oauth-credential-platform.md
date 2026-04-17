# ADR-031: OAuth Credential Platform — Build Core, Defer Long Tail

**Date:** 2026-04-17
**Status:** accepted
**Resolves:** ADR-005 open follow-up — "Which integration platform (if any) to adopt for credential management: build minimal, adopt Nango, or use Composio"
**Related:** ADR-025 (Centralised Network Service), ADR-018 (Runtime Deployment), Insight-090 (integration auth is a conversation moment), Insight-186 (non-blocking integration upgrade offers)

## Context

ADR-005 closed the high-level integration architecture (multi-protocol, multi-purpose) but left the credential-platform question open. Today that open question blocks managed-cloud OAuth for the top-5 providers Alex and Mira need to send email, schedule meetings, access documents, and post to Slack on a user's behalf: **Gmail, Google Calendar, Google Drive, Slack, Notion.**

The question has specific structure given ADR-025 and the three-layer deployment model (Network Service + per-user Workspace + bridge):

1. OAuth apps are owned by the Network Service — one set of Ditto-registered apps serves all managed-cloud users.
2. Workspaces never handle OAuth tokens — they call the Network with a service handle, and the Network injects the real token server-side.
3. Refresh, revocation, scope drift, and token rotation all belong to the Network.

Three options for the Network's OAuth implementation were evaluated in `docs/research/external-integrations-architecture.md` and `docs/research/integration-auth-reality.md`:

- **Build core** — implement OAuth consent handler + refresh worker + per-provider registration inside the Network Service. Bespoke, small surface.
- **Adopt Nango** (self-hosted, Docker/Helm) — 700+ providers, managed auth, automatic refresh. Elastic License v2.
- **Adopt Composio** (cloud SDK) — 1000+ providers, brokered credentials, cloud-only.

### Forces

- **Scope is small for MVP.** OAuth handler + refresh worker + top-5 providers is ~3–4 weeks of engineering inside the Network. Well within "boil the ocean" range.
- **Licensing is load-bearing.** Nango ships under Elastic License v2, which prohibits "providing the software to third parties as a hosted or managed service, where the service provides users with access to any substantial set of the features or functionality of the software." The Ditto Network Service is precisely such a service for managed-cloud users. Conservative reading: adopting Nango inside the Network Service without a commercial license from NangoHQ is legally risky.
- **Composio is cloud-only.** Incompatible with self-hosted Track B and adds a hard cloud dependency to a layer that should be ours.
- **Coverage asymmetry.** At 5 providers, building is cheaper and cleaner than any platform. At 50 providers, Nango's coverage saves months. The break-even sits somewhere between and is not known yet — we have not shipped a single OAuth'd integration in production.
- **Strategic control.** Integrations are on the critical path to product value. Owning the auth layer keeps the edge cases (Google's 6-month refresh-token expiry, Slack's token rotation, Notion's workspace-switch quirk) inside Ditto rather than behind a vendor abstraction we can't inspect.
- **Escape hatch already exists.** ADR-005's integration registry is already a declaration (YAML) and the credential vault is already an abstraction. A Nango-backed handler can slot in behind the same interface later — but only if we don't couple to Nango-specific shapes in the meantime.

## Decision

**Build the OAuth platform inside the Network Service for the top-5 providers. Defer the Nango-or-continue-building decision for the long tail to Phase 12.**

### What we build now

1. **OAuth consent handler** inside the Network Service. `POST /v1/network/oauth/start?service={provider}&workspace={id}` returns a provider redirect URL with state + PKCE. `GET /v1/network/oauth/callback` handles the code exchange and stores the grant in the Network vault.
2. **Refresh worker** — scheduled job that proactively rotates access tokens before expiry per provider's semantics. Failures trigger a `TOKEN_REVOKED` event delivered to the workspace via the existing SSE bridge.
3. **Top-5 provider registrations** — Gmail, Google Calendar, Google Drive, Slack, Notion. Each with its own Ditto-owned OAuth app, scopes declared in the integration registry, `connect_service` Self tool gains an `oauth2` method.
4. **Revocation detection** — 401/403 responses on token use trigger `TOKEN_REVOKED`; Self prompts reconnect via the Insight-186 non-blocking upgrade offer pattern, not a hard block.
5. **Workspace ↔ Network bridge** — workspace holds a user-scoped API token (existing from ADR-025). Calls like `POST /v1/network/gmail/send` are logged server-side; every hop lands in the activity table with `network_call` rows for audit.

### What we defer

1. **Long-tail providers** (Xero, HubSpot, Mailchimp, Meta Ads, etc.) — added case-by-case after the top-5 ships, using the same pattern. Each new provider is a scoped brief, not a platform decision.
2. **Nango adoption** — re-evaluated at Phase 12. Trigger: ≥3 unplanned integration requests per week sustained over one month. Before adoption, Ditto must (a) secure a commercial license from NangoHQ, or (b) obtain legal confirmation that Elastic License v2 scope does not apply to our deployment model.
3. **Self-hoster OAuth story** (Track B) — document the fork ("use Ditto Network as auth proxy OR register your own OAuth apps") and pick a default when self-hosters actually ask. No demand signal yet.
4. **BYO OAuth apps** — user wants their own Google Cloud project / Slack app backing the integration. Valid request, deferred until demand appears.

### What we must not do

- **Couple the workspace or integration registry to Nango-specific shapes.** The handler-swap escape hatch only works if the registry stays provider-agnostic.
- **Ship OAuth token handling inside the workspace.** Tokens live in the Network vault only. Workspaces hold handles.
- **Block on OAuth infra being ready** for services that work with API keys. The API-key path (per `docs/research/integration-auth-reality.md`) stays the universal fallback.

### Triggers that would reopen this decision

- NangoHQ publishes a permissive licence tier compatible with our deployment model.
- We ship ≥10 long-tail providers and observe each taking >2 weeks to add.
- A provider we need (not in our top-5) is trivially supported by Nango and non-trivial for us.
- Security audit flags ownership of OAuth refresh workers as a compliance burden better outsourced.

## Provenance

Original to Ditto — informed by:

- **Nango** (`github.com/NangoHQ/nango`) — brokered-credentials pattern, refresh-worker pattern, integration-as-declaration pattern. We adopt the shapes, not the code.
- **Composio** (`composio.dev`) — "agent never sees tokens" invariant. Reinforces keeping tokens in the Network, not workspaces.
- **12-factor migration patterns** — env-var-to-vault migration with deprecation warning (already in `resolveServiceAuth`).
- **Elastic License v2 text** (`github.com/NangoHQ/nango/blob/master/LICENSE`) — specific clause motivating the deferral of Nango adoption until commercial conversation.
- **ADR-025** — Network Service as the owner of cross-workspace concerns including managed OAuth apps.

## Consequences

**What becomes easier:**

- Managed-cloud OAuth UX — one-click "Connect Gmail" for the top-5 providers.
- Refresh reliability — Ditto owns the schedule, can observe failures directly, can test in CI against provider sandboxes.
- Trust + audit — every OAuth'd external call traverses the Network with full provenance (who authorised, when, for which process, which scopes).
- Strategic control — provider quirks stay inside Ditto.

**What becomes harder:**

- Long-tail provider coverage grows linearly with engineering time. Past ~20 providers, the tax is real and ongoing.
- Provider quirk tax — every provider has idiosyncrasies that a platform would abstract away. We absorb these ourselves.
- Multi OAuth app ops — each Ditto-owned OAuth app has its own developer console, secrets, billing, compliance surface. Ops work, not engineering, but still has to be owned.

**New constraints:**

- Integration registry entries for OAuth-backed services MUST declare `auth_type: oauth2` + scopes + an OAuth app handle (by reference); never the client secret itself — secrets live in Network config only.
- Workspace code MUST NOT import OAuth token types. All token-using code paths go through `Network.call(serviceHandle, operation, payload)`.
- Every new provider is a scoped brief with its own OAuth app registration task (ops work) budgeted alongside engineering.
- Integration handler seams must remain provider-agnostic (Nango-compatible shapes) even while built natively, to preserve the escape hatch.

**Follow-up decisions needed (Phase 12+):**

- Nango adoption trigger check: ≥3 unplanned integration requests per week for one month — re-evaluate with commercial-licence pricing in hand.
- Self-hoster Track B OAuth default (auth proxy vs BYO apps vs API-key-only).
- Per-user OAuth app override (user wants their own Google Cloud project backing the integration).

## Closes Out

- ADR-005 "Follow-up decisions needed" → line: "Which integration platform (if any) to adopt for credential management: build minimal, adopt Nango, or use Composio" — **resolved here**.
- `docs/architecture.md` Open Decisions row 1206 — **resolved here**.
