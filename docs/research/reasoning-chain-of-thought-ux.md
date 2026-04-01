# UX Interaction Spec: Reasoning & Chain of Thought Display

**Date:** 2026-03-31
**Designer:** Dev Designer
**Feeds:** Brief 065 (conversation core feel), future reasoning visibility brief
**Personas tested:** Rob (mobile, between jobs), Lisa (desk, quick scan), Jordan (demos to leadership), Nadia (team quality governor)

---

## Design Problem

The current reasoning/chain-of-thought display uses developer-oriented patterns borrowed from Claude.ai and Cursor. The screenshot shows:

- "Thought for a moment" — collapsed, with chevron
- "Thought for a few seconds" — collapsed, with chevron
- Internal CLI activity (Read, Edit, Grep) grouped into collapsible sections

**This doesn't work for our personas.** Rob doesn't care that the AI "thought." Lisa doesn't know what "Read file" means. Jordan can't demo "Thought for a few seconds" to leadership and expect them to be impressed. Nadia needs to know what was CHECKED, not that checking happened.

The competitive audit (Section 3) shows that every product — Claude.ai, ChatGPT, Cursor, Perplexity — designs reasoning for technical users. Ditto's personas are outcome owners, not developers. We need a fundamentally different framing.

---

## The Core Reframe

**From "thinking trace" → to "verification evidence."**

The personas doc (Problem 5) says: *"I don't trust AI because I can't see its reasoning."* But when you read the solution — *"Every output shows what was checked (pricing check: passed, margin check: 1 warning). Confidence scores per item. Evidence trails with source links."* — that's not a thinking trace. That's a **verification report**.

The distinction matters:

| Developer framing | Outcome-owner framing |
|---|---|
| "Thought for 7 seconds" | "Checked 3 things before responding" |
| "Searched knowledge · 3 results" | "Reviewed your pricing history" |
| "Read file · config.yaml" | (hidden — internal implementation) |
| Collapsible reasoning text (monospace) | Collapsible evidence summary (plain language) |

**The user's question isn't "how did you think?" — it's "what did you check and should I trust this?"**

---

## Human Jobs Served

| Job | How reasoning/activity display serves it |
|-----|------------------------------------------|
| **Orient** | "What's happening right now?" — active step indicator during processing |
| **Review** | "Was the reasoning sound?" — verification summary lets user assess before reading the full response |
| **Decide** | "Should I trust this?" — evidence quality informs whether to approve, edit, or reject |

Not served: Define, Delegate, Capture (these jobs don't involve reasoning display).

---

## Three Tiers of Visibility

The key design pattern: **progressive disclosure matched to user intent**, not to technical detail level.

### Tier 1: Always Visible — The Response
The AI's response text. This is what the user came for. Nothing about reasoning competes with this.

### Tier 2: Glanceable Summary — What Was Checked
A single compact line (or short group) that summarizes what verification occurred. Visible but quiet — the user can glance at it and move on, or use it as a trust signal.

**Current pattern (developer-oriented):**
```
▸ Thought for 7s — checked pricing database, verified copper rates
✓ Searched knowledge · 3 results
✓ Checked pricing · copper $18.40/unit
```

**Proposed pattern (outcome-oriented):**
```
▸ Verified pricing and availability before responding
  ✓ Checked your supplier price list — copper rates current
  ✓ Reviewed Henderson project history — 2 similar quotes found
```

The difference: the header tells the user WHAT WAS VERIFIED (outcome language), not HOW LONG THE AI THOUGHT (process language). The sub-items are specific checks with outcome summaries.

### Tier 3: Full Detail — Reasoning Text & Tool I/O
Available on expand. For users who want to audit the reasoning process itself. This is where the actual thinking text, tool inputs, and raw outputs live.

**Who uses Tier 3:**
- Nadia, when a compliance check flags something unexpected
- Jordan, when preparing a demo and wanting to understand the system
- Rob and Lisa, almost never (they care about outcomes, not process)

---

## Two Activity Categories (Insight-125 Applied)

The existing Insight-125 identifies internal vs user-facing tools. This spec extends that to reasoning:

### Category A: Internal Activity (collapse aggressively)
- **AI reasoning** (thinking-delta events) — the AI's internal deliberation
- **CLI tools** (Read, Edit, Grep, Glob, Bash) — implementation details
- **Sub-agent calls** (Agent tool) — delegation internals

These are the AI's "working process." They should be:
- Grouped together into a single collapsible section
- Default collapsed when complete
- Summarised with an outcome-oriented header (not "Thought for 7s")
- Expandable for audit/transparency

### Category B: User-Facing Work (show prominently)
- **Ditto tools** (search_knowledge, save_process, start_pipeline, check_status) — these produce meaningful output
- **Pipeline steps** — these are the actual work being done on the user's behalf

These represent work the user asked for. They should:
- Render as compact inline steps (current Brief 065 pattern is correct)
- Show outcome summaries
- Surface ContentBlock output directly (not behind a collapsible)

---

## Proposed Interaction Patterns

### Pattern 1: Activity Summary Header

**During processing:**
```
◌ Checking your quoting data...
```
Single line, subtle spinner, outcome-oriented language. Updates as the activity progresses — the label changes to reflect what's currently happening, not a generic "Working..."

**Progression examples:**
```
◌ Reviewing your supplier prices...
◌ Comparing with Henderson project history...
◌ Verifying margin calculations...
```

**After completion (collapsed):**
```
▸ Verified pricing, project history, and margins
```

One line. Tells the user what was checked. Chevron to expand.

**After completion (expanded):**
```
▾ Verified pricing, project history, and margins
  ✓ Checked supplier price list — copper $18.40/unit (current)
  ✓ Reviewed Henderson project — 2 similar quotes found
  ✓ Calculated margin — 25% residential rate applied

  ┆ Thinking: "Let me check the pricing database for copper
  ┆ fittings in the Henderson project scope. The last quote
  ┆ used $18.40/unit but copper prices have moved..."
```

The expanded view shows: specific checks with outcomes (top), then the raw reasoning text (bottom, further indented, secondary styling). The checks are the useful part; the raw reasoning is the transparency part.

### Pattern 2: Contextual Headers (Not Time-Based)

**Current:** "Thought for 7s — checked pricing database, verified copper rates"

**Proposed options (presenting three alternatives for Architect evaluation):**

**Option A: Outcome-first header**
```
▸ Verified pricing and availability before responding
```
Pro: Directly answers "what did you check?"
Con: Requires the system to generate a meaningful summary (LLM work)

**Option B: Check-count header**
```
▸ Checked 3 things before responding
```
Pro: Simple, deterministic, no LLM summary needed
Con: Less informative — "3 things" is vague

**Option C: Hybrid — count + lead item**
```
▸ Checked 3 sources — pricing, project history, margins
```
Pro: Informative AND deterministic (extract from tool names/types)
Con: Can get long with many checks

**Recommendation:** Option C for the typical case (2-5 checks). Falls back to Option B for >5 checks. Option A is aspirational (requires engine-side summarisation, mark as future enhancement).

### Pattern 3: Progressive Detail by Trust Level

The amount of verification evidence shown should adapt to trust tier:

| Trust tier | Default visibility | Rationale |
|---|---|---|
| **Supervised** (new process) | Activity summary expanded, all checks visible | User is actively validating — show everything |
| **Spot-checked** | Activity summary collapsed, one-line header | User trusts the process, glances for anomalies |
| **Autonomous** | Activity summary hidden unless anomaly detected | User trusts the process fully — don't clutter |

This maps to the emotional journey: Week 1 (cautious hope) → show more. Month 3 (compound effect) → show less. The system earns the right to be quiet.

**Note:** This is a future enhancement (requires trust-tier awareness in the UI). The immediate implementation should default to "collapsed with summary header" for all trust levels.

### Pattern 4: Error/Anomaly Elevation

When something goes wrong or is flagged, the activity display should ELEVATE, not hide:

```
▾ ⚠ Pricing check found a discrepancy
  ✓ Reviewed Henderson project — 2 similar quotes found
  ⚠ Supplier price list — copper $18.40/unit but last quote used $16.20
  ✓ Calculated margin — 25% residential rate applied
```

The warning icon and elevated header pull the user's attention. This is the "exception-driven" oversight pattern from the personas doc. The activity display becomes an active trust signal, not just passive transparency.

---

## Persona Tests

### Rob Test (mobile, between jobs)
Rob asked Ditto about the Henderson quote status from his truck. He sees:

```
▸ Checked 2 sources — pricing, project history

The Henderson bathroom renovation quote is ready for your
review. Key details:
- Materials: $6,240 (copper fittings at current rates)
- Labour: 18 hours at standard residential rate
- Total: $14,200 including 25% margin

Tap to review the full quote.
```

Rob glances at "Checked 2 sources" — he knows the pricing is fresh. He focuses on the numbers. If he's suspicious about the copper price, one tap expands the verification detail. But 90% of the time, the one-line summary is enough.

### Lisa Test (desk, quick scan between meetings)
Lisa asked Ditto to draft a product description. She sees:

```
▸ Reviewed product data and brand guidelines

Here's the draft for the Merino Wool Throw:

"Crafted from certified New Zealand merino wool, this throw
brings..." [continues]
```

Lisa doesn't care about the tool calls. She cares about the output. The one-line summary tells her the AI consulted the brand guidelines (so the voice should be right). She focuses on reading the description and deciding whether to approve or edit.

### Jordan Test (demoing to leadership)
Jordan is showing the CTO how Ditto handles reference checking. The CTO asks "how does it know what to ask the referees?"

```
▾ Checked 3 sources — HR templates, role requirements, industry standards
  ✓ Retrieved standard questionnaire template — 12 questions
  ✓ Matched role requirements — added 3 role-specific questions
  ✓ Applied industry benchmarks — flagged 2 questions below compliance threshold
```

Jordan clicks to expand. The CTO sees specific, meaningful checks — not "Thought for 12 seconds." This is demoing intelligence, not demoing machinery.

### Nadia Test (reviewing team output quality)
Nadia sees a report flagged for review. The activity display elevated:

```
▾ ⚠ Citation check found 3 issues
  ✓ Verified formatting — APA 7th compliant
  ⚠ Missing DOI — 3 citations lack DOI links (Chen, Park, Williams)
  ✓ Cross-referenced data sources — all current

[Report content with issues highlighted...]
```

Nadia knows exactly where to focus. The verification display acts as a pre-review summary — she doesn't need to read the whole report to find the problems. The expanded view shows her what the AI CHECKED, which builds trust that nothing was missed.

---

## Competitive Patterns: What Transfers, What Doesn't

### Claude.ai Extended Thinking
- **What transfers:** Collapsible by default, distinct visual container, summary when collapsed
- **What doesn't:** "Thinking" framing, time-based headers, monospace technical display
- **Ditto adaptation:** Same collapsible mechanic, but outcome-oriented headers and plain-language summaries

### ChatGPT Thinking Mode
- **What transfers:** Plan preview concept (showing approach before conclusion)
- **What doesn't:** Token counter, thinking level presets, technical framing
- **Ditto adaptation:** The "what was checked" summary IS a lightweight plan preview — it tells the user what the AI's approach was, without technical detail

### Perplexity Sources-First
- **What transfers most:** Sources shown BEFORE the answer — communicates credibility immediately. Numbered source pills. "I found these, and here's what they say."
- **What doesn't:** Search-engine metaphor, academic citation format
- **Ditto adaptation:** The "Checked 3 sources — pricing, project history, margins" header IS the Perplexity pattern, adapted for process work instead of web search. Evidence before conclusion.

### Cursor/Windsurf
- **What transfers:** Compact step display (checkmark + label), progress indicator through step completion
- **What doesn't:** Developer-tool framing, diff views, file paths
- **Ditto adaptation:** The compact step pattern works. The content needs to be outcome-oriented, not file-oriented.

---

## Implementation Considerations (For Architect)

These are UX constraints the Architect should account for — not technical design decisions.

1. **Header generation:** The outcome-oriented headers (Option C: "Checked 3 sources — pricing, project history, margins") can be derived from tool names and tool result metadata without additional LLM calls. The tool display name map already exists (`tool-display-names.ts`). An Architect decision: extend this with outcome-oriented summaries, or generate headers from tool-call metadata at render time.

2. **Trust-tier awareness:** Progressive detail by trust level (Pattern 3) requires the UI to know the current process's trust tier. This is a future enhancement — flag for architecture consideration but don't block the initial implementation.

3. **Anomaly detection:** Pattern 4 (error/anomaly elevation) requires tool results to carry a severity/status signal (pass/warning/fail). The ContentBlock system may already support this via AlertBlock — the Architect should evaluate.

4. **Activity grouping boundary:** Insight-125 defines the CLI_INTERNAL_TOOLS set. The current `message.tsx` groups reasoning + internal tools into ChainOfThought sections. This spec proposes keeping that grouping but changing the header from time-based ("Thought for 7s") to outcome-based ("Checked 3 sources — ..."). The grouping logic stays; the presentation changes.

5. **Summary extraction:** The current `extractSummary()` in reasoning.tsx takes the last ~80 chars. The proposed pattern instead extracts from tool names/results — "pricing, project history, margins" from the tool calls within the group. This is a render-time computation, not an LLM call.

---

## What This Spec Covers vs. Defers

### This spec covers (interaction design):
- How reasoning and activity should be FRAMED for outcome owners
- The three-tier visibility model
- Activity header language and content
- Expanded vs collapsed behavior
- Trust-tier adaptation direction
- Persona validation for each pattern

### This spec defers to the Architect:
- How to generate outcome-oriented headers (tool metadata vs LLM summary)
- How trust-tier awareness reaches the UI components
- ContentBlock extensions for check-result rendering
- Engine-side changes (if any) to support richer activity metadata

### This spec defers to future briefs:
- ReasoningTraceBlock wired into conversation (human-layer.md gap table)
- "Teach this" feedback capture from reasoning review
- Mobile-specific reasoning display adaptations
- Voice summary of verification checks

---

## Design Tokens Used

All existing `.impeccable.md` tokens — no new tokens needed:
- **text-muted:** Collapsed headers, check labels
- **text-secondary:** Expanded reasoning text
- **positive:** Check pass icon (✓)
- **warning:** Check anomaly icon (⚠)
- **negative:** Check fail icon (✕)
- **vivid-deep:** Left border accent on expanded reasoning
- **surface-raised:** Background for expanded detail (subtle differentiation)

---

## Recommended Insight Capture

This research reveals a design principle that should be captured as an insight:

**"Reasoning display for outcome owners is verification evidence, not thinking trace."**

The framing shift — from "here's how I thought" to "here's what I checked" — is fundamental to serving non-technical personas. Every product in the competitive audit frames reasoning for developers/power users. Ditto's differentiation is framing it for people who manage outcomes, not algorithms.

---

## Reference Doc Status

- **docs/human-layer.md:** Gap table row "Reasoning visibility" confirmed — this spec provides the interaction design to fill it
- **docs/personas.md:** Problem 5 ("I don't trust AI because I can't see its reasoning") validated — the "verification evidence" framing directly addresses it
- **docs/research/ai-chat-ux-patterns-competitive-audit.md:** Section 3 (Thinking/Reasoning Display) consumed — no drift found
- **docs/research/conversation-polish-ux.md:** Section 3 (Thinking/Reasoning) consumed — this spec extends the reasoning content display with persona-appropriate framing
