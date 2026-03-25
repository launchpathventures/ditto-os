# Insight-090: Integration Auth Is a Conversation Moment, Not a Setup Step

**Date:** 2026-03-24
**Trigger:** Architecture validation — tracing conversational process creation through to execution. Every real process needs external system access, but no design exists for how auth happens conversationally.
**Layers affected:** L2 Agent (credential vault UX), L6 Human (Self's integration flow), L1 Process (integration dependency declaration)
**Status:** absorbed — implemented in Brief 040 (Self Extensions): `connect_service` tool, `ConnectionMetadata` type on integration registry, masked credential input at `/api/credential`, conversational auth guidance in Self system prompt. Remaining: OAuth flow deferred to Phase 11 managed cloud.

## The Insight

The credential vault exists (Brief 035). The integration registry exists (ADR-005). The brokered credentials pattern is architecturally sound. But there is no design for **how a non-technical user connects an external service during conversational process creation**.

Every real process hits this moment:

| User says | Self needs | Gap |
|-----------|-----------|-----|
| "Email the quote to the customer" | Email service OAuth or SMTP credentials | No conversational auth flow |
| "Post it to Instagram" | Meta API OAuth | No OAuth redirect/callback handling |
| "Put the invoice into Xero" | Xero OAuth2 | No conversational guide through OAuth |
| "Check stock in Epicor" | ERP API credentials | No credential collection UX |
| "Send the document to the client" | Email service access | No connection testing in conversation |

Currently, credential management is CLI-only (`ditto credential add`). This is a developer interface. Rob, Steven, Jay, and every target persona will never use it.

The UX spec correctly says "no 'connect your integrations' step" at onboarding. But it doesn't design what happens when integration needs emerge naturally during process creation. This is a **conversation moment**, not a setup step — it should feel like:

> Self: "To send quotes by email, I'll need access to your email. I can connect to Gmail, Outlook, or any email service. Which do you use?"
>
> Rob: "Gmail."
>
> Self: "I'll open a quick sign-in so you can give me permission. One sec..."
> [OAuth popup/redirect → Rob signs in → callback]
>
> Self: "Connected. I can send emails from rob@hendersonplumbing.com.au. I'll only use it for sending quotes — nothing else. Ready to set up the quoting process?"

The critical design constraints:

1. **Just-in-time, not upfront** — auth happens when a process needs it, woven into the conversation
2. **Plain language** — "give me permission to send emails" not "OAuth2 authorization required"
3. **Scope-explicit** — the Self explains what access is for and what it won't do
4. **Testable** — the Self confirms the connection works before proceeding
5. **Resumable** — if OAuth fails or the user postpones, the process creation saves state and continues when auth completes
6. **Reusable** — once Gmail is connected for quoting, the Self offers to reuse it for follow-up emails without re-auth

## The Four Auth Realities

Full analysis at `docs/research/integration-auth-reality.md`. Each auth type demands fundamentally different infrastructure:

| Auth type | Who it works for | Ditto infrastructure needed | Deployment implication |
|-----------|-----------------|----------------------------|----------------------|
| **API key** | Everyone. User copies key from provider dashboard. | Conversational key entry + vault storage + connection test. | Works for both managed cloud and self-hosted. No platform registration. |
| **OAuth2** | SaaS services (Gmail, Xero, Meta, Mailchimp). Consent flow. | Ditto must be a registered OAuth client per provider. Redirect URI + callback handler + token refresh. | Managed cloud: standard SaaS. Self-hosted: user registers own apps OR auth proxy. |
| **CLI** | Developer/technical users only. gh, gws, stripe, aws. | CLI detection + auth status check. | Self-hosted only. Non-technical users never see this path. |
| **MCP servers** | Transparent to user. MCP server handles auth internally. | MCP server deployment + configuration. | Deployment concern, not user concern. MCP servers may still need OAuth internally. |
| **No API** | Government portals, legacy systems. | Process step becomes `executor: human`. Ditto prepares the output, user submits manually. | Architecture handles this natively. Not a failure — working as designed. |

**Key finding:** API keys get 4 of 6 validated businesses started. OAuth is needed for premium email (Gmail) and social/marketing (Meta). This supports phased delivery: API keys in MVP, OAuth when managed cloud launches.

## Implications

- The integration registry should declare `connection:` metadata (auth_type, setup instructions, test endpoint, scope description) — the Self uses this to guide users
- The Self needs a `connect_service` tool for managing connections (store credential, test, report)
- Processes with missing connections should be `needs_connection` (not silently broken), with graceful degradation (integration step becomes human step)
- Credential reuse: when Gmail is connected for quoting, the Self offers to reuse it for follow-up emails
- OAuth callback handling requires a web surface — this is a managed cloud feature, not a Telegram feature
- This intersects with data sensitivity (G8 from validation) — the Self should explain what data flows through the connection
- **Open ADR-005 decision:** Build minimal OAuth or adopt Nango (self-hostable, 700+ services, token refresh)?

## Where It Should Land

- Architecture.md Cross-Cutting: External Integrations section — add "Connection Lifecycle" subsection
- ADR-005 — add Section 6: "Connection Setup" covering auth types, conversational flow, connection testing, credential reuse, connection health
- Integration registry schema (`integrations/00-schema.yaml`) — add `connection:` section
- Phase 10 MVP brief — API key entry via conversation, connection testing, connection state on processes
- Phase 11 brief — OAuth for managed cloud (top 5 services)
- UX spec — new section on integration moments within conversation
