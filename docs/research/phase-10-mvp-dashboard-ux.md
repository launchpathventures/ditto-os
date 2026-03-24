# UX Interaction Spec: Phase 10 MVP — The Living Workspace

**Date:** 2026-03-24
**Role:** Dev Designer
**Brief:** 037 — Phase 10 MVP Dashboard
**Status:** Draft v3 — conversation-first, dashboard-earned, with review flags resolved
**Consumers:** Dev Architect (solution design, sub-briefs), Dev Builder (implementation)

---

## Design Constraints (Hard)

| # | Constraint | Source |
|---|-----------|--------|
| C1 | **User language, not system language.** No "goals," "tasks," "processes," "trust tiers" in the UI. The user's words are the labels. System classifies invisibly. | Insight-073 |
| C2 | **Conversation-first everything.** Work creation, approvals, briefings, process definition, trust changes — the default path is conversational. Structured UI is the power-user path. | Insight-071, 075 |
| C3 | **The Self is the primary surface.** The conversation with the Self is what the user sees first and uses most. The dashboard/feed is earned when volume demands it. | Insight-074, 075 |
| C4 | **Everything gets a process.** Domain processes (repeatable) and generated processes (living roadmaps). Both invisible to the user unless they ask "how does this work?" | Insight-072 |
| C5 | **Dashboard proves the engine.** Expose engine internals on demand. The UI tells us what the engine needs next. | Insight-070 |
| C6 | **One process must be valuable.** Every design must work for a single process. No empty states that imply "add more." | Personas |
| C7 | **The Self guides always.** The user never wonders "what can I do?" The Self proactively suggests what's next based on who the user is, what they've done, and what businesses like theirs typically need. | Insight-074 |
| C8 | **Cold start is a conversation, not onboarding.** No wizards, no tours, no "set up your first workflow." The Self gets to know you. | Insight-074 |
| C9 | **Risk detection is first-class.** The Self doesn't just catch problems — it anticipates them. Pattern risks, temporal risks, data staleness, quality drift, coverage gaps. Surfaced naturally, not as a risk dashboard. | Insight-077 |

---

## The Big Idea: Two Surfaces, Progressive Reveal

The MVP has two surfaces — not three panels from day one:

| Surface | Role | When it appears |
|---------|------|----------------|
| **The Self (conversation)** | Primary interface. Greets, briefs, guides, accepts work, presents outputs, handles approvals, captures context. | Always. Day 1. This IS the product. |
| **The Workspace (feed + detail)** | Structured view for when volume demands it. Batch review, multi-process overview, drill-in, big picture. | Earned. Self introduces it when the user has enough going on (~3+ active items, or on demand). |

**New users see the Self.** Full screen. No sidebar, no feed, no three-panel layout. Just a conversation.

**Returning users with low volume** see the Self with a brief. Dashboard is one click away.

**Returning users with high volume** see the workspace (three-panel layout) with the Self in the right panel — the layout from Brief 037, earned through use.

**The user can always switch.** Some people will prefer the dashboard from day one. The Self learns this and adapts. But the default entry point is conversation, not structure.

---

## 1. First Contact — The Self Gets to Know You

**Human jobs served:** Define (understanding the user's world), Orient (what's possible)

### 1.1 What the User Sees

No sign-up wizard. No "connect your integrations" step. No blank dashboard with tooltips. The first screen is the Self:

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│                                                      │
│  Hi, I'm your Self — think of me as a colleague      │
│  who'll learn how your business works and help you    │
│  run it.                                             │
│                                                      │
│  I'd love to understand what you do. What's your     │
│  business?                                           │
│                                                      │
│                                                      │
│                                                      │
│  ─────────────────────────────────────────────────── │
│  [Type here, or tap 🎤 to talk...]           🎤  📎  │
└─────────────────────────────────────────────────────┘
```

### 1.2 The First Conversation

This is not a form disguised as chat. It's a genuine getting-to-know-you conversation that builds the Self's understanding of the user. The Self drives — asking open questions, picking up on signals, suggesting where to start.

**Rob's first conversation:**

> Self: "Hi, I'm your Self — think of me as a colleague who'll learn how your business works and help you run it. I'd love to understand what you do. What's your business?"
>
> Rob: "I run a plumbing company. About 12 staff."
>
> Self: "Trades business, decent size. You're probably wearing a lot of hats — sales, operations, on the tools yourself?"
>
> Rob: "Yeah, all of the above. I'm on job sites most of the day."
>
> Self: "So you're running the business from your phone half the time. What's eating most of your time right now? The stuff you wish someone else could just handle?"
>
> Rob: "Quoting. I'm writing quotes every night at the kitchen table."
>
> Self: "Quoting's a great one to start with — it's exactly the kind of thing I can take off your plate. Tell me roughly how it works: a customer gets in touch, and then what do you do?"
>
> Rob: "I work out the materials from the spec, estimate labour, add my margin, and type up the quote."
>
> Self: "Got it. A few things so I get it right — where do your material prices come from?"
>
> Rob: "Reece and Tradelink. I've got their price lists."
>
> Self: "And labour — do you estimate by the hour, or by job type?"
>
> Rob: "By job type roughly. Bathrooms are about 20 hours, kitchens maybe 12, hot water replacements about 4."
>
> Self: "And margin?"
>
> Rob: "25% for residential, 20% for commercial."
>
> Self: "Right, I think I've got enough to have a crack at it. Next time a quote request comes in, I'll draft one and show you before anything goes out. You can tell me what I got wrong and I'll get better each time."
>
> Self: "Want to try one now, or wait for the next real enquiry?"
>
> Rob: "There's one from Henderson about a bathroom reno. I'll forward you the email."

**What just happened (invisibly):**
- The Self built a user model: trades business, 12 staff, owner-operator, mobile-first, primary pain = quoting
- The Self created a quoting process definition (YAML, behind the scenes) from the conversation
- The Self set the process to supervised trust (every output to Rob for review)
- Rob never saw a "process," never configured anything, never left the conversation
- The Self suggested starting with quoting — it didn't wait for Rob to figure out what to do

### 1.3 The Self Always Knows What to Suggest Next

After the first process is running, the Self doesn't go quiet. It proactively guides:

**Week 1 (quoting running):**
> Self: "5 quotes out this week — you corrected one. By the way, you mentioned customers sometimes don't respond. Want me to follow up automatically after a few days?"

**Week 3 (follow-up added):**
> Self: "I've noticed you forward a lot of supplier price change emails. Other trades businesses find it useful to track those automatically. Want to explore that?"

**Month 2 (3 processes):**
> Self: "Everything's running smoothly this week. You've got quoting, follow-ups, and supplier tracking. The next thing businesses like yours usually tackle is invoicing — or is there something else bugging you?"

**Design decisions:**
- Suggestions are grounded in: stated pain points, industry patterns (APQC-level knowledge), observed behavior, and a maturity model for businesses like theirs.
- Suggestions are offered, never pushed. The Self proposes; the user decides.
- Timing matters: suggest when things are calm, not when the user is busy approving 5 items.
- The Self can say "I don't have a suggestion right now" — better than a forced recommendation.

### 1.4 The User Model Deepens Continuously

The first conversation is the beginning, not the end. Every interaction adds to the Self's understanding:

| Signal | What the Self learns |
|--------|---------------------|
| Rob corrects bathroom labour upward 3 times | Rob's quality bar for bathroom jobs — labour takes longer than averages suggest |
| Lisa always adds sustainability angle | Lisa's brand voice prioritizes sustainability — "Teach this" codifies it |
| Jordan checks process health every Monday | Jordan's working rhythm — prepare Monday briefings proactively |
| Rob voice-captures at 10am and 3pm | Rob's between-jobs windows — this is when to surface approvals |
| Nadia asks about Chen's quality weekly | Nadia's team oversight pattern — surface Chen's data proactively |

This is not a profile page. It's accumulated understanding from natural interaction — like a real colleague who gets better at their job the longer they work with you.

### 1.5 Onboarding States

| State | What the user sees |
|-------|-------------------|
| **Brand new** | Full-screen Self. "Hi, I'm your Self." Open-ended getting-to-know-you. |
| **Conversation done, no process yet** | Self: "Ready when you are. Tell me what's on your plate, or try forwarding me an email with a real piece of work." |
| **First process created** | Self: "Your quoting is set up. I'll have a go at the first one and show you. In the meantime, I'm here if you need anything." |
| **First output in review** | Self: "Henderson quote is ready for you. Take a look and tell me what you think." (presented conversationally — see section 2) |
| **First approval** | Self: "Sent. I'll remember what you told me for next time. I'll let you know when the next one's ready." |

---

## 2. The Self as Primary Operating Surface

**Human jobs served:** Orient, Review, Define, Delegate, Capture, Decide — all six
**Primitives used:** Conversation Thread (primary), Daily Brief (conversational), Review Queue (conversational), Feedback Widget (conversational), Trust Control (conversational), Quick Capture (unified input)

### 2.1 Morning Briefing

When the user returns, the Self greets them with what matters — conversationally, not as a dashboard.

**Rob, 6:30am, phone in the truck:**

> Self: "Morning Rob. Two things:
>
> Henderson quote is ready — $14,200. Looks solid, but I think the labour's a bit low for a bathroom. Similar jobs have averaged 22 hours and I've got 18. Want to check it, bump the labour, or just send as-is?
>
> And the Wilson follow-up went out yesterday — they haven't replied yet. I'll nudge them again Friday if we don't hear back.
>
> Everything else is running fine."

Rob: "Bump Henderson to 22 hours and send."

> Self: "Done — $15,140, sent to Henderson. I'll remember bathrooms need more hours. Anything else before you head to site?"

Rob: "Nah, all good."

**3 minutes.** Previously: 45 minutes at the kitchen table. Rob never opened a dashboard, never saw a feed card, never tapped "approve."

**Lisa, 10am, at her desk after warehouse visit:**

> Self: "Morning Lisa. A few things:
>
> 2 product descriptions ready for you — the new sustainable widget and the recycled tote. The widget one's good but I'm not sure I've captured the sustainability angle well enough. Want to take a look?
>
> Also, competitor pricing shifted overnight — Widget A dropped 20% at CompetitorX. 2 other products are out by more than 15%. Worth adjusting?
>
> Your content process is running smoothly otherwise — 8 descriptions this week, you only edited one."

Lisa might reply conversationally ("Show me the widget description") or, because she's at her desk and has 10 items, she might tap **"Show me everything"** — which opens the workspace view.

### 2.2 Conversational Review (The Default Path)

For low-volume users (1-3 items), the Self presents outputs conversationally:

> Self: "Henderson bathroom reno quote — $14,200:
>
> Materials: $8,400 (copper pipe, fittings, Rinnai unit)
> Labour: 18 hours ($4,200)
> Margin: 25%
>
> Three checks passed. One thing — labour might be low for a bathroom with tight access. Similar jobs averaged 22 hours.
>
> Good to send, or want to adjust?"

The user can:
- **Approve:** "Send it" / "Looks good" / "Go ahead"
- **Edit:** "Make it 22 hours" / "Bump the labour up"
- **Ask:** "Why 18 hours?" / "What did Wilson's bathroom come to?"
- **Reject:** "Start over — they changed the spec"

The Self understands natural language responses. No buttons required (though buttons are available as shortcuts for tap-friendly mobile use).

**After the user edits:**
> Self: "Updated to $15,140 and sent. By the way, that's the third time you've bumped bathroom labour — want me to use 22 hours as the starting point for bathrooms from now on?"
>
> Rob: "Yeah, good idea."
>
> Self: "Done. Bathroom jobs will start at 22 hours going forward."

The approval, edit, feedback capture, and "Teach this" all happened in conversation. The user didn't navigate anywhere, expand any cards, or tap through any flows.

### 2.3 Conversational Decisions (The Decide Job)

The Self doesn't just present text when a decision is needed — it renders supporting data inline so the user can decide with evidence, not just narrative.

**Trust change with inline evidence:**

> Self: "Quick thing about your quoting — the numbers look good:
>
> Last 15 quotes:
> ██████████████░ 14 approved clean, 1 corrected
>
> Corrections over time:
> ▇▅▃▂▁▁▁▁▁▁ ↓ trending down
>
> The one correction was a commercial job (margin was 25% instead of 20%). I've fixed that.
>
> I could start sending routine residential quotes automatically and just check with you on commercial ones and anything over $20k. You'd still see everything in your morning update. Want to try that?"

The Self renders mini-visualisations (bar charts, sparklines, trend indicators) inline in conversation. These are not images — they're lightweight data components the conversation surface can render. The Architect should design the conversation renderer to support: inline bar/progress indicators, sparklines, small tables (3-5 rows), and confidence indicators.

**Improvement suggestion with evidence:**

> Self: "I noticed something about your bathroom quotes — here's the pattern:
>
> | Job | Your estimate | Actual hours | Diff |
> | Wilson bath | 18h | 23h | +5h |
> | Acme bath | 18h | 21h | +3h |
> | Peters bath | 20h | 24h | +4h |
>
> Bathrooms consistently run 3-5 hours over. Want me to start with 22 hours as the baseline for bathroom jobs?"

**Risk detection with context:**

> Self: "Heads up — copper prices went up 8% last week but your supplier price list is from 3 weeks ago. Your last 2 quotes used the old prices.
>
> Affected quotes:
> · Henderson bathroom — sent at old prices (margin ~21% instead of 25%)
> · Wilson kitchen — still in draft, I can update before you send
>
> Want me to refresh the price list and recalculate Wilson?"

In each case, the Self presents the data needed for the decision, not just a recommendation. The user decides based on evidence they can see, not trust in the system's judgment alone.

### 2.4 Conversational Trust Changes

The Self proposes trust changes when the data supports them — as a colleague would, not as a settings page:

> Self: "Quick thing — your quoting has been solid lately. 14 of the last 15 went out without changes. I could start sending the routine ones automatically and just check with you on unusual jobs. You'd still see everything in your morning update, and I'll flag anything that looks off. Want to try that?"
>
> Rob: "Yeah, go for it."
>
> Self: "Done. I'll still show you anything unusual — new customer types, big jobs, anything over $20k. And if things slip, I'll go back to checking everything with you first."

**Design decisions:**
- The Self explains what changes and what stays the same.
- Safety nets are mentioned proactively ("if things slip, I'll go back").
- The user can decline without friction: "Nah, keep showing me everything" → "No worries. I'll mention it again in a few weeks."
- Trust changes never happen silently. The Self always asks.

### 2.4 Conversational Process Definition

When the user describes a new need, the Self transitions naturally into process definition — without the user knowing they're "creating a process":

> Rob: "I need to sort out my invoicing. It's a mess."
>
> Self: "Tell me about the mess — what's happening with invoicing right now?"
>
> Rob: "I do the work, write it up on a job sheet, then my office manager puts it into Xero. But sometimes jobs slip through and we don't invoice for weeks."
>
> Self: "So the gap is between finishing the job and the invoice getting into Xero. What if I tracked job completions and made sure every finished job gets an invoice drafted within 24 hours? Your office manager could still handle Xero, but I'd make sure nothing falls through."
>
> Rob: "That'd be brilliant."
>
> Self: "A few things — how do you mark a job as done? Is there a system, or is it more informal?"
>
> Rob: "I usually text the foreman or the office manager."
>
> Self: "What if you just told me? 'Henderson bathroom is done' — I'll handle the rest."
>
> Rob: "Yeah, that's easier."
>
> Self: "Right — I'll set this up. When you tell me a job is done, I'll pull the details from the original quote, create a draft invoice, and put it in front of you or your office manager. I'll also check for any jobs that have been going more than a week without being marked done. Sound right?"
>
> Rob: "Perfect."

**What happened invisibly:** A process was defined (trigger: job completion signal, steps: pull quote data → draft invoice → route to review, quality criteria: within 24 hours, no jobs older than 7 days uninvoiced). Rob never saw a process builder, steps, inputs, outputs, or YAML. He described his problem and agreed to a solution.

### 2.5 Quick Capture (Unified Input)

The input area serves triple duty:

```
┌──────────────────────────────────────────────────┐
│  [Type here, or tap 🎤 to talk...]        🎤  📎  │
└──────────────────────────────────────────────────┘
```

**Three modes, one input:**

1. **Conversation** (default): Talk to the Self. Full dialogue.
2. **Quick capture** (detected from intent): "Remember that copper prices went up 20%" → Self: "Noted — I'll factor that into your next quote." No dialogue needed.
3. **Command** (detected from brevity): "Bump Henderson to 22 hours" → Self acts immediately without a back-and-forth.

The Self determines mode from context and intent. The user never selects a mode.

**Voice is first-class.** Rob on a job site: taps mic, speaks: "Henderson also wants a hot water quote, Rinnai system, tight access." Self: "Got it — I'll draft a hot water quote for Henderson. I'll have it ready for you this afternoon." Rob never typed a word.

---

## 3. The Workspace — Earned Structured View

**Human jobs served:** Orient, Review, Decide (at scale)
**When it appears:** When the user's volume demands it, or on request

### 3.1 The Transition

The Self introduces the workspace when it makes sense:

> Self: "You've got 5 things going now — quoting, follow-ups, supplier tracking, invoicing, and the Henderson proposal. Want me to show you everything in one view? Some people find it useful when things get busy."

Or the user asks: "Show me everything" / "What have I got going on?" / "I want the full picture."

### 3.2 Workspace Layout

Once earned, the workspace is the three-panel layout from Brief 037:

```
┌─────────────┬──────────────────────────┬──────────────────┐
│ LEFT (w-64) │ CENTER (flex-1)          │ RIGHT (w-80)     │
│ Navigation  │ Feed                     │ Self Panel       │
│             │ OR Detail view           │                  │
│             │                          │                  │
│ My Work     │ [Structured feed with    │ [Self continues  │
│ · Henderson │  card-based items]       │  to be available │
│   quote ●   │                          │  for conversation│
│ · CRM       │                          │  alongside the   │
│   research  │                          │  workspace]      │
│             │                          │                  │
│ Recurring   │                          │                  │
│ · Supplier  │                          │ PromptInput      │
│   updates ✓ │                          │ [always visible] │
│ · Quoting ✓ │                          │                  │
│             │                          │                  │
│ How It      │                          │                  │
│ Works       │                          │                  │
└─────────────┴──────────────────────────┴──────────────────┘
```

**Everything from the original spec (v1) applies to this workspace view** — the feed item types, progressive disclosure, inline actions, entity grouping, process detail drill-in, trust control, engine transparency. The design of these components is unchanged. What changed is WHEN and WHY the user sees them.

### 3.3 Feed Item Types (Recap — unchanged from v1)

Six feed card types for the structured workspace view:

1. **Shift Report** — narrative summary, top card, always present
2. **Needs Your Eye** — review items with inline approve/edit/discuss
3. **Work Updates** — progress on active items
4. **Something's Off** — exceptions and failures
5. **Insights & Suggestions** — patterns detected, trust change proposals, "Teach this" prompts
6. **Process Outputs** — rendered content (reports, data, via json-render)

All use user language. All have defined empty/loading/error/content states. All support progressive disclosure (collapse/expand). See v1 spec sections 1.2-1.4 for full detail on each type.

**Key addition from review (Flag 1):** Trust change suggestions surface as feed cards (Type 5), not only in process detail. "Your quoting has been solid — want to check in less often? [Yes] [Not yet] [Show me the data]."

### 3.4 Navigation Sidebar

```
┌─────────────┐
│  [Ditto]     │  ← Click → feed
│              │
│  My Work     │  ← Active items (user's names)
│  · Henderson │     ● = needs attention
│    quote ●   │
│  · CRM       │
│    research  │
│              │
│  Recurring   │  ← Domain processes (running)
│  · Supplier  │     ✓ = running smoothly
│    updates ✓ │     ⚠ = needs attention
│  · Quoting ✓ │
│              │
│  How It Works│  ← Capability map
│              │
│  ──────────  │
│  Settings    │
└─────────────┘
```

- User language throughout: "My Work" / "Recurring" / "How It Works"
- Empty categories are hidden, not shown hollow
- Single-process user: one item under "Recurring." Still natural.
- Clicking an item scrolls the feed or opens process detail
- **Team manager (Nadia):** In the MVP, Nadia manages her team's processes as the process owner — she sees them in her own sidebar under "Recurring," grouped by team member if she has multiple. The Self's briefing segments by person: "Chen: 3 reports, 2 clean. Priya: 2 reports, both clean." Full team management UX (dedicated team view, per-member dashboards, delegated governance) is Phase 13 scope.

### 3.5 Process Detail (Drill-In)

Two variants, both accessed from sidebar or feed:

**Living Roadmap (one-off work):**
```
Henderson bathroom reno quote
Started 2 days ago · Due Friday

The Plan
────────
✓ Gathered specs from Henderson email thread
✓ Pulled current copper pricing
● Drafting quote — estimating labour based on similar jobs
○ Your review
○ Send to Henderson
```

**Domain Process (recurring):**
```
Quoting
Running since 6 weeks ago · 34 quotes completed

How it works: [plain language steps]

How it's going:
34 total · 31 approved clean · 3 corrected
You're checking everything · ready for less?
Quality: ▁▂▃▅▇▇█▇▇█ improving
```

**Trust Control (within process detail):**
- "How closely do you watch this?" slider with natural language: "Check everything" → "Check a sample" → "Let it run"
- Data presented as narrative, not metrics tables
- Safety nets explained in plain language

**Engine Transparency ("Under the hood"):**
- Collapsible section at bottom of process detail
- Shows: routing decision, memory assembly, agent + cost, checks run, trust gate, timing
- For power users (Jordan) and for proving the engine (us)

### 3.6 Engine View (Developer Mode — Insight-070)

The "Under the hood" section in process detail is the user-facing proving ground. But the dev team building Ditto needs more — a first-class engine view for proving and tuning.

**Engine View** is a developer-only mode, toggled via settings or keyboard shortcut. When active:

- **Feed items show engine metadata inline:** routing decision, agent used, cost, timing, checks run. Displayed as a subtle footer on each card.
- **Process detail shows full execution traces** by default (not collapsed).
- **Trust gate decisions are annotated:** why this item was held for review vs. auto-approved, what data informed the decision.
- **Memory assembly is visible:** what context was assembled for each run — which memories, how many tokens, what was included/excluded.
- **Risk signals are tagged with source:** "Pattern risk: 3 corrections on bathroom labour" shows which engine layer detected it (Harness L3, Awareness L4, Learning L5).

```
┌ Engine View (feed card footer) ──────────────────────┐
│ Route: quote-generation → matched by intent classifier│
│ Agent: Claude Sonnet · Cost: $0.08 · Time: 34s       │
│ Memory: 12 items (3 pricing, 4 past quotes, 5 msgs)  │
│ Checks: pricing ✓ margin ✓ completeness ✓            │
│ Trust gate: held for review (supervised)              │
│ Risks detected: labour-estimate-pattern (L5)          │
└───────────────────────────────────────────────────────┘
```

**Design decisions:**
- Hidden from end users entirely. Not a "power user" feature — a developer feature.
- The conversation surface in Engine View shows the Self's reasoning chain: what it considered, what it decided, what tools it called.
- This is how the dashboard "tells us what the engine needs next" (Insight-070). When trust gating feels wrong, when memory assembly is sparse, when routing is off — Engine View reveals it.
- Engine View drives the engine improvement backlog. If Phase 8 (Learning) or Phase 7 (Awareness) features are needed, Engine View is where that need becomes visible.

### 3.7 Responsive Behavior

- **≥1280px:** Full three-panel workspace
- **1024–1279px:** Sidebar collapses to icon rail
- **<1024px:** Self panel becomes overlay/drawer, sidebar becomes hamburger

---

## 4. The Self as Proactive Attention Manager

**Human jobs served:** Orient, Define, Decide, Capture
**This is the core differentiator — not in any product surveyed. (Insight-074, 076)**

### 4.1 The Problem This Solves

Every tool our personas have tried fails at the same moment: after signup, the user stares at a blank screen and thinks "now what?" Even powerful tools leave the user's imagination as the bottleneck. But the problem is deeper than cold start — it's ongoing. Even established users miss opportunities, let things slip, and spend time on the wrong thing because no tool proactively manages their attention.

The Self acts like a brilliant executive assistant who knows your business, your priorities, and your patterns — and proactively makes sure you're spending your time on the right things.

### 4.2 Five Dimensions of Proactive Behaviour

The Self manages five dimensions continuously, not just at onboarding:

#### 1. Focus — "Here's what matters most right now"

Not just listing what needs attention, but prioritising and explaining WHY:

> "Henderson quote first — they called yesterday asking about it. Wilson can wait until tomorrow."

> "Two descriptions need your eye, but the pricing alert is more urgent — competitor moved overnight and your prices are 20% above market on three products."

The Self synthesises signals the user would otherwise have to gather from multiple sources.

#### 2. Attention — "You might have forgotten about this"

Surfacing things that are slipping — not because they failed, but because they've gone quiet:

> "You haven't looked at the Wilson quote in 3 days. They're usually quick to respond — want me to follow up, or is there a reason to wait?"

> "Chen's report quality issue from last week — did you get a chance to talk to him about it?"

This is the "nothing falls through the cracks" feeling — the core anxiety every one of our personas carries.

#### 3. Opportunities — "I noticed something you might want to act on"

Connecting dots across the user's work and business context:

> "Three customers asked about hot water systems this week. That's unusual — might be worth a targeted offer."

> "Your competitor dropped widget prices by 20%. Your tote bag uses the same material — check if tote pricing is still competitive too."

> "You've completed 5 similar proposals this month. Want me to turn that into a repeatable process so future ones are faster?"

The Self observes patterns the user might not see and surfaces them as opportunities, not just reports.

#### 4. Coverage — "Here's a gap you might not have noticed"

Identifying blind spots using industry knowledge + observed behaviour:

> "You've got quoting and invoicing covered, but job scheduling is still manual. That's usually where trades businesses lose the most time. Worth exploring?"

> "Your content process covers descriptions but not the weekly newsletter. Want me to handle that too?"

> "You mentioned supplier prices change a lot but you're tracking them manually. Want to automate that?"

This is the Capability Catalog (human-layer.md) made alive — the user never browses a catalog, but the Self's industry knowledge powers proactive gap detection.

#### 5. Upcoming — "Here's what's coming"

Forward-looking awareness based on patterns, schedules, and deadlines:

> "Henderson's quote is 4 days old with no response. Normally you follow up after 3. Want me to send a nudge?"

> "3 jobs finishing this week — I'll have the invoices ready as they're done."

> "Quarter-end is in 2 weeks. Last quarter you spent a full day pulling numbers. Want me to start gathering data now?"

The Self anticipates work before it becomes urgent. The user feels ahead, not behind.

### 4.3 Suggestion Sources

All five dimensions draw from:

| Source | What it powers | Example |
|--------|---------------|---------|
| **User model** (business type, size, pain points, patterns) | Focus, Coverage, Opportunities | "Trades businesses your size..." |
| **Stated but unaddressed pain points** | Coverage, Upcoming | "You mentioned invoicing..." |
| **Observed behaviour** (corrections, questions, time patterns, forwarded items) | Attention, Opportunities | "I've noticed you forward supplier emails..." |
| **Industry knowledge** (APQC, domain patterns) | Coverage, Opportunities | "Marketing agencies usually also track..." |
| **Process maturity + trust data** | Focus, Upcoming | "Quoting is solid — ready for less oversight?" |
| **Temporal awareness** (aging items, approaching deadlines, quiet periods) | Attention, Upcoming | "Wilson quote is 3 days old..." |
| **Cross-process pattern recognition** | Opportunities | "3 similar proposals this month — pattern detected" |

### 4.4 Delivery: Woven into the Briefing

The morning briefing is the primary vehicle. The five dimensions weave naturally into the Self's narrative:

> "Morning Rob. Three things:
>
> Henderson quote first — they called yesterday (**focus**). $14,200, looks good, labour might be low. Bump and send?
>
> Wilson hasn't responded in 3 days — unusual for them. Want me to follow up? (**attention**)
>
> Also, three hot water enquiries this week — that's a spike. Might be worth a targeted offer to your mailing list. (**opportunity**)
>
> Everything else running fine. 2 jobs finishing tomorrow — invoices will be ready. (**upcoming**)"

Four dimensions in one briefing, plus a risk woven in naturally. No separate "suggestions" section. The Self weaves proactive intelligence into the conversation.

### 4.4.1 Risk Detection Woven In (Insight-077)

Risk is not a sixth dimension — it's a lens that cuts across all five. The Self surfaces forward-looking risks naturally within the briefing and throughout the day:

**Pattern risk (woven into review):**
> "Henderson quote looks good, but heads up — your bathroom labour estimates have been low on the last 3 jobs. I've bumped this one to 22 hours to be safe."

**Temporal risk (woven into attention):**
> "Wilson hasn't responded in 4 days. They're usually quick — might be worth a check before they go elsewhere."

**Data staleness risk (woven into focus):**
> "Copper prices went up 8% last week but your supplier list is 3 weeks old. I've used the latest for Henderson, but your other quotes might be underpriced."

**Quality drift risk (woven into attention):**
> "Chen's correction rate is climbing — 3 of the last 5 needed fixes. Might be worth a conversation about the baseline numbers."

**Coverage gap risk (woven into opportunity):**
> "Holiday season is 6 weeks out but you don't have a seasonal content process. Last year you said it was a scramble. Want to set something up?"

**Design decisions:**
- The Self never says "risk" to the user (Insight-073). It says "heads up," "something to watch," "might be worth checking," "just so you know."
- Risk severity determines tone: "heads up" (watch) → "something to check" (flag) → "this needs your attention" (alert).
- Risk signals come from the engine: Harness (L3) detects quality drift from correction trends, Awareness (L4) detects cross-process and temporal patterns, Learning (L5) detects emerging pattern risks. The Self consumes and presents them.
- **MVP scope:** Basic risk detection — temporal (aging items, approaching deadlines), data staleness (outdated inputs), pattern (correction trends). Advanced risk categories (competitive, cross-process, coverage gap) are post-MVP but the conversational pattern for surfacing them is designed now.

### 4.5 Timing and Frequency

- **At briefing time** — primary vehicle. All five dimensions can appear.
- **After milestones** — "5th quote sent. Here's what businesses like yours usually tackle next..."
- **When things are calm** — not during a busy review. Suggestions appear when the user has bandwidth.
- **When prompted** — "What should I focus on?" / "What else can you help with?"
- **Never during exceptions** — fix first, suggest later.
- **Frequency cap:** 1-2 proactive nudges per session beyond the briefing. The Self is helpful, not noisy.

### 4.6 Tone

Suggestions are offered as a thoughtful colleague would — not prescribed:

**Good:** "Henderson quote first — they called yesterday asking about it."

**Bad:** "Priority 1: Henderson Quote. SLA: 24 hours. Status: Overdue."

**Good:** "Other trades businesses find it useful to track supplier prices automatically. Interested?"

**Bad:** "Recommended automation: Supplier Price Monitoring. Estimated ROI: 3 hours/week."

**Good:** "Quarter-end is in 2 weeks — want me to start gathering data?"

**Bad:** "Alert: Q1 reporting deadline in 14 days. 0 of 12 data sources connected."

The Self is a colleague who notices things and mentions them at the right moment. Not a task manager showing you a backlog.

---

## 5. Entry Point Logic — How the Surface Adapts

### 5.1 Decision Matrix

| User state | Volume | Entry point | Layout |
|-----------|--------|-------------|--------|
| **Brand new** | 0 items | Full-screen Self | Conversation only |
| **First process, first week** | 1-3 items | Self briefs conversationally | Conversation primary, "Show me everything" available |
| **Growing** | 3-5 items | Self briefs, suggests workspace | Conversation with workspace prompt |
| **Established** | 5+ items | Workspace with Self in right panel | Three-panel layout |
| **User preference** | Any | Whatever the user last chose | Self learns and adapts |

### 5.2 The Transition is a Conversation

The Self doesn't silently switch layouts. It proposes:

> Self: "You've got a few things going now. Some people find it useful to see everything laid out — want me to show you a workspace view, or do you prefer just talking?"

If the user says "show me," the workspace appears. If they say "just talking," the Self stays full-screen.

The user can always toggle: a persistent "workspace / conversation" control in the header. The Self remembers the preference.

---

## 6. User Journeys (Revised)

### 6.1 Rob — Day 1 to Month 2

**Day 1, evening, kitchen table:**
Rob downloads Ditto. Sees the Self. Has a 15-minute conversation about his business, his quoting pain, and how he prices jobs. By the end, the Self has a quoting process ready. Rob forwards the Henderson email. "I'll have a draft for you in the morning."

**Day 2, 6:30am, phone in the truck:**
Self: "Morning Rob. Henderson quote ready — $14,200. Labour might be low for a bathroom. Bump to 22 hours, or send as-is?"
Rob: "Bump it and send."
Self: "Done — $15,140. I'll remember bathrooms need more hours."
3 minutes. No dashboard. Just conversation.

**Week 1:**
Self: "5 quotes out this week. You mentioned customers don't always respond — want me to follow up automatically after 3 days?"
Rob: "Yeah, good idea."
A follow-up process is created — Rob never saw it happen.

**Week 3:**
Self: "Your quoting's been solid — 14 of 15 approved clean. I could start sending routine ones automatically and just check with you on unusual jobs. Sound good?"
Rob: "Go for it."
Trust escalated — conversationally.

**Month 2:**
Self: "You've got quoting, follow-ups, and supplier tracking running. Want to see everything in one view?"
Rob: "Yeah, show me."
The workspace appears for the first time. Rob sees the feed with his shift report, a few review items, and the sidebar with his work listed. He discovers he can tap through things faster here. The workspace is now his default when he's at the kitchen table. The Self stays his default on the phone.

### 6.2 Lisa — Content Review at Scale

**Week 1:** Conversational. Self presents product descriptions one at a time. Lisa edits and approves in chat.

**Week 2:** Lisa has 10 descriptions, 3 pricing alerts, and a content calendar. Self: "You've got a bunch of things today — want to see them all at once?" Lisa says yes. Workspace opens. She taps through review cards, approves 8, edits 2. The workspace is faster for batch work. She keeps it as her default at the desk.

**On the commute:** Lisa opens Ditto on her phone. Self greets her: "Morning — 2 things need your eye, everything else is running." Conversational mode. She handles them in chat.

### 6.3 Jordan — 48-Hour Value Proof

**Hour 1:** Jordan talks to Self: "I need to set up reference checking for HR." Self asks 10 questions over 15 minutes. Process ready.

**Hour 2:** Jordan tells Self about the first candidate. Self routes to the new process.

**Day 2:** Self: "Reference check for Sarah Mitchell — 2 of 3 responses received. Summary will be ready when the third comes in."

**Day 2, afternoon:** Self: "Sarah Mitchell reference summary ready. Take a look." Jordan reviews in chat, approves. Forwards to HR lead. Value delivered.

**Week 2:** Jordan has 4 processes across 3 departments. Self suggests the workspace. Jordan opens it, sees all processes in the sidebar. Clicks "How It Works" and sees the capability map — processes connected across departments. Puts it on the big screen in the leadership meeting.

### 6.4 Nadia — Team Quality Oversight

**Daily:** Self: "Team output: 6 reports delivered, 4 clean. Chen's data source had trouble — API changed. Want to see the detail?"

Nadia: "What happened with Chen's?"

Self explains the issue. Nadia decides how to handle it. In standup, she already knows.

**Weekly:** Self: "Chen's formatting process is getting better — 95% clean rate. Want to let it run with less oversight?" Nadia: "For Chen, yes. Keep watching Priya's." Different trust levels per team member — all decided in conversation.

---

## 7. Interaction States (All Surfaces)

### 7.1 Conversation Surface

| State | What the user sees |
|-------|-------------------|
| **Brand new** | Self's greeting. Open, warm, no instructions needed. |
| **Returning, nothing happened** | "All quiet. Nothing needs you." One line. |
| **Returning, items need attention** | Self briefs with numbered items. Actions inline. |
| **User is idle** | Self doesn't pester. Available but quiet. |
| **Self is processing** | Typing indicator: "Working on it..." |
| **Self hit an error** | "I ran into a problem with [thing]. Here's what happened: [explanation]. Want me to try again, or should we look at it together?" |
| **Confirmation pending** | Self states the irreversible action and waits for explicit confirmation before executing. See 7.1.1 below. |

#### 7.1.1 Confirmation Model for Irreversible Actions

When the user asks the Self to do something that can't be undone, the Self always confirms before executing. This is critical — Rob talks fast from his truck, and a misinterpreted "send it" could send the wrong quote to a customer.

**Irreversible actions requiring confirmation:**
- Sending output to an external recipient (quote to customer, email to referee, report to client)
- Trust tier changes (reducing oversight)
- Archiving or deleting a process
- Any action that modifies external systems (updating CRM, posting to Xero, sending emails)

**The confirmation pattern:**

> Rob: "Bump the labour and send"
>
> Self: "Updating Henderson quote to $15,140 (22 hours labour) and sending to henderson@email.com. Go ahead?"
>
> Rob: "Yep"
>
> Self: "Sent. ✓"

**Design decisions:**
- The Self restates the specific action with key details (amount, recipient) — not just "send it?"
- One-word confirmation ("yep," "yes," "go," "do it") is sufficient.
- If the user says something ambiguous, the Self asks again rather than guessing.
- Reversible actions (editing a draft, adjusting an estimate, capturing a note) do NOT require confirmation — the Self acts immediately.
- In the workspace (feed cards), irreversible actions show a brief confirmation toast: "Sending Henderson quote for $15,140 to henderson@email.com" with a 3-second undo window.

### 7.2 Workspace (When Active)

| Surface | Empty | Loading | Error | Content | Single-process |
|---------|-------|---------|-------|---------|----------------|
| **Feed** | "Nothing here yet. Talk to Self to get started." | Skeleton cards (3) | "Something went wrong. Self can help." | Full feed | One shift report + one item. Feels complete. |
| **Shift report** | "All quiet." | Pulsing lines | "Couldn't load — here are your items." | Narrative | Covers one process naturally. |
| **Review card** | (Not rendered) | Skeleton + disabled buttons | "Couldn't load. [Retry] [Ask Self]" | Full card | Single card works fine. |
| **Sidebar** | "Get started" link → Self | Labels + skeleton dots | Just labels | Full nav with dots | One item. Natural. |
| **Process detail** | (Can't reach empty process) | Skeleton steps + sparkline | "Couldn't load. [Retry]" | Full detail | — |

---

## 8. MVP Scope Validation (Revised)

### What Changed from Brief 037

| Brief item | Original design | Revised design | Rationale |
|-----------|----------------|----------------|-----------|
| Feed | Primary surface | Earned surface (second layer) | Non-technical users need conversation first, structure second |
| Conversation with Self | Right panel | Primary surface, entry point, first contact | The Self IS the product, not a sidebar |
| Review flow | Feed cards with buttons | Conversation (default) + feed cards (workspace) | Conversational review is faster for low volume and more natural for our personas |
| Navigation | Always visible sidebar | Appears with workspace | No navigation needed when conversation is the only surface |
| Process detail | Center panel drill-in | Accessed from workspace or via Self ("show me how quoting works") | Same content, different access path |

### Six Human Jobs Coverage

| Job | Conversation surface | Workspace surface |
|-----|---------------------|-------------------|
| **Orient** | Self briefs proactively | Shift report card + sidebar status |
| **Review** | Self presents outputs, user responds naturally | Feed cards with inline actions |
| **Define** | Self guides process definition through dialogue | (Process builder deferred — conversation IS the builder) |
| **Delegate** | Self proposes trust changes conversationally | Trust control in process detail |
| **Capture** | Unified input: type, speak, attach | Same input in right panel |
| **Decide** | Self presents options with evidence, user chooses | Improvement cards in feed, process detail data |

All six jobs are served by conversation. The workspace adds speed and structure for scale, but conversation is sufficient alone.

### Guidance Engine Coverage

| User moment | How the Self helps |
|------------|-------------------|
| "I just signed up — now what?" | Self greets, gets to know you, suggests where to start |
| "My first process is running — what next?" | Self suggests based on stated pain points |
| "Things are working — is there more?" | Self suggests based on industry patterns + observed behavior |
| "Something broke — what do I do?" | Self explains the problem and proposes a fix |
| "I want to do less checking" | Self proposes trust change with evidence |
| "I want the big picture" | Self suggests the workspace or capability map |

---

## 9. Gaps and Original Patterns (Revised)

### Patterns Adopted

| Pattern | Source | How applied |
|---------|--------|-------------|
| Narrative shift report | Linear Pulse | Self delivers as conversational brief |
| Progressive disclosure | Slack Peek | Feed cards expand inline (workspace mode) |
| Entity grouping | Notion | Feed updates cluster by work item |
| Inline actions | Asana | Approve/edit on feed cards (workspace) |
| Dual-pane structure | Claude Artifacts | Workspace: feed + Self panel |

### Original to Ditto

| Pattern | What's new |
|---------|-----------|
| **Conversation as primary operating surface** | No AI workspace surveyed (Linear, Notion, Asana, Superhuman, Paperclip, Cursor, Claude Artifacts, ChatGPT Canvas, v0.dev — see research reports) uses conversation as the default daily operating surface. All use dashboard-first with chat as secondary. Ditto inverts this. |
| **Dashboard-earned progressive reveal** | No product surveyed reveals its full UI progressively based on user volume. All show the full interface immediately. Ditto's layered reveal (conversation → workspace) is original. |
| **Proactive guidance engine** | Most products have onboarding wizards or feature tours. Ditto's ongoing, context-aware, industry-informed suggestion engine that operates through the Self is original. |
| **Conversational trust calibration** | All trust/autonomy controls surveyed use settings pages or sliders. Ditto's Self proposing trust changes as a colleague would ("your quoting's been solid — want to let routine ones go?") is original. |
| **Invisible process definition** | Surveyed products require explicit process/workflow creation UX. Ditto defines processes through natural conversation without the user seeing a builder, steps, or configuration. |
| **User-language-first UI** | No product surveyed systematically eliminates system vocabulary from the user surface. (See Insight-073.) |
| **Implicit feedback chain** | Edit → diff → pattern → "Teach this" → quality criterion — embedded in conversational review flow. |
| **Risk detection as proactive intelligence** | No surveyed product detects and surfaces forward-looking risks (pattern, temporal, data staleness, quality drift, coverage gaps) through a conversational agent. Products have alerts/notifications, but not predictive risk woven into a daily briefing. |

---

## 9.5 Risks and Mitigations (Product Risk)

The conversation-first model is an unvalidated product bet. No surveyed product uses this as the primary operating surface. The risks are real and should be named:

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Conversation is cognitively taxing for batch operations** | Lisa reviewing 10 descriptions in chat is slower than tapping through feed cards | The workspace (feed with inline actions) is the explicit mitigation. The Self introduces it when volume demands it. Users who prefer dashboard-first can set it as default from day one. |
| **Intent detection is unreliable** | "Send it" misinterpreted — wrong quote goes to customer | Confirmation model for all irreversible actions (section 7.1.1). The Self restates action with specifics before executing. One-word confirmation required. |
| **Conversation feels like "just another chatbot"** | Users who've failed with ChatGPT see a text box and disengage | The Self drives — it greets, briefs, suggests, acts. It's not waiting for the user to prompt it. The proactive behaviour makes it feel fundamentally different from a passive chat interface. First impressions matter: the Self should speak first, not present an empty input box. |
| **Users want structure from day one** | Some users (especially Jordan) prefer dashboards | Entry point preference is a first-class setting. Users who toggle to workspace immediately are supported. The system remembers and adapts. |
| **Voice input is unreliable in noisy environments** | Rob on a job site, Self misinterprets voice capture | Voice inputs are confirmed before acting: "I heard: Henderson wants a hot water quote, Rinnai, tight access. Right?" Capture (non-action) is more forgiving than commands. |
| **The Self feels too chatty for returning power users** | Users who've been using Ditto for months don't want a briefing conversation every morning | The Self adapts to usage patterns. Power users who go straight to the workspace see a brief one-line summary in the right panel, not a full conversational briefing. Brevity increases with familiarity. |

**The escape hatch is always the workspace.** If the conversation-first model doesn't work for a user or a use case, the structured view is one click away. The bet is that conversation-first is the better default for our non-technical personas — but the workspace ensures we're never trapped in a model that doesn't work.

---

## 10. Recommendations for the Architect

1. **The Self is the core product surface, not a feature.** Architect the conversation experience as the primary interface. The workspace is a progressive enhancement. This affects routing, state management, and where the primary UX investment goes.

2. **The Self needs a user model.** Beyond memory (what happened), the Self needs a structured understanding of: business type, size, industry, pain points, quality standards, working patterns, trust disposition. This is a new engine concept — likely an extension of the Memory layer with structured fields alongside freeform memories.

3. **The proactive attention engine is a first-class capability.** The Self's proactive behaviour (focus, attention, opportunities, coverage, upcoming) draws from: user model, stated pain points, observed behaviour, industry patterns, process maturity, temporal awareness, and cross-process patterns. This is not a notification system — it's intelligence woven into the Self's conversational briefing. Needs its own architectural design as a meta-process.

4. **Natural language approval needs robust intent detection.** "Bump it and send" / "Looks good" / "Make it 22 hours" — the Self must reliably distinguish approvals, edits, questions, rejections, and captures. This is an AI/NLP design challenge. Confirmation safeguards are needed for irreversible actions ("Sending to Henderson — go ahead?").

5. **Entry point routing needs state awareness.** New user → conversation only. Low volume → conversation-first brief. High volume → workspace with Self panel. User preference override. This is lightweight state but needs to be architected.

6. **The workspace (feed + sidebar + process detail) from v1 remains valid.** All the feed item types, progressive disclosure, entity grouping, inline actions, trust control, engine transparency — keep all of it. It's the second layer, not the first. The Architect should design both surfaces and the transition between them.

7. **Capability map deferred.** "How It Works" (systems view) is valuable for Jordan but not essential for the conversation-first experience. Recommend deferring to MVP+1 unless effort is trivial.

8. **Process definition flow is conversation-only in the MVP.** No Process Builder visual editor. The Self defines processes through dialogue. The resulting YAML/definition is engine-internal. This is a significant simplification for the MVP.

9. **Confirmation safeguards on irreversible actions.** Conversational approvals feel fast and natural — but "send the quote" is irreversible. The Self should confirm before executing irreversible actions: "Sending Henderson quote for $15,140 — go ahead?" This adds one exchange but prevents costly mistakes. See section 7.1.1 for the full confirmation model.

10. **Risk detection as an engine capability.** The Harness (L3) should output risk signals alongside quality check results — correction trend analysis, temporal risk (aging items), data staleness detection. The Awareness layer (L4) adds cross-process and pattern risks. The Self consumes these signals and weaves them into briefings and reviews. MVP scope: temporal risks, data staleness, correction-pattern risks. Process schema should support risk criteria alongside quality criteria. (Insight-077)

11. **Engine View (developer mode) is first-class.** A togglable mode that surfaces routing decisions, memory assembly, trust gate logic, agent cost, timing, and risk signal sources at the feed/conversation level. Hidden from end users but essential for the team building Ditto. This is how the dashboard "tells us what the engine needs next" (Insight-070).

12. **Conversation renderer must support inline data.** The Self presents decisions with evidence — inline sparklines, small tables (3-5 rows), bar/progress indicators, trend arrows. These are lightweight data components, not images. The conversation surface needs a component registry for rendering structured data inline alongside narrative text.

---

## Reference Docs Status

- **`docs/personas.md`** — checked. No drift. The conversation-first direction aligns more closely with how Rob, Lisa, Jordan, and Nadia actually interact with tools (conversation/text, not dashboards).
- **`docs/human-layer.md`** — checked. All 16 primitives remain valid. This spec adapts their delivery method (conversation-first, workspace-second) without changing their purpose. Recommendation: update human-layer.md to reflect that conversation is the primary delivery surface for primitives, not just a definition tool.
- **Insights 070-077** — all applied.
- **Research reports** — patterns cited. No stale research.
- **New insights captured:** Insight-074 (Self as Guide), Insight-075 (Conversation-first, Dashboard-earned).
