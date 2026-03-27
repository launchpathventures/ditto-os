# Insight 098: Prototypes Are Specifications, Not Phases

**Date:** 2026-03-25
**Source:** Phase 10 post-build review — UI diverged from prototypes because prototyping stopped too early
**Status:** Active
**Consumers:** CLAUDE.md (dev process), review-checklist.md, PLAN.md

---

## Observation

Phase 10 shipped 7 briefs in one day. The built React UI is functional but visually and experientially disconnected from the 13 HTML prototypes. The prototypes show a warm, intelligent workspace. The build shows a generic chat app with a sidebar. Root cause: prototypes froze at "Draft v1" (inspiration-grade) when the agent advised stopping refinement. Builder briefs were scoped as architecture deliverables, not "match this prototype." No visual QA step existed in the review process.

## Principle

**Prototypes are living specifications that stay ahead of the build.** They are not a phase you graduate from. When the prototype stops being refined, the specification freezes and the implementation drifts. The build should never outrun the prototype.

Corollary: if a screen isn't prototyped and approved, it can't be built.

## How to Apply

1. Every user-facing screen must have an approved Build-Ready prototype before Builder work begins
2. "Build-Ready" = real content, all interaction states, clickable happy path, responsive variants, quality gates passed
3. Builder briefs reference specific prototypes as acceptance criteria
4. Review checklist includes visual fidelity check (screenshot comparison against prototype)
5. Prototypes evolve alongside the build — if the design changes, the prototype changes first
6. Use `/frontend-design` + `.impeccable.md` to produce specification-grade prototypes efficiently

## Relationship to Existing Principles

- Extends "plan before build" (feedback_plan_before_build) to visual design
- Extends Insight-084 (prototyping is first-class process) with the "specification, not phase" framing
- Addresses the gap that produced the Phase 10 visual disconnect
