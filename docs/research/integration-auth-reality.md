# Research: Integration Auth — The Reality of Connecting External Systems

**Date:** 2026-03-24
**Role:** Dev Architect
**Trigger:** Architecture validation stress test — every real process needs external system access, but auth setup has no design
**Status:** Complete — design analysis
**Consumers:** Dev Architect (ADR update, brief design), Dev PM (prioritisation)

---

## The Problem

Ditto has solid integration plumbing: credential vault (AES-256-GCM, per-process scoped), integration registry (YAML declarations with auth methods), brokered credentials (agents never see tokens), `resolveServiceAuth()` (vault-first, env-var fallback). ADR-005 is clean.

But all of this assumes the credential is **already in the vault**. The only way to get it there today is `ditto credential add` — a CLI command that requires a terminal. Rob, Steven, Jay, and every target persona will never use it.

When the Self conversationally creates a process that needs Gmail, Xero, Meta, or Epicor — there is no design for what happens next.

---

## The Four Auth Realities

Each auth type imposes fundamentally different requirements on both the user and on Ditto's infrastructure.

### 1. OAuth2 — The Dominant SaaS Pattern

**Services:** Gmail, Google Workspace, Xero, Meta (Instagram/Facebook Ads), Mailchimp, HubSpot, Slack, Salesforce, QuickBooks, Notion, LinkedIn, Stripe (Connect), Microsoft 365

**What OAuth actually requires:**

| Step | Who does it | When |
|------|------------|------|
| **Register an OAuth application** with the provider (get client_id + client_secret) | **Ditto** (platform-level, one-time per provider) | Before any user can connect |
| **Present consent screen** to user (redirect to provider's auth page) | Ditto opens, provider shows | At connection time |
| **Receive callback** with authorization code | Ditto's web server (redirect URI) | Immediately after user consents |
| **Exchange code for tokens** (access_token + refresh_token) | Ditto's backend (server-to-server) | Immediately after callback |
| **Store tokens** encrypted in vault | Ditto's credential vault | Immediately |
| **Refresh tokens** when expired | Ditto's backend (automatic, no user involvement) | Ongoing — hours to months depending on provider |
| **Handle revocation** (user revokes access in provider settings) | Ditto detects failure, prompts reconnect | Ongoing |

**The meta-problem: Who registers the OAuth apps?**

| Deployment track | Who registers | Complexity | User experience |
|-----------------|--------------|------------|-----------------|
| **Managed cloud (Track A)** | Ditto Inc. registers with each provider | One-time per provider. Standard SaaS. | "Connect Gmail" button. User clicks, authorises, done. |
| **Self-hosted (Track B)** | The deployer (or user) must register their own OAuth apps | Per-provider, requires developer console access | Much harder. Options below. |

**Self-hosted OAuth options:**

| Option | User effort | Ditto effort | Reality check |
|--------|-----------|-------------|---------------|
| User registers their own OAuth apps | HIGH — navigate developer consoles, create projects, set redirect URIs | LOW — just needs client_id/secret in config | Jordan can do this. Rob cannot. |
| Ditto provides an auth proxy service | LOW — user clicks "Connect", proxy handles OAuth | HIGH — Ditto runs a hosted auth relay | Like Nango Cloud or Supabase auth. Adds cloud dependency to self-hosted. |
| Adopt Nango (self-hosted) | MEDIUM — deploy Nango alongside Ditto | MEDIUM — integrate with Nango's auth API | Nango is self-hostable (Docker). Handles OAuth for 700+ services. But adds infrastructure. |
| Use MCP servers that handle their own auth | MEDIUM — install + configure MCP server | LOW — MCP handles auth internally | Works for services with official MCP servers (Xero, Google). Not universal. |

**What the Self says (managed cloud):**

> Self: "To send quotes by email, I'll need access to your Gmail. I'll open a quick sign-in — takes about 10 seconds."
>
> [Ditto opens OAuth popup → Google consent screen → Rob clicks "Allow"]
>
> Self: "Connected. I can send emails from rob@hendersonplumbing.com.au. I'll only use this for sending quotes from your quoting process — nothing else."

**What the Self says (self-hosted, no auth proxy):**

> Self: "To send quotes by email, I'll need access to your Gmail. This requires a Google OAuth setup — your IT person will need to create a Google Cloud project and give me the credentials. I've prepared a guide. Want me to send it to them?"
>
> [This is realistic. Rob will ask Jordan or his IT person.]

### 2. API Keys — The Simplest Auth

**Services:** Stripe (API key), SendGrid, Twilio, OpenAI, Anthropic, Deepgram, many REST APIs, most developer tools

**What API key auth requires:**

| Step | Who does it | When |
|------|------------|------|
| **Create an account** with the provider | User (already done in most cases) | Before connection |
| **Navigate to API keys page** in provider dashboard | User (with Self's guidance) | At connection time |
| **Copy the key** | User | At connection time |
| **Paste into Ditto** | User (via conversation or settings) | At connection time |
| **Store encrypted** in vault | Ditto's credential vault | Immediately |

**No platform-level setup needed.** API keys work identically for managed cloud and self-hosted. No OAuth apps to register. No callbacks to handle.

**Security constraint: Secure credential input.** API keys must NOT be entered as regular chat messages — chat history is persisted, logged, and visible in activity tables. The `connect_service` tool must accept credentials through a **masked input field** (like a password field) that is never written to conversation history or activity logs. The Self prompts: "Paste your key below" → a masked input appears → the key goes directly to the vault, never touching the conversation log.

**What the Self says:**

> Self: "I'll need a Stripe API key to check payment status. Here's how to get one:
>
> 1. Go to dashboard.stripe.com
> 2. Click 'Developers' → 'API keys'
> 3. Copy the 'Secret key' (starts with sk_live_)
> 4. Paste it in the secure field below
>
> I'll store it securely and only use it for invoice reconciliation."
>
> [Masked input field appears — key goes directly to vault]
>
> Self: "Got it. Testing... I can see your recent transactions. Connected."

**The Self can be even more specific:**

> Self: "For Xero, I need an API key. Go to developer.xero.com/app/manage, click 'New App', choose 'Custom Connection'..."

This works because the Self has domain knowledge about each service's setup process. The integration registry could store setup instructions per service.

### 3. CLI Tools — Developer-Only Path

**Services:** gh (GitHub), gws (Google Workspace), stripe CLI, aws CLI, kubectl, docker

**What CLI auth requires:**

| Step | Who does it | When |
|------|------------|------|
| **Install the CLI** on the server | Deployer/user | Before connection |
| **Run CLI's own auth command** (e.g., `gh auth login`, `gws auth login`) | User or deployer (in terminal) | At connection time |
| **CLI stores its own credentials** (OS keyring, config files) | CLI handles this | Immediately |
| **Ditto detects CLI availability** and auth status | Ditto (at process creation) | At connection time |

**Reality check:**

- CLI auth is **only relevant for self-hosted Track B** (managed cloud would pre-install CLIs)
- CLI tools require terminal access — non-technical users won't install or auth them
- For managed cloud: Ditto pre-installs common CLIs and handles auth setup during instance provisioning, or provides admin UI
- The cost advantage of CLI (10-32x cheaper than MCP) is significant but only matters if the CLI is available

**What the Self says (developer user like Jordan):**

> Self: "I can use the GitHub CLI for this — it's much cheaper than the API. Do you have `gh` installed?"
>
> Jordan: "Yeah."
>
> Self: "Great. Run `gh auth status` — if you're logged in, I'm good to go."

**What the Self says (non-technical user):**

The Self **doesn't mention CLIs** to Rob or Steven. It uses OAuth or API key paths instead. CLI is an optimisation for technical users, not a primary path.

### 4. MCP Servers — Emerging Standard

**Services:** Xero (official), Google Workspace (official), GitHub (official), Slack (community), plus hundreds of community servers

**What MCP auth requires:**

| Step | Who does it | When |
|------|------------|------|
| **Install/run the MCP server** | Deployer or Ditto (pre-bundled) | Before connection |
| **Configure MCP server auth** (varies — OAuth, API key, env var) | Depends on MCP server | At setup |
| **Connect Ditto to MCP server** (stdio or HTTP/SSE URI) | Ditto configuration | At setup |
| **MCP server brokers all calls** | MCP server (transparent to Ditto) | Ongoing |

**Reality:** MCP servers are a deployment concern, not a user concern. The user doesn't know MCP exists. The question is whether the MCP server itself uses OAuth (requiring the same OAuth setup problem) or API keys (simpler).

**For managed cloud:** Ditto pre-deploys common MCP servers. OAuth for those servers is handled by Ditto Inc.'s registered OAuth apps. User sees "Connect Xero" button.

**For self-hosted:** Deployer installs MCP servers (Docker, npm). Auth configuration is part of deployment, not conversational setup.

### 5. No API — The Human Step Fallback

**Services:** Government portals (FICO's visa submissions), some legacy systems, on-premise ERPs without API access, manual-only processes

**What happens:** Ditto prepares the output (application package, formatted data, document) and creates a human step. The user submits manually.

**What the Self says:**

> Self: "I can't submit directly to the visa portal — they don't have an API. I'll prepare the full application package with all documents in the right format, and you'll submit it through their website. I'll remind you when it's ready and walk you through what to upload."

This is not a failure — it's the architecture working correctly. `executor: human` exists for exactly this reason.

---

## What Ditto Needs: The Connection Lifecycle

### Registry Extension

The integration registry (`integrations/*.yaml`) already declares auth methods. Extend with connection setup metadata:

```yaml
service: xero
description: Xero accounting — invoices, contacts, payments, bank transactions
interfaces:
  mcp:
    uri: stdio://xero-mcp-server
    auth: oauth2
  rest:
    base_url: https://api.xero.com/api.xro/2.0
    auth: oauth2
preferred: mcp

# NEW: Connection setup metadata
connection:
  auth_type: oauth2                    # oauth2 | api_key | cli_login | none
  provider_name: Xero                  # Human-readable name
  setup_url: https://developer.xero.com/app/manage  # Where to go for self-serve
  scopes:                              # OAuth scopes needed
    - accounting.transactions
    - accounting.contacts.read
  instructions: |                      # Self uses this to guide API key users
    1. Go to developer.xero.com/app/manage
    2. Click 'New App' → 'Custom Connection'
    3. Copy the Client ID and Client Secret
  test_command: null                   # CLI command to test connection
  test_endpoint: /Organisation         # REST endpoint to verify (GET, expect 200)
  reusable: true                       # Can credentials be shared across processes?
  human_description: |                 # What Self tells the user about scope
    I'll be able to see your invoices, contacts, and payments.
    I won't change any settings or access bank feeds.
```

### Connection States

A process that needs an integration should track connection state:

```
DISCONNECTED → CONNECTING → TESTING → CONNECTED → EXPIRED → RECONNECTING
                                                     ↓
                                                   FAILED
```

**Process creation with missing connections:**

The Self creates the process definition. If integrations are needed but not connected, the process is created with status `needs_connection` (not silently broken). The Self tracks what's missing and prompts when appropriate.

> Self: "I've set up your quoting process. It needs Gmail to send quotes — want to connect that now, or get it running with manual sending first?"

**Graceful degradation:** A process with a missing integration can still run — the integration step becomes a human step ("I've drafted the quote. Here it is — you'll need to email it yourself until we connect Gmail").

### Connection Reuse

When a user connects Gmail for quoting, the Self should offer to reuse it:

> Self: "You already have Gmail connected for quoting. Want to use the same connection for follow-up emails?"

The credential vault is per-(processId, service) — a deliberate security boundary (ADR-005). Reuse means **copying the credential** to the new process scope. The Self handles this conversationally: "You already have Gmail connected for quoting. Want to use the same connection for follow-up emails?" → copies credential, no schema change needed.

**Rejected alternative:** A global credential scope (`processId: "*"`) was considered and rejected. It weakens per-process isolation without sufficient benefit. Copy-credential solves the UX problem while preserving the security boundary. Each process's credential usage remains independently auditable.

---

## Deployment Track Implications

### Track A: Managed Cloud (Primary User Path)

| Auth type | Infrastructure needed | User experience |
|-----------|----------------------|-----------------|
| OAuth2 | Ditto Inc. registers OAuth apps with each provider. Server handles redirect/callback/token-exchange. | "Connect Gmail" → popup → authorise → done |
| API key | Nothing beyond the conversation surface | Self guides user to copy key → paste → test → done |
| CLI | Pre-install common CLIs on managed instances | Transparent — user doesn't know CLIs are used |
| MCP | Pre-deploy common MCP servers | Transparent — user sees "Connect Xero" |

**This is standard SaaS.** Every product from Zapier to n8n to Cal.com does this. The hard part is registering OAuth apps with dozens of providers and maintaining them. This is a startup operations task, not an architecture task.

### Track B: Self-Hosted (Developer Path)

| Auth type | Infrastructure needed | User experience |
|-----------|----------------------|-----------------|
| OAuth2 (option 1) | User registers own OAuth apps. Configures client_id/secret. | Developer-only. Self provides setup guide. |
| OAuth2 (option 2) | Adopt Nango self-hosted. One Docker container. | Medium effort. Nango handles OAuth flows. |
| OAuth2 (option 3) | Ditto provides auth proxy. Self-hosted talks to Ditto's OAuth relay. | Easy for user. Adds cloud dependency. |
| API key | Nothing beyond the conversation surface | Same as managed cloud |
| CLI | User installs CLIs and runs auth commands | Self detects and guides |
| MCP | User runs MCP servers (Docker/npm) | Configuration at deploy time |

**Recommendation for MVP:** Start with API keys (works everywhere, no infrastructure) and defer OAuth to when managed cloud launches. For dogfood, env vars and `ditto credential add` are sufficient. OAuth is a Track A feature.

---

## What the Self Needs

### Auth Detection During Process Creation

When the Self creates a process that references an integration, it should:

1. **Check the integration registry** — does the service exist? What auth type?
2. **Check the credential vault** — is this service already connected for any process?
3. **Route to the right flow:**

```
Service declared in process
        │
        ├── Credential exists (vault) for this process? → CONNECTED. Skip.
        │
        ├── Credential exists for another process? → Offer reuse.
        │
        ├── Auth type = api_key?
        │       → Guide user to copy/paste key
        │       → Store in vault
        │       → Test connection
        │
        ├── Auth type = oauth2?
        │       ├── Managed cloud? → Open OAuth popup
        │       └── Self-hosted?
        │               ├── OAuth proxy configured? → Open OAuth popup via proxy
        │               └── No proxy? → Guide to API key fallback, or IT setup guide
        │
        ├── Auth type = cli_login?
        │       ├── CLI installed? → Check auth status → Guide if needed
        │       └── CLI not installed? → Fall back to REST/MCP if available
        │
        └── No auth needed? → CONNECTED. Skip.
```

### A New Self Tool: `connect_service`

The Self needs a tool for managing connections:

```typescript
connect_service({
  service: "gmail",
  processId: "quoting-process",
  method: "api_key" | "oauth2" | "reuse",
  // For api_key: user provides key in conversation
  // For oauth2: Self opens auth flow, waits for callback
  // For reuse: copies credential from another process
})
```

This tool:
- Stores the credential in the vault
- Tests the connection (using the registry's `test_endpoint` or `test_command`)
- Reports success/failure back to the Self
- The Self communicates the result conversationally

### Connection Health Monitoring

After initial connection, credentials can expire, get revoked, or become invalid. The Self should:
- Detect failed integration calls (already logged as activities)
- Distinguish auth failures from service outages
- Proactively notify: "Your Xero connection expired — I need you to reconnect. Takes 10 seconds."
- For OAuth: attempt automatic token refresh before bothering the user

---

## Mapping to Real Use Cases

| Business | Key integrations | Auth types | MVP path (API key first) |
|----------|-----------------|------------|--------------------------|
| Steven Leckie | Meta (ads), Mailchimp (email), Instagram (posting) | OAuth2, API key | Mailchimp API key (v). Meta OAuth (defer to Track A). Instagram via Meta API (defer). |
| Rawlinsons | Internal rate databases, document store, email | API key, internal | Rate DB likely internal/file-based (no external auth). Email via API key. |
| Delta Insurance | Lloyd's (reporting), email, internal systems | API key, custom | Lloyd's is likely file upload (human step). Email via API key. |
| FICO | Email (client comms), government portals | API key, human step | Email via API key. Government portals = human steps (no API). |
| Abodo Wood | Epicor ERP (stock, production), email | API key, custom | Epicor REST API with API key. Email via API key. |
| Jay / Status | Clinical records, speech-to-text | API key, custom | Clinical records likely API key or local. Speech-to-text (Deepgram/Whisper) via API key. |

**Key finding:** API keys get 4 of 6 businesses started — but honestly, for 3 of those 4, the API-key integration is primarily email (SendGrid, Mailgun, or SMTP service). The value proposition is: "email works day one via API key; deeper system integrations (Xero, Meta, ERP) come with OAuth." This is still a strong MVP position — email is the most universal integration need. OAuth is needed for premium email (Gmail) and social/marketing (Meta, Mailchimp).

---

## Phasing Recommendation

| Phase | What | Auth types supported | Why |
|-------|------|---------------------|-----|
| **Phase 10 MVP** | Self guides API key entry via conversation. Connection testing. Connection state on processes. Credential reuse. | API key only | Gets real users started. No OAuth infrastructure needed. |
| **Phase 11** | OAuth for managed cloud (Track A). Ditto registers OAuth apps for top 5 services. Token refresh. | OAuth2 (managed) + API key | Managed cloud launch needs OAuth for premium UX. |
| **Phase 12** | OAuth for self-hosted via auth proxy or Nango integration. CLI auth detection. MCP server auth. | All types | Full integration story for all deployment tracks. |

---

## Open Decisions (for ADR-005 update)

1. **Integration platform adoption:** Build minimal OAuth (Phase 11) or adopt Nango (self-hostable, 700+ integrations, handles token refresh)? ADR-005 explicitly deferred this.
2. **Connection health:** Proactive monitoring (periodic test calls) or reactive detection (notice when a call fails)?
3. **Auth proxy for self-hosted:** Should Ditto provide a hosted auth relay for self-hosted users' OAuth needs? Trade-off: adds cloud dependency to self-hosted track.
4. **Credential rotation:** The `connect_service` tool needs a `replace` mode for compromised or rotated keys. Design alongside Phase 10 MVP.

## Known Phase 11 Design Work (OAuth)

When OAuth is built for managed cloud, the brief must address:
- **Refresh token expiry** — what happens when the refresh token itself expires (Google: 6 months inactivity). Re-consent flow needed.
- **Scope changes** — provider changes required scopes, re-consent needed.
- **Rate-limited refresh** — multiple processes sharing the same underlying OAuth grant. Coordinate refresh attempts.
- **MCP servers with internal OAuth** — for self-hosted, an MCP server requiring OAuth pushes the same problem down one level.

## Resolved Decisions

- **Global credential scope:** Rejected. Per-(processId, service) isolation preserved. Credential reuse via copy, not global scope. See "Connection Reuse" section.
