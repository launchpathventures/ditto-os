# Insight-231: Cross-Deployment Auth Artifacts Must Validate in the Consuming Deployment

**Date:** 2026-05-12
**Trigger:** Brief 267 review loop. The initial managed workspace welcome path generated a Network-local DB magic link for a workspace-local `/login/auth` route, so the link could be delivered successfully while being invalid in the deployment that consumed it.
**Layers affected:** L3 Harness, L6 Human
**Status:** active

## The Insight

In a split Network Service / managed workspace architecture, the deployment that sends an auth link is not necessarily the deployment that consumes it. A link can look correct at the communication layer while still being invalid at the session layer if its backing storage, signing secret, audience, or replay marker lives in the wrong deployment.

Auth artifacts that cross deployment boundaries need an explicit ownership contract: the URL must target the consuming deployment, the artifact must be signed or stored with material available there, the audience must bind to that deployment, and replay protection must be recorded where the session is created. Central delivery is fine; central-only validation is not.

## Implications

1. Welcome links, invite links, share links with auth, and future intro authorization links must name both producer and consumer deployment in the design.
2. Reviewers should check auth storage locality, not just token entropy or expiry. "Does the route receiving this token have access to the state/secret needed to validate it?" is the load-bearing question.
3. Tests should include the full redirect/POST target and a wrong-audience case whenever a central service sends a link intended for a workspace or public edge route.

## Where It Should Land

- ADR-018 runtime deployment, in the managed cloud/workspace boundary section.
- ADR-025 centralized Network Service, near the workspace bootstrap/login contract.
- Future auth/link briefs as an acceptance criterion: sender, URL target, signing/storage authority, audience, and replay marker must all be stated.
