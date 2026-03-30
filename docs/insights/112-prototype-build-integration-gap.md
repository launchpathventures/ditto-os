# Insight-112: Prototypes Don't Become Product Without an Integration Brief

**Date:** 2026-03-30
**Trigger:** First dogfood session — launched Ditto and discovered setup page uses old terracotta palette, no onboarding flow, no navigation for new users. All components existed but the user journey was unwired.
**Layers affected:** L6 Human, Dev Process
**Status:** active

## The Insight

When a design phase produces specifications (prototypes, design tokens, interaction specs), those specifications do NOT automatically become product. Each brief checks its own ACs — "did I build what I was asked to build?" — but no brief asks "does the overall product match the current design spec?"

In Ditto's case: 28 prototypes were created defining the target UI. 18 build briefs shipped engine capabilities and components. Every brief passed review. But no brief ever said "update the existing pages to match the new design spec." The prototypes and the product diverged silently.

This is a structural gap in the dev process, not a one-time mistake.

## The Fix

After any design phase that changes the visual or interaction specification:

1. The PM must triage an **integration brief** that applies the new spec to existing surfaces
2. This brief is NOT optional — it goes on the roadmap as part of the phase
3. The Reviewer checklist should include: "Do all user-visible surfaces match the current `.impeccable.md` spec?"

## Implications

- Add "integration brief" as a standard step after design phases in `docs/dev-process.md`
- The Reviewer role should check design token alignment, not just architecture compliance
- Design specs (`.impeccable.md`, prototypes) are requirements — stale code against current spec is a defect

## Where It Should Land

`docs/dev-process.md` — add integration brief step. Review checklist — add design token alignment check.
