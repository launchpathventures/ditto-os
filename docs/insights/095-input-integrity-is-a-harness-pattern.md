# Insight-095: Input Integrity Is a Harness Pattern, Not Just Output Validation

**Date:** 2026-03-25
**Trigger:** Hark (gethark.ai) product research — document integrity checking applied to process inputs before content extraction
**Layers affected:** L3 Harness (input validation handlers — proposed extension), L1 Process (proposed `input_validators` field), L6 Human (integrity status UI)
**Status:** active

## The Insight

Ditto's harness patterns (maker-checker, adversarial review, spec testing) all validate **agent outputs** — checking the AI's work before it reaches the user. Hark reveals an equally important pattern: validating **process inputs** before they enter the pipeline.

When a document enters a Hark workflow, the system automatically analyses metadata (creation tool, timestamps, incremental saves, device source) and flags integrity issues before the content is extracted or trusted. This is a quality gate on inputs, not outputs.

The same principle applies broadly: when any artifact enters a Ditto process (PDF, email forward, API data, voice transcription), the harness should be able to run input validation handlers that check authenticity, format, completeness, and freshness — before the content is used by agents.

This is not document-specific. An email forward could be checked for spoofing signals. An API response could be validated against schema. A voice transcription could be checked for confidence scores. The pattern is universal: **the harness governs what goes IN, not just what comes OUT.**

## Implications

- Process definitions may need `input_validators` alongside existing quality criteria (which validate outputs)
- Input validation handlers run before the first process step, not as a step themselves — they're harness infrastructure
- The UI needs an integrity status display: per-input-artifact status badges, expandable issue details, human override ("accept anyway")
- This is complementary to Insight-088 (document understanding as tools) — 088 is about content extraction, this is about pre-extraction integrity

## Where It Should Land

- Architecture.md Layer 3: add input validation as a harness pattern alongside output validation
- Process primitive (Layer 1): `input_validators` field in process definitions
- Future brief (Phase 11+): when document understanding tools are built, include integrity checking
- Human layer: input integrity UI patterns (status badges, issue expansion, override)
