# UX Interaction Spec: Onboarding — The Self Gets to Know You

**Date:** 2026-03-24
**Role:** Dev Designer
**Status:** Draft v1
**Triggered by:** Insight-093 (deep intake), Insight-091 (mutable processes), onboarding research report
**Consumers:** Dev Architect (Brief 040 update), Dev Builder (implementation)
**Depends on:** `docs/research/onboarding-intake-coaching-patterns.md`, Insights 074/079/080/081/088/089

---

## Design Constraints (Hard)

| # | Constraint | Source |
|---|-----------|--------|
| C1 | Onboarding is a native YAML process (`system: true`), not a hardcoded UI flow. Self adapts the process mid-flight via `adapt_process` tool. | Insight-091 |
| C2 | Conversation is the input method, not the destination. Structure emerges visually as context is gathered. | Insight-079 |
| C3 | The artefact being built (user model / knowledge synthesis) is the primary surface, not the chat. | Insight-080 |
| C4 | User language throughout. Never say "process," "agent," "trust tier," "YAML." | Insight-073 |
| C5 | One process must be valuable. Onboarding must produce a working first process within the first session. | Personas |
| C6 | Value exchange — every question has a visible payoff the user can see. | Research: progressive profiling |
| C7 | Assess through doing, not asking. Quality standards emerge from corrections, not from self-reporting. | Research: Duolingo adaptive |
| C8 | Work with the user's real data from minute one. No demo mode, no synthetic inbox. | Research: Superhuman |
| C9 | The Self guides always. The user never wonders "what now?" | Insight-074 |

---

## The Big Picture: Three Acts

Onboarding is not a single conversation. It's a multi-session relationship arc with three acts:

| Act | When | Duration | What happens | What the user sees |
|-----|------|----------|-------------|-------------------|
| **1. First Contact** | Day 1, first session | 10-20 min | Self gets to know user. Captures enough for first process. Proposes and creates it. | Conversation → knowledge taking shape → first process proposed |
| **2. First Value** | Day 1-2 | 5-15 min | First process produces output. User reviews. Self learns from corrections. | Output for review → corrections → "I'll remember that" |
| **3. Deepening** | Days 3-14+ | 2-5 min per session | Self deepens understanding across remaining dimensions. Suggests next processes. Coaches AI collaboration. | Proactive suggestions, coaching moments, knowledge growing |

**Critical:** Act 1 must end with a working process. The user must see value before they close the browser. Everything else can happen across sessions.

---

## Act 1: First Contact — "Tell me about your world"

**Human jobs served:** Define (understanding the user's world), Orient (what's possible), Capture (gathering context)
**Duration:** 10-20 minutes
**Outcome:** User model with enough depth for first process. First process created and ready to run.

### 1.1 The Opening (0-2 minutes)

The Self speaks first. The user never sees an empty input box with a blinking cursor.

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  ● Ditto                                             │
│                                                      │
│  Hi — I'm Ditto. Think of me as a colleague who'll   │
│  learn how your business works and help you run it.   │
│                                                      │
│  I'd love to understand what you do.                 │
│  What's your business?                               │
│                                                      │
│                                                      │
│  ─────────────────────────────────────────────────── │
│  [Type here...]                                 📎   │
└─────────────────────────────────────────────────────┘
```

**Design decisions:**
- "Ditto" not "your Self" — test with real users which feels warmer
- One question at a time. Never a barrage.
- The Self drives. It asks, the user answers. The ratio is inverted from normal chat (user talks more, Self talks less).
- The very first question is intentionally open and easy to answer.

### 1.2 The Gathering Phase (2-8 minutes)

The Self asks 4-6 focused questions, adapting based on responses. Behind the scenes, the onboarding process YAML adapts via `adapt_process` — adding industry-specific steps, removing irrelevant ones.

**Rob's conversation:**

> **Ditto:** "What's your business?"
>
> **Rob:** "I run a plumbing company. About 12 staff."
>
> **Ditto:** "Trades business, decent size team. What's eating most of your time right now — the stuff you wish someone else could handle?"
>
> **Rob:** "Quoting. I'm writing quotes every night at the kitchen table."
>
> **Ditto:** "Quoting's a great one to start with. Tell me roughly how it works — a customer gets in touch, then what happens?"
>
> **Rob:** "I work out the materials from the spec, estimate labour, add my margin, type up the quote."
>
> **Ditto:** "A few quick things so I get it right — where do your material prices come from?"
>
> **Rob:** "Reece and Tradelink. I've got their price lists."
>
> **Ditto:** "And labour — by the hour, or by job type?"
>
> **Rob:** "By job type. Bathrooms about 20 hours, kitchens maybe 12."
>
> **Ditto:** "And margin?"
>
> **Rob:** "25% residential, 20% commercial."

**What happened invisibly:**
- After "plumbing company," the Self adapted the onboarding YAML: added trades-specific steps (materials sourcing, labour estimation, supplier relationships), removed irrelevant ones (content calendar, brand voice)
- Each answer populated a dimension of the user model
- The Self asked follow-up questions based on what it still needed (value exchange — "so I get the quote right")

**Libby's conversation (different path):**

> **Ditto:** "What's your business?"
>
> **Libby:** "I'm a doula, transitioning into online education and coaching."
>
> **Ditto:** "That's a big transition — exciting. Are you in the building phase, or are you already selling courses?"
>
> **Libby:** "Still building. I'm doing my certifications and testing content on social."
>
> **Ditto:** "So you're creating content to see what resonates. What's taking the most time — the content itself, or figuring out what to write about?"
>
> **Libby:** "Both. I know my stuff but I struggle to turn it into posts that connect."

**Different path, same structure.** The Self adapted the onboarding YAML differently for Libby: brand voice, content strategy, ideal client definition. Same process template, different adapted version.

### 1.3 The Knowledge Takes Shape (visible artefact)

After 3-4 exchanges (roughly 3-5 minutes), the Self has enough to show something. A **knowledge synthesis card** appears in the conversation:

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  ● Ditto                                             │
│                                                      │
│  Here's what I'm taking away so far:                │
│                                                      │
│  ┌─ What I Know ─────────────────────────────────┐  │
│  │                                                │  │
│  │  You: Plumbing company, 12 staff, owner-       │  │
│  │  operator. On job sites most of the day.       │  │
│  │                                                │  │
│  │  Main pain: Quoting — every evening at the     │  │
│  │  kitchen table.                                │  │
│  │                                                │  │
│  │  How quoting works: Spec → materials (Reece    │  │
│  │  + Tradelink price lists) → labour by job      │  │
│  │  type → margin (25% resi, 20% commercial)      │  │
│  │  → type up quote                               │  │
│  │                                                │  │
│  │  [This looks right]  [Let me fix something]    │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Anything I'm missing or getting wrong?             │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Design decisions:**
- The knowledge synthesis card is **editable**. "Let me fix something" opens inline editing. Corrections are captured as feedback (the learning loop starts here).
- The card uses the **user's words**, not system language. "Main pain: Quoting" not "Problem dimension: Quote generation."
- The card is a **checkpoint, not a gate**. The user doesn't have to approve it to continue. But showing it builds trust — "this thing is listening."
- This is the "discovery as deliverable" pattern from consulting. The knowledge synthesis IS value — the user can see their business described back to them clearly.

### 1.4 The Proposal (8-12 minutes)

Once the Self has enough context (the information model hits its completion threshold), it transitions from gathering to proposing. This is Insight-079's Phase 2.

```
┌─────────────────────────────────────────────────────┐
│                                                      │
│  ● Ditto                                             │
│                                                      │
│  I think I've got enough to have a crack at your     │
│  quoting. Here's what I'd do:                        │
│                                                      │
│  ┌─ Quoting ─────────────────────────────────────┐  │
│  │                                                │  │
│  │  When a quote request comes in:                │  │
│  │                                                │  │
│  │  1. Pull materials from Reece/Tradelink        │  │
│  │     pricing                                    │  │
│  │  2. Estimate labour by job type                │  │
│  │  3. Apply your margin (25%/20%)                │  │
│  │  4. Draft the quote                            │  │
│  │  5. Show you before anything goes out          │  │
│  │                                                │  │
│  │  I'll check everything with you at first.      │  │
│  │  As I get it right more often, I'll ask less.  │  │
│  │                                                │  │
│  │  [Looks good — let's try it]                   │  │
│  │  [I'd change something]                        │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Want to try one now? If you've got a real quote     │
│  request, forward me the email or tell me the        │
│  details.                                            │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Design decisions:**
- **Plain language steps.** Not "Step 1: Material cost aggregation." Just "Pull materials from Reece/Tradelink pricing."
- **Trust explained simply.** "I'll check everything with you at first. As I get it right more often, I'll ask less." No mention of trust tiers, supervised mode, or governance.
- **Immediate real work.** "Want to try one now?" — not "Your process is set up! Come back when you have work." Value must be demonstrated in the session. (Superhuman pattern: prove it live.)
- **The process-proposal-card** is a new component (Insight-079). It's the bridge from conversation to structured work.

### 1.5 First Real Work (12-20 minutes)

Rob forwards an email or describes the Henderson bathroom reno. The Self runs the quoting process on real data.

> **Rob:** "There's one from Henderson about a bathroom reno. I'll forward you the email."
>
> **Ditto:** "Got it. Give me a minute — I'll pull together a draft quote."
>
> [Self executes the quoting process through the harness. Output arrives.]
>
> **Ditto:** "Here's what I've got for Henderson:
>
> Materials: $8,400 (copper pipe, fittings, Rinnai unit)
> Labour: 18 hours ($4,200)
> Margin: 25%
> Total: $14,200
>
> Three things checked out. One thing — labour might be low for a bathroom with tight access. Similar jobs average 22 hours.
>
> Good to send, or want to adjust?"

**This is the trust moment.** Rob sees Ditto produce real work on real data. The quality of this output determines whether Rob comes back tomorrow.

**Design decisions:**
- **Use real data from minute one.** No demo quote. Henderson is real.
- **Self flags its own uncertainty.** "Labour might be low" — the metacognitive check surfaces naturally. This builds trust because the Self is honest, not just confident.
- **Simple actions.** "Good to send, or want to adjust?" — not a form with 12 fields.

### 1.6 Onboarding States

| State | What the user sees |
|-------|-------------------|
| **Brand new** | Full-screen conversation. Ditto speaks first. |
| **Gathering (2-8 min)** | Conversation with adaptive questions. Subtle signal: "Getting to know your business..." |
| **Knowledge checkpoint** | Knowledge synthesis card appears inline. Editable. |
| **Proposing** | Process-proposal-card appears. Plain language steps. |
| **First work in progress** | "Working on your Henderson quote..." with progress indicator |
| **First output** | Output presented conversationally with approve/edit actions |
| **Session complete** | "Your quoting is set up. I'll have a go at the next one and show you." |

---

## Act 2: First Value — "Let me show you what I can do"

**Human jobs served:** Review (output quality), Delegate (trust calibration), Capture (corrections as teaching)
**Duration:** Day 1-2. Each interaction is 3-10 minutes.
**Outcome:** User has reviewed 1-3 outputs. Self has learned from corrections. Trust is calibrating.

### 2.1 The Morning After

Rob opens Ditto the next day. The Self briefs him:

> **Ditto:** "Morning Rob. Henderson quote from last night — $14,200. I've been thinking about it — the labour might be low for a bathroom. Similar jobs have run 22 hours. Want to bump it up, send as-is, or take a look?"

**Design decisions:**
- The Self **continues the relationship**, not "Welcome back to Ditto!"
- The briefing references **specific work** — not "You have 1 item for review"
- The Self **offers its opinion** with evidence — this is what makes it feel like a colleague

### 2.2 Corrections as Teaching (AI Coaching)

When Rob edits the quote:

> **Rob:** "Bump it to 22 hours."
>
> **Ditto:** "Done — $15,140. Sent to Henderson.
>
> By the way, that's useful — when you tell me the hours are wrong and why, I learn much faster than if you just change the number. Bathrooms clearly need more hours than my estimate. I'll start at 22 for bathrooms from now on."

**This is the AI coaching moment.** Not a tutorial. Not a tooltip. A natural conversational acknowledgment that teaches the user how to give better feedback — embedded in the flow of real work.

**Coaching patterns (woven in, never separate):**

| Moment | What the Self says | What it teaches |
|--------|-------------------|-----------------|
| **After a correction** | "When you tell me *why*, I learn faster" | Explain the reasoning, not just the change |
| **After vague feedback** | "Was it the labour, the pricing, or something else?" | Be specific |
| **After good teaching** | "You've taught me 3 things this week — here's what I know now" | Your effort pays off visibly |
| **After repeated corrections** | "Bathrooms keep running over — should I use 22 hours as the starting point?" | The system proposes rules from patterns |
| **After the user skips explanation** | (Nothing — never nag. Try again next time.) | Respect the user's time |

**Design decisions:**
- Coaching is **brief and natural**. One sentence, never a paragraph.
- Coaching is **intermittent**. Not after every correction — maybe 1 in 3. The Self judges when it's helpful.
- Coaching **celebrates success**. "You've taught me 3 things" is more motivating than "please provide more context."
- Coaching **never blocks work**. The correction is applied immediately. The coaching comment is an aside.
- **If the user ignores coaching, the Self adapts.** Some users will never explain their corrections. The Self learns from the diff anyway — coaching just accelerates it.

### 2.3 The Knowledge Grows (Visible)

After a few interactions, the knowledge synthesis deepens. The user can ask "what do you know about me?" at any time:

```
┌─ What I Know ─────────────────────────────────────┐
│                                                    │
│  Your business                                     │
│  Plumbing, 12 staff, owner-operator               │
│  On sites most of the day. Phone-first.           │
│  ████████████████████ Complete                     │
│                                                    │
│  Your quoting                                      │
│  Materials from Reece + Tradelink. Labour by job   │
│  type. 25% resi / 20% commercial.                 │
│  Bathrooms: 22 hours (learned from Henderson).     │
│  Kitchens: 12 hours. Hot water: 4 hours.          │
│  █████████████████░░░ Good — learning              │
│                                                    │
│  Your preferences                                  │
│  Checks phone early morning and lunch.             │
│  Prefers short messages. Decides fast.             │
│  ████████░░░░░░░░░░░░ Building                     │
│                                                    │
│  [Edit anything]                                   │
└────────────────────────────────────────────────────┘
```

**Design decisions:**
- This is the "battleships grid made visible" (Insight-081) — but shown as natural categories, not a matrix.
- Completeness bars show **how much Ditto knows**. This is the "enough signal" — novel to Ditto.
- "Learned from Henderson" shows **provenance**. The user can see WHERE knowledge came from.
- Everything is **editable**. The user is always the authority.
- Categories emerge from what Ditto actually knows, not from a pre-defined template. If Ditto doesn't know about Rob's competitors, that category doesn't appear (no empty sections).

---

## Act 3: Deepening — "I'm getting better at this"

**Human jobs served:** Define (new processes), Decide (trust changes), Orient (proactive suggestions)
**Duration:** Days 3-14+, woven into normal use. 2-5 minute additions per session.
**Outcome:** User model deepens across all 9 dimensions. 2-3 processes running. Trust earning.

### 3.1 Progressive Deepening (Not Re-Onboarding)

The Self deepens understanding **in the context of real work**, not by scheduling "profiling sessions."

| Trigger | What the Self asks | Which dimension |
|---------|-------------------|-----------------|
| After 3rd quote approved | "You've done 3 quotes. What's your vision — stay at this size, or grow the team?" | Vision |
| After a customer follow-up | "How do you usually handle follow-ups? Text, email, or call?" | Communication preferences |
| After Rob mentions a frustration | "You said you've tried apps before. What went wrong?" | Frustrations |
| After a quiet Monday | "You seem busiest Tuesday-Thursday. Is Monday your planning day?" | Working patterns |
| After 5th quote | "Other trades businesses usually tackle invoicing or scheduling next. What's bugging you most?" | Goals, Coverage |
| After a correction on a commercial job | "Your commercial jobs seem different — different margin, different clients. Tell me more." | Challenges |

**Design decisions:**
- **Never more than one deepening question per session.** These are asides, not interrogations.
- **Always grounded in real work.** "After your 3rd quote" not "Tell me about your 5-year plan."
- **Value exchange is explicit.** The user can see why the question matters: "so I can suggest what to work on next."
- **The user can say "not now" and the Self never re-asks in that session.** It tries again in a future session, perhaps from a different angle.

### 3.2 Proactive Process Suggestions

As the user model deepens, the Self suggests new processes:

> **Ditto (Week 1):** "5 quotes out. You mentioned customers sometimes don't respond. Want me to follow up automatically after 3 days?"
>
> **Rob:** "Yeah, good idea."
>
> [Self creates a follow-up process from the adapted onboarding knowledge — already knows Rob's communication style, customer types]

> **Ditto (Week 3):** "You forward a lot of supplier price change emails. Other trades businesses track those automatically. Interested?"

**Design decisions:**
- Suggestions come from the **9-dimension user model** — not generic recommendations.
- "Other trades businesses" uses **industry knowledge** (APQC patterns) — grounded, not generic.
- Suggestions are **offered, never pushed**. "Not now" is always fine.
- The Self **creates the process from existing knowledge** — it already knows Rob's suppliers, pricing, communication style. The second process creation is faster than the first because the Self already knows the business.

### 3.3 The Workspace Emerges

By Week 2-3, Rob has enough going on that the Self suggests the workspace:

> **Ditto:** "You've got quoting, follow-ups, and supplier tracking running. Want to see everything in one view? Some people find it useful when things get busy."

This is not Act 3's job to design (it's the workspace progressive reveal from the Phase 10 UX spec). But the timing matters: the workspace emerges from the depth of the relationship, not from a feature toggle.

---

## The Onboarding Process YAML (System Process)

The onboarding is a native engine process that the Self adapts at runtime (Insight-091):

```yaml
name: Getting Started
id: onboarding
system: true
version: 1
status: active

description: >
  System process for getting to know a new user. The Self adapts this
  process based on what it learns — adding industry-specific steps,
  removing irrelevant ones, adjusting the depth of each area.

steps:
  - id: gather-basics
    name: Understand the business
    executor: ai-agent
    description: >
      Learn: business type, size, role, daily reality.
      Adapt the remaining steps based on industry.
    config:
      role_contract: cognitive/self.md
      tools: read-only
      model_hint: capable

  - id: identify-first-pain
    name: Find the first thing to help with
    executor: ai-agent
    description: >
      Learn: primary pain point, current process for handling it,
      quality standards, tools/systems involved.
    config:
      role_contract: cognitive/self.md
      tools: read-only
      model_hint: capable

  - id: reflect-understanding
    name: Show what I've learned
    executor: ai-agent
    description: >
      Present knowledge synthesis card. User confirms or corrects.
      Corrections captured as feedback.
    config:
      role_contract: cognitive/self.md

  - id: propose-first-process
    name: Suggest how to help
    executor: ai-agent
    description: >
      Present process-proposal-card for first process.
      User approves, adjusts, or redirects.
    config:
      role_contract: cognitive/self.md

  - id: first-real-work
    name: Try it on something real
    executor: human
    description: >
      User provides real work (forwards an email, describes a job).
      Self creates work item and routes to the new process.
    input_fields:
      - name: first_work_item
        type: text
        label: "Describe or forward a real piece of work"

quality_criteria:
  - User model captures business type, size, and primary pain point
  - First process created from conversation (not a template)
  - First real work item submitted before session ends
  - User confirms knowledge synthesis is accurate

trust:
  initial_tier: supervised
  upgrade_path:
    - after: "10 onboardings at >85% user confirmation rate"
      upgrade_to: spot-checked

feedback:
  metrics:
    - name: first_process_created
      description: Did the onboarding produce a working first process?
      target: ">90%"
    - name: knowledge_accuracy
      description: How often does the user confirm the knowledge synthesis without corrections?
      target: ">80%"
    - name: time_to_first_value
      description: Minutes from first message to first real work item submitted
      target: "<20 minutes"
```

**The Self adapts this at runtime.** After Rob says "plumbing company," the Self might add steps for "gather supplier information" and "understand labour estimation method" between `identify-first-pain` and `reflect-understanding`. The adapted YAML is what actually executes.

---

## AI Coaching — Design Principles

AI coaching is not a feature. It's a **behavioural layer** woven into everything the Self does. It follows these principles:

### 1. Coach Through Work, Not About Work

Bad: "Tip: You can give me more context to improve results!"
Good: "When you told me bathrooms need 22 hours, I updated all future quotes. That kind of correction is gold."

### 2. Show the Return on Teaching

Bad: "Your feedback helps improve the system."
Good: "You've taught me 4 things this week. Here's what I know now: [knowledge card]"

### 3. Never Block, Never Nag

The coaching comment comes AFTER the work is done. Never before. Never as a gate. If the user ignores it three times, the Self stops that coaching pattern and tries a different angle.

### 4. Celebrate Specificity

When the user gives great context unprompted:
> "That's really helpful — knowing it's tight access changes the labour estimate completely. I'll watch for that on future bathroom jobs."

### 5. Adapt to the User's Style

Some users will never explain their corrections. That's fine. The Self learns from diffs anyway. Coaching accelerates learning but isn't required for it.

### 6. Honest About Limitations

> "I'll get the first few wrong — that's how I learn your standards. The more you tell me what's off, the faster I improve."

This sets expectations on day 1 and prevents the "AI is supposed to be perfect" disappointment.

---

## Interaction States

### Conversation Surface During Onboarding

| State | What the user sees |
|-------|-------------------|
| **Brand new** | Full-screen conversation. Ditto speaks first. No chrome, no sidebar, no navigation. |
| **Gathering** | Conversation with adaptive questions. Subtle indicator: "Getting to know your business..." |
| **Knowledge checkpoint** | Knowledge synthesis card appears inline. [This looks right] / [Let me fix something] buttons. |
| **Proposing** | Process-proposal-card appears inline. Plain language steps. [Looks good] / [I'd change something]. |
| **First work — waiting** | "Working on your Henderson quote..." Pulsing indicator. |
| **First work — ready** | Output presented conversationally. Approve/edit/ask actions. |
| **Correction in progress** | Inline editing. Self acknowledges: "Updated." Coaching aside (intermittent). |
| **Session ending** | "Your quoting is set up. I'll have a go at the next one and show you. See you tomorrow." |
| **Returning user** | Self briefs on what happened since last visit. Continues relationship, not "Welcome back!" |
| **Ditto processing** | Typing indicator. Brief context: "Pulling pricing..." |
| **Ditto error** | "I ran into a problem with [specific thing]. Here's what happened: [explanation]. Want me to try again?" |

### Knowledge Synthesis Card

| State | What the user sees |
|-------|-------------------|
| **Emerging (3-4 exchanges)** | Small card, 3-4 lines. "Here's what I'm taking away..." |
| **Growing (5-10 exchanges)** | Larger card, categorised. Completeness bars per area. |
| **Mature (post-first-process)** | Full knowledge view with provenance ("learned from Henderson"). |
| **User editing** | Inline edit mode. Changes saved immediately. Correction captured as feedback. |

---

## Persona Stress Tests

### Rob (Plumber, phone-first, 15 minutes max)

- Opens Ditto at the kitchen table, 7pm
- Conversation takes 12 minutes. First process (quoting) created.
- Forwards Henderson email. Quote drafted by end of session.
- Next morning, approves from phone in 2 minutes.
- **Pass:** Value in first session. Phone review works. Under 15 minutes.

### Libby (Doula, building phase, needs brand guidance)

- Opens Ditto on her laptop, afternoon
- Conversation takes 18 minutes. Different path — brand voice, ideal client, content strategy.
- First process: social media content testing (5 posts to test resonance).
- Self asks about tone: "warm, empathetic, direct — not clinical, not woo-woo."
- Knowledge synthesis shows her brand taking shape — THIS is the visible value.
- **Pass:** Value is the knowledge synthesis itself, not just the first output.

### Jordan (Ops Director, wants to prove value in 48 hours)

- Opens Ditto at the office, between meetings
- Conversation takes 10 minutes. Very directed: "I need reference checking for HR."
- First process created quickly — Jordan knows exactly what they want.
- Self adapts: skips broad business questions, goes straight to process definition.
- **Pass:** Speed-to-first-process for users who know what they want.

### Nadia (Team Lead, needs team oversight)

- Opens Ditto, wants to set up quality processes for her team
- Conversation takes 15 minutes. Self learns about team structure, quality concerns.
- First process: Chen's report formatting (the one she checks most).
- Self asks about quality bar — "what does a good report look like?"
- **Pass:** Single process for one team member. Team management grows later.

---

## Patterns Adopted

| Pattern | Source | How applied |
|---------|--------|-------------|
| Speed-to-first-value | Twin AI | First process created within one session |
| Knowledge-first (ingest existing content) | Intercom Fin | "Forward me the email" — real data from minute one |
| Progressive profiling (value exchange) | HubSpot/Typeform | Every question has visible payoff |
| Assess through doing | Duolingo | Quality standards emerge from corrections, not self-reporting |
| White-glove coaching with real data | Superhuman | Self is the onboarding specialist, using real work |
| Discovery as deliverable | Consulting | Knowledge synthesis card IS value |
| SPIN conversation arc | Rackham | Situation → Problem → Implication → Need-payoff |
| Stories reveal process | JTBD (Moesta) | "Tell me about the last quote" > "how does quoting work?" |
| Process adapts at runtime | Insight-091 | Self adapts onboarding YAML mid-flight |
| Three-phase conversation | Insight-079 | Gathering → Proposing → Working through it |
| Artefact-primary | Insight-080 | Knowledge synthesis is the primary surface |

## Original to Ditto

| Pattern | What's new |
|---------|-----------|
| **Knowledge completeness visible** | No product shows users how much the AI knows and what's missing |
| **AI collaboration coaching embedded in workflow** | No product actively teaches users to be better AI collaborators through the flow of real work |
| **Process adapts at runtime from conversation** | No product lets the AI modify the process definition based on what it learns during execution |
| **Onboarding as a governed system process** | No product runs onboarding through the same trust/feedback/quality pipeline as user processes |

---

## Reference Docs Status

- **`docs/personas.md`** — checked. All 4 personas stress-tested above. No drift.
- **`docs/human-layer.md`** — checked. Conversation Thread primitive used. Knowledge synthesis card extends the component catalog. Progressive disclosure (boiling frog) applied throughout.
- **Insights 074, 079, 080, 081, 088, 089** — all applied and referenced.
- **`docs/research/onboarding-intake-coaching-patterns.md`** — consumed. All 14 patterns evaluated.
- **`docs/research/phase-10-mvp-dashboard-ux.md`** — checked. Onboarding states in section 1.5 are consistent with this spec. This spec extends them with deeper detail.

Reference docs checked: no drift found.
