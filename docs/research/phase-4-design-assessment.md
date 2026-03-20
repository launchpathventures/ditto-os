# Phase 4 Design Assessment — CLI Workspace Foundation

**Date:** 2026-03-20
**Status:** Complete (reviewed — PASS WITH NOTES, findings addressed)
**Purpose:** Assess whether the existing CLI UX spec (`phase-4-workspace-cli-ux.md`) provides adequate design coverage for all three Phase 4 sub-briefs (4a, 4b, 4c). Identify any gaps or refinements the Builder needs.
**Verdict:** Existing spec is comprehensive. No new interaction spec needed. Targeted design notes below.

---

## Coverage Assessment

### Phase 4a — Work Items + CLI Infrastructure (Brief 012)

**Spec coverage:** Complete. Scenarios 1, 2, and 5 directly apply.

| Capability | Spec reference | Status |
|------------|---------------|--------|
| `aos status` — morning check-in | Scenario 1 (Rob), Scenario 2 (Jordan), interaction states table | ✓ Fully specified |
| `aos review <id>` — output detail | Scenario 1 (review flow), interaction states | ✓ Fully specified |
| `aos approve/edit/reject` — feedback actions | Scenario 1, interaction states for review | ✓ Fully specified |
| `aos trust <process>` — trust visibility | Scenario 5 (Nadia), interaction states for trust | ✓ Fully specified |
| `aos sync/start` — process management | Command map table | ✓ Sufficient (these are straightforward rewrites) |
| Work item line format | Output formatting principles section | ✓ `#ID Type Summary / Context │ Process │ Age` |
| `--json` / `--quiet` flags | Machine-readable output section | ✓ Specified |
| TTY-awareness | Progressive disclosure section | ✓ Specified |
| Empty states | Interaction states: "Nothing needs your attention" | ✓ Specified |
| First run state | Interaction states: "Welcome to Agent OS" | ✓ Specified |

**Designer recommendation for Builder:** Proceed. The spec is implementation-ready for 4a.

### Phase 4b — Human Steps + Capture (Brief 013)

**Spec coverage:** Complete. Scenarios 3 and 4 directly apply.

| Capability | Spec reference | Status |
|------------|---------------|--------|
| `aos capture` — quick capture | Scenario 3, interaction states for capture | ✓ Fully specified |
| `aos complete <id>` — human step completion | Scenario 4 (Lisa), interaction states for complete | ✓ Fully specified |
| Unified task surface (review + action + goal) | Scenario 1 shows mixed types in status | ✓ Specified |
| Pattern notification after repeated edits | Spec item 7 "What This Spec Does NOT Cover" + Brief 013 acceptance criteria | ✓ Addressed (see design note 1) |
| Manual classification fallback | Capture interaction states: "Ambiguous" | ✓ Specified |

**Design note 1 — Pattern notification placement:** The original spec flagged this as a deferred item needing an Architect decision. The Architect resolved it in Brief 013: a minimal read-only notification after `aos edit` when the same correction appears 3+ times. The copy from Brief 013 is good:

```
✓ Approved with edits. Diff captured as feedback.
  Note: You've corrected margin calculations 3 times for quoting.
  This pattern is being tracked — the system will learn from it.
```

This serves the emotional journey's Week 2-3 "Building Confidence" moment — the user feels heard. The notification is **passive** (no action required) and **encouraging** (not nagging). Builder should implement exactly this tone.

**Design note 2 — Manual capture in 4b vs auto in 4c:** In 4b, `aos capture` prompts the user to select type and process manually. In 4c, this becomes automatic. The transition must feel like an upgrade, not a breaking change. Recommendation: when manual selection is active, the prompt copy should be neutral ("What type of work is this?" / "Which process should handle this?") — not apologetic about lacking auto-classification. The user shouldn't feel they're using an incomplete feature.

**Design note 3 — Action tasks in status:** When a human step is waiting, `aos status` shows instructions from the suspend payload. The spec (Scenario 4) shows this well. Builder note: instructions should be truncated to 2 lines max in the status view, with full instructions shown in `aos complete <id>`. Don't flood the morning check-in with paragraphs.

### Phase 4c — Meta-Processes + Confidence (Brief 014)

**Spec coverage:** Complete. Scenario 3 shows the end state.

| Capability | Spec reference | Status |
|------------|---------------|--------|
| Auto-classification in capture | Scenario 3 (Rob on site) | ✓ Fully specified |
| Supervised classifier messaging | Capture interaction states: "(Classification is supervised)" | ✓ Specified |
| Confidence escalation in status | Interaction states: low-confidence escalation | ✓ Specified |
| Fallback to manual when low confidence | Capture interaction states: "Ambiguous" | ✓ Specified |

**Design note 4 — Confidence display in review items:** The spec shows confidence on review items (`Confidence: high`). For 4c, when confidence is `low` and the item was escalated from an autonomous process, the status line should make this clear. The spec already has this:

```
#55 Review Invoice match uncertain — GreenPack $4,200 vs PO $3,800
     Confidence: low │ Process: invoice-recon (autonomous) │ Escalated: agent flagged uncertainty
```

The `(autonomous)` label and `Escalated:` prefix are critical — they tell the user WHY this item appeared despite the process normally running quietly. Builder should preserve these exact signals.

**Design note 5 — System agent visibility:** System agents (intake-classifier, router, orchestrator, trust-evaluator) should be invisible to the user in normal operation. The spec's Process Architecture Notes section is clear: no implementation terms in user-facing output. System processes should NOT appear in `aos status` process health unless explicitly requested with a flag (e.g., `--system`). The user's mental model is "the system classified and routed this" — not "the intake-classifier system agent ran through the harness pipeline."

---

## Human Jobs Coverage

| Human Job | Phase 4a | Phase 4b | Phase 4c | Spec quality |
|-----------|----------|----------|----------|-------------|
| **Orient** | `status` command | Unified task surface | Confidence escalation | ✓ Complete |
| **Review** | `review`/`approve`/`edit`/`reject` | Pattern notification | — | ✓ Complete |
| **Define** | `sync`/`start` | — | — | ⚠ Minimal — YAML-file-based only. Conversational process definition (P8 Conversation Thread + P9 Process Builder) deferred to Phase 10. The Week 1 emotional journey describes "sets up one process through conversation" — that experience is Phase 10, not Phase 4. |
| **Delegate** | `trust` command | — | — | ✓ Complete |
| **Capture** | — | `capture` (manual) | `capture` (auto) | ✓ Complete |
| **Decide** | — | — | — | ⚠ Deferred. True Decide job (improvement proposals, process modifications via P13/P14/P15/P16) is Phase 8+. `aos complete` serves Action tasks within processes, not the architectural Decide job. |

Five of six human jobs are served. Define is minimal (YAML-only, no conversational setup). Decide is deferred entirely — `aos complete` is an Action mechanism, not a Decide mechanism in the architectural sense.

---

## Persona Validation

| Persona | Served by Phase 4? | Key moment |
|---------|-------------------|------------|
| **Rob** | ✓ Morning check-in, approve from phone (future), capture on site | Scenario 1 — 2 items, under 2 minutes |
| **Lisa** | ✓ Human step completion for verification steps | Scenario 4 — supplier certificate |
| **Jordan** | ✓ Cross-department status with `--all` | Scenario 2 — copies for leadership |
| **Nadia** | ✓ Per-process deep dive with `--process` | Scenario 5 — 1:1 prep |

**Persona gap (acceptable):** Nadia cannot see all team members' processes at a glance — this requires the web dashboard (Phase 10). The spec documents this explicitly.

---

## Primitives Applied (All 16)

| Primitive | CLI realisation | Phase | Status |
|-----------|----------------|-------|--------|
| P1 Daily Brief | `aos status` structured text output | 4a | ✓ Served |
| P2 Process Card | `aos status --process <slug>` detail view | 4a | ✓ Served |
| P3 Activity Feed | — | Deferred | Not in Phase 4. No `aos log` or history command. |
| P4 Performance Sparkline | `aos trust` correction trends + run metrics (textual) | 4a | ◐ Partial — text equivalent of sparkline data |
| P5 Review Queue | `aos review` listing | 4a | ✓ Served |
| P6 Output Viewer | `aos review <id>` detail view | 4a | ✓ Served |
| P7 Feedback Widget | `aos approve --edit` + pattern notification | 4a/4b | ✓ Served |
| P8 Conversation Thread | — | Phase 10 | Deferred. Conversational Define is web dashboard. |
| P9 Process Builder | `aos sync` (loads YAML) | 4a | ◐ Minimal — file-based, not conversational |
| P10 Agent Card | — | Deferred | Not in Phase 4 CLI. |
| P11 Trust Control | `aos trust` commands | 4a | ✓ Served |
| P12 Quick Capture | `aos capture` | 4b/4c | ✓ Served |
| P13 Improvement Card | Pattern notification after `aos edit` (minimal) | 4b | ◐ Partial — read-only notification, not full improvement proposals (Phase 8) |
| P14 Process Graph | — | Phase 10 | Deferred. Needs canvas, not terminal. |
| P15 Data View | — | Deferred | Not in Phase 4 CLI. |
| P16 Evidence Trail | — | Deferred | Not in Phase 4 CLI. |

---

## Design Recommendations for Builder

1. **Preserve the spec's copy exactly** — the tone in the scenarios is carefully calibrated (encouraging, not robotic; concise, not verbose). Don't add filler.
2. **Silence is sacred** — resist adding confirmation messages, success banners, or "helpful" tips. The spec's silence principle means autonomous processes produce zero output in the morning check-in.
3. **Instructions truncation** — human step instructions in `aos status` should be max 2 lines. Full instructions in `aos complete`.
4. **Manual capture should feel complete** — don't signal that auto-classification is coming. The manual type/process selection IS the feature in 4b.
5. **System agents are invisible** — no system process names, agent IDs, or harness terminology in user-facing output. Ever.
6. **Pattern notification tone** — encouraging and passive. "This pattern is being tracked" not "Would you like to teach this?" (that's Phase 8).
7. **Input validation** — `aos capture` accepts free-text and `aos complete --data` accepts JSON. Both should validate/sanitize inputs at the boundary. Not a design concern per se, but the Builder should ensure no injection vectors exist in stored text or JSON data.

---

## Review Findings

**Reviewer verdict:** PASS WITH NOTES

The review agent identified four refinements, all addressed in this version:

1. **Primitives table expanded** — now shows all 16 primitives with served/partial/deferred status (was 7 of 16).
2. **Define job qualified** — now explicitly notes that conversational Define is Phase 10, and Phase 4 is YAML-only. The personas.md Week 1 "conversation setup" moment is not served until Phase 10.
3. **Decide job corrected** — `aos complete` is an Action mechanism, not the architectural Decide job. True Decide (improvement proposals, process changes) is Phase 8+.
4. **Security note added** — input validation recommendation for capture text and complete data (Recommendation 7).
5. **Edit @ desk pattern noted** — deferred to mobile surface (Phase 10+). Not applicable to CLI-only Phase 4.

---

## Conclusion

The existing CLI UX spec (`docs/research/phase-4-workspace-cli-ux.md`) provides complete design coverage for all three Phase 4 sub-briefs. No new interaction spec is needed. The six design notes above are refinements for the Builder, not gaps in the spec.

The Builder can proceed with Brief 012 (Phase 4a) immediately using the existing spec as the authoritative design reference.
