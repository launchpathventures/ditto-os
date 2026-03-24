# UX Research: Real-World Persona Stress Test

**Date:** 2026-03-24
**Role:** Dev Designer
**Status:** Draft v1
**Triggered by:** Testing the framework against real users (Libby, Tim) who don't fit the original four personas
**Consumers:** Dev Architect, Design system evolution, Roadmap

---

## Why This Matters

The original four personas (Rob, Lisa, Jordan, Nadia) are small business operators running established operations. Libby and Tim surface patterns the framework hasn't been tested against:

1. **Multi-context lives** — not one business, but multiple workspaces (business + parenting + passion projects)
2. **Building-phase users** — not running operations, but creating from scratch (vision, brand, knowledge, audience)
3. **Knowledge accumulation as the core need** — the AI needs to learn and retain, not just execute
4. **Life management alongside business** — Ditto as a life workspace, not just a business tool
5. **Multiple independent knowledge bases** — Tim's clients each have their own context, brand, and rules

These aren't edge cases. These might be the *primary* use case for solo operators and freelancers.

---

## Persona: Libby — Doula Building an Online Education Business

### Who She Is
- Doula by training, transitioning to online education and coaching
- In the learning/visioning phase — not yet operational
- Completing courses, defining her ideal client persona, preparing to test market interest
- A mum managing family alongside business creation
- Frustrated with AI because she doesn't know how to build up context over time

### What She Needs From Ditto

**Business workspace:**
- Help crystallising her vision, persona, and brand voice
- Social media content that's on-brand (she needs the AI to *learn* her voice)
- Landing page copy that matches her positioning
- Survey design and feedback synthesis
- Knowledge capture — everything she learns feeds the system
- Eventually: course creation, coaching workflows, CRM, website

**Life workspace:**
- Parenting advice and resources
- Meal planning and grocery lists
- Relationship coaching and planning
- Life admin

### Libby's First Conversation

> Self: "Hi, I'm your Self — think of me as a colleague who'll learn how your world works and help you run it. What brings you here?"
>
> Libby: "I'm a doula and I'm trying to launch an online education business, but I'm also a mum and everything's scattered. I'm using ChatGPT but every conversation starts from scratch."
>
> Self: "That's exactly the problem I'm built to solve. Nothing we talk about gets lost — I learn and remember. Let's start with whatever's most on your mind right now. Is it the business or the home side?"
>
> Libby: "The business. I'm trying to figure out my ideal client and my brand voice but it's all in my head."
>
> Self: "Perfect place to start. Tell me about your ideal client — who are you trying to help? Even rough thoughts are fine, I'll help you shape it."

**What happens invisibly:**
- The Self creates a user model: doula, building education business, early-stage, mum
- The Self recognises this is a *building* phase, not an *operating* phase — the patterns it offers will be different
- The knowledge Libby shares (persona thinking, brand ideas, course notes) gets captured as workspace knowledge — it persists and enriches future interactions
- No process is created yet. The Self is in *exploration and capture* mode, not *execution* mode

### Libby's Week 1

Monday — Libby talks to the Self about her ideal client. The Self asks probing questions ("What age range? What's their biggest fear? What have they tried before?"). By the end, the Self has a draft persona doc. Libby says "that's pretty close but more empathetic." The Self adjusts and remembers the voice preference.

Wednesday — Libby forwards survey responses from friends. The Self synthesises: "Three themes: they want practical not theoretical, they're nervous about being judged, and they want community not just content." Libby says "yes, exactly." Knowledge captured.

Friday — Libby asks for Instagram post ideas that test market interest. The Self drafts 5 posts using the persona, the survey themes, and the voice Libby has been developing. Libby edits 2 ("too clinical, make it warmer"). The Self learns.

**What Libby never sees:** A process definition, a YAML file, a workflow, a trust tier. She's having conversations that build knowledge. The system is accumulating context that makes every future interaction better.

### Libby's Month 2

The Self now knows: Libby's ideal client persona, her brand voice (warm, empathetic, practical), her course outline (emerging), her social media cadence (3x/week Instagram, 1x/week email), her survey findings, her competitive positioning.

> Self: "Morning Libby. Your Instagram engagement is picking up — the 'nervous about being judged' post had 3x your average reach. Want to lean into that theme this week? I've drafted 3 posts. Also, your landing page waitlist hit 50 — that's the threshold you mentioned for feeling ready to build the course outline. Want to start on that?"

This is the Self *proactively managing attention* — but for a building-phase user, not an operations user. The proactive dimensions still work:
- **Focus:** "Landing page hit 50 — ready for the next step"
- **Attention:** "Survey responses you haven't processed yet"
- **Opportunities:** "The 'judged' theme is resonating — lean in"
- **Coverage:** "You've got brand voice and persona defined, but no content calendar yet"
- **Upcoming:** "You said you wanted to launch by May — here's what's left"

### Libby's "Other" Workspace — Family

Libby also uses Ditto for family management. This is a separate context:

> Libby: "What's for dinner this week? I need to do a shop."
>
> Self: "Based on what you've liked before and what's quick for a weeknight: [5 meals]. Want me to make the grocery list? I can organise by aisle if that's easier."

The Self knows Libby's family context: kids' ages, dietary preferences, meal preferences she's expressed, shopping patterns.

**Critical design question: How does this coexist with the business workspace?**

---

## Persona: Tim — Fractional CTO + Dad + Micro-School Founder

### Who He Is
- Provides fractional CTO services to multiple clients
- Each client has: their own tech stack, their own team, their own brand voice, their own priorities
- A dad who needs family support
- Passionate about homeschooling, building a micro-school for his community
- Manages context-switching as his core cognitive challenge

### What He Needs From Ditto

**Client workspaces (3-5 separate contexts):**
- Client A: Startup, moving fast, needs architecture decisions, code reviews, team mentoring
- Client B: Enterprise, compliance-heavy, needs governance documentation, risk assessment
- Client C: Agency, creative, needs tech stack recommendations, build/buy decisions
- Each client has its own knowledge base, its own brand/tone, its own processes
- Tim needs to switch between them cleanly without bleed

**Life workspace:**
- Parenting coordination
- Family scheduling
- Coaching and personal development

**Micro-school workspace:**
- Curriculum planning
- Community coordination
- Regulatory requirements
- Teacher/mentor coordination

### Tim's Morning

> Self: "Morning Tim. Across your world:
>
> **Client A (Startup):** Architecture review ready. They pushed the auth PR last night — pre-reviewed, one concern flagged about session handling. 15 minutes.
>
> **Client B (Enterprise):** Compliance doc draft ready for your review. Legal wants it by Thursday.
>
> **Micro-school:** Two parents confirmed for the Tuesday visit. You haven't sent them the info pack yet.
>
> **Home:** It's a school holiday next Monday — no childcare. Might affect your Client A commitment.
>
> Want to start with the architecture review, or something else?"

Tim sees a **unified morning briefing across all his contexts**. The Self knows which workspace each item belongs to and presents them in a prioritised, cross-cutting view.

### Tim's Context Switching

When Tim works on Client A, the Self operates in Client A's context:
- Uses Client A's tech terminology
- References Client A's architecture decisions
- Knows Client A's team members
- Produces outputs in Client A's brand voice

When Tim switches to the micro-school, the Self shifts:
- Uses education terminology
- References curriculum frameworks
- Knows the parent community
- Different tone, different knowledge

**This is not a different Self.** It's the same Self with different active context — like a consultant who works across clients.

---

## What the Framework Handles Well

### 1. Conversation-first works perfectly for both
Libby and Tim don't want dashboards or process builders. They want to talk. The conversation-first model (Insight-075) is even more important for them than for Rob, because:
- Libby is in a creative/building phase — conversation IS the work
- Tim switches contexts constantly — conversation is faster than navigating between views

### 2. The Self as guide (Insight-074) is essential
Libby's core frustration ("I don't know what the AI needs to know") is solved by the Self proactively asking and guiding. The Self doesn't wait for Libby to structure her knowledge — it asks, captures, synthesises, and builds up understanding.

### 3. Knowledge accumulation is already in the architecture
Memory (ADR-003) with agent-scoped, process-scoped, and self-scoped memory supports this. The Self's accumulated understanding of Libby's brand voice, persona, and business is exactly what self-scoped memory is for.

### 4. Progressive reveal still works
Libby week 1: just conversation. Libby month 3: maybe a content calendar view, a knowledge dashboard, a brand guide. The workspace surfaces earn their place as complexity grows.

### 5. Proactive attention management transfers
The five dimensions (Focus, Attention, Opportunities, Coverage, Upcoming) work for building-phase users too — they just surface different content.

---

## What the Framework Doesn't Handle (Design Gaps)

### GAP 1: Workspaces / Contexts

**The current design assumes one workspace per user.** Rob has one business. Lisa has one business. The sidebar shows "My Work" and "Recurring" as flat lists.

Libby has: Business + Family.
Tim has: Client A + Client B + Client C + Family + Micro-school.

**What's needed:**
- A concept of **workspace** or **context** that separates knowledge, processes, and outputs
- The Self operates across all workspaces but activates the right context
- The sidebar needs a workspace switcher or grouping
- The morning briefing crosses workspaces (unified view) but each item is tagged to its context
- Outputs (social media posts, architecture docs, grocery lists) use the right knowledge/voice per workspace

**Design question:** Is a workspace a top-level navigation element (tab bar, switcher)? Or is it invisible — the Self just knows which context you're in? Or both?

**Cockpit reference:** Cockpit 2 has a "YES GROUP" selector at the top — switching between portfolio groups. This is the closest pattern. A workspace selector in the header, with the Self and feed adapting to the active workspace. Plus a "unified" view that crosses all workspaces for the morning brief.

**Proposed interaction:**
```
┌──────────────────────────────────────────────┐
│ Ditto    [All] [Business] [Family]     Tim ▾ │
│                                              │
│ (content adapts to selected workspace)       │
└──────────────────────────────────────────────┘
```
Or for Tim:
```
┌──────────────────────────────────────────────────┐
│ Ditto  [All] [Client A] [Client B] [School] [Home]│
└──────────────────────────────────────────────────┘
```

"All" is the default — the unified morning brief. Selecting a workspace filters the sidebar, feed, and Self context.

### GAP 2: Building Phase vs Operating Phase

**The current design optimises for operations:** review outputs, approve, adjust, trust calibration. But Libby isn't operating — she's *building*. She needs:

- **Knowledge capture and synthesis** — not process execution
- **Brand/voice/persona development** — iterative, conversational, not output-review
- **Strategic thinking support** — "What should I focus on?" is not operational triage
- **Research and learning support** — the Self helps her make sense of what she's learning

**What's needed:**
- The Self recognises the user's *phase* (building vs. operating) and adapts its behaviour
- Building-phase users get: capture prompts, synthesis, "here's what you've told me so far", knowledge dashboard
- Operating-phase users get: review queue, trust calibration, process health
- Users transition between phases — Libby's social media goes from "building voice" to "running a content process"

**Design question:** Is phase an explicit thing the user sets? Or does the Self infer it from the nature of the work?

**Proposed:** The Self infers. If most interactions are conversational knowledge-building (no processes running, no outputs to review), the Self operates in building mode. As processes emerge from conversation, the Self naturally transitions to operating mode. No explicit toggle.

### GAP 3: Knowledge Dashboard

**Libby's frustration is she doesn't know what the AI knows.** The current design has no way to see accumulated knowledge — it's invisible in memory.

**What's needed:**
- A "What I know about you" view — the Self's accumulated understanding, visible and editable
- Organised by workspace: "Your business: brand voice (warm, empathetic, practical), ideal client (women 30-45...), competitive positioning..."
- The user can correct, add, or remove knowledge
- This is the Capability Catalog idea (human-layer.md) but for *user knowledge*, not *process capabilities*

**Design question:** Is this a full view/page? Or is it conversational? ("Self, what do you know about my brand voice?" → Self summarises, user corrects inline)

**Proposed:** Both. Conversational is the default path ("What do you know about my brand?"). But a "What I Know" section in settings or process detail gives the user the full picture when they want to audit.

### GAP 4: Multi-Brand / Multi-Voice Outputs

Tim needs outputs in different brand voices:
- Client A: technical, direct, startup-casual
- Client B: formal, compliance-aware, enterprise
- Micro-school: warm, educational, community-focused

Libby needs outputs in her developing brand voice, which is different from her family context voice.

**What's needed:**
- Per-workspace voice/style profiles that govern output generation
- The Self applies the right voice when producing content for a given workspace
- Voice profiles are learned from corrections (like Rob's labour corrections, but for tone)

**This is partially covered by process-level memory**, but it needs to be elevated to workspace-level. A workspace isn't just processes — it's an identity with voice, knowledge, and rules.

### GAP 5: Life Management as a First-Class Use Case

Both Libby and Tim use Ditto for personal life management (meal planning, parenting, scheduling). The current design positions Ditto as a business tool. But for solo operators, the boundary between business and life is blurred.

**What's needed:**
- Life workspaces are not second-class. They get the same Self, the same memory, the same proactive attention.
- But the *tone* adapts. The Self as business colleague vs. the Self as life companion.
- The unified morning brief weaves both: "Client A review is ready. Also, it's a school holiday Monday — you might want to plan for that."

**Design question:** Does Ditto market itself as a "life + work" platform? Or is life management an emergent use case that the architecture supports but doesn't lead with?

**Proposed for now:** The architecture supports it. Marketing leads with business. Life management emerges naturally because the workspace model is domain-agnostic.

---

## What Changes in the UI

### Sidebar Evolution

Current (Rob):
```
My Work
  Henderson quote ●
  CRM research
Recurring
  Quoting ✓
  Follow-ups ✓
```

Libby:
```
[All] [Business ▾] [Family]

Business
  My Work
    Brand voice draft
    Survey responses ●
  Running
    Social media content ✓
    Landing page waitlist

Family
  This Week
    Meal plan ●
    Grocery list
```

Tim:
```
[All] [Client A ▾] [Client B] [School] [Home]

Client A — Startup
  My Work
    Auth architecture review ●
    Sprint planning
  Running
    Feature pipeline ✓
    Code review ✓
```

### Workspace Switcher

A horizontal tab bar or pill selector in the header. "All" shows the unified view. Selecting a workspace filters everything. The Self adapts context.

### Morning Brief Evolution

The unified brief crosses workspaces, clearly tagged:

> "Morning Tim. Across your world:
>
> **Client A:** Auth PR ready for review. Pre-reviewed, one concern. [15 min]
> **Client B:** Compliance doc ready. Legal wants it Thursday.
> **Micro-school:** Two parents confirmed Tuesday. Info pack not sent yet.
> **Home:** School holiday Monday — no childcare.
>
> My suggestion: Start with the auth review (blocking someone), then the compliance doc. I'll draft the school info pack and send it to you for a quick check."

### Knowledge View

A new view (or section within settings) showing "What I Know":

```
Business — Doula Education
├── Brand Voice: warm, empathetic, practical, not clinical
├── Ideal Client: women 30-45, first pregnancy, anxious about birth...
├── Competitive Position: combines clinical knowledge with emotional support
├── Content Themes: "you're not being judged", practical tools, community
├── Course Outline: [draft, 6 modules...]
└── Feedback Synthesis: [3 survey rounds, key themes...]

Family
├── Dietary: no dairy for Mia, Tim prefers high-protein
├── Routines: school drop-off 8:30, pickup 3:15
└── Preferences: quick weeknight meals, batch cook Sundays
```

Each item is clickable → shows the evidence (which conversations built this knowledge) and is editable.

---

## New Persona Profiles

### Persona 5: Libby — Solo Operator Building a New Business

**Role:** Doula transitioning to online education and coaching. Mum. In the visioning/building phase — not yet operational.

**Core problem:** She's drowning in scattered thinking. Every AI conversation starts fresh. She doesn't know how to build up context so the AI can truly help. She's simultaneously building a business and managing a family, and needs one place that holds all of it.

**What Ditto gives Libby:** A single colleague who learns everything — her vision, her voice, her clients, her family's needs. The Self captures knowledge from every conversation and uses it to make the next interaction better. Libby never has to say "as I mentioned before" — the Self already knows.

**One process must be valuable:** Libby's first process is social media content. The Self knows her voice and persona and drafts on-brand posts. She edits, the Self learns. That one process — just content — frees up 5 hours a week.

### Persona 6: Tim — Multi-Context Freelancer

**Role:** Fractional CTO, dad, micro-school founder. Manages 3-5 client contexts simultaneously plus personal life.

**Core problem:** Context-switching is his biggest cognitive tax. Each client has different knowledge, different priorities, different voice. He loses time re-establishing context every time he switches. Personal life falls through the cracks.

**What Ditto gives Tim:** One Self that holds all his contexts. It switches cleanly between clients, applies the right knowledge and voice, and gives him a unified morning brief across his entire world. He never loses a thread.

**One process must be valuable:** Tim's first process is a weekly client status report. Each client gets an auto-drafted report in their format and voice, drawn from the week's work. Tim reviews and sends. 3 hours saved per week across 3 clients.

---

## Summary of Design Gaps

| # | Gap | Impact | Proposed Solution |
|---|-----|--------|-------------------|
| 1 | **Workspaces / Contexts** | Users with multiple businesses, clients, or life domains can't separate knowledge and outputs | Workspace model: switchable contexts with unified "All" view. Header selector. Self adapts. |
| 2 | **Building vs Operating phase** | Users in visioning/creation phase need knowledge capture, not process execution | Self infers phase from interaction patterns. Building mode = capture, synthesise, guide. Operating mode = execute, review, trust. |
| 3 | **Knowledge visibility** | Users don't know what the AI knows — Libby's core frustration | "What I Know" view per workspace. Conversational access + structured audit view. Editable. |
| 4 | **Multi-voice outputs** | Outputs need to match the workspace's brand/voice, not a single user voice | Per-workspace voice profiles, learned from corrections. |
| 5 | **Life management** | Solo operators blur business and personal. Both need first-class support. | Life workspaces are architecturally identical to business workspaces. Self adapts tone. |

---

## Implications for the Prototype

The HTML prototypes (01, 02, 03) work for single-workspace Rob. To support Libby and Tim:

1. **Add a workspace switcher** to the workspace header in prototype 02
2. **The morning brief (shift report)** should show cross-workspace items with context tags
3. **The sidebar** groups items by workspace when in "All" view, filters when in a specific workspace
4. **The conversation surface** needs a subtle workspace context indicator — "You're talking to Self about [Business]" — so Libby knows her meal planning question won't pollute her brand voice
5. **A "What I Know" prototype** — new surface showing accumulated knowledge per workspace

---

## Reference Docs That Need Updates

| Doc | Update needed |
|-----|--------------|
| `docs/personas.md` | Add Libby and Tim as Personas 5 and 6 |
| `docs/human-layer.md` | Add workspace as a concept. Update the six human jobs to account for knowledge-building (Define job expands) |
| `docs/architecture.md` | Workspace as an entity (knowledge, voice, processes scoped to a workspace) |
| Phase 10 MVP brief | Workspace switcher as a UI element. "All" view as default entry point. |
| Visual identity spec | Workspace indicator styling. Context tags on feed cards. |
