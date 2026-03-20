---
number: "031"
title: Research-Extract-Evolve IS the Meta-Process
status: active
date: 2026-03-20
emerged_from: PM triage — composition discipline audit
---

## Observation

The cycle of researching external approaches, extracting implementation patterns, and evolving internal processes is not just our development methodology — it is one of the core meta-processes Agent OS must run on itself.

The platform's self-improvement loop (Phase 9: improvement-scanner) does exactly this: scan the landscape, identify patterns that outperform current implementations, propose upgrades, earn trust in those proposals. The system is never static — it continuously scouts, extracts, and evolves.

## Why This Matters

1. **We must nail this loop in our own development** because we're dogfooding the pattern the product will automate. If we can't do it disciplined manually, we can't encode it.

2. **Composition discipline weakened as architecture matured.** Phases 1-3 were high-composition (built FROM antfarm, Paperclip, Mastra). Phase 4+ shifted to "Original" claims without proportional pattern extraction. This is exactly the decay the improvement-scanner agent should catch.

3. **The research-extract-evolve cycle should be a first-class process definition** — not just an implicit part of `/dev-researcher`. It has inputs (capability need + landscape), transformation (pattern extraction + adaptation), and outputs (adopted pattern + integration recommendation). That's a process.

## Implications

- Every "Original" claim in the roadmap should be challenged: is it genuinely original, or have we not looked hard enough?
- The `/dev-researcher` role should have an explicit "implementation pattern extraction" mode — not just strategic research.
- The `improvement-scanner` system agent (Phase 9) should include landscape scanning, not just internal feedback analysis.
- This loop validates ADR-008's system agent model: the platform's own evolution runs through the same harness as user processes.

## Absorb Into

- `docs/dev-process.md` — add implementation pattern extraction as explicit researcher output type
- ADR-008 — note that improvement-scanner should include external landscape scanning
- Phase 9 roadmap entry — add landscape scanning capability
