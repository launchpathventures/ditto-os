# Insight-142: The Coverage Agent — Proactive Gap Detection as a Living Meta-Process

**Date:** 2026-04-02
**Trigger:** Strategic conversation comparing OpenClaw/clawchief to Ditto. Key insight: "We need an agent that is constantly thinking about what should be in place for the user and making suggestions. The Self then surfaces, clarifies and that gets put in place." The power of OpenClaw is that the claw thinks and you can add skills. Ditto adds structure, guidance, and leverage — for non-technical people who want to be guided and supported to achieve their dreams.
**Layers affected:** L1 Process (process model adoption), L2 Agent (new system agent: coverage-agent), L3 Harness (coverage suggestions governed like any output), L4 Awareness (cross-process gap detection), L5 Learning (coverage knowledge evolves from use), L6 Human (Self surfaces suggestions in conversation and briefings)
**Status:** active

## The Core Tension

**OpenClaw** is powerful because the claw *thinks* — it has skills, memory, heartbeat, and agency. But it requires a developer to assemble. The skills are markdown files. The memory is handcrafted context. The cron jobs are manual configuration. It works brilliantly for Ryan Carson because he's technical. It doesn't work for Rob the plumber, Lisa the ecommerce founder, or Nadia the team manager.

**Ditto's promise** is to deliver the same power — a system that thinks, suggests, acts, and learns — but accessible to people who will never write a SKILL.md file or configure a cron job. The harness is the product. The structure is the value. The guidance is the differentiator.

The gap: Ditto has the infrastructure (processes, trust, harness, memory, Self) but doesn't yet have an agent that **proactively thinks about what the user needs**. The improvement-scanner looks inward (how to make existing processes better). The process-discoverer looks at data (what patterns exist in connected systems). Neither asks the fundamental EA question:

> "Given what I know about this person, their business, their stage, and the world — what should they have in place that they don't?"

A great EA doesn't wait for instructions. They anticipate. They know your business well enough to see the gaps you can't see because you're too busy living them. They say: "I noticed you're still manually following up on quotes. That's usually the biggest revenue leak for trades businesses at your stage. Want me to handle that?"

## The Insight: Coverage Agent as the 12th System Agent

The coverage agent is a new system agent — the outward-looking complement to improvement-scanner:

| Agent | Direction | Question |
|---|---|---|
| **improvement-scanner** | Inward | "How can we make what exists better?" |
| **coverage-agent** | Outward | "What doesn't exist yet that should?" |

Together they form a complete picture: improve what's running + suggest what's missing. Both feed the Self, which surfaces suggestions to the human with the right timing, tone, and context.

### What the Coverage Agent Does

It runs as a scheduled meta-process (eating its own cooking — using the scheduler we just built). On each heartbeat:

**1. Reads the user model**
- Business type, industry, stage, team size
- Goals they've stated (work items with type: goal)
- Pain points they've mentioned (captured in Self-scoped memory)
- What processes are already running and their health

**2. Consults the knowledge base**
- Process Model Library (Insight-099): what businesses like this typically have in place
- Standards Library (ADR-019): what quality baselines exist for processes they're running
- Industry patterns (already in `industry-patterns.ts`): APQC-level process maps
- Connected data signals: email patterns, calendar gaps, manual repetition indicators

**3. Reasons about gaps**
Not a checklist comparison. Genuine reasoning:
- "Rob has quoting running at spot-checked trust. His quotes reference supplier prices. But he has no process for keeping supplier prices current. When prices change, his quotes will be wrong. This is a dependency gap."
- "Lisa has content review running. She's producing 15 product descriptions a week. But she has no distribution process — the descriptions are piling up without being published. This is a bottleneck gap."
- "Jordan has 4 departmental processes running. None of them have a reporting process that feeds the leadership meeting he mentioned as important. This is a visibility gap."

**4. Produces prioritised suggestions (max 1-2)**
Not a laundry list. One or two highest-impact suggestions with:
- What the gap is (specific, not generic)
- Why it matters for THIS person (tied to their goals, their business, their stage)
- What the path looks like ("I can set this up for you in about 5 minutes")
- How confident it is (high: industry standard, clear need; medium: inferred from patterns; low: speculative)
- A ready-to-adopt Process Model if one exists

### What the Coverage Agent Does NOT Do

- It does not act. It suggests. The Self surfaces. The human decides.
- It does not overwhelm. Maximum 1-2 suggestions per cycle. Frequency control matters — a suggestion every morning brief is useful; a suggestion every hour is nagging.
- It does not repeat. Dismissed suggestions stay dismissed (tracked in memory). It learns from rejection: "Rob dismissed the scheduling suggestion twice — he might have a system I don't know about. Ask once, then stop."
- It does not need all data. It works on day one with just the user model (business type + stage). Connected data makes it smarter over time, but it starts useful.

### How the Self Surfaces Coverage Suggestions

The coverage agent produces structured suggestions. The Self weaves them into natural interaction:

**In the morning brief (Today composition):**
> "Everything's running smoothly. One thought: you mentioned wanting to respond to customer enquiries faster. Right now quotes go out within a day, but initial acknowledgments are still manual. A simple auto-acknowledgment process could buy you goodwill while the full quote is being prepared. Want to explore it?"

**In conversation, when contextually relevant:**
> User: "I keep forgetting to follow up on quotes"
> Self: "That's a common pain point. I can set up follow-up tracking — it watches for quotes that haven't gotten a response after 3 days and drafts a follow-up for your approval. Want me to?"

**After a milestone (process reaches spot-checked trust):**
> "Your quoting process is running well — 92% approval rate over 30 runs. That usually means you're ready for the next piece: quote follow-ups. Most trades businesses see a 15% revenue increase just from systematic follow-up. Want to see how it works?"

The key: **the Self is the voice, not the coverage agent.** The coverage agent is the thinking; the Self is the communication. The human never knows or cares that a separate agent reasoned about coverage. They just experience a Self that knows their business and proactively helps.

### The Seed Is Knowledge, Not a List

The coverage agent does NOT work from a hardcoded checklist ("Step 1: Set up email. Step 2: Set up calendar."). It works from:

**1. Process Model Library (Insight-099)**
Pre-built, battle-tested process definitions organized by business type and function. "Trades businesses typically need: quoting, invoicing, follow-ups, job scheduling, compliance tracking, supplier management." These are not instructions — they are the agent's domain expertise.

**2. Standards Library (ADR-019)**
Quality baselines that tell the agent what "good" looks like at each stage. "A quoting process at Rob's stage should be achieving 85% accuracy by run 20. His is at 92% — he's ahead. Time to suggest the next thing."

**3. Industry patterns (existing)**
APQC-level process maps already in `industry-patterns.ts`. The coverage agent consults these the way a management consultant consults industry benchmarks.

**4. Accumulated user context**
Every conversation, every correction, every goal stated, every pain point mentioned. The Self-scoped memory (ADR-016) is the coverage agent's primary input. The more the user talks to the Self, the smarter the coverage agent gets.

**5. Connected data (when available)**
Email patterns, calendar structure, financial data. The Analyze mode (architecture.md) feeds the coverage agent with evidence: "Your email shows 15 supplier conversations per week that follow a negotiation pattern — this could be a sourcing process."

The agent reasons FROM these sources. It generates suggestions dynamically for each user. A plumber in Auckland gets different suggestions than an ecommerce founder in London, even if they're both at the same business stage. The knowledge is the seed. The list is emergent.

## The Emotional Promise

This is what separates Ditto from every other AI tool. Not "here's a chat interface, figure out what to ask." Not "here's a template marketplace, pick what you want." But:

> "I know your business. I know what you're trying to achieve. I know what's working and what's missing. I'm always thinking about what you need next — and when the time is right, I'll suggest it in a way that makes sense. You don't need to know what processes to build. You don't need to know what's possible. You just need to trust that I'm watching, thinking, and ready to help when you are."

This is the emotional journey from personas.md accelerated. Week 1 isn't "cautious hope" — it's "this thing already knows what I need." Month 2 isn't "what else can this handle?" — it's "it already suggested the next thing and it was exactly right."

**For Rob:** He sets up quoting. Two weeks later, the Self says "I notice you're losing quotes because you're not following up fast enough. Want me to handle that?" Rob didn't know that was a solvable problem. Now it is.

**For Lisa:** She sets up content review. A month later, the Self says "Your competitor just dropped prices on 3 products you both carry. Your pricing monitoring process would catch this automatically. Want me to set it up?" Lisa was going to discover this from a customer complaint next week. Now she's ahead.

**For Jordan:** He sets up HR reference checking. The Self says "That's working well. The finance team's reconciliation problem you mentioned in week one — I have a process model for that. Want to look at it in your next leadership meeting?" Jordan gets to be the hero who keeps delivering.

**For Nadia:** Her team's report formatting is running. The Self says "I notice three of your analysts are spending time gathering the same data from different sources before they can start their analysis. A data prep process could save each of them 2 hours a week. Want me to propose it to you?" Nadia didn't see the pattern across her team. The system did.

## The Ditto Difference (vs OpenClaw)

| | OpenClaw + clawchief | Ditto |
|---|---|---|
| **Who can use it** | Developers who can write SKILL.md files and configure cron | Anyone who can describe their business in conversation |
| **How skills are added** | Manual: write markdown, copy to ~/.openclaw/skills/ | Automatic: coverage agent suggests, Self guides adoption, Process Models provide the template |
| **How gaps are detected** | Manual: user has to know what they need | Proactive: coverage agent reasons about gaps from industry knowledge + user context |
| **How it learns** | Memory files updated manually | Self-scoped memory + correction patterns + standards evolution — all automatic |
| **How it improves** | User rewrites prompts | Learning loop refines process definitions, coverage agent adjusts suggestions based on what worked |
| **How it scales** | One person at a time, each assembling their own config | Community intelligence: corrections from 500 users improve the Process Model everyone starts from |
| **Trust model** | Implicit: you trust it or you don't | Progressive: supervised → spot-checked → autonomous, per process, with visible evidence |

OpenClaw proves the pattern works. Ditto makes the pattern accessible, governed, and learning. The coverage agent is the bridge: it delivers the "thinking EA" experience without requiring the user to know what to ask for.

## Architectural Placement

### System Agent Definition

```
Agent: coverage-agent
Purpose: Proactively identify process coverage gaps for the user
Earns trust in: Suggestion acceptance rate, suggestion relevance quality
Inputs: user model, running processes, process model library, standards library, industry patterns, connected data signals
Outputs: prioritized coverage suggestions (CoverageSuggestion[])
Schedule: runs on heartbeat (daily default, configurable)
Trust tier: starts supervised (suggestions always surfaced for human decision)
```

### Meta-Process Placement (ADR-015)

The coverage agent belongs to a **fifth meta-process**: **Proactive Guidance**. The existing four are:
1. Goal Framing (intake → routing → orchestration)
2. Build (process creation and evolution)
3. Feedback & Evolution (improvement-scanner, inward)
4. Operational Intelligence (monitoring, governance)

**Proactive Guidance** is the outward-looking complement:
- Coverage agent: what should exist that doesn't?
- Process-discoverer: what exists in the data that could become a process?
- Onboarding-guide: how do we get the user started?

These three agents share a common purpose: **helping the user discover and adopt processes they didn't know they needed.**

### Self Integration

The Self already has `suggest_next` as a tool. Coverage suggestions flow through the same channel:
- Coverage agent produces `CoverageSuggestion` objects
- `suggest_next` checks coverage suggestions alongside its existing logic
- Self weaves the highest-priority suggestion into conversation or briefing
- When the user accepts, Self uses `generate_process` (or Process Model adoption flow) to set it up

### Frequency and Tone Control

- **Frequency:** Max 1-2 suggestions per daily brief cycle. The coverage agent runs daily but may produce zero suggestions if nothing new is relevant.
- **Dismissal memory:** Dismissed suggestions tracked in Self-scoped memory with reason (if given). Same suggestion not resurfaced for 30 days.
- **Stage awareness:** New users (week 1) get zero coverage suggestions — let them settle into their first process. Week 2-3: first suggestion, gentle. Month 2+: full coverage agent active.
- **Capacity awareness:** If the user has 3 processes in supervised tier (heavy review load), don't suggest a 4th. Wait until at least one reaches spot-checked.
- **Tone:** Always offered, never demanded. "I noticed..." not "You should..." Curious, not prescriptive.

## The Living Library: Three Hunting Mechanisms

The Process Model Library is NOT a static catalogue. It actively hunts for new processes through three mechanisms, all of which are meta-processes running through the same harness:

### 1. Inward Hunting — From the User's Own Data

The `process-discoverer` system agent (ADR-008) connects to the user's systems — Gmail, Calendar, Sheets, CRM — and finds patterns:

- "You have a recurring email thread with 6 suppliers every month that follows a negotiation pattern. This could be a sourcing process."
- "Your calendar shows a weekly team standup but no process captures the action items. Want me to track those?"
- "You've sent 14 follow-up emails manually this month. That's a process waiting to be born."

This is Analyze mode (architecture.md) applied continuously. The org's data already encodes its processes — the discoverer surfaces them.

### 2. Outward Hunting — From the World

When the coverage agent identifies a gap or the learning loop proposes an improvement, it should research what's current. Not "what do we already know about follow-up processes" but "what are the best practices for follow-up in trades businesses RIGHT NOW."

This is the Dev Researcher pattern applied at runtime — Insight-078's core point: **scout the gold standard before proposing.** The outward hunt keeps the library current with evolving best practices, new tools, and emerging patterns. A library that stopped learning in 2026 is stale by 2027.

### 3. Cross-Instance Hunting — From Community Intelligence

When 500 users are running quoting processes and 80% of them add a "check competitor pricing" step that didn't exist in the original model, the model absorbs it. When users in a new industry (say, veterinary clinics) collectively define processes that don't exist in the library yet, those become new industry patterns.

The library evolves not because someone edited a YAML file but because the evidence is overwhelming:
- **Correction convergence:** Same correction across many users → the standard absorbs it
- **Structural emergence:** Many users adding the same step → the model adds it
- **Industry expansion:** Users from unrecognised industries → new industry profiles emerge from their data
- **Template evolution:** Community-proven refinements flow back to canonical models

### The Compound Effect

The three hunting mechanisms feed each other:

```
Inward hunting → discovers a user's actual process
  → if it matches a model, suggest adoption with bindings
  → if it's novel, propose as a new model candidate

Outward hunting → finds a new best practice
  → updates existing models with the latest approach
  → surfaces to coverage agent: "there's a new approach to X"

Cross-instance → aggregates corrections across users
  → refines model quality baselines (ADR-019)
  → expands industry pattern coverage
  → all users benefit from each user's corrections
```

**The shelf restocks itself.** The coverage agent doesn't suggest from a static list — it suggests from a living body of knowledge that is continuously updated by all three hunting processes. This is what makes Ditto's guidance compound over time rather than decay.

## Implications

1. **Coverage agent is the 12th system agent** (ADR-008 currently defines 11). It needs to be added to the system agent registry.
2. **Process Model Library is the coverage agent's primary knowledge source.** Without models, the agent can only make generic suggestions. With models, it can say "here's exactly how follow-up tracking works for trades businesses — want me to set it up?"
3. **The adoption flow is the critical UX.** The coverage agent's suggestions are only as good as the path from "yes" to "running." Process Model adoption (Insight-099) is that path: bind apps → activate → first run.
4. **suggest_next becomes the unified suggestion surface.** It already exists. Coverage suggestions flow through it. The Self doesn't need a new tool — it needs richer input.
5. **Standards Library provides baselines for "when to suggest."** Not just "what's missing" but "when is the user ready for the next thing." Trust data + standards baselines = timing intelligence.
6. **This is what makes Ditto feel alive.** Not the scheduler, not the trust tiers, not the harness pipeline. The moment the Self says "I've been thinking about your business, and I think you need this" — that's when Ditto stops being a tool and becomes a partner.

## Connection to the Emotional Journey

From personas.md:

> **Week 1 — Cautious Hope:** "Let's see if this is different."

With the coverage agent, Week 1 is still about the first process. But the Self already knows, from the onboarding conversation, what the SECOND process should be. It's watching. Waiting. Not suggesting yet — the user isn't ready. But it's thinking.

> **Week 2-3 — Building Confidence:** "It's getting things right."

The first suggestion lands. "I noticed you're still manually following up on quotes. Want me to handle that?" The user thinks: "How did it know?" It knew because the coverage agent reasoned about trades businesses + quoting process health + missing follow-up process. But the user just feels: understood.

> **Month 1 — Trust Forming:** "I don't need to check everything."

The first process hits spot-checked trust. The coverage agent notes this and suggests the next highest-impact gap. The suggestion comes with a Process Model — not "here's an idea" but "here's exactly how this works, pre-built, ready to adopt. Which email do you use?"

> **Month 2 — Expansion:** "What else can this handle?"

The user doesn't even ask this. The Self has already been guiding them. Three processes running. The morning brief shows health across all three. The coverage agent suggests a fourth — and the user says "yes" without hesitation because the last three suggestions were exactly right.

> **Month 3+ — The Compound Effect:** "I've got my time back."

The coverage agent shifts from suggesting new processes to suggesting optimizations: "Your invoicing process could integrate with your quoting process — when a quote is approved and the job is done, the invoice could be auto-generated." The user's business is becoming a system. Not because they designed it — because the coverage agent guided them there, one suggestion at a time.

**This is Ditto's north star.** Not infrastructure. Not dashboards. Not process definitions. A system that knows you, thinks for you, and guides you — from wherever you are to wherever you're capable of going.

## Where It Should Land

- **ADR-008** — add coverage-agent as 12th system agent
- **ADR-015** — add "Proactive Guidance" as 5th meta-process (coverage-agent + process-discoverer + onboarding-guide)
- **architecture.md** — coverage agent in system agent table, proactive guidance in meta-process table
- **suggest_next tool** — extend to consume coverage suggestions as input
- **Roadmap** — coverage agent activation as a key Phase 11+ milestone
- **Process Model Library brief** — the coverage agent's effectiveness depends on having models to suggest. Models are the knowledge; the agent is the reasoning.
