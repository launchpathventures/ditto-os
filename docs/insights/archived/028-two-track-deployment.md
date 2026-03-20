# Insight-028: Deployment Must Be Two-Track From Day One

**Date:** 2026-03-19
**Trigger:** Architect persona check — the VPS + Tailscale deployment model fails for Rob, Lisa, and Nadia. Research into hosted cloud patterns confirmed every comparable OSS tool offers "sign up and start in 2 minutes."
**Layers affected:** All layers (cross-cutting infrastructure decision)
**Status:** absorbed into ADR-006 (runtime deployment)

## The Insight

There are two fundamentally different deployment audiences with incompatible requirements:

1. **Users (Rob, Lisa, Jordan, Nadia)** — need managed cloud. Zero infrastructure. "Sign up → first process in 2 minutes." Won't SSH into anything.
2. **Developers and data-sovereignty users** — need self-hosted. Full control. "git clone → running in 10 minutes."

Designing for only one track creates problems:
- Self-hosted only → users can't onboard → no adoption
- Cloud only → developers can't contribute, enterprises can't comply → limited ecosystem

Every successful open-source tool in the space (Supabase, n8n, Cal.com, Plane, Trigger.dev) serves both tracks with the same codebase. The managed cloud is the revenue engine; self-hosted is the trust engine.

The architectural implication: the engine must be deployment-agnostic from day one. Configuration via environment variables, health check endpoints, database abstraction via ORM, no hardcoded paths. These are cheap to do now and expensive to retrofit later.

## Implications

- ADR-006 defines the two-track model: Track A (managed cloud, primary for users) and Track B (self-hosted, for developers and data sovereignty)
- The AGPL license protects cloud revenue while keeping code fully open (follows Cal.com, Plane, Twenty)
- The dogfood phase (Track B1) uses self-hosted on a VPS — but every architecture decision must be tested against "does this work for Track A too?"
- The managed cloud is not needed for dogfood but becomes the priority when external users arrive (Phase 10+)
- One-click deploy templates (Railway, Render) serve as the intermediate path between self-hosted and managed cloud

## Where It Should Land

Architecture spec — new section on deployment model. Roadmap — Phase 10 should include managed cloud alongside the web dashboard. ADR-006 captures the decision.
