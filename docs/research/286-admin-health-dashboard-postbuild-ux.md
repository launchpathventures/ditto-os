# Brief 286 - Admin Network Health Dashboard - Post-Build UX Review

**Role:** Dev Designer
**Date:** 2026-05-19
**Brief:** `docs/briefs/286-network-admin-health-dashboard-dryrun-ratelimit.md`
**Status:** Fresh-context reviewed APPROVE WITH NITS; nits fixed
**Scope:** Post-build UX review of the shipped admin dashboard surface. This is not a technical implementation review and does not change code.

---

## 0. Scope & Method

Brief 286 already had a reviewed interaction source of truth: `docs/research/278-trust-privacy-admin-ux.md` section 4. This review checks the built dashboard against that spec, not against a newly invented pattern.

**In scope:**

- `packages/web/components/admin/network-health-dashboard.tsx`
- `packages/web/app/admin/network/superconnector/page.tsx`
- The operator experience for action-required triage, health, metrics, dry-run replay, audited reveal, suppression rows, and recent actions.

**Out of scope:**

- Rate-limit implementation, DB schema, route safety, and server-side audit correctness. Those belong to Builder/Reviewer.
- Member Privacy Center UX. That is sub-brief 285.
- New Refero research. The existing Brief 278 Designer spec is the Refero-backed precedent set for this surface.

**Method.** Checked against `docs/human-layer.md` jobs, `docs/architecture.md` Operate/governance model, `docs/personas.md`, `.impeccable.md`, `docs/insights/087-every-piece-of-data-has-provenance.md`, `docs/insights/127-trust-signals-not-activity-traces.md`, `docs/insights/201-user-facing-legibility.md`, the Brief 278 UX spec, and the built component.

---

## 1. Executive Verdict

**UX verdict: REVISE for product design. Not a backend safety blocker.**

The shipped dashboard is functionally recognizable as the Brief 286 operator surface: it preserves the three bands, includes the all-clear state, marks dry-run as no-contact, keeps raw text sealed by default, and requires a reason before audited reveal. Those are the critical safety signals.

The interaction model, however, falls short of the Designer spec. The built surface behaves like a form-based admin console. The specified surface was a triage tool: action queue first, contextual row actions, per-entity drill, audit table with filters, and progressive disclosure. The current page asks the operator to copy or remember raw IDs, then use separate forms. That increases cognitive load at exactly the liability-bearing moment.

**Overall UX score:** 24 / 40

**Main risk:** An operator can technically do the work, but the UI makes safe work harder than necessary. It relies on recall, manual ID entry, JSON inspection, and repeated card scanning instead of letting the queue carry context into each decision.

---

## 2. Human Jobs Evaluation

| Job | Score | Evidence | Design gap |
|---|---:|---|---|
| Orient | 3 / 4 | The page orders Action required -> Health -> Metrics and explains sealed raw text in the header. | Band-scoped loading/error/partial states are missing; metrics do not communicate trend or provenance. |
| Review | 2 / 4 | Action-required cards exist. | Queue items are display-only. Approve/suppress actions live in separate raw-ID forms, so the operator must recall or copy context. |
| Decide | 2 / 4 | Pause, suppress, approve, dry-run, and reveal actions exist and take reasons. | Decisions are disconnected from the entity being reviewed; reasons are free-text instead of a structured reason taxonomy plus notes. |
| Define | N/A | Not a process-definition surface. | No issue. |
| Delegate | N/A | Not a trust-tier configuration surface. | No issue. |
| Capture | N/A | Not an input-capture surface. | No issue. |

**Operator mental model check:** The target mental model is "what needs my decision now -> what is degraded -> how is the network trending." The built ordering supports that. The built mechanics do not: the decision path becomes "find an ID -> move to a form -> submit -> scan recent actions/audit," which is slower and more error-prone than triage.

**Parent-context note:** Brief 278/Insight 238 introduce Curate as an emerging, human-ratification-pending seventh job for member-owned data surfaces. It is not part of the current `docs/human-layer.md` six-job score, and it is not relevant to this operator dashboard.

---

## 3. Nielsen Heuristic Score

| Heuristic | Score | Notes |
|---|---:|---|
| Visibility of system status | 3 / 4 | Loading, dry-run result, pause status, all-clear, and recent actions are visible. Missing per-band status. |
| Match to operator world | 3 / 4 | Language is mostly clear and safety-oriented. Raw IDs still dominate action entry. |
| User control and freedom | 2 / 4 | Pause/resume exists. No contextual undo/retry or side-sheet continuity after decisions. |
| Consistency and standards | 2 / 4 | Uses existing tokens, but diverges from the specified ContentBlock-style queue/table/drill composition. |
| Error prevention | 3 / 4 | Reasons are required for reveal and actions. Manual ID entry is the largest remaining error source. |
| Recognition rather than recall | 1 / 4 | Candidate ID, Watch ID, suppression identifier, and raw metadata force recall/copying. |
| Flexibility and efficiency | 2 / 4 | Forms work for low volume. Higher-volume triage needs inline row actions, filters, and keyboard/scannable flow. |
| Aesthetic and minimalist design | 2 / 4 | Clear but card-heavy and generic-admin in places; metadata JSON and form farm add visual noise. |
| Error recovery | 3 / 4 | Global error and recent action failure log exist. Band-specific recovery is absent. |
| Help and documentation | 3 / 4 | Header and dry-run/reveal copy are good. Some labels are system-language rather than operator-language. |

**Total:** 24 / 40

---

## 4. What Works

1. **Triage order is present.** The top-level structure follows the Brief 278 Designer spec: Action required, then Health, then Metrics.
2. **All-clear is deliberate.** "No items need your decision" is a real state, not a blank panel.
3. **Bounded visibility is visible.** Private raw text is not shown by default; reveal requires a reason and the post-reveal annotation says the view is audited.
4. **Dry-run has the right trust signal.** The result banner says "DRY RUN - no contact" and displays zero emails, notifications, and writes.
5. **The surface reuses the existing admin shell direction.** It does not invent new admin chrome or a second auth concept.

---

## 5. Priority Findings

### P1 - The action queue is not yet an operator inbox

**Built shape:** Action-required items render as cards with title/detail/reason chips. Approve/suppress controls live below in separate forms with `Candidate ID` inputs.

**Why it matters:** This fails "recognition rather than recall." The operator has the decision context in one place and the action in another. In a trust-and-safety surface, copying an ID into a destructive or reputation-bearing action is avoidable risk.

**Desired shape:** Each action-required row/card should own its primary actions:

- `Approve`, `Suppress`, `Review details`, and `Reveal raw text` only when eligible.
- Candidate/request/source identifiers are carried by the row, not typed by the operator.
- Reason enum is required, with optional notes.
- Success removes the item from the queue and pins the resulting audit row in the drill.

This is the `ReviewCardBlock` + `ActionBlock` + `InputRequestBlock` composition specified in Brief 278 UX section 4.3.

### P1 - Audit drill is not yet an operator-grade audit surface

**Built shape:** Audit rows are a list of `<details>` disclosures. Metadata is flattened through `JSON.stringify()`. There are no filter facets, no structured actor column, no event badges, and no side-sheet.

**Why it matters:** Audit is the operator's proof layer. A raw list can be transparent without being usable. Insight-127 says trust comes from structured signals first, raw traces last.

**Desired shape:**

- Reverse-chronological `InteractiveTableBlock` with event badge, actor, subject, reason, time, and revealable state.
- Filter facets for event class, actor type, subject type, reason, and date.
- Row expand or side-sheet for structured metadata.
- Raw text reveal stays inside the expanded row or side-sheet with the audited annotation.

### P2 - Interaction states are too coarse for a trust console

**Built shape:** There is one global error banner and one loading treatment in Action required. Suppression rows have an empty state; metrics and health do not show their own loading/error/partial states.

**Why it matters:** The Designer spec required band-scoped states so a failed metrics query never hides the action queue and partial audit data is labelled honestly.

**Desired shape:**

- Per-band skeletons.
- Per-band errors with retry.
- Partial states such as "Showing newest 50 of 312 audit events."
- Counts should reflect true totals, not just loaded rows.

### P2 - The visual system drifts toward generic internal-tool dashboard

**Built shape:** Nearly every item is a bordered white card: action cards, health cards, metrics cards, three operator forms, dry-run panel, audit details, suppression table, recent actions. Gray table and badge treatments appear in the metrics and suppression areas.

**Why it matters:** `.impeccable.md` explicitly rejects grey/dashboard-utilitarian and says cards should be deliberate moments. The current surface is clear, but it looks like a generic admin panel rather than Ditto's precise trust console.

**Desired shape:**

- Use fewer cards. Let sections flow typographically and reserve raised panels for decision modules.
- Make Action required the strongest visual object; Health and Metrics should quiet down.
- Use electric orange only for privileged/review attention and audited reveal affordances.
- Keep green/red/amber semantic only for health and failure states.
- Replace gray utility styling with the existing canvas/ink/alabaster tokens.

### P2 - Structured reason taxonomy is missing from the interaction

**Built shape:** Approve, suppress, pause, dry-run, and reveal use free-text reason fields. Suppression identifier kind has a select, but the action reason itself is unstructured.

**Why it matters:** Brief 278 specified a reason taxonomy aligned to refusal reasons so suppression/override patterns become countable metrics. Free text is useful as notes, but weak as the primary reason model.

**Desired shape:** Every state-changing action should have:

- Required reason enum.
- Optional notes.
- Inline explanation of why the reason is required.
- Audit row showing both enum and notes provenance.

### P2 - Dry-run and reveal are safe, but not privileged enough visually

**Built shape:** Dry-run has a good result banner after execution, but the replay form itself looks like an ordinary panel. Reveal sits inside a vivid nested panel and the raw result appears in a white nested card.

**Why it matters:** Dry-run and reveal are the two moments where the operator needs maximum trust calibration: "this contacts no one" and "this is a privacy bypass." They should not feel like ordinary form submissions.

**Desired shape:**

- The dry-run replay module should carry a persistent no-contact label before and after execution.
- The reveal action should read as a privileged audit action, not a normal expansion form.
- Post-reveal should render as a structured record with actor, timestamp, field, and reason before raw text.

### P3 - Metrics are cards, not signals

**Built shape:** Metrics render as display-only cards with label/value/detail.

**Why it matters:** Display-only is correct, but aggregate metrics still need provenance and trend context to be useful. Brief 278 specified `MetricBlock` plus `ChartBlock` for trended series.

**Desired shape:** Add lightweight trend treatment where data exists, and a provenance affordance for each metric: source event class, aggregation window, and last refreshed time.

---

## 6. Cognitive Load Checklist

| Check | Result | Notes |
|---|---|---|
| Can the operator answer "what needs me now?" in under 5 seconds? | Pass | The Action required band is first. |
| Can the operator act without copying IDs? | Fail | Candidate ID, Watch ID, and suppression identifiers are manually typed. |
| Can the operator inspect provenance without raw traces first? | Partial | Some actor/subject metadata exists, but audit metadata is JSON and lacks source labels/filtering. |
| Are destructive or privileged actions context-bound? | Partial | Reasons are required, but actions are separated from the triggering row. |
| Is success visible in the workflow, not just in a log? | Partial | Queue refresh occurs and recent actions log records results, but the audit proof is not visibly tied to the row. |
| Does the surface stay calm when there is nothing to do? | Pass | The all-clear state works. |
| Does it avoid generic dashboard noise? | Partial | Structure is readable, but the repeated bordered-card pattern creates utility-dashboard drift. |

---

## 7. Interaction-State Requirements For Follow-Up

| State | Required treatment |
|---|---|
| Loading | Skeleton per band: queue rows, health strips, metric shells, audit table rows. Do not block the entire page on the slowest request. |
| Empty | Keep the current all-clear message for Action required. Add calm empty states for audit and suppression with last-refresh context. |
| Error | Band-scoped error with retry. A metrics failure must not hide the action queue. |
| Partial | Show loaded count and true total for audit/suppression lists. Include load-more or date-range controls. |
| Success | Inline confirmation on the action row, row leaves queue, and the newly written audit row is visible or linked immediately. |

---

## 8. Concrete Design Requirements

These are the highest-value follow-up requirements if the surface gets a design-polish pass.

1. **Promote Action required into the primary operator inbox.** Use a table/list or compact review cards with inline actions and a detail side-sheet. Do not require raw candidate IDs for row-owned actions.
2. **Replace the operator form farm with contextual actions.** Approve/suppress/pause/dry-run should be launched from the relevant row, watch, member, request, source, or segment context.
3. **Add structured reason taxonomy.** Use a reason enum plus optional notes for every state-changing action.
4. **Rebuild Audit drill as a scannable audit table.** Event badge, actor, subject, reason, timestamp, filter facets, row expand, and structured metadata.
5. **Add per-band states.** Loading, empty, error, partial, and success must be band-specific.
6. **Tighten visual hierarchy.** One strong queue, quieter health/metrics, fewer bordered cards, less gray utility styling, and stricter orange usage.
7. **Add provenance to metrics and audit metadata.** Every count should answer where it came from and over what window.
8. **Keep dry-run and reveal visibly privileged.** No-contact and audited-bypass labels should persist before action, during action, and after action.

---

## 9. Reference Doc Status

- `docs/research/278-trust-privacy-admin-ux.md` - Checked. Still valid. The implementation partially diverges from section 4, especially contextual row actions, side-sheet drill, audit filter facets, and band-scoped states.
- `docs/human-layer.md` - Checked. No drift found for this surface. The dashboard remains an Operate/Orient drill-down, not the primary conversation workspace.
- `docs/architecture.md` - Checked. No drift found. This surface fits Layer 6 Human plus governance/operator oversight.
- `docs/personas.md` - Checked. The Brief 278 Designer gap still stands: internal trust-and-safety operator is not one of the four primary personas. No edit made here because the gap is already flagged in the parent research and this review does not add a new persona claim.
- `.impeccable.md` - Checked. The implementation drifts from the "no grey/dashboard-utilitarian" and "cards are deliberate moments" direction. The doc itself is current.
- `docs/insights/` - Checked relevant 087, 127, 201, 238. No new insight needed; this review applies existing principles rather than discovering a new one.

**Reference docs updated:** none.

---

## 10. Handoff

This artifact feeds a design-polish or follow-up implementation brief. It does not reopen Brief 286's backend safety review.

Recommended next role depends on intent:

- If the team wants to preserve scope and only polish the existing surface: invoke Builder with this review plus `docs/research/278-trust-privacy-admin-ux.md` section 4.
- If the team wants to change data shape, side-sheet routing, or ContentBlock-level composition: invoke Architect first to scope the interaction changes.

Dev Reviewer handoff: challenge whether this critique accurately represents the user/operator job, honors the existing Designer spec, and is actionable enough for a Builder/Architect handoff.

---

## 11. Fresh-Context Review Report

**Reviewer verdict:** APPROVE WITH NITS.

**Blocking findings:** none.

**Nits fixed before handoff:**

1. Score mismatch fixed: the executive score now matches the Nielsen total, 24 / 40.
2. Human-jobs table fixed: Curate is no longer scored as a seventh job; a parent-context note explains that it is emerging and ratification-pending.

**Reviewer summary:** The artifact correctly identifies the operator job as triage, not analytics, and fairly compares the built surface to the Brief 278 UX source. Main findings are grounded in the implementation: display-only action cards plus separate ID forms, raw audit details via details/JSON, coarse global states, and free-text reasons. Severity ratings are defensible and the artifact avoids backend implementation review.
