# UX Interaction Spec: Hark Patterns → Phase 10 Brief Upgrades

**Date:** 2026-03-25
**Designer input for:** Briefs 041, 042, 038 (parent)
**Source:** `docs/research/hark-decision-intelligence-ui-patterns.md` (6 patterns) cross-referenced against Briefs 038-044

---

## Cross-Reference Summary

| Hark Pattern | Most relevant brief | Current coverage | Gap | Upgrade needed |
|-------------|---------------------|-----------------|-----|----------------|
| 1. Process-as-stepped-navigation | 042 (Navigation & Detail) | Living roadmap + domain process variants exist, but as READ-ONLY views | No "process runner" composition for processes with multiple human input steps | YES — add process runner variant |
| 2. Document integrity checking | 041 (Feed & Review) | No document handling in feed | No input validation UI, no document upload component | DEFERRED — Insight-088 capability gap, not Phase 10 scope |
| 3. Field-level validation with cross-reference | 041 (Feed & Review) | review-editor.tsx handles inline edits with diff | No split-view cross-reference for extracted-data verification | DEFERRED — depends on Insight-088 document tools |
| 4. Activity log component | 042 (Navigation & Detail) | "mini activity feed" mentioned in AC#5 | Not specified as a reusable catalog component with human+system unified timeline | YES — strengthen activity log spec |
| 5. Decision rendering with reasoning | 041 (Feed & Review) | process-output card (Type 6) is generic placeholder | No specific pattern for verdict + reasoning + evidence + export | YES — add decision output variant |
| 6. Governance layer | 038 (Parent) | Fully covered by harness (Layer 3) | None | NO upgrade needed |

**Result: 3 upgrades across 2 briefs (041, 042). 2 patterns deferred. 1 pattern already covered.**

---

## Upgrade 1: Process Runner Composition (Brief 042)

### The user's perspective

Rob has a quoting process with 7 steps. Three of those steps are human steps (input materials, review labour estimate, approve final quote). Today, Brief 042 shows Rob a process detail with "How it works" (7 steps listed) and "How it's going" (metrics). But when it's Rob's turn to act on a human step, he sees a review card in the feed (Brief 041) — he has no sense of where he is in the process flow.

Hark's stepped navigation solves this: when Rob is actively participating in a multi-step process, the UI shows him where he is in the sequence. He can see what's been done, what he's doing now, and what's coming next.

### What this means for the user

**When it activates:** The Self (or a sidebar click) opens a process instance where the user has active human steps. The center panel switches from the feed to a "process runner" composition.

**What the user sees:**
- Left sidebar (or inline panel): process steps in the user's language, with status indicators (✓ done, → current, ○ upcoming)
- Center: the current step's content — could be a review card, an input form, a document upload, or an approval
- The user can click on completed steps to review what happened
- The user can see what's next without it feeling like a preview of work they haven't done

**What this is NOT:**
- Not a wizard that locks the user into a sequence. They can leave and come back.
- Not a replacement for the feed. The feed is the daily surface. The process runner is a drill-in when the user is actively working through a multi-step process.
- Not for every process. Most processes have 1-2 human steps (a review). The runner is valuable when there are 3+ human steps in sequence.

### Which human jobs it serves

- **Orient:** "Where am I in this process?" — step indicators show progress
- **Review:** "Is this step's output right?" — current step renders the review surface
- **Capture:** "Here's what I know for this step" — input steps within the runner
- **Decide:** "Should I proceed or adjust?" — visible context from prior steps informs current decisions

### How it composes with existing primitives

The process runner is a **third process detail variant** alongside the existing two:

| Variant | When shown | What it shows |
|---------|-----------|---------------|
| Living roadmap | Generated processes (one-off work) | Steps with ✓/●/○, current step narration |
| Domain process | Recurring processes (ongoing operations) | "How it works" + "How it's going" |
| **Process runner (NEW)** | Active process instance with 3+ pending human steps | Stepped navigation + current step content |

The Self decides which variant to show based on process state. If a process run has multiple pending human steps (2+), it opens in runner mode. If the user just wants to check on a recurring process, it opens in domain mode. The threshold is a sensible default, not a hard rule — the Self may offer the runner for any process with sequential human steps when context suggests it.

### Interaction states

| State | What the user sees |
|-------|-------------------|
| Steps loading | Skeleton step list + loading indicator in content area |
| Step complete | ✓ icon, muted style, clickable to review |
| Step current (human) | → icon, highlighted, content area shows the action needed |
| Step current (agent) | Animated indicator "Working...", content shows progress or partial output |
| Step failed | ⚠ icon (amber), error explanation in user language, actions: "Try again" / "Skip" / "Ask Ditto" |
| Step upcoming | ○ icon, label visible but muted |
| All steps complete | Outcome view (see Upgrade 4 below) |
| User leaves mid-process | State preserved, returns to exact position |

### Recommended brief changes (042)

Add to Brief 042:
- **New file:** `packages/web/components/detail/process-runner.tsx` — stepped process runner with step navigation + content area
- **AC addition:** "Process runner variant: when a process instance has 3+ pending human steps, center panel shows stepped navigation with current step content. User can navigate between completed steps."
- **Provenance:** Hark stepped-wizard pattern (gethark.ai), adapted for Ditto's composable model

---

## Upgrade 2: Validation Review Variant (Brief 041)

### The user's perspective

Rob's quoting process extracts materials from a supplier price list (PDF). The system pulled out "Copper pipe: $2,100" but Rob needs to verify this against the actual price list. Today, Brief 041's review card shows the extracted value with an approve/edit/reject action. But Rob can't see the source document inline — he'd have to open the PDF separately and cross-reference manually.

Hark's cross-reference pattern solves this: when reviewing extracted data, the review card can expand into a validation view that shows the extracted value alongside the source.

### What this means for the user

**When it activates:** A review card's output includes extracted data with source document references. The user clicks "Verify" or expands the card.

**What the user sees:**
- Left: checklist of extracted fields with ✓ (verified) / ○ (pending) status
- Right top: source document region with the relevant value highlighted
- Right bottom: extracted value in an editable field, source attribution
- Actions per field: "Looks right" (verify) or "Fix this" (edit — captured as feedback)
- Overall actions: "All verified" (bulk approve) or "Done for now" (partial save)

**Progressive disclosure:**
- Default: review card shows extracted values as a summary table with confidence dots
- Expand: full validation view with cross-reference
- Most users will bulk-approve confident extractions and only drill into flagged ones

### Which human jobs it serves

- **Review:** "Is this extraction correct?" — field-by-field with evidence
- **Decide:** "Do I trust this source?" — seeing the source builds or erodes trust

### How it composes with existing primitives

This is a **variant of the review-item feed card** (Type 2 in Brief 041), not a new feed item type. The variant activates when:
1. The process output includes structured extracted data (not free text)
2. Source document references are available in the output metadata

The review-editor component (already in Brief 041) handles text editing with diffs. The validation review adds a **split-pane mode** for document-backed extractions.

### Interaction states

| State | What the user sees |
|-------|-------------------|
| Review card collapsed | Summary: "5 fields extracted from Rental Agreement. 2 flagged." |
| Review card expanded (simple) | Table of extracted values with approve/edit per row |
| Review card expanded (validation) | Split-pane: field checklist + source document + extracted value |
| Field verified | ✓ turns green, field greys out, focus moves to next |
| Field edited | Edit captures diff (existing feedback-recorder pathway), original and new values shown |
| All fields verified | Card collapses to "Verified ✓" state |
| Source document unavailable | Falls back to simple expanded view (no split-pane) |

### Recommended brief changes (041)

Add to Brief 041:
- **New file:** `packages/web/components/feed/validation-review.tsx` — split-pane validation view for document-extracted data
- **AC addition:** "When review output includes extracted structured data with source references, review card offers a validation mode: field checklist + source document cross-reference + per-field verify/edit."
- **Note:** This is an enhancement of the review-item card, not a new feed item type. The 6-type taxonomy remains unchanged.
- **Provenance:** Hark human validation pattern (gethark.ai), adapted for Ditto's review-in-feed model

---

## Upgrade 3: Activity Log as Catalog Component (Brief 042)

### The user's perspective

Rob drills into the Henderson quote and wants to know who changed the labour estimate and when. Today, Brief 042's domain-process variant shows "recent runs" but doesn't expose a field-level activity timeline mixing his actions with the system's.

Hark's activity log shows exactly this: a chronological timeline where human and system actions sit side by side, with expandable details per entry.

### What this means for the user

**When it activates:** Within process detail (either variant), a tab or expandable section shows the activity history for that process instance.

**What the user sees:**
- Timeline of actions, newest first
- Each entry: when, what changed, who (user name or "Ditto"), expandable detail
- Human actions: "Rob edited labour estimate: 18hrs → 22hrs"
- System actions: "Ditto extracted materials from Reece price list"
- Filter: "Show all" / "Just mine" / "Just Ditto's"

**Why this matters beyond Hark:**
- This is the visual manifestation of Insight-087 (provenance). Every piece of data has a history. The activity log IS that history.
- This directly serves the Decide job: "Should I trust this process?" — seeing the full history of human corrections and system actions gives the user evidence.
- For processes earning trust upgrades, this is the evidence base: "31 approved without changes" becomes visible as 31 entries in the log.

### Which human jobs it serves

- **Orient:** "What happened on this process?" — recent activity at a glance
- **Delegate:** "Should I change how closely I watch this?" — correction frequency and clean-run streaks in the timeline are the evidence base for trust calibration
- **Decide:** "Is the system getting better?" — correction frequency visible in timeline
- **Review (retrospective):** "Let me check what Ditto did while I was away"

### How it composes

The activity log is a **reusable display component** in the catalog (Insight-086). It can appear:
- In process detail (both domain-process and living-roadmap variants)
- In the process runner (showing history for the current step)
- In Engine View (expanded with routing/cost metadata per entry)

Data source: existing `activities` table + `stepRuns` + `trustChanges`, assembled by a query function.

### Interaction states

| State | What the user sees |
|-------|-------------------|
| Loading | Skeleton rows |
| Empty | "No activity yet. This process hasn't run." |
| Few entries (1-5) | All visible, no scroll |
| Many entries (5+) | Scrollable with "Show more" lazy loading |
| Entry expanded | Detail panel: full diff, reasoning, source references |
| Filtered (mine) | Only human actions, system actions hidden |

### Recommended brief changes (042)

Strengthen Brief 042 AC#5:
- **Current:** "Living roadmap variant: shows steps with ✓/●/○ icons, current step narration, mini activity feed"
- **Upgrade to:** "Living roadmap variant: shows steps with ✓/●/○ icons, current step narration, activity log component (unified timeline of human + system actions, per-entry detail, filterable). Activity log also appears in domain-process variant."
- **New file:** `packages/web/components/detail/activity-log.tsx` — reusable timeline component
- **Provenance:** Hark activity log pattern (gethark.ai), adapted as reusable catalog component per Insight-086

---

## Upgrade 4: Decision Output Variant (Brief 041)

### The user's perspective

Rob's quoting process produces a final quote. Today, Brief 041's process-output card (Type 6) is a generic placeholder for json-render content. But a quote decision is not generic content — it's a verdict ("Quote ready: $15,140") with reasoning ("Materials $8,400 at current Reece prices, labour 22hrs at $85/hr, 15% margin") and supporting data (line items, comparison to similar jobs).

Hark's decision rendering shows exactly this pattern: verdict prominent, reasoning accessible, supporting data visualized, exportable.

### What this means for the user

**When it activates:** A process output is tagged as a decision type (the process definition declares `output_type: decision` or the system classifies it from the output structure).

**What the user sees:**
- **Verdict bar:** prominent result with status colour (approved/conditional/flagged/declined)
- **Reasoning:** 1-3 sentences explaining the decision criteria and how they were met
- **Supporting data:** domain-specific visualisation (financial breakdown, comparison chart, risk indicators) — rendered via json-render when available, simple table as fallback
- **Actions:** Approve / Edit / Ask Ditto + **Export** (download as PDF or share)
- **Provenance footer:** "Based on: [sources]" — clickable per Insight-087

**Why "Export" matters:**
- Hark builds for regulated environments where every decision needs external documentation
- Ditto's personas include regulated users (FICO's immigration documents, Delta's insurance claims, Steven's property valuations)
- The architecture validation (6 businesses, 33 processes) found that 5 of 6 produce outputs consumed outside Ditto
- Export is not a nice-to-have — it's load-bearing for real users

### Which human jobs it serves

- **Review:** "Is this decision correct?" — verdict + reasoning visible
- **Decide:** "Should I approve this?" — evidence informs judgment
- **Orient:** "What was decided?" — glanceable verdict bar

### How it composes

This is a **variant of the process-output card** (Type 6 in Brief 041). The variant activates when the output has decision structure (verdict, criteria, evidence). It composes with:
- The review flow (approve/edit/reject actions from existing Type 2 patterns)
- The provenance system (Insight-087 — sources clickable)
- The export system (new — generates a shareable document from the output)

### Interaction states

| State | What the user sees |
|-------|-------------------|
| Decision pending | "Ditto is working on this..." with process steps visible |
| Decision ready | Verdict bar (green/amber/red) + reasoning + "Review this" |
| Decision approved | Verdict bar shows "Approved by [you]" + timestamp |
| Decision exported | "Downloaded" or "Shared" confirmation |
| Decision reasoning expanded | Full criteria evaluation: each criterion, pass/fail, evidence |

### Recommended brief changes (041)

Add to Brief 041:
- **Enhancement to process-output card (Type 6):** "When process output includes a decision (verdict + criteria + evidence), render as decision variant: verdict bar, reasoning summary, supporting data, export action."
- **New file:** `packages/web/components/feed/decision-output.tsx` — decision variant of process-output card
- **AC addition:** "Decision output: verdict prominent with status colour, reasoning accessible (1-3 sentences), supporting data rendered. Provenance footer per Insight-087."
- **AC addition:** "Export (MVP): decision outputs can be copied as formatted text or downloaded as Markdown. Full PDF export is a future enhancement requiring a document generation subsystem — not in Phase 10 scope."
- **Provenance:** Hark decision rendering pattern (gethark.ai), adapted for Ditto's review-in-feed model

---

## Deferred: Document Integrity Checking

### Why not Phase 10

Hark's document integrity pattern (metadata analysis, creation tool detection, timeline anomaly flagging) is compelling but depends on:
1. Document understanding agent tools (Insight-088 — not yet built)
2. File upload handling in the engine (process input types beyond text)
3. PDF/document metadata parsing capabilities

These are infrastructure capabilities, not UI patterns. Phase 10 builds the workspace; document handling is a Phase 11+ capability. The UI pattern is documented in the Hark research report for when the capability arrives.

### What to track

When document understanding is built (Insight-088), the UI should include:
- Upload component with per-document status (uploading, processing, verified, flagged)
- Integrity issue display: expandable list of metadata-level concerns per document
- Integration with the validation review pattern (Upgrade 2) for extracted fields

---

## New Insight Captured

### Insight-095: Input Integrity Is a Harness Pattern, Not Just Output Validation

Hark's document integrity checking reveals that the harness pattern (quality gates between steps) should apply to **process inputs**, not just AI outputs. When a document enters a process, the harness can validate its integrity (metadata analysis, format, authenticity) before the content is trusted and processed. This extends the harness from "checking the AI's work" to "checking the work's inputs."

**Layers affected:** L3 Harness (input validation handlers), L1 Process (input_type declarations), L6 Human (integrity status UI)
**Where it should land:** Architecture.md Layer 3 harness patterns, Insight-088 extension, future Phase 11+ brief

---

## Parent Brief (038) Impact

The upgrades above add three components and one enhancement but stay within the existing sub-brief structure:

| Upgrade | Brief affected | Size impact |
|---------|---------------|-------------|
| Process runner | 042 | ~3 AC (new variant + file + tests) |
| Validation review | DEFERRED | — (depends on Insight-088 document tools) |
| Activity log | 042 | ~1 AC (strengthen existing "mini activity feed" to full component) |
| Decision output | 041 | ~2 AC (new variant of existing process-output card + Markdown/text export) |

Total: ~6 AC across 2 briefs. These are additions to existing components, not new systems. They can be tagged as "should have" or built as fast-follows to the must-have core.

### Recommended priority within briefs

**Must have (proves the model):**
- Decision output variant (041) — real users produce decisions, not just text
- Activity log component (042) — provenance made visible, trust evidence

**Should have (completes the experience for regulated users):**
- Process runner composition (042) — valuable for multi-step human processes
- Validation review variant (041) — DEFERRED until document understanding tools exist (Insight-088). AC should NOT be added to Brief 041 now. Pattern is documented here for when the capability arrives. Fallback: simple expanded review card (already in Brief 041) handles all non-document review cases.

---

## Reference Doc Status

- **`docs/human-layer.md`:** Checked — six human jobs framework still accurate. Process runner serves Orient+Review+Capture+Decide. No updates needed.
- **`docs/personas.md`:** Checked — Rob, Lisa, Jordan, Nadia still accurately represented. Rob's trades workflow benefits most from process runner + decision rendering. No updates needed.
- **Insights checked:** 086 (composable UI — process runner is a valid composition), 087 (provenance — activity log is the visual manifestation), 088 (document understanding — integrity checking extends it), 089 (artifact-first — confirms document upload importance)
- **New insight captured:** Insight-095 (input integrity as harness pattern)
