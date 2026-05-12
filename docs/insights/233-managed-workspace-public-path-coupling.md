# Insight-233: Managed-workspace public-path allow-list must include the readiness endpoint that the provisioner polls

**Date:** 2026-05-13
**Trigger:** Brief 267 boot hardening + task #18 end-to-end reprovision attempt. Three consecutive provision runs failed health-check after 300s. The Railway service was up and Next.js responding, but `/api/healthz?deep=true&mode=provisioning` returned `307 → /login?redirect=…` because the workspace middleware's public-path allow-list did not include `/api/healthz`.
**Layers affected:** L3 Harness (workspace boot), L4 Awareness (provisioner ↔ workspace contract)
**Status:** active

## The Insight

The provisioner's success signal is a single HTTP request — `GET ${workspaceUrl}/api/healthz?deep=true&mode=provisioning`. If the workspace's edge middleware intercepts that request before the route handler runs, the provisioner cannot tell a healthy workspace from a misconfigured one. It will time out and roll back.

Brief 267 tightened the workspace middleware so a managed workspace (DITTO_NETWORK_URL set) without an owner-email cookie redirects to `/login` instead of falling through. The same brief made the provisioner always seed `WORKSPACE_OWNER_EMAIL`. Together, these two changes meant the provisioner was now the *only* unauthenticated caller of the workspace, and its readiness probe was the *only* endpoint the middleware had to keep open — but `/api/healthz` was never added to `BASE_PUBLIC_PREFIXES`. The previous behavior (workspace fell through because no `WORKSPACE_OWNER_EMAIL` was set) accidentally papered over this gap.

Pre-Brief-267 workspaces booted because the middleware short-circuited before reaching the cookie check; post-Brief-267 workspaces cannot boot at all under the new code path.

## Implications

- **Whenever two cross-component contracts are tightened in the same change, walk the contract endpoint-by-endpoint.** Brief 267 hardened (a) which env vars the workspace requires at boot, (b) what the middleware returns when those vars are present without a session, and (c) what the provisioner sends. The provisioner ↔ middleware contract was the seam that broke — the single endpoint the provisioner *must* reach is the one we forgot to allow-list.
- **Insight-231 (cross-deployment auth artifacts validate in consuming deployment) generalizes.** The workspace image is the consuming deployment; the provisioner is the producer. We validated the hash secret end-to-end via that insight, but did not validate the readiness path end-to-end.
- **Middleware allow-lists are part of the public API contract of the deployment.** They should be enumerated in the same place that documents what the provisioner expects, so a change to one prompts a review of the other.
- **A middleware regression test that covers managed-workspace mode (DITTO_NETWORK_URL + WORKSPACE_OWNER_EMAIL + SESSION_SECRET all set) is necessary** — previous tests covered local mode and missing-secret modes but never the fully-configured managed mode where Brief 267 lives.

## Where It Should Land

- ADR-025 §6 (managed workspace boot contract) should explicitly enumerate the URLs the Network expects the workspace to expose without auth: `/api/healthz` (provisioner probe) and `/api/v1/workspace/request-link`, `/api/v1/workspace/session`, `/login` (welcome login flow).
- Brief 267's review checklist should be extended: "for every endpoint the Network calls on a managed workspace, assert middleware allow-list coverage."
- The middleware test file should grow a "managed-workspace mode" describe block that exercises every entry in `BASE_PUBLIC_PREFIXES` from the provisioner's perspective.
