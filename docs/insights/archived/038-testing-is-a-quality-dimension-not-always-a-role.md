# Insight-038: Testing Is a Quality Dimension, Not Always a Separate Role

**Date:** 2026-03-20
**Trigger:** Research on QA/Tester role in the dev pipeline — `docs/research/qa-tester-role-in-dev-pipeline.md`
**Layers affected:** L3 Harness (review patterns), dev process (role contracts)
**Status:** absorbed into `docs/dev-process.md` (Quality Check Layering), Builder skill, Reviewer skill. Re-entry: Phase 10 QA role evaluation

## The Insight

The question "should we add a QA/Tester role?" assumes testing is always best served by a separate role. Research across 11 projects and frameworks (gstack, agency-agents, Aider, CrewAI, AutoGen, etc.) shows a spectrum:

- Projects with **web UIs and behavioral complexity** (gstack, agency-agents) benefit from QA as a separate role — the QA agent opens a browser, navigates flows, takes screenshots. This is genuinely different work from reading code.
- Projects that are **CLI-only, library, or API-focused** (Aider, Codex) integrate testing into the build loop — run tests, fix, repeat. No separate QA step.
- **LLM-based QA agents were found unreliable** in practice (CrewAI). Script-based testing (test suites, linters, type checkers) is more reliable than an LLM "trying to break things."

The architectural principle: testing is a **quality dimension** that should be assigned based on the project's current surface area and complexity, not assumed to require its own role. For a CLI-only project, the Builder running tests (Aider pattern) and the Reviewer checking behavioral verification (Qodo pattern) is sufficient. When a web UI exists, a separate QA role with browser-based testing becomes valuable.

This follows Insight-002 (Review Is Compositional): strengthen the free quality layers (Builder self-testing, Reviewer behavioral checkpoint) before adding an expensive layer (separate QA agent).

## Implications

**For the dev process:** The Builder contract should be strengthened to include `pnpm test`, smoke test execution, and test authoring. The Reviewer contract should include a behavioral verification checkpoint. No 8th role needed now.

**For the product architecture:** The coding team's QA agent role (architecture.md Agent Roles table) remains correct for the product — processes orchestrated by Agent OS may have web UIs and behavioral complexity that justify a dedicated QA step. The dev process and the product have different surface areas. However, this means the product's QA role is not validated through dogfooding — the dev process is the "manual precursor to the automated harness" (dev-process.md), so the QA agent role in the coding team table has never been exercised. The Phase 10 re-entry should include explicit comparison: did the distributed-QA approach in the dev process miss things a dedicated QA role would have caught?

**Re-entry condition:** When Phase 10 (Living Workspace) ships a web UI, revisit this with gstack's `/qa` pattern. Browser-based behavioral testing becomes the trigger for a separate QA role.

## Where It Should Land

- **Dev process (immediate):** Updated Builder and Reviewer contracts, updated Quality Check Layering section
- **Architecture spec:** No changes needed — the product already defines QA correctly for its domain
- **Re-entry:** Phase 10 brief should include a QA role evaluation
