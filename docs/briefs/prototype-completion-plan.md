# Brief: Prototype Completion & Artifact Prototypes

**Date:** 2026-03-27
**Status:** Ready for execution
**Context:** Prototype-as-specification work has produced 35 HTML files mapped to 11 screens (see `docs/prototypes/RECONCILIATION.md`). Block vocabulary evolved to 21 types. ADR-023 defines the artifact interaction model. This brief sequences the remaining work to reach build-ready state.
**Inputs:** `docs/prototypes/RECONCILIATION.md`, `docs/adrs/023-artifact-interaction-model.md`, `.impeccable.md`, user feedback log (this session)

---

## Outstanding Feedback (from design review)

### Resolved this session
- [x] Navigation labels — user language not system language (Today, Inbox, Work, Routines)
- [x] Trust labels — "Check everything / Spot check / Let it run"
- [x] Layout spec drift in `.impeccable.md` — three-column layout documented
- [x] Block vocabulary evolution — RecordBlock + InteractiveTableBlock added (21 types)
- [x] ChartBlock sizing — `size` property added (inline/small/medium/large)
- [x] DataBlock annotations — per-field provenance, flags, format hints
- [x] P30 block gallery — updated to 21 types with proper CSS classes
- [x] 8 prototypes updated to block vocabulary (P13, P14a, P15, P19, P24, P25, P26, P33)
- [x] Button colour fix — emerald (vivid) not black (accent) for primary actions
- [x] P25 centering fix
- [x] Prototype reconciliation document written

### Unresolved — requires prototype work

| # | Issue | Affected | Priority |
|---|-------|----------|----------|
| F1 | P15 Knowledge Base should be table, not record list | P15 | **P0** |
| F2 | P09 formatting broken (file encoding) | P09 | **P1** |
| F3 | P11, P12 not using block vocabulary | P11, P12 | **P1** |
| F4 | P21 mobile should be conversation-forward | P21 | **P1** |
| F5 | No artifact generation/refinement prototypes | New prototypes needed | **P0** |
| F6 | Missing real-world test case diversity (only posts) | Multiple prototypes | **P0** |
| F7 | P27 process flow needs real graph library consideration | P27 | **P2** |

---

## Work Plan

### Sprint 1: Artifact Prototypes (P0 — the big gap)

These are the prototypes that don't exist yet. They prove the ADR-023 artifact interaction model — conversation on left, live artifact preview on right, iterative refinement.

#### P36: Document Artifact — Rawlinsons Cost Estimate
**What it shows:** Conversation-driven document generation and refinement.
**Layout:** Three-column workspace. Conversation in centre, formatted document preview in right panel.
**States:**
1. **Generation** — User asks for cost estimate. Ditto generates. Right panel shows formatted document (line items, assumptions, totals). Conversation shows ArtifactBlock reference card.
2. **Refinement** — User says "copper rate seems high, use Q4 rates." Right panel updates with diff highlighted. Conversation shows updated reference with change summary.
3. **Second refinement** — User says "add 5% contingency." Right panel shows new line item.
4. **Approval** — User approves. Status changes. Destination shown ("Email to Henderson as PDF").
**Test case:** Rawlinsons quantity surveyor — cost estimate from uploaded plans.
**Blocks used:** ArtifactBlock (conversation reference), DataBlock (line items in right panel), TextBlock (assumptions), ActionBlock (approve/send).

#### P37: Multi-Part Content — Steven Leckie Content Pack
**What it shows:** Multi-artifact deliverable with individual review.
**Layout:** Three-column workspace. Conversation in centre, tabbed artifact view in right panel.
**States:**
1. **Pack generated** — Ditto produces 6 pieces (listing + 3 Instagram posts + video script + email blast). Conversation shows RecordBlock summary ("Content Pack — 6 pieces ready") + first ArtifactBlock. Right panel shows tabbed preview: [Listing] [Post 1] [Post 2] [Post 3] [Script] [Email].
2. **Individual review** — User reviews Post 2. Right panel shows Post 2 (image + caption in phone-frame preview). User says "punchier caption." Right panel updates.
3. **Batch progress** — 4/6 approved. Conversation shows updated pack status. Remaining items highlighted.
4. **Complete** — All approved. Pack status "Scheduled" with per-piece destinations (Instagram Thu 2pm, email blast Fri 9am).
**Test case:** Steven Leckie real estate — Dubai property marketing pack.
**Blocks used:** ArtifactBlock (per-piece references), RecordBlock (pack header), ImageBlock (in right panel), TextBlock (captions, scripts).

#### P38: Code Artifact — Integration Config
**What it shows:** Code generation with syntax highlighting and iterative refinement.
**Layout:** Three-column workspace. Conversation in centre, syntax-highlighted code in right panel.
**States:**
1. **Generation** — User asks to set up ERP integration. Right panel shows generated config code with field mappings.
2. **Refinement** — User says "add timber grade field mapping." Right panel updates, new lines highlighted.
3. **Testing** — User says "test it." Right panel shows test results inline.
4. **Deployment** — User approves. Status: "Deployed to staging."
**Test case:** Abodo Wood — Epicor ERP integration.
**Blocks used:** ArtifactBlock (conversation reference), CodeBlock (in right panel).

#### P39: Email Artifact — Client Communication
**What it shows:** Email drafting with preview-as-recipient-sees-it.
**Layout:** Three-column workspace. Conversation in centre, email preview in right panel.
**States:**
1. **Draft** — Ditto drafts a follow-up email. Right panel shows email preview (To, Subject, Body) styled as recipient would see it.
2. **Tone adjustment** — User says "more formal." Right panel updates body text.
3. **Approval** — User approves. "Sent to Henderson."
**Test case:** Plumber follow-up email to client about overdue quote response.
**Blocks used:** ArtifactBlock (conversation reference), TextBlock (email body in right panel).

#### P40: Clinical Notes — Voice to Structure
**What it shows:** Voice input → structured artifact with section-level refinement.
**Layout:** Three-column workspace. Conversation in centre, structured clinical notes in right panel.
**States:**
1. **Transcription** — User sends voice note (shown as audio indicator in conversation). Ditto produces structured session notes in right panel (Assessment, Findings, Plan, Follow-ups).
2. **Reorganisation** — User says "move cortisol observation to assessment section." Right panel reorganizes.
3. **Addition** — User says "add supplement recommendation: Vitamin D 5000IU." Right panel updates Plan section.
4. **Approval** — "Saved to patient record."
**Test case:** Jay/Status longevity practice — consultation notes.
**Blocks used:** ArtifactBlock (conversation reference), TextBlock (structured sections in right panel), ChecklistBlock (follow-ups).

### Sprint 2: Existing Prototype Fixes (P0-P1)

#### F1: P15 Knowledge Base → Table View
**What changes:** Rebuild P15 using three-column workspace layout. Centre panel shows InteractiveTableBlock (Status, Name, Type, Freshness, Used By, Actions). Health strip stays as hero above table. Right panel shows RecordBlock detail when row is clicked (fields, provenance, edit controls).
**Effort:** Medium — new layout, rewrite content section.

#### F2: P09 Formatting Fix
**What changes:** Fix file encoding issues (mojibake from previous unicode_escape corruption). Re-encode as clean UTF-8.
**Effort:** Small — encoding fix only.

#### F3: P11, P12 Block Vocabulary Update
**What changes:** Convert feed items in P11 (workspace emerges) and P12 (morning mobile) to use `.block-record` CSS classes, matching P13/P19 pattern.
**Effort:** Small — same mechanical update done for 8 other prototypes.

#### F4: P21 Mobile Conversation-Forward
**What changes:** Replace the current tab-based mobile layout (Feed / Review / Capture / Process) with conversation-forward design. Conversation is the primary surface. Bottom nav: Today, Inbox, [Conversation primary], Work, More. Quick capture becomes "talk to Ditto" — the conversation input IS the capture method.
**Effort:** Medium — significant layout rethink.

### Sprint 3: Polish & Consistency (P1-P2)

#### P30 Block Gallery Update
Add ArtifactBlock as type #22 to the block gallery. Show the compact reference card with all three states (created, updated, resolved). Include JSON example.

#### P27 Graph Rendering Note
Add a note to P27 that production implementation should evaluate graph visualization libraries (React Flow/Xyflow). Current CSS Grid prototype proves the concept but won't scale to 10+ process nodes with real dependency edges.

#### Consistency Audit
Final pass across all prototypes to verify:
- All use emerald (vivid) primary buttons, not black (accent)
- All workspace prototypes use three-column layout with correct sidebar labels
- All record/table patterns use block vocabulary CSS classes
- No remaining inline styles where CSS classes exist

---

## Sequencing & Dependencies

```
Sprint 1 (Artifact prototypes — the new work)
├── P36 Document artifact     ← proves ADR-023 core pattern
├── P37 Multi-part content    ← proves multi-artifact handling
├── P38 Code artifact         ← proves code rendering
├── P39 Email artifact        ← proves email preview
└── P40 Clinical notes        ← proves voice-to-structure

Sprint 2 (Existing fixes — parallel with Sprint 1)
├── F1 P15 table rebuild      ← can start immediately
├── F2 P09 encoding fix       ← trivial, do anytime
├── F3 P11/P12 block vocab    ← mechanical, do anytime
└── F4 P21 mobile redesign    ← depends on Sprint 1 patterns

Sprint 3 (Polish — after Sprints 1-2)
├── P30 gallery update        ← after ArtifactBlock design settled
├── P27 note                  ← trivial
└── Consistency audit         ← final pass
```

**Sprint 1 is the critical path.** P36 (document artifact) is the reference prototype — it proves the conversation-left, artifact-right, iterative-refinement pattern. All other artifact prototypes follow its layout and interaction model.

---

## Acceptance Criteria

1. **P36 proves the loop:** A user can see the full cycle — generate → refine → refine again → approve → deliver — in one prototype with live right-panel updates
2. **P37 proves multi-part:** Individual review, batch progress tracking, per-piece destinations
3. **P15 is a table:** Knowledge items render as InteractiveTableBlock, detail opens in right panel
4. **P21 is conversation-forward:** Primary mobile surface is conversation, not tabs
5. **All prototypes pass consistency audit:** Block vocabulary CSS, emerald buttons, correct sidebar labels, three-column layout
6. **P30 gallery shows all block types** including ArtifactBlock (22 types)
7. **Every prototype maps to exactly one screen** per RECONCILIATION.md

---

## Relationship to Build

Once these prototypes are approved:
1. `content-blocks.ts` gains ArtifactBlock type (22 types total)
2. `block-registry.tsx` gains ArtifactBlockComponent
3. Right panel gains artifact mode renderer
4. Each of the 11 screens from RECONCILIATION.md has pixel-level prototype references
5. Build brief can be finalized with full coverage

---

## Files Produced

| File | What it is |
|------|-----------|
| `docs/adrs/023-artifact-interaction-model.md` | Architecture decision for artifact interaction |
| `docs/prototypes/RECONCILIATION.md` | 35 prototypes → 11 screens mapping |
| `docs/prototypes/36-document-artifact.html` | **New** — Rawlinsons cost estimate |
| `docs/prototypes/37-content-pack.html` | **New** — Steven Leckie multi-part |
| `docs/prototypes/38-code-artifact.html` | **New** — Abodo ERP integration |
| `docs/prototypes/39-email-artifact.html` | **New** — Client email draft |
| `docs/prototypes/40-clinical-notes.html` | **New** — Jay session notes from voice |
| `docs/prototypes/15-knowledge-base.html` | **Rebuilt** — table view |
| `docs/prototypes/21-mobile-workspace.html` | **Rebuilt** — conversation-forward |
