# Conversation Block Emission — UX Interaction Spec

**Date:** 2026-04-01
**Designer:** Dev Designer
**Trigger:** PM triage of Briefs 057-068 revealed fundamental gap: 22 ContentBlock types exist in engine, only ~8 appear in conversation. Prototypes show rich inline blocks; reality shows text + developer-oriented activity traces.
**Insight:** 131 (Polishing a Chat Wrapper Is Not Building the Product)
**Personas tested against:** Rob (mobile, quick capture), Lisa (visual, non-technical), Jordan (demo to leadership), Nadia (team health at a glance)

---

## 1. The Problem Statement

**What the user sees today:**
- Text streaming (Self's narrative — looks like ChatGPT)
- Developer-oriented activity traces ("8 steps — read file 5x, searched code 2x")
- Raw monospace reasoning (internal thinking exposed)
- Occasionally: StatusCard, Progress block
- Confidence card (new, Brief 068)

**What the prototypes envision:**
- Inline correction blocks with diff rows (P16 Teach This)
- Trust evidence blocks with quality visuals, field tables, track records (P17 Trust Upgrade)
- Provenance strips with source badges (P22 Knowledge in Output)
- Inline sparklines, progress bars, metrics, checklists
- Rich structured records with 2-column field tables

**The gap:** Self responds with text. The block infrastructure exists but isn't used. The conversation feels like a wrapped Claude/ChatGPT, not a product.

---

## 2. Human Jobs Analysis

Every conversation block must serve one of the six human jobs:

| Human Job | What blocks should appear | Currently appears |
|-----------|--------------------------|-------------------|
| **Orient** | StatusCard, Progress, Metric, Data (table), Chart (sparkline) | StatusCard (some), Progress (rare) |
| **Review** | ReviewCard, KnowledgeCitation, ReasoningTrace, Checklist | Never in conversation |
| **Define** | ProcessProposal, InputRequest, Suggestion | ProcessProposal (onboarding only) |
| **Delegate** | Trust evidence (Record), StatusCard (trust tier) | Never |
| **Capture** | GatheringIndicator, KnowledgeSynthesis | Onboarding only |
| **Decide** | Suggestion, Alert, Data (comparison), Chart | Never |

**Approximately half the 22 block types never appear in regular conversation, and several more appear only in narrow flows (onboarding, dev pipeline).** 12 tools currently have block mappings, but most emit only StatusCard/Text. 7 tools return no blocks. The gap is both coverage (unmapped tools) and richness (mapped tools under-use the block vocabulary). The conversation only serves Orient (partially) and Capture (onboarding only). Four of six human jobs have zero block support.

---

## 3. The Conversation Block Vocabulary

### Principle: Text Is Narrative, Blocks Are Evidence

> **Note:** The Confidence Card is response-level metadata per Insight-129, not a ContentBlock. It is rendered as conversation chrome by the Message component, not through the block registry. It appears in examples below using `[Confidence: ...]` notation for illustration but is architecturally distinct from ContentBlocks.

Self's text is its voice — explanations, context, guidance, reasoning. Blocks are the structured evidence that supports the narrative. They are NOT replacements for text but companions to it.

**Pattern:** Self speaks → blocks appear inline as evidence/data → user processes both.

This mirrors how a competent colleague communicates: they explain verbally AND show you the data, the chart, the checklist.

### When Each Block Type Should Appear

#### Tier 1: High-frequency (every conversation)

| Block | Trigger | Human Job | Example |
|-------|---------|-----------|---------|
| **StatusCard** | Any tool that changes state (work item, process, trust) | Orient | "Created work item: Invoice follow-up — status: active" |
| **Data** (key-value) | Any tool that retrieves structured information | Orient | Process details, work item fields, user model summary |
| **Checklist** | Any verification, test result, or multi-step check | Review | "Checked 3 things: ✓ tests pass, ✓ types clean, ✕ coverage dropped" |
| **Alert** | Errors, warnings, timeouts, important notices | Orient | "Type-check found 2 errors in self-tools.ts" |

#### Tier 2: Context-dependent (when relevant data exists)

| Block | Trigger | Human Job | Example |
|-------|---------|-----------|---------|
| **Metric** | When Self reports a single important number | Orient | "Trust score: 87%" with trend arrow |
| **Record** | When showing entity detail (process, agent, work item) | Orient | Process record with fields, status, health |
| **KnowledgeCitation** | When Self references learned knowledge or prior work | Review | "Based on: prior run (Mar 28), user correction (Mar 30)" |
| **Chart** (sparkline) | When showing trend data (trust, quality, activity) | Orient/Decide | Trust score over last 20 runs |
| **Suggestion** | When Self has a proactive recommendation | Decide | "You could automate this — here's a process that fits" |

#### Tier 3: Workflow-specific (specific interaction flows)

| Block | Trigger | Human Job | Example |
|-------|---------|-----------|---------|
| **ReviewCard** | When presenting work output for approval | Review | Inline review with approve/edit/reject actions |
| **ProcessProposal** | When proposing a new or adapted process | Define | Process steps with status indicators |
| **InputRequest** | When Self needs structured input from user | Capture | "What's the client name?" with form fields |
| **KnowledgeSynthesis** | When summarizing what was learned | Capture | Editable summary of captured knowledge |
| **ReasoningTrace** | When showing decision logic for trust-building | Review | "Chose this approach because: step 1 → step 2 → conclusion" |
| **InteractiveTable** | When presenting multiple options or comparisons | Decide | Process template selection, risk comparison |

#### Tier 4: Rare (special contexts)

| Block | Trigger | Human Job | Example |
|-------|---------|-----------|---------|
| **Code** | When showing code snippets or config | Review | Only in dev-pipeline context |
| **Image** | When showing generated visuals | Review | Future: generated diagrams |
| **Artifact** | When referring to a large output | Review | "Full report available" with open action |
| **Progress** | When a pipeline is running | Orient | Step-by-step execution progress |

---

## 4. Activity & Reasoning Display — User-First Reframe

### The Problem

Current activity display is developer-oriented:
- Header: "8 steps — read file (5x), searched code (2x)"
- Expanded: raw tool names, file paths, grep patterns
- Reasoning: monospace internal thinking text

This serves Jordan (technical PM) but alienates Lisa (non-technical) and confuses Rob (mobile, glanceable).

### The Fix: Three Levels of Progressive Disclosure

**Level 1 — Collapsed (default for most users):**
> Ditto checked 3 sources and verified the result.

No tool names. No file paths. No step counts. Just what happened in human terms.

**Level 2 — Expanded (click to see more):**
> - Checked knowledge base → found 2 relevant entries
> - Reviewed recent work → invoice follow-up ran 3 times this week
> - Verified result → all quality checks passed

Outcome-oriented steps. Still no raw tool names or file paths.

**Level 3 — Technical detail (developer toggle, Ctrl+Shift+E):**
> - Read file: processes/invoice-follow-up.yaml
> - Grep: "invoice" in src/engine/
> - Bash: pnpm test -- --grep "invoice"

This is what exists today. It should be the THIRD level, not the first.

### Reasoning Display

**Current:** Raw monospace thinking text, always visible, 200px scroll.

**Proposed:** Reasoning should NOT be exposed by default for non-technical users. Instead:
- **Confidence card (Brief 068)** summarizes what Self checked and where it's uncertain — this IS the user-facing reasoning
- **Activity trace** (Level 2 above) shows what was done
- **Raw thinking** is Level 3 only (developer toggle)

For Lisa: she sees the confidence card ("Medium confidence — couldn't verify the deadline") and that's enough.
For Jordan: he can expand the activity trace to see the steps.
For a developer: they can toggle to see raw reasoning.

---

## 5. Conversation Flow — What the User Should See

### Example: "What's the status of my invoice follow-up process?"

**Today (chat wrapper):**
```
[Activity: 5 steps — read file (2x), queried database (2x), searched code]

The invoice follow-up process is running well. It's completed
12 runs this month with an 85% trust score. The last run was
yesterday and produced a follow-up email that was approved
without changes...
```

**Proposed (block-rich):**
```
[Confidence: High — ● Checked process history and recent runs]

[StatusCard: Invoice Follow-up — Active, Spot-checked tier]

[Record:
  Last run:        Yesterday, 3:42 PM
  Runs this month: 12
  Trust score:     85% ↑
  Approval rate:   100% (last 5)
]

The process is running smoothly. All recent outputs were
approved without changes. Trust has been climbing — it may
be ready for an upgrade to autonomous.

[Suggestion: "Upgrade to autonomous?" — Based on 20 consecutive
 clean runs. You can always dial it back.]
```

### Example: "Review the output from the content review"

**Today:**
```
[Activity: 8 steps — read file (3x), searched code (2x), ...]

Here's the output from the content review. The article covers
the main points but I found a few issues...

[wall of text describing the issues]
```

**Proposed:**
```
[Confidence: Medium — ● Found 2 issues to flag]

[ReviewCard: Content Review Output
  Quality: 78%
  ✓ Covers all required topics
  ✓ Tone matches brand voice
  ✕ Missing source attribution (paragraph 3)
  ✕ Statistics need verification

  [Approve] [Edit] [Reject]
]

The article covers the required topics well and matches your brand
voice. Two things need attention before publishing:

[KnowledgeCitation: Based on: brand voice guide (captured Mar 15),
 previous review feedback (Mar 22)]
```

### Example: "Create a process for onboarding new clients"

**Today:**
```
[Activity: 3 steps — ...]

I'll help you create a process for client onboarding. Based on
what I know about your work...

[text describing the proposed steps]
```

**Proposed:**
```
[GatheringIndicator: Learning about your client onboarding needs...]

Let me propose something based on what I know about your work.

[ProcessProposal: Client Onboarding (Draft)
  Step 1: Gather client details (human)
  Step 2: Set up workspace (ai-agent)
  Step 3: Send welcome package (ai-agent)
  Step 4: Schedule kickoff call (human)
  Step 5: Review first deliverable (human + ai review)

  [Approve] [Adjust]
]

This gives you two checkpoints (steps 1 and 4) where you're
directly involved. Steps 2-3 can run autonomously once you've
provided the client details.

[Suggestion: "Want to add an integration?" — Connect to your
 calendar to auto-schedule the kickoff.]
```

### Example: "I want to let the invoice process run on its own"

**Today:**
```
[Activity: 4 steps — queried database (3x), read file]

Based on the invoice follow-up process history, it's been
performing well. It has completed 23 runs with a 92% approval
rate. The current trust tier is spot-checked...

[text continues with trust details]
```

**Proposed:**
```
[Confidence: High — ● Reviewed full process history]

Here's the evidence for upgrading invoice follow-up to autonomous:

[Record: Invoice Follow-up — Trust Assessment
  Current tier:    Spot-checked (~20% review)
  Runs completed:  23
  Approval rate:   92% (last 20)
  Last rejection:  None in 15 runs
  Quality trend:   Stable
]

[Metric: Trust Score — 91% ↑3% this week]

[Checklist: Safety Net
  ✓ Auto-pause on low confidence (always active)
  ✓ Revert to spot-checked after any rejection
  ✓ Weekly digest of autonomous decisions
  ○ You can adjust trust anytime from process detail
]

The track record supports autonomous operation. You'll still
get a weekly summary and it will pause automatically if
confidence drops.

[Suggestion: "Upgrade to autonomous" — You can always dial
 it back from the process detail view.]
```

---

## 6. Design Rules for Block Emission

1. **Text frames, blocks prove.** Self always provides narrative context. Blocks provide the structured evidence. Never blocks without framing text.

2. **One to three blocks per response.** More than three creates visual noise. If there's more data, use artifact mode.

3. **Blocks appear after confidence card, before or interleaved with narrative.** Confidence card first (Brief 068), then blocks + text weave together.

4. **Match block type to data shape, not to tool name.** A `get_process_detail` result should emit a Record block for the entity AND a Chart for the trust trend — not just a StatusCard.

5. **Never show raw tool/file information in default view.** Tool names, file paths, grep patterns are Level 3 only.

6. **Blocks must be actionable where appropriate.** StatusCards have drill-down. ReviewCards have approve/edit/reject. Suggestions have accept/dismiss. Records have field-level actions.

7. **Mobile-safe by default.** Every block must render well at 320px width. Record blocks collapse to stacked layout. Charts use responsive sizing.

---

## 7. What This Changes Architecturally (for the Architect)

This spec implies the following changes (design requirements, not technical decisions):

1. **Self must be instructed to produce structured blocks.** When Self's tools return structured data, it should emit ContentBlocks, not narrate the data as text. This is a cognitive/self.md change + tool result mapping expansion.

2. **Tool → Block mapping must expand from 12 tools (most emitting only StatusCard/Text) to all 19, with richer block type selection.** Every Self tool should have a block emission strategy. 7 tools currently return no blocks at all. The Architect decides the mechanism.

3. **Activity display needs three progressive disclosure levels.** The current single-level developer view needs to become Level 3, with new Level 1 (human summary) and Level 2 (outcome steps) above it.

4. **Reasoning should default to hidden for non-technical users.** Confidence card + activity trace replace raw thinking as the trust signal.

5. **Block emission should be declarative, not imperative.** Rather than a switch statement per tool, the Architect should consider a data-driven approach: tool metadata declares what block types its output maps to.

---

## 8. Prototype Cross-Reference

| Prototype | Key blocks shown | Current implementation gap |
|-----------|------------------|---------------------------|
| P16 Teach This | Correction block (diff), Teach block (patterns), Confirmed block | None of these render. Correction → could be Record with diff format. Teach → Suggestion + KnowledgeSynthesis. Confirmed → Alert (success). |
| P17 Trust Upgrade | Quality visual (Metric), Track record (Record), Trust changes (Checklist), Safety net (Alert) | None in conversation. Trust upgrade is text-only today. |
| P22 Knowledge in Output | Provenance strip (KnowledgeCitation) | Never generated. Self doesn't cite sources in conversation. |
| P09 First Conversation | ProcessProposal, GatheringIndicator | Works in onboarding flow only. |
| P30 JSON Render | Full block gallery | Block registry renders all 22 types; emission is the gap. |

---

## 9. Success Criteria (for the Architect's brief)

A user conversation should pass these tests:

1. **Lisa test:** A non-technical user can understand every element in the conversation without hovering or expanding anything. No tool names, no file paths, no raw code in default view.

2. **Glanceability test:** Scanning the conversation gives you the gist in 3 seconds — structured blocks create visual anchors in the text flow.

3. **Trust test:** The confidence card + provenance citations + activity summary give the user enough evidence to trust (or question) the response without seeing raw internals.

4. **Action test:** Every block that implies a next step has an actionable affordance (button, link, expand).

5. **Prototype parity test:** A conversation about process status should visually resemble P17 Trust Upgrade. A conversation about teaching should resemble P16 Teach This.

---

## 10. Stale Research Flag

The following existing research docs may need updating in light of this spec:
- `docs/research/conversation-polish-ux.md` — Written for Brief 066, focused on chat-wrapper polish (animations, hover). Stale: should incorporate block emission.
- `docs/research/reasoning-chain-of-thought-ux.md` — Written for Brief 067, focused on reframing activity headers. Stale: should incorporate three-level progressive disclosure.
- `docs/research/confidence-trust-card-ux.md` — Written for Brief 068. Still valid but should reference this spec for context.

---

## 11. Open Questions (for the Architect)

1. **Where does block selection happen?** Does Self's LLM decide which blocks to emit? Or does a post-processing layer convert tool results to blocks? Or both?
2. **How do we handle streaming blocks?** Text streams character-by-character. Can blocks stream too (e.g., a Record that fills in as data arrives)?
3. **Should Self be trained/prompted to produce block hints?** e.g., Self's response includes `[block:record]` markers that the renderer interprets?
4. **How does the three-level activity disclosure interact with the existing ChainOfThought component?** Is it a refactor of the same component or a replacement?
5. **Block ordering during streaming:** The conversation flow examples imply specific block ordering (confidence card first, entity blocks middle, narrative last, suggestion at end). The current streaming model emits in tool-execution order. How is the desired ordering achieved — prompt engineering (instruct Self to structure responses this way), post-processing reorder, or is the ordering aspirational?
6. **Adaptive disclosure level:** Should the default activity disclosure level adapt over time? A user like Jordan who repeatedly clicks to Level 2-3 should eventually have Level 2 as their default. Is this a user preference toggle or an adaptive default driven by implicit signals (Insight-124)?
