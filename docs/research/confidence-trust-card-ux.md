# UX Interaction Spec: Confidence & Trust Card

**Date:** 2026-04-01
**Designer:** Dev Designer
**Feeds:** Next brief after 067 (trust card implementation)
**Personas tested:** Rob (mobile, between jobs), Lisa (desk, quick scan), Jordan (demos to leadership), Nadia (team quality governor)

---

## Design Problem

Brief 067 improved activity group headers from "5 steps -- read file (2x)" to "Checked 3 sources -- files." But the fundamental problem remains: **the expanded content dumps a trace of every tool call on the user.** Looking at the actual UI:

- "Thinking..." expanded, showing raw reasoning ("The user wants me to re-read the roadmap carefully and think through what should come next...")
- "Checked 6 sources -- files" expanded, showing "Reviewed file - docs/roadmap.md" repeated 6 times
- Walls of text between the user's question and the AI's answer

**None of this builds trust.** Rob doesn't care what files were read. Lisa doesn't know what "docs/roadmap.md" means. Jordan can't demo "Reviewed file" to leadership. Nadia needs to know if she should trust the output, not what tools ran.

The user's feedback cuts to the core: **"The purpose of revealing the thinking is to build trust. Most importantly, I'd love to see the confidence evaluation and what the AI thinks it got wrong or needs further clarification on."**

This is Problem 5 from personas.md: *"Every output shows what was checked (pricing check: passed, margin check: 1 warning). Confidence scores per item. Evidence trails with source links."*

---

## The Core Insight

**No AI product shows you where it's uncertain.**

Claude.ai shows "Thinking..." Perplexity shows sources. ChatGPT shows a plan preview. They all answer the question "what did the AI do?" None of them answer the question the outcome owner actually has: **"Should I trust this, and what should I watch out for?"**

The trust card must answer two questions in priority order:
1. **"Is anything wrong or uncertain?"** (uncertainty-first — the actionable signal)
2. **"What was this based on?"** (evidence — the trust backdrop)

When everything is fine (high confidence), the card is quiet — one line, collapsed. When something is uncertain, the card surfaces it **before the response** so the user reads the answer with the right calibration.

---

## Human Jobs Served

| Job | How the trust card serves it |
|-----|------------------------------|
| **Review** | "Should I trust this output?" -- confidence level signals whether to scrutinize or approve quickly |
| **Decide** | "What should I watch out for?" -- uncertainties tell the user exactly where to focus judgment |
| **Orient** | "What did the AI base this on?" -- evidence summary provides context without noise |

Not served: Define, Delegate, Capture (these jobs don't involve evaluating AI output).

---

## Three-Tier Visibility (Refined from Insight-126)

### Tier 1: The Response (always visible)
The AI's answer. This is what the user came for. Nothing competes with it.

### Tier 2: Confidence Card (the new element)
A compact trust signal that sits **above the response**. Default collapsed when confidence is high, auto-expanded when uncertainties exist. Contains:
- Confidence level (qualitative, not numerical)
- What was checked (compact, outcome-oriented)
- Uncertainties and caveats (when present — these are the most important)

### Tier 3: Activity Trace (deep audit, rarely accessed)
Raw tool calls, reasoning text, tool I/O. Behind a secondary expand within the card ("View activity trace"). For Jordan's demo deep-dives or Nadia's compliance audits.

---

## The Confidence Card

### Confidence Levels

Three qualitative levels, using existing semantic design tokens from .impeccable.md:

| Level | Indicator | Token | Meaning | Default state |
|-------|-----------|-------|---------|---------------|
| **High** | Small filled dot | `positive` | "I'm confident in this" | Collapsed |
| **Medium** | Small filled dot | `caution` | "There are uncertainties -- review the caveats" | Auto-expanded |
| **Low** | Small filled dot | `negative` | "I'm not confident -- please review carefully" | Always expanded |

The dot is 8px, same scale as Ditto's vivid identity dot. Qualitative labels ("High confidence") rather than percentages — outcome owners don't calibrate on "83% vs 87%," they calibrate on "should I scrutinize this or not?"

### Data Model Preference

Confidence data is **response-level metadata**, not a ContentBlock. It is attached to every assistant message (like `role` or `parts`) — a structured object with `level`, `checks[]`, `uncertainties[]`. The ConfidenceCard is conversation chrome rendered by the Message component, not a block in the BlockList registry.

Rationale: confidence describes the response itself, not a discrete piece of content within it. A ContentBlock could appear in a composition intent (Today, Inbox) independently — confidence cannot. It only makes sense attached to the response it describes.

The Architect may determine that a `ConfidenceBlock` ContentBlock variant is also useful for composition contexts (e.g., a briefing that summarizes confidence across multiple process runs). But the conversation-level card is metadata, not a block.

### Visual Treatment

Two treatments depending on context — respecting .impeccable.md's anti-card principle:

**Collapsed (most common — high confidence):**
```
● High confidence · Checked pricing, project history, margins
```
Single line. Muted text (`text-muted`). Positive-colored dot. Chevron to expand. Min-height 44px for mobile touch target.

**Auto-expanded (medium/low confidence — hero moment):**
A subtle `surface-raised` background with `rounded-xl` and left `vivid-deep` border — this IS a hero moment per .impeccable.md: the system is demanding the user's attention before they read the response. Justified alongside "process card, connect card" as an infrequent, high-importance element.

**User-expanded (high confidence, tapped to inspect):**
Typographic treatment only — `border-left: 2px solid var(--vivid-deep)` + `padding-left`. No surface container. This is curiosity browsing, not a hero moment. The anti-card principle applies.

Inside either expanded treatment:

```
● Medium confidence

⚠ Q4 pricing data unavailable — used Q3 estimates
  Consider verifying current copper rates before sending

✓ Henderson project history — 2 similar quotes found
✓ Margin rules — 25% residential rate applied
```

Uncertainties render first (with `caution` icon), then verified checks (with `positive` icon). Each item is one line — outcome language, not tool language.

### Interaction States

**During streaming (activity in progress):**
```
◌ Checking your quoting data...
```
Shimmer animation. Updates label as tools run (same `runningOutcome` labels from Brief 067). This is the only time the user sees activity — during processing, as a progress indicator.

**Streaming complete, response starting:**
The activity indicator resolves into the confidence card. If high confidence, it collapses smoothly. If medium/low, it stays expanded with uncertainties visible.

**High confidence, collapsed:**
```
▸ ● High confidence · Checked 3 sources
```
User's eye moves past this to the response. One tap expands if curious.

**High confidence, expanded (user tapped):**
```
▾ ● High confidence · Checked 3 sources

✓ Supplier prices — copper $18.40/unit (current)
✓ Henderson project — 2 similar quotes found
✓ Margin rules — 25% residential applied

▸ View activity trace
```

"View activity trace" is the Tier 3 gateway. Collapsed by default. Opens to show raw tool calls and reasoning text. Almost never accessed.

**Medium confidence, auto-expanded:**
```
▾ ● Medium confidence · 1 caveat

⚠ Q4 pricing unavailable — estimates based on Q3 rates
  Copper has been volatile — verify before committing

✓ Henderson project — 2 similar quotes found
✓ Margin rules — 25% residential applied

▸ View activity trace
```

The caveat is the headline. The user reads this BEFORE the response, calibrating their attention.

**Low confidence, always expanded:**
```
▾ ● Low confidence · 2 issues

⚠ Could not access supplier price list — API error
  Using cached prices from 2 weeks ago
⚠ No similar projects found in history
  This quote is based on standard rates only

✓ Margin rules — 25% residential applied

▸ View activity trace
```

Low confidence is a strong signal: "Don't trust this without checking." The visual weight (caution/negative colors, expanded state) pulls the user's attention before they read the response.

**Error state:**
```
▾ ● Unable to verify

✕ Failed to retrieve pricing data
✕ Henderson project not found in knowledge base

The response below may not be reliable.

▸ View activity trace
```

---

## Persona Tests

### Rob Test (mobile, between jobs)

Rob asked about the Henderson quote from his truck. He sees:

```
● High confidence · Checked pricing, project history

The Henderson bathroom renovation quote is ready for your
review. Key details:
- Materials: $6,240 (copper fittings at current rates)
- Labour: 18 hours at standard residential rate
- Total: $14,200 including 25% margin

Tap to review the full quote.
```

Rob glances at "High confidence" — he doesn't even expand it. He trusts the green dot and moves to the numbers. Approves in 30 seconds from his truck.

Now imagine the same quote with medium confidence:

```
● Medium confidence · 1 caveat
  ⚠ Copper prices volatile — verify $18.40/unit rate

The Henderson bathroom renovation quote is ready...
```

Rob sees the amber dot and the caveat. He knows to double-check the copper price before sending. He calls his supplier on the drive to the next job. **The uncertainty signal saved him from sending a quote with stale pricing.**

### Lisa Test (desk, quick scan)

Lisa asked for a product description draft. She sees:

```
● High confidence · Checked product data, brand guidelines

Here's the draft for the Merino Wool Throw:
"Crafted from certified New Zealand merino wool..."
```

Lisa doesn't expand. "High confidence" + "Checked brand guidelines" tells her the voice should be right. She reads the description and approves with one edit.

### Jordan Test (demoing to leadership)

Jordan is showing the CTO how Ditto handles reference checking. The CTO asks "how does it know what to check?"

Jordan expands the confidence card:

```
▾ ● High confidence · Checked 3 sources

✓ HR template library — standard questionnaire (12 questions)
✓ Role requirements — added 3 role-specific questions
✓ Industry compliance — flagged 2 questions below threshold

▸ View activity trace
```

The CTO sees specific, meaningful checks with outcomes. Jordan clicks "View activity trace" and shows the raw tool I/O underneath — "See, it actually read the compliance framework and cross-referenced." This is demoing intelligence, not demoing machinery. **Two levels of detail for two audiences in one conversation.**

### Nadia Test (reviewing team output)

Nadia sees a report flagged for review. The confidence card auto-expanded:

```
▾ ● Medium confidence · 2 caveats

⚠ Missing DOI — 3 citations lack DOI links (Chen, Park, Williams)
⚠ Baseline year — Q3 data used where Q4 expected
  Chen's report consistently uses Q3 baselines

✓ Formatting — APA 7th compliant
✓ Data sources — all cross-referenced and current

[Report content with issues highlighted...]
```

Nadia knows exactly where to focus. The caveats tell her the two things to check. She doesn't need to read the whole report to find problems — **the trust card is a pre-review summary.** She corrects the baseline, notes that Chen's reports always have this issue, and moves on. The "Teach this" opportunity is obvious.

---

## Competitive Differentiation

| Product | What they show | What they don't show |
|---------|---------------|---------------------|
| **Claude.ai** | "Thought for Xs" — time-based trace | Confidence, uncertainty, what was checked |
| **ChatGPT** | Thinking plan preview | Confidence, uncertainty, evidence quality |
| **Perplexity** | Sources (numbered pills, inline citations) | Confidence in the synthesis, uncertainty |
| **Cursor/Windsurf** | Steps (spinner → checkmark) | Confidence, uncertainty, outcome meaning |
| **Ditto** | **Confidence level + uncertainties + evidence outcomes** | Raw activity (hidden in Tier 3) |

**Ditto's differentiation:** Every competitor answers "what did the AI do?" Ditto answers "should you trust this, and what should you watch out for?" This is the only approach that serves outcome owners who don't care about AI mechanics.

The closest analog is **Perplexity's sources-first pattern** — evidence before conclusion. Ditto extends this: **confidence and uncertainty before conclusion, evidence on demand.**

---

## Where Confidence Data Comes From (UX Constraints for Architect)

The Designer does not prescribe the technical approach — but these are the UX constraints the Architect must satisfy:

1. **Confidence must be present on every response.** The card can't appear only sometimes. If the system can't assess confidence, it should say so ("Unable to assess confidence") rather than omitting the card.

2. **Uncertainties must be specific and actionable.** "Medium confidence" alone is useless. The caveats must say WHAT is uncertain and WHY — "Q4 pricing unavailable — used Q3 estimates" not just "some data may be stale."

3. **The confidence assessment must not significantly delay the response.** The user sees the progress indicator during streaming. When streaming completes, the card should resolve immediately — not trigger a second thinking phase.

4. **Confidence should be conservative.** It's better to show "Medium" when the answer is actually fine than to show "High" when there's an issue. False negatives (missed uncertainty) damage trust permanently. False positives (unnecessary caution) just mean the user checked and confirmed — that builds trust.

5. **Confidence data must be structured** — not embedded in prose. The UI needs discrete fields (level, checks[], uncertainties[]) to render the card, not a paragraph to parse.

6. **Conversational responses (no tool activity) do NOT show the card.** When the user asks a casual question and Self answers from context/training data without calling tools, the confidence card adds noise — the user will learn to ignore it, which defeats the signal. The card appears only when the system performed verifiable work (tool calls, knowledge retrieval, process execution). For conversational replies, the response speaks for itself.

7. **One confidence card per discrete response.** In composition contexts (Today briefing, Inbox), each process output gets its own card. In conversation, each assistant message gets at most one card. When a pipeline produces multiple outputs, confidence is per-output — not averaged across the run.

---

## Auto-Expand Behavior Rules

| Confidence | Uncertainties present? | Default state | Rationale |
|------------|----------------------|---------------|-----------|
| High | No | Collapsed | Quiet trust signal — don't interrupt |
| High | Yes (minor) | Collapsed, but uncertainties visible in one-line summary | "High confidence · 1 minor note" |
| Medium | Any | Auto-expanded | User needs to see caveats before reading |
| Low | Any | Always expanded | Strong signal — don't let user miss this |
| Error | N/A | Always expanded | Something failed — be transparent |

**User override:** The user can always collapse or expand, regardless of the auto-state. Once the user manually toggles, their preference is respected for that card (Insight-124).

---

## Mobile Treatment

Rob lives on mobile. The confidence card must work on a phone screen (full-width conversation, no right panel).

### Collapsed (high confidence)
No change from desktop. Single line, full width. `min-height: 44px` ensures tap target.

### Auto-expanded (medium/low confidence)
On mobile (<1024px), the expanded card renders full-width with compact spacing:
- Uncertainties and checks render as single-line items (same as desktop but no max-width constraint)
- The surface-raised background extends edge-to-edge within the message container
- "View activity trace" renders as a simple text link (no nested expand — tapping it scrolls down to an inline trace section to avoid disorienting nested collapses on small screens)

### Key constraint: vertical real estate
On mobile, the expanded card sits between the user's message and the response. A medium-confidence card with 2 uncertainties and 3 checks takes ~7 lines. This is acceptable — the caveats are what the user needs to see before the response. If the card has more than 5 items, truncate to the uncertainties + a count ("+ 4 verified checks") with expand to see all.

### Wireframe (mobile, medium confidence)
```
┌──────────────────────────────┐
│ User: "Henderson quote ready?"│
│                              │
│ ┌──────────────────────────┐ │
│ │ ● Medium confidence      │ │
│ │                          │ │
│ │ ⚠ Q4 copper prices      │ │
│ │   unavailable — using Q3 │ │
│ │ ✓ Project history · 2    │ │
│ │ ✓ Margin rules applied   │ │
│ │                          │ │
│ │ View activity trace      │ │
│ └──────────────────────────┘ │
│                              │
│ ● The Henderson quote is     │
│   ready for review...        │
│                              │
│ ┌──────────────────────────┐ │
│ │  Type a message...       │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

---

## What This Spec Covers vs. Defers

### This spec covers (interaction design):
- The three-tier visibility model (refined from Insight-126/127)
- The confidence card: levels, visual treatment, content structure
- Data model preference (response-level metadata, not ContentBlock)
- Split visual treatment (hero-moment for auto-expand, typographic for user-expand)
- Auto-expand behavior based on confidence level
- Uncertainty-first information hierarchy
- Activity trace as a tertiary layer
- When the card appears vs. does not (tool activity = yes, conversational = no)
- One card per discrete response (batch/pipeline guidance)
- Mobile treatment with wireframe
- Persona validation for all states
- Competitive differentiation

### This spec defers to the Architect:
- How confidence data is generated (prompt engineering, separate evaluator, metadata derivation, or hybrid)
- Structured data format for confidence (schema design)
- Engine changes to produce confidence metadata
- How "View activity trace" connects to existing tool/reasoning data
- Whether confidence generation happens in-band (same LLM call) or out-of-band

### This spec defers to future briefs:
- Trust-tier modulation (supervised processes show more detail, autonomous show less)
- "Teach this" integration (when the user identifies a recurring uncertainty)
- Historical confidence tracking (confidence trends over time for a process)
- Team-level confidence dashboard (Nadia's team view)

---

## Design Tokens Used

All existing `.impeccable.md` tokens — no new tokens needed:

- **positive:** High confidence dot, verified check icons
- **caution:** Medium confidence dot, uncertainty icons
- **negative:** Low confidence dot, error icons
- **text-muted:** Collapsed card text, check labels
- **text-secondary:** Expanded detail text
- **surface-raised + rounded-xl:** Expanded card background (hero moment)
- **vivid-deep:** Left border accent on expanded card

---

## Recommended Insight Capture

This spec crystallizes a principle from Insight-127 that should be captured:

**"Uncertainty is more valuable than evidence."** Every AI product shows what the AI did (evidence). None show what the AI is unsure about (uncertainty). For outcome owners, uncertainty is the actionable signal — it tells them where to focus their judgment. Evidence is the backdrop that builds confidence. Lead with uncertainty, support with evidence.

---

## Reference Doc Status

- **docs/personas.md:** Problem 5 ("I don't trust AI because I can't see its reasoning") — this spec directly addresses it with confidence + uncertainty signals. No drift.
- **docs/human-layer.md:** ReasoningTraceBlock exists in the block vocabulary but is flagged as unwired in the gap table. The trust card is a new concept that sits alongside it — the card summarizes, the trace provides audit detail. Recommend adding "ConfidenceCard" to the AI Elements component list.
- **docs/insights/126-reasoning-is-verification-evidence.md:** This spec supersedes 126's header-only approach with the full card treatment. 126 remains valid as the foundational insight; this spec is its full realization.
- **docs/insights/127-trust-signals-not-activity-traces.md:** This spec is the design response to 127. Recommend updating 127's status to "addressed by confidence-trust-card-ux.md."
