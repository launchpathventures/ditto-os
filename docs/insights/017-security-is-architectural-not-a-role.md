# Insight-017: Security Is Architectural, Not a Separate Role

**Date:** 2026-03-19
**Trigger:** PM triage — evaluating whether Agent OS needs a dedicated `/dev-security` skill
**Layers affected:** L2 Agent, L3 Harness, Cross-cutting Governance
**Status:** active

## The Insight

Security concerns in Agent OS — credential storage, agent permissions, trust enforcement integrity, data sovereignty, audit trails — are architectural decisions, not a separate discipline. They cut across layers, which is exactly what the Architect role already handles. The Researcher already scouts security patterns (e.g., Composio brokered credentials in ADR-005) before the Architect designs.

A dedicated security role would be premature because: (1) security work surfaces intermittently, not every session; (2) seven roles is already at the upper limit of useful separation; (3) the actual security decisions are structural (how credentials are stored, how permissions are scoped, what trust boundaries exist) — they belong in briefs and ADRs, not a parallel review track.

The right approach is to bake security into the Architect's constraints and the review checklist, so it's structurally enforced without role overhead.

## Implications

- Add a security constraint to the Architect skill contract
- Add a security checkpoint to the review checklist (point 10)
- Re-evaluate if Agent OS reaches multi-tenant SaaS with external attack surfaces (Phase 12+)

## Where It Should Land

- Absorbed into `.claude/commands/dev-architect.md` (constraint added)
- Absorbed into `docs/review-checklist.md` (checklist point 10 added)
- Re-evaluate at Phase 12 (Governance at Scale) whether a dedicated role is needed
