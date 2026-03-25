# Ditto — Human Layer Design

**Version:** 0.1.0
**Date:** 2026-03-18
**Status:** Draft — companion to architecture.md
**Scope:** Layer 6 (Human Layer) in full detail — wireframes, interactions, UX philosophy, experience narrative

This document captures the design thinking behind the human-facing layer of Ditto. The architecture spec (`architecture.md`) defines WHAT the 16 primitives are. This document defines HOW they work, WHAT they look like, and WHY they're designed this way.

---

## Design Philosophy

### The Six Human Jobs

Every UI decision in Ditto is evaluated through the lens of six jobs a human performs in an agent organisation. These are universal — regardless of domain, role, or industry.

| Job | Question the human is asking | Primary primitives |
|-----|------------------------------|-------------------|
| **Orient** | "What's going on and what needs my attention?" | Daily Brief, Process Card, Activity Feed, Performance Sparkline |
| **Review** | "Is this output right?" | Review Queue, Output Viewer, Feedback Widget |
| **Define** | "What needs to happen?" | Conversation Thread, Process Builder |
| **Delegate** | "Who/what should do it and how much do I trust them?" | Agent Card, Trust Control |
| **Capture** | "Here's something the system needs to know" | Quick Capture |
| **Decide** | "What should change?" | Improvement Card, Process Graph, Data View, Evidence Trail |

**Design rule:** If a UI element doesn't clearly serve one of these six jobs, it doesn't belong.

### Everyone Will Be a Manager and Delegator

In the future, every knowledge worker manages and delegates to agents. This frames every design decision:
- The interface must be usable by someone who has never managed people or processes
- It must feel like working with a team, not configuring a system
- The platform guides, not requires — the human never needs to think "what do I configure next?"

### Three Modes: Analyze, Explore, Operate

Different phases of work need different interfaces. Ditto encodes this directly:

| Mode | Interface | When |
|------|-----------|------|
| **Analyze** | Connected data views, pattern reports, gap alerts | Understanding how the org actually works — onboarding, ongoing analysis, validation |
| **Explore** | Conversation Thread (centre column) + Process Builder (right panel) | Defining and refining processes — guided by evidence from Analyze or from a blank canvas |
| **Operate** | Dashboard, queues, cards, metrics | Daily use, monitoring, reviewing, deciding |

The magic is in the **transitions**: Analyze surfaces what's really happening → Explore crystallises that into process definitions → Operate runs them. The user can enter at any mode — Analyze for evidence-first discovery, Explore for conversation-first definition, Operate for daily execution. Analyze is not a one-time onboarding step; it's a mode the user returns to whenever they want Ditto to look at how things are actually working.

### The Boiling Frog: Progressive Disclosure

Setup should feel like a frog slowly being boiled — the user never has a moment of "this is too much." The platform is a consultant slowly helping the user identify, map, automate, and operate AI processes.

**Principles:**
- Ask one question at a time, never overwhelm
- Show the structure being built alongside the conversation (the user sees progress)
- Start with what the user knows (their pain point) and expand outward
- Never require the user to know AI terminology, workflow concepts, or technical configuration
- The AI fills in defaults from industry knowledge — the user corrects, not creates
- A technical support analyst (human) may guide this process initially; the platform develops AI setup agents over time

### AI Limitations Are the Platform's Problem

Most humans don't know:
- AI likes to please (it will say "yes" when it should say "this won't work")
- AI hallucinates (it will invent data and present it confidently)
- AI gets narrow in its thinking (it optimises for the prompt, not the broader context)
- AI doesn't think laterally, critically, or honestly unless told to do so
- AI is great when you question it, get it to think from first principles, or red-team something
- AI tends to think every process is best solved with AI (often a script or rules engine is better)

**The platform actively mitigates these.** The harness is designed so that:
- Agents check each other (adversarial review catches pleasing/hallucination)
- Quality criteria are specification-tested (not just "does this look good?" but "does this meet the defined standard?")
- The system recommends non-AI solutions when appropriate (scripts, rules, human steps)
- Correction patterns are tracked and fed back into the harness (the system learns from AI failures)

The human doesn't need to understand AI's limitations. The platform handles them.

### Capability Catalog, Not App Store

The library is a **capability catalog with a guided process that evolves over time** — not an app store (too rigid) or raw templates (too technical).

Think of the platform like a consultant:
1. Understand the pain ("I spend hours reconciling invoices")
2. Recognise the pattern ("This is invoice reconciliation — here's how most businesses handle it")
3. Discover the variation ("Where do YOUR invoices come from? What system do you reconcile against?")
4. Configure capabilities ("You need: email extraction, document matching, exception flagging, report generation")
5. Assemble into a process ("Here's your process — inputs from Gmail, matches against Xero, flags exceptions, reports to you weekly")
6. Improve over time ("You keep correcting the amount matching threshold — want me to adjust it?")

Industry standard frameworks (APQC, ITIL, COBIT, ISO 9001) provide the base knowledge. Users never see "APQC 8.3.1" — they see "This sounds like invoice reconciliation."

---

## The 16 Primitives: Detailed Design

### Primitive 1: Daily Brief

**Job:** Orient — "What needs my attention today?"

**Not a list of everything. A prioritised, reasoned recommendation.** Adapts to role: an IC sees their processes, a manager sees their team's processes. Also serves as the **primary digest surface** for autonomous processes (ADR-011) — process health summaries replace individual review items for processes that have earned autonomy.

```
┌─────────────────────────────────────────────────┐
│  Good morning, Tim.                  Wed 18 Mar │
│                                                 │
│  OVERNIGHT                                      │
│  Feature agent completed: Auth flow             │
│  for Delta (3 files, tests passing)             │
│  Review agent found: 1 pattern issue            │
│  Self-improvement: Spotted a new auth           │
│  library worth evaluating                       │
│                                                 │
│  TODAY'S FOCUS                                  │
│  1. Review: Delta auth implementation           │
│     Ready for your eyes. Pre-reviewed           │
│     by convention + security agents.            │
│     1 issue flagged.                            │
│  2. Decide: New auth library proposal           │
│     Agent evaluated, recommends adopt.          │
│  3. Brief: Insurance platform scope             │
│     Ready to kick off — define the              │
│     brief and agents will plan.                 │
│                                                 │
│  Why this order: #1 is blocking a team          │
│  member. #2 has been waiting 3 days.            │
│  #3 has a Friday deadline.                      │
│                                                 │
│  RUNNING QUIETLY (autonomous — digest)          │
│  ● Invoice reconciliation  12 runs, 0 issues    │
│    Quality: all criteria met │ Cost: $2.40      │
│    [View runs]                                  │
│  ● Content generation      8 published          │
│    0 corrections │ downstream: 100% accepted    │
│    [View runs]                                  │
│                                                 │
│  PROCESS HEALTH                                 │
│  ● Delta feature pipeline     ✓ 4/6 done       │
│  ● Insurance scoping          ○ Not started     │
│  ● LaunchPath platform        ⚠ Blocked         │
│    (waiting on your pricing decision)           │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- Always explains reasoning ("Why this order") — the human learns to trust the prioritisation
- Shows what happened overnight — agents work while you sleep
- **"Running quietly" section** (ADR-011) — autonomous process digest summaries. Run counts, quality status, cost. Drill into individual runs on demand. No action required — silence IS the signal. This section grows as more processes earn autonomy.
- Process health is glance-level (green/amber/red) — drill into Process Card for detail
- Personalised per role and per user's actual priorities (learns from what you actually do vs. what was recommended)

### Primitive 2: Process Card

**Job:** Orient — "What's the status of this process?"

Works at two levels: **glance** (in a grid/list) and **expanded** (full detail view).

**Glance view:**
```
┌─────────────────────────────────────────┐
│  Invoice Reconciliation          ● Live │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Trust: Spot-checked  │  Last: 2h ago   │
│  Health: ▓▓▓▓▓▓▓░░░ 73%               │
│  Runs: 47  │  Corrections: 8  │  ↑ 12% │
│  Next run: Mon 9am                      │
└─────────────────────────────────────────┘
```

**Expanded view** adds: step-by-step run history, performance sparklines, trust control, output history, activity feed, quality criteria status.

**Key design decisions:**
- Domain-agnostic — an invoice process and a content process look structurally identical
- Health percentage is derived from quality criteria pass rate + correction rate + downstream acceptance
- Trust tier is always visible — the human never forgets how much oversight this process has
- "Next run" shows when the agent will next execute (heartbeat schedule)

### Primitive 3: Activity Feed

**Job:** Orient — "What happened while I was away?"

```
┌─────────────────────────────────────────┐
│  Activity                    [Filter ▾] │
│                                         │
│  15 min ago                             │
│  🤖 Builder completed auth flow         │
│     3 files changed, 142 lines added    │
│     Process: Feature Implementation     │
│                                         │
│  32 min ago                             │
│  🔍 Reviewer flagged pattern issue      │
│     Raw <button> on line 47 of auth.tsx │
│     Process: Code Review                │
│                                         │
│  2h ago                                 │
│  ✓ You approved: Weekly report draft    │
│     No corrections — trust data updated │
│     Process: Content Generation         │
│                                         │
│  6h ago                                 │
│  💡 Scout proposed: Adopt zod v4        │
│     Evidence: 40% smaller bundle,       │
│     backwards compatible                │
│     Process: Self-Improvement           │
└─────────────────────────────────────────┘
```

**Key design decisions:**
- Filterable by: process, agent, time, event type (runs, reviews, flags, improvements)
- Each entry links to the relevant process and output
- Human actions appear alongside agent actions — it's a unified timeline of the organisation
- Uses icons to distinguish agent types: 🤖 builder, 🔍 reviewer, 💡 scout, ✓ human

### Primitive 4: Performance Sparkline

**Job:** Orient — "Is this getting better or worse?"

A tiny trend line that attaches to anything measurable. Appears inside other primitives: Process Cards, Agent Cards, Daily Brief, Improvement Cards. No domain knowledge needed.

```
Accuracy:  ▁▂▃▅▇▇█▇▆▅  ↓ trending down
Cost:      █▇▆▅▃▂▂▁▁▁  ↓ improving
Speed:     ▁▁▂▃▅▇▇▇██  ↑ improving
```

**Key design decisions:**
- Always shows direction arrow (↑↓→) — the human doesn't need to interpret the sparkline
- Colour-coded: green (improving), amber (flat), red (degrading)
- Clicking opens the Data View (Primitive 15) with full historical detail

---

### Primitive 5: Review Queue

**Job:** Review — "Is this output right?"

**The single most important UI element in Ditto.** This is the human's primary workspace. Everything agents produce that needs human eyes flows through this queue.

```
┌─────────────────────────────────────────────────┐
│  Review Queue                            12 new │
│  ┌───────────────────────────────────────────┐  │
│  │ ⚠ Invoice Reconciliation                  │  │
│  │   2 discrepancies found by agent          │  │
│  │   Confidence: 85%  │  Due: Today          │  │
│  │   Pre-reviewed: ✓ Spec test passed        │  │
│  │   [Review now]                            │  │
│  ├───────────────────────────────────────────┤  │
│  │ ✏ Blog post draft                         │  │
│  │   "Q1 Market Update" — 850 words          │  │
│  │   Confidence: 72%  │  Routine             │  │
│  │   Pre-reviewed: ✓ Tone check, ⚠ 1 flag   │  │
│  │   [Review] [Auto-approve similar]         │  │
│  ├───────────────────────────────────────────┤  │
│  │ ✓ Lead scoring — 23 leads scored          │  │
│  │   All within normal parameters            │  │
│  │   Confidence: 94%  │  Routine             │  │
│  │   Pre-reviewed: ✓ All checks passed       │  │
│  │   [Approve batch] [Spot-check 3]          │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- **Universal** — handles any output type through the Output Viewer. A text draft, a data reconciliation, a design comp, and a code change all appear in the same queue with the same interaction pattern.
- **Pre-review summary** — shows what the harness already checked. The human reviews the review, not raw output.
- **"Auto-approve similar"** — This is how trust gets earned. The human doesn't toggle a setting somewhere. They signal trust through the review queue itself: "I've approved 10 of these, stop asking me." One tap, and similar outputs auto-advance in future.
- **"Approve batch" / "Spot-check 3"** — For high-confidence routine outputs, the human can approve all at once or spot-check a sample. This is the spot-checked trust tier in action.
- **Confidence score** — Visible on every item. The human learns to calibrate: "85% from this agent usually means one minor issue."
- **Due/urgency indicators** — Items that block other processes or have deadlines surface higher.

### Primitive 6: Output Viewer

**Job:** Review — "Let me see what the agent produced."

The universal renderer. Makes the platform domain-agnostic by rendering any output type appropriately:

| Output type | Renders as | Interaction |
|-------------|-----------|-------------|
| **Text** (report, email, post, description) | Rich text with inline editing. If human edits, shows diff highlighting. | Edit inline → diff captured as feedback |
| **Data** (spreadsheet, reconciliation, scores) | Table with flagged cells (amber/red for exceptions). Sortable, filterable. | Click flagged cell for agent's reasoning. Correct value → captured as feedback |
| **Visual** (design, thumbnail, diagram) | Image preview with annotation overlay. Side-by-side comparison if iterations exist. | Annotate with comments → captured as feedback |
| **Code** (implementation, script, config) | Syntax-highlighted with line-level comments. Shows test results alongside. | Line comments → captured as feedback. Run tests inline. |
| **Action** (sent email, updated CRM, API call) | Action log showing: what was done, to what, when, result. Includes undo if reversible. | Confirm or undo. Undo → captured as feedback (the action was wrong) |
| **Decision** (scored lead, classified item, routed ticket) | Decision tree / reasoning trace. Shows: input → reasoning steps → conclusion. | Override decision → captured as feedback (the reasoning was wrong) |

**Key design decisions:**
- Output Viewer adapts to the output type — the human never thinks about rendering
- Every interaction IS feedback — edits, corrections, overrides, and approvals are all captured structurally
- The viewer shows what the harness already checked ("Convention check: passed. Security check: 1 warning.")
- For text outputs: side-by-side diff view when the human makes changes, so the system can extract correction patterns

### Primitive 7: Feedback Widget

**Job:** Review — "The system should learn from my corrections."

Not a form. Not a modal. Not a separate step. **Embedded in the review action itself.**

When you edit a draft, the diff IS the feedback. When you reject a reconciliation, the reason IS the feedback. The system captures structurally without asking the human to "fill out a feedback form."

```
┌─────────────────────────────────────────────────┐
│  You edited this draft:                          │
│                                                  │
│  - "We're excited to announce our new..."        │
│  + "Here's what changed this quarter for..."     │
│                                                  │
│  - "Reach out to our team for a free consult"    │
│  + "See pricing at example.com/pricing"          │
│                                                  │
│  Pattern detected:                               │
│  You consistently remove marketing language      │
│  from reports. (3 of last 5 edits match this     │
│  pattern.)                                       │
│                                                  │
│  [Teach this]  [Not a pattern]  [Dismiss]        │
└─────────────────────────────────────────────────┘
```

**"Teach this"** is the one-tap bridge from feedback to permanent learning. When tapped:
1. The correction pattern is extracted as a rule
2. The rule is added to the process's quality criteria
3. Future runs include this rule in the agent's context
4. The harness (specification testing) validates against it
5. The human sees fewer of this type of correction over time

**Key design decisions:**
- Feedback is implicit, not explicit — humans won't fill out forms
- Pattern detection runs across multiple reviews, not just one
- The human explicitly confirms patterns before they become rules ("Teach this" vs "Not a pattern")
- Over time, correction frequency is the primary metric for process health
- This is how the harness evolves — every "Teach this" makes the harness tighter

---

### Primitive 8: Conversation Thread (Explore Mode)

**Job:** Define — "Help me figure out what this process should be."

This is NOT a chatbot. It's a guided conversation that progressively builds structured output. The conversation and the structure are visible side-by-side.

```
┌──────────────────────┬──────────────────────────┐
│  CONVERSATION        │  BUILDING: Listing       │
│                      │  Description Process     │
│  What's taking too   │                          │
│  long or going wrong?│  INPUTS                  │
│                      │  ☑ Inspection notes      │
│  "I spend hours      │  ☑ Property photos       │
│  writing listing     │  ☐ [awaiting discovery]  │
│  descriptions for    │                          │
│  new properties"     │  STEPS                   │
│                      │  1. Extract key features  │
│  This sounds like    │     [AI — Extractor]     │
│  Content Generation  │  2. ???                  │
│  for Property        │  3. ???                  │
│  Listings. Most      │                          │
│  agencies handle     │  OUTPUTS                 │
│  this in 4 steps.    │  ☐ [awaiting discovery]  │
│                      │                          │
│  Where do property   │  QUALITY                 │
│  details come from?  │  ☐ [awaiting discovery]  │
│                      │                          │
│  ○ CRM/listing       │  FEEDBACK                │
│    system            │  ☐ [awaiting discovery]  │
│  ○ Email from vendor │                          │
│  ○ I type them up    │  TRUST                   │
│    from inspection   │  ☐ Supervised (default)  │
│    notes             │                          │
│  ○ Other...          │                          │
└──────────────────────┴──────────────────────────┘
```

**Key design decisions:**
- **Three-panel layout**: conversation in the centre column, Process Builder in the right panel. Mobile: Process Builder deferred (conversation only). Brief 046 resolved this — the three-panel workspace maps "dual pane" across centre + right naturally.
- **Every answer fills in a piece** of the process definition — the human sees their process taking shape as they talk
- **One question at a time** — never overwhelm. The AI doesn't dump 10 questions.
- **AI suggests based on industry knowledge**: "Most agencies also include nearby schools and transport — do you?"
- **At any point** the human can switch to directly editing the structured view
- **The conversation is ephemeral** — it can be replayed for reference but the process definition is what persists
- **Process discovery model: "Start in the middle, expand outward"** — the agent starts with the core transformation and progressively discovers upstream inputs and downstream handoffs

**The discovery flow:**
1. Human describes pain (unstructured)
2. AI recognises the pattern ("This sounds like...")
3. AI asks about the core transformation ("What do you actually do when you reconcile?")
4. AI fills in the middle of the process
5. AI expands upstream ("Where do the invoices come from?")
6. AI expands downstream ("What happens after reconciliation?")
7. AI asks about edge cases ("What about duplicates? Partial payments?")
8. AI asks about quality ("How do you know it's been done right?")
9. AI proposes feedback metrics ("Should we track correction rate and processing time?")
10. Process definition complete — human reviews and activates

### Primitive 9: Process Builder

**Job:** Define — "Let me see and edit the full process definition."

The structured editor. Can be populated by conversation (Primitive 8 fills it in) or edited directly by power users. **Universal structure regardless of domain.**

```
┌─────────────────────────────────────────────────┐
│  Process: Invoice Reconciliation         [Edit] │
│  ─────────────────────────────────────────────  │
│                                                 │
│  INPUTS                                         │
│  ┌─ Source ──────── Type ──── Trigger ────────┐ │
│  │  Gmail           Email     On receive      │ │
│  │  Xero            API       Daily 9am       │ │
│  │  [+ Add input]                             │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  STEPS                                          │
│  ┌─ # ─ Action ─────────── Executor ──────────┐ │
│  │  1   Extract invoice     AI Agent          │ │
│  │      data from email     (Extractor)       │ │
│  │  2   Match against POs   Script            │ │
│  │      in Xero             (rules engine)    │ │
│  │  3   Flag discrepancies  Rules engine      │ │
│  │      (>$5 difference)    (threshold check) │ │
│  │  4   Draft exception     AI Agent          │ │
│  │      report with context (Writer)          │ │
│  │  [+ Add step]                              │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  OUTPUTS                                        │
│  ┌─ What ────────── Goes to ──────────────────┐ │
│  │  Exception report  Human (review queue)    │ │
│  │  Matched records   Xero (auto-update)      │ │
│  │  Discrepancy list  Accounts team (email)   │ │
│  │  [+ Add output]                            │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  QUALITY CRITERIA                               │
│  ┌────────────────────────────────────────────┐ │
│  │  ☑ All invoices processed (none skipped)   │ │
│  │  ☑ Discrepancies within $5 flagged         │ │
│  │  ☑ Report delivered by 9am Monday          │ │
│  │  ☑ No marketing language in reports        │ │
│  │    (learned from corrections)              │ │
│  │  [+ Add criterion]                         │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  REVIEW PATTERN                                 │
│  [● Maker-Checker ○ Adversarial ○ Spec-test    │
│   ○ Ensemble ○ None]                            │
│                                                 │
│  TRUST LEVEL                                    │
│  [○ Supervised ● Spot-checked ○ Autonomous      │
│   ○ Critical]                                   │
│  Earned: 47 runs, 8 corrections (83% clean)     │
│  System recommends: Ready for Autonomous        │
│  [Accept] [Keep current]                        │
│                                                 │
│  FEEDBACK LOOP                                  │
│  ┌────────────────────────────────────────────┐ │
│  │  Tracking: correction rate, false          │ │
│  │  positives, processing time, cost          │ │
│  │  Baseline: 4.2 corrections per 10 runs     │ │
│  │  Alert if: accuracy drops below 85%        │ │
│  │  Alert if: processing time exceeds 15min   │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  [Save] [Run now] [Pause] [Archive]             │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- Same structure for EVERY process — invoices, content, coding, lead scoring, anything
- Quality criteria include learned rules (from "Teach this" in Feedback Widget)
- Trust level shows earned data alongside current setting — the human sees the agent's track record
- System recommends trust upgrades but never auto-applies
- Review pattern is configurable per process — different processes need different harness patterns
- "Not everything is AI" is visible: steps show Script, Rules engine, Human alongside AI Agent

---

### Primitive 10: Agent Card

**Job:** Delegate — "Who's doing what, and how are they performing?"

```
┌─────────────────────────────────────────┐
│  🤖 Content Writer            ● Active │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  Serves: Blog posts, Social, Listings   │
│  Runtime: Claude Sonnet │ Cost: $12/mo  │
│  Accuracy: 87% │ Corrections: ↓ trend   │
│  Trust: Spot-checked (earned from       │
│  Supervised after 34 approved runs)     │
│  ─────────────────────────────────────  │
│  Recent: 12 runs this week              │
│  Quality: ▁▃▅▇▇██▇██  trending up     │
│  Avg review time: 3 min (down from 8)   │
└─────────────────────────────────────────┘
```

**Key design decisions:**
- Can represent ANY executor: AI agent, script, rules engine, or human
- Shows trust earned, not just trust assigned
- Performance sparkline embedded (Primitive 4)
- Cost tracking visible — the human sees what agents cost
- "Serves: [processes]" — the agent is defined by the processes it serves, not its capabilities in abstract

### Primitive 11: Trust Control

**Job:** Delegate — "How much oversight does this process need?"

Not a settings page buried in a menu. A **visible, adjustable dial** on every process.

```
┌─────────────────────────────────────────────────┐
│  Trust Level: Invoice Reconciliation             │
│                                                  │
│  Supervised ────────●──────────────── Autonomous │
│              ◄ More oversight    Less oversight ► │
│                    ↑                             │
│               Currently: Spot-checked            │
│                                                  │
│  ─────────────────────────────────────────────── │
│                                                  │
│  EARNED DATA                                     │
│  Total runs: 47                                  │
│  Approval rate: 83% (39 of 47)                   │
│  Correction rate: 17% (8 corrections)            │
│  Last 10 runs: 9 approved, 1 corrected           │
│  Downstream acceptance: 100%                     │
│                                                  │
│  SYSTEM RECOMMENDATION                           │
│  ✓ Ready for Autonomous                          │
│  Reason: Last 10 runs show 90% clean rate,       │
│  corrections are decreasing, downstream          │
│  processes report no issues.                     │
│                                                  │
│  [Accept recommendation]  [Keep current]         │
│                                                  │
│  ─────────────────────────────────────────────── │
│                                                  │
│  AUTO-DOWNGRADE TRIGGERS                         │
│  If correction rate exceeds 30%: → Supervised    │
│  If downstream rejects output: → Supervised      │
│  If inputs change significantly: → Supervised    │
│                                                  │
│  These triggers are always active regardless     │
│  of current trust level.                         │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- Shows the evidence for trust, not just the setting
- System recommends but never auto-upgrades — the human decides
- Auto-downgrade is always active — trust can be lost automatically (but not gained)
- The human can override in either direction at any time
- History of trust changes is visible (not shown in wireframe but accessible)

---

### Primitive 12: Quick Capture

**Job:** Capture — "Here's something the system needs to know."

**This is the Trojan horse feature.** If capture is frictionless, the platform becomes the place where all work context lives. If it's clunky, people default to Notes, Slack, or their head.

```
┌─────────────────────────────────────────────────┐
│  [Type, paste, or speak...]         🎤  📎  📷  │
│                                                  │
│  Auto-routing: Delta project                     │
│  (you're viewing Delta processes)                │
│                                                  │
│  [Change project ▾] [New task] [Just context]    │
└─────────────────────────────────────────────────┘
```

**Capture must be:**
- **Instant** — one tap/keystroke to start
- **Unstructured** — dump text, voice, photo, link, screenshot
- **Auto-classified** — the platform figures out which project/process it belongs to
- **Contextual** — if you're looking at the Delta project when you capture, it defaults to Delta
- **Multi-modal** — text, voice memo (transcribed), photo, file attachment, URL

**The agent's job after capture (the Capture → Classify → Route process):**
1. Transcribe (if voice)
2. Classify (which project? which process? new task or context for existing task?)
3. Extract action items if any
4. Add to the right place
5. Surface in tomorrow's Daily Brief if it's actionable

**Key design decisions:**
- "New task" vs "Just context" — sometimes you're adding work, sometimes you're adding information. The system should suggest which, but the human decides.
- Always visible on every view (compact form at bottom or floating action button)
- Full-screen capture mode on mobile — optimised for voice and quick text
- This is actually a process itself — "Capture → Classify → Route" — and it's pre-configured for every user

---

### Primitive 13: Improvement Card

**Job:** Decide — "Should we change how this process works?"

```
┌─────────────────────────────────────────────────┐
│  💡 Suggested Improvement                        │
│  ─────────────────────────────────────────────── │
│                                                  │
│  Lead scoring accuracy dropped 15%               │
│  over the last 2 weeks.                          │
│                                                  │
│  DIAGNOSIS                                       │
│  New lead source (LinkedIn) has different         │
│  patterns than existing sources (website,         │
│  referral). Agent is applying old scoring         │
│  rules that don't fit LinkedIn leads.             │
│                                                  │
│  EVIDENCE                                        │
│  - 12 of 15 LinkedIn leads were re-scored        │
│    by human (vs 2 of 30 website leads)           │
│  - LinkedIn leads have different data fields     │
│    (job title present, company size present,      │
│    email quality lower)                          │
│                                                  │
│  SUGGESTION                                      │
│  Add LinkedIn-specific scoring criteria           │
│  based on the 12 human-corrected examples.       │
│  Predicted impact: restore accuracy to 90%+.     │
│                                                  │
│  Confidence: High (clear pattern, sufficient     │
│  data, no conflicting signals)                   │
│                                                  │
│  [Apply]  [Modify]  [Dismiss]  [Discuss]         │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- Shows diagnosis (what's wrong), evidence (how we know), and suggestion (what to do)
- Confidence level helps the human calibrate — "High confidence" means "we're pretty sure"
- "Discuss" opens a Conversation Thread to explore the issue further
- "Modify" lets the human adjust the suggestion before applying
- Never auto-applies — the human always decides
- These surface from the Learning Layer (Layer 5) when degradation is detected

### Primitive 14: Process Graph

**Job:** Decide — "How does my business actually flow?"

The live map of how processes connect. How a non-technical person understands their business as a system.

```
┌─────────────────────────────────────────────────────┐
│  Process Map                          [List | Graph] │
│                                                      │
│  [Property Photos] ──→ [Listing Writer] ──→ [Compliance Check]│
│                              │                      ││
│                              ├──→ [Social Posts]     ││
│                              │                      ▼│
│                              └──→ [Email Blast] ←── [Corrected]│
│                                        │                      │
│                                        ▼                      │
│                              [Lead Qualifier] ──→ [Agent Assign]│
│                                                       │       │
│                                                       ▼       │
│                                                [Follow-up]    │
│                                                               │
│  Legend: ● Healthy  ⚠ Degraded  ✕ Failed  ○ Paused           │
│                                                               │
│  Click any node to see Process Card detail.                   │
│  Dotted lines show event dependencies.                        │
│  Animated flow shows data moving between processes.           │
└───────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- Each node IS a Process Card (Primitive 2) — click to expand
- Colour-coded by health status
- Animated flow when processes are running (data moving between nodes)
- Shows impact propagation: "If I change Listing Writer, these 3 downstream processes are affected"
- Toggle between graph view and list view
- Bottlenecks surface naturally (nodes with many incoming edges waiting)

**Cross-process awareness in action:**

When one process produces output that another process depends on:
1. Output published to the process's output slot
2. Dependent processes notified via event
3. If output changed materially, dependent processes re-evaluate
4. If a downstream process ran with stale input, the graph highlights this

Example: Listing Writer produces a description. Compliance Checker flags an issue. The Compliance Checker's output event triggers the Email Blast process to wait for the corrected version. Lead Qualifier, which received an enquiry about that property, is notified that the listing is being corrected and should use the updated version. The human sees this flow on the graph.

---

### Primitive 15: Data View

**Job:** Decide (Research & Analytics) — "Show me the data."

```
┌─────────────────────────────────────────────────┐
│  Lead Scoring Performance         Last 30 days  │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  95%─┐                                      │ │
│  │      └──────┐                               │ │
│  │              └──────┐     ┌─── LinkedIn      │ │
│  │  80%─               └───┘     source added  │ │
│  │                                              │ │
│  │  65%─                                        │ │
│  │  ├──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┤     │ │
│  │  W1  W2  W3  W4  W5  W6  W7  W8        now  │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─ Source ──── Count ── Accuracy ── Trend ────┐ │
│  │  Website     142      94%         →          │ │
│  │  Referral     38      91%         →          │ │
│  │  LinkedIn     15      47%         ↓ ⚠       │ │
│  └──────────────────────────────────────────────┘ │
│                                                  │
│  [Export] [Share] [Set alert]                     │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- Domain-agnostic — renders any structured data with appropriate chart types
- Annotations on charts mark events ("LinkedIn source added") for context
- Table view for drill-down alongside charts
- Alert thresholds configurable from the data view

### Primitive 16: Evidence Trail

**Job:** Decide (Research & Analytics) — "Where did this come from?"

Attached to any research or analytical output. Shows sources, confidence per claim, links to original material.

```
┌─────────────────────────────────────────────────┐
│  Evidence: "Adopt zod v4" Recommendation         │
│                                                  │
│  Claim: 40% smaller bundle size                  │
│  Source: zod changelog v4.0.0 (2026-03-01)       │
│  Confidence: High (verified benchmark)           │
│  [View source →]                                 │
│                                                  │
│  Claim: Backwards compatible                     │
│  Source: Migration guide + codebase analysis      │
│  Confidence: Medium (12 of 14 patterns migrate   │
│  cleanly, 2 need manual review)                  │
│  [View analysis →]                               │
│                                                  │
│  Claim: No security advisories                   │
│  Source: GitHub security tab, Snyk database       │
│  Confidence: High (checked 2026-03-18)           │
│  [View sources →]                                │
└─────────────────────────────────────────────────┘
```

**Key design decisions:**
- Per-claim confidence (not just overall confidence) — one dodgy claim in a good report is visible
- Links to original sources — the human can verify
- "Checked" dates — evidence ages, and the human should know how fresh it is
- Appears alongside any Output Viewer that includes claims, recommendations, or analysis

---

## View Compositions: Detailed Layout

### Home View

The "what should I be doing" view. Opens every morning.

```
┌──────────────────────────────────────────────────────┐
│  [Logo] Ditto          [Capture 🎤] [Profile ●]   │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌── Daily Brief (Primitive 1) ───────────────────┐  │
│  │  Good morning, Tim.              Wed 18 Mar    │  │
│  │  3 items need review. 1 process degraded.      │  │
│  │  [See full brief →]                            │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌── Review Queue (Primitive 5, top 5) ───────────┐  │
│  │  [Item 1]                          [Review]    │  │
│  │  [Item 2]                          [Review]    │  │
│  │  [Item 3]                          [Review]    │  │
│  │  +9 more                     [See all →]       │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌── Process Health (Primitive 2, summary) ───────┐  │
│  │  ● Invoice reconciliation  ✓                   │  │
│  │  ● Content generation      ✓                   │  │
│  │  ● Lead qualification      ⚠ accuracy down     │  │
│  │  ● Code review pipeline    ✓                   │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌── Quick Capture (Primitive 12) ────────────────┐  │
│  │  [Type, paste, or speak...]        🎤  📎  📷  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Setup View (Explore Mode)

Where new processes are born. Dual-pane: conversation + structure.

```
┌──────────────────────────────────────────────────────┐
│  [← Back to Processes]     Setting up a new process  │
├──────────────────────┬───────────────────────────────┤
│                      │                               │
│  CONVERSATION        │  PROCESS DEFINITION           │
│  (Primitive 8)       │  (Primitive 9)                │
│                      │                               │
│  Scrollable chat     │  Structured editor that       │
│  with AI guide.      │  fills in as the              │
│  One question at     │  conversation progresses.     │
│  a time. Suggests    │  Human can edit directly      │
│  based on industry   │  at any time.                 │
│  knowledge.          │                               │
│                      │  [Inputs] [Steps] [Outputs]   │
│                      │  [Quality] [Trust] [Feedback] │
│                      │                               │
│                      │  Progress: ████░░░░ 50%       │
│                      │  (4 of 8 sections defined)    │
│                      │                               │
│  [🎤 Voice input]    │  [Save draft] [Activate]      │
│                      │                               │
└──────────────────────┴───────────────────────────────┘
```

---

## The Daily Experience: A Narrative

This is the north star for what using Ditto feels like. Written from the perspective of a user managing multiple projects with coding agents.

### 6:00am — Agents Work While You Sleep

Process 5 (Project Orchestration) runs on its daily heartbeat. The PM agent scans:
- Git activity across all repos overnight
- Brief statuses (what's active, blocked, in review)
- Captured notes from yesterday
- Process health across all running processes

It produces a Daily Brief and adds items to the Review Queue.

### 7:30am — You Open the Dashboard

The Home view shows: 3 items need review, 1 process is underperforming, a self-improvement proposal is waiting. You see what happened overnight — the builder agent finished the auth flow for Delta, the reviewer found 1 pattern issue, the scout spotted a new library worth evaluating.

The Daily Brief explains why it recommends this order: the auth review is blocking a teammate, the library decision has been waiting 3 days, the insurance brief has a Friday deadline.

### 8:00am — You Review the Delta Auth Code

You tap "Review" on the auth implementation. The Output Viewer (Primitive 6) shows the diff — syntax-highlighted, with the harness's pre-review annotations:
- Convention checker: "⚠ Raw `<button>` on line 47 — should use `Button` component"
- Bug hunter: "✓ No logic issues found"
- Security reviewer: "✓ No vulnerabilities detected"

You fix the one convention issue (edit inline), approve the rest. The Feedback Widget (Primitive 7) captures the edit as a diff. After 3 similar corrections, it will surface: "You consistently fix raw button elements. Teach this?"

### 8:30am — You Brief the Insurance Work

You navigate to Setup and start a new process. The Conversation Thread (Primitive 8) asks: "What's taking too long or going wrong?" You describe the claims submission flow. The AI recognises it as document processing + routing, asks clarifying questions, and the Process Builder (Primitive 9) fills in alongside your conversation. By 9am you have a defined process and the planner agent starts architecting.

### Throughout the Day — Quick Captures

From your phone: "Remember to check if the real estate CRM needs the same auth pattern as Delta."

Quick Capture (Primitive 12) transcribes, classifies (Delta project, cross-project dependency note), and routes it. It surfaces in tomorrow's Daily Brief.

### 3:00pm — An Improvement Surfaces

The Improvement Card (Primitive 13) appears in your Review Queue. Lead scoring accuracy dropped 15% since adding LinkedIn as a lead source. The agent diagnoses: LinkedIn leads have different data patterns. It proposes LinkedIn-specific scoring criteria based on your corrections. Confidence: High.

You tap "Apply." The process definition updates. Next run uses the new criteria.

### 6:00pm — Agents Continue Overnight

The builder agent starts implementing the insurance claims flow based on the plan you approved at 9am. The review agents will check it. By morning, it's in your Review Queue.

### The Compound Effect

- **Week 1:** You review everything. You correct 5 of 10 outputs. You're learning what the agents get wrong.
- **Week 4:** You review everything but corrections are down to 2 of 10. You "Teach this" on 3 patterns. The harness is tighter.
- **Week 8:** Some processes are spot-checked. You review ~20% of outputs. Corrections are rare. You spend time on new processes, not reviewing old ones.
- **Month 3:** Most established processes are autonomous. You spend your mornings on improvements, new processes, and strategic decisions. The agents handle the operational work. You manage exceptions.

This is progressive trust in action. Not because you configured it — because you earned it through 100 approve/edit/reject cycles that the system tracked and learned from.

---

## The System Analyst Role

A critical concept for scaling beyond technical early adopters.

### Today: Human System Analyst

A human consultant or support person who:
- Understands the platform deeply
- Guides non-technical users through process discovery
- Helps configure complex integrations
- Reviews process definitions for quality
- Suggests improvements based on cross-client patterns

### Tomorrow: AI System Analyst (Meta-Agent)

An AI agent that:
- Guides users through setup (the Conversation Thread is its primary interface)
- Draws on industry standards and cross-client patterns
- Handles simple process setups autonomously
- Escalates complex setups to human analysts
- Learns from human analyst corrections

**The progression:**
1. Human analysts guide all setups (early adoption)
2. AI analyst handles simple setups, human handles complex (growth)
3. AI analyst handles most setups, human handles novel/complex (scale)
4. Human analysts focus on strategic consulting, AI handles operational setup (maturity)

This is itself a process with trust tiers — the AI system analyst starts supervised and earns autonomy.

---

## Design Principles Summary

1. **The six human jobs are the UI lens** — every element serves Orient, Review, Define, Delegate, Capture, or Decide
2. **Chat is for exploring, structure is for operating** — two modes, one platform
3. **Feedback is implicit** — edits ARE feedback, no forms
4. **Trust is visible and earned** — never hidden in settings, always shows the evidence
5. **One question at a time** — never overwhelm the user during setup
6. **Industry knowledge fills defaults** — users correct, not create from scratch
7. **The platform handles AI's limitations** — the human doesn't need to know about hallucination or pleasing
8. **Everything is domain-agnostic** — the same 16 primitives serve any business
9. **Quick capture is the Trojan horse** — if it's frictionless, all context flows through the platform
10. **The compound effect is the value proposition** — it gets better every week because the harness evolves
