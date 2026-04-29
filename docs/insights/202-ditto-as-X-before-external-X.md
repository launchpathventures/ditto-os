# Insight-202: Ditto-as-X before external-X at user-facing seams

**Date:** 2026-04-20
**Trigger:** Mid-session redirect during the User-Facing Legibility design pass (Brief 197/198/199/200, 2026-04-20). Architect default-reached for "push workspace projection to the user's GitHub" when Railway container filesystem broke the local-files assumption. User pushed back on the external-service dependency. Revised design made **Ditto itself** the authenticated git remote (`git clone https://ditto.you/<workspace-slug>/ws.git`), with zero external-service dependency. The lesson generalised: before reaching for an external provider at a user-facing seam, ask whether Ditto can be that provider itself.
**Layers affected:** L3 Harness (transport surfaces); L6 Human (user-facing access shape); cross-cutting
**Status:** active

## The Insight

When a design requires a service that the user interacts with (git host, object store, identity provider, notification delivery, search index, cache), the **default first question** is: **"can Ditto provide this itself?"** — not "which external provider do we integrate with?"

Reaching for GitHub for git hosting, Auth0 for identity, S3 for file storage, Mailgun for outbound email, Algolia for search — each is a load-bearing dependency that (a) imposes account-creation friction on users (Rob has no reason to create a GitHub account), (b) establishes the external service as Ditto's de-facto trust root, (c) creates vendor-lock-in for the user's data, (d) splits the "Ditto is where your work lives" promise across two or more parties, and (e) adds failure modes outside Ditto's control surface.

Many of these services are small when scoped to one user's workspace. A single-tenant git server is ~200 LOC on top of `isomorphic-git`. A per-workspace object store is a directory of files. A per-workspace identity is already solved by Ditto's existing session mechanism. When the scope is one user, the external service is wildly over-provisioned for the need — and the "small" cost of integration compounds across the set of all external services.

**Ditto's deployment shape already optimises for this:** each workspace is a single-tenant container with a mounted data volume and an HTTP server already in the request path. Adding endpoints, protocols, or sub-services to the existing container is often cheaper than integrating with an external service of equivalent capability — and always cheaper in user-onboarding and data-sovereignty terms.

## Implications

**For Architects designing any user-facing transport or storage surface:**

1. **Default the first design question to "Ditto-as-X" before surveying external X providers.** Survey external options as a fallback, not a default.
2. **Cost-compare honestly.** A self-served capability has a fixed build cost (one brief of work) but a near-zero ongoing cost. An external-integration has a small build cost but ongoing dependency-management, vendor-risk, user-onboarding friction, and credential-plumbing cost. Over the life of the product, self-served wins for capabilities that fit inside one-user scope.
3. **When to reach for external:**
   - The capability requires economies of scale Ditto cannot replicate (e.g., deliverability reputation for outbound email at volume — SendGrid-class).
   - The capability is a hard industry standard the user already has a credential for (e.g., Google OAuth for their own Google data — use the user's existing account, but don't require a new one).
   - The capability is regulatory / legal-review heavy (payment processing — Stripe; KYC — Persona).
   - The per-workspace scale makes self-serving wasteful (large-scale embedding indexes; real-time global CDN).
4. **Workspace users are not developers.** Rob (personas.md) has no reason to create a GitHub account, a Vercel account, an AWS account, or any developer-adjacent identity. Every external account Ditto requires is a user who churns. Self-serve preserves Rob's adoption path.
5. **"Opt-in external mirroring" is cheap and honest.** Ditto can be the primary provider and expose an optional "push to your own external X" hook for users who want mirroring (Lisa wants her memories also backed up to her personal GitHub). Optional mirroring preserves the zero-dependency default without denying external-integration convenience to users who want it.
6. **Engine-core boundary.** Ditto-as-X implementations live in `src/engine/` or `packages/web/`, not in `@ditto/core` — the engine stays reusable across consumers (ProcessOS, future Ditto-on-Foo deployments). The "Ditto provides X" is a **product** opinion, not an engine primitive.

**Reach-for-external smell signals** (that should prompt a "Ditto-as-X" reconsideration):
- The design names a specific vendor in the first sentence (GitHub, Auth0, Stripe, etc.) before establishing the need.
- The design's ACs include "user must have an account at Vendor X."
- The design creates a new env var of the shape `VENDOR_X_API_KEY` or `VENDOR_X_CLIENT_SECRET` without a documented reason why Ditto-as-X was rejected.
- The design cites "because everyone uses Vendor X" as provenance — that's a reach-for-familiarity, not a considered composition choice.

## Where It Should Land

**Architecture spec (`docs/architecture.md`):** once two independent briefs have applied this insight (Brief 200 applies it once — Ditto-as-git-server; a second application is pending), absorb into §Layer 6 or §Cross-Cutting Governance as a first-class design principle for user-facing transport/storage surfaces.

**Related existing material:**
- CLAUDE.md §Principles #1 (Composition over invention) — this insight refines the composition question: *"what can we build FROM?"* is often *"what can Ditto itself provide?"* for user-facing capabilities.
- Insight-068 (composition levels: depend / adopt / pattern) — this insight sits **upstream** of the composition-level decision: before picking `depend` on Vendor-X, verify that external-X is actually the right frame.
- Insight-151 (archived — "network is the front door") — related but different scope: 151 is about Ditto's Network Service shape; 202 is about every user-facing-surface design decision.
- Brief 200 (workspace git server) — first concrete application of this insight.
- ADR-031 (OAuth credential platform) — a mixed case: Ditto runs its own Network Service for OAuth orchestration but uses Google / Slack / Notion as the external identity providers (because the user's data already lives there). The insight applies: Ditto-as-OAuth-orchestrator yes; Ditto-as-Google-data-host no. Precedent for the "default to self-provide, reach for external when the user already has an account and the data is theirs" balance.

**Absorption criterion:** this insight stays `active` until at least **two** user-facing seams have applied the "Ditto-as-X" default explicitly and shipped. Brief 200 is application #1 (Ditto-as-git-server-instead-of-GitHub). Brief 228 (Project Retrofitter, shipped 2026-04-28) is application **#1.5** — `.ditto/` substrate writer displaces a fuzzy CATEGORY of vendor-shipped harness packages (Catalyst packages, agentskills.io packages, vendor-shipped `.cursorrules` templates, npm-installable AI harnesses) rather than a single named external service. Per Brief 224 §AC #9b, the partial application contributes evidence but does NOT discharge the absorption gate alone. A third unambiguous application (likely "Ditto-as-object-store-instead-of-S3" via the legibility sub-brief, or "Ditto-as-search-instead-of-Algolia", or "Ditto-as-OAuth-broker") is needed before absorption into `docs/architecture.md`.

**Do NOT pre-reserve brief numbers** for applications of this insight (per Insight-200 hygiene). Seam-by-seam briefs claim numbers at scheduling time.
