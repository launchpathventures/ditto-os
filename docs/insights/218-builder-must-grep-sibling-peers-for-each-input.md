# Insight-218: Builder must grep sibling peers for each input/dependency when adding the Nth member of a multi-peer family

**Date:** 2026-04-27
**Trigger:** Brief 218 (GitHub Actions adapter — third cloud runner peer after Routine + Managed Agents). The Builder shipped the adapter with `harness_type: "catalyst"` hardcoded as a literal string in the dispatch inputs. Both sibling adapters (`claude-code-routine.ts`, `claude-managed-agent.ts`) resolve harnessType via a `harnessTypeFor(project, db)` dependency that reads `projects.harnessType`. The Reviewer caught the defect (HIGH-1); without the Reviewer, native + none harness-type projects would have silently failed to fetch the dev-review skill from the workflow's release-asset URL — the template's `if: harness_type != 'catalyst'` branch would never have fired.
**Layers affected:** L3 Harness (cross-cutting Builder discipline)
**Status:** active

## The Insight

When adding the Nth peer to a family of similar adapters, handlers, or processors (cloud-runner adapters, status decoders, webhook handlers, etc.), structural similarity to siblings is **not enough**. The Builder must structurally compare **every input, dependency, and branch point** against what each sibling actually does — not just the shape of the file.

In Brief 218 the adapter file structure (factory pattern, dispatch flow, status/cancel/healthCheck shape, three-callback-mode discipline) mirrored sibling adapters perfectly. But one specific input — `harness_type` — was hardcoded with a stub comment ("resolved upstream; dispatcher does not pass it on, default catalyst") that was wishful thinking. A `grep harnessType src/adapters/claude-managed-agent.ts` would have surfaced the `harnessTypeFor` dependency that needs to be replicated.

The defect was invisible at the per-test level (every test seeded a catalyst project, so the assertion `body.inputs.harness_type === "catalyst"` passed truthfully) and invisible at the type level (the input is a `string`, not an enum). It only surfaced under Reviewer adversarial reading.

## Implications

- **Builder discipline (extends Insight-043):** for each peer addition, run a "what do my siblings do for X?" check on every dispatch input, every constructor parameter, every config field. The exhaustive form is a `grep` of each input's name across the sibling source files.
- **Test discipline:** when an input has multiple valid values (catalyst | native | none for harnessType, three callback modes, etc.), test cases must exercise more than the seeded default. The Reviewer caught HIGH-1 in part because the test suite ASSERTED `body.inputs.harness_type === "catalyst"` — that test locked in the bug.
- **Architect discipline:** when a brief assumes the dispatcher pre-resolves a value ("dispatcher does not pass it on" was the Builder's stub-comment justification), the brief should EXPLICITLY name the dispatcher field and where the resolution happens. If the resolution doesn't exist, the brief should require the adapter to do it itself.
- **Reviewer discipline:** the §Review Process check "(d) The /dev-review skill loading is honest for catalyst, native, and none harness types" was the catch — explicit per-tier checks in the Review Process catch silent stubs that pass per-test.

## Where It Should Land

- **Builder skill (`.claude/commands/dev-builder.md`):** add a clause under "Self-review before spawning Reviewer" — "When adding the Nth peer to a multi-peer family (adapters, handlers, decoders), grep each sibling for every input/dependency you wire and confirm parity. A stub-comment justifying a hardcoded default is a flag, not a resolution."
- **Reviewer skill (`.claude/commands/dev-reviewer.md`):** add a clause under "Sibling-pattern parity" — "For multi-peer families, verify each input the new peer wires matches the resolution mechanism each sibling uses. Hardcoded values where siblings use a resolver are HIGH-severity defects (silent correctness drift on non-default code paths)."
- **Once a 4th cloud-runner peer ships** (e.g., `e2b-sandbox`), absorb into a per-family checklist in `docs/architecture.md` §Layer 3 ("multi-peer family conformance check"). Until then this insight earns its keep as a Builder + Reviewer contract clause.

## Related insights

- **Insight-213** (Architect must verify SDK surface exists) — sibling-pattern of "Builder must verify the brief's claimed dependencies/inputs". Both are pre-build verification disciplines.
- **Insight-043** (knowledge maintenance at point of contact) — same family of "do the work where you have the most context" but applied to code-pattern parity not docs.
