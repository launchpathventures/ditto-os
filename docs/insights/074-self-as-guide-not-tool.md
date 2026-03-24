# Insight-074: The Self is a Guide, Not a Tool — Cold Start is a Conversation, Not Onboarding

**Date:** 2026-03-24
**Trigger:** User challenge during Phase 10 design: "Users struggle with the cold start problem — they don't know what they can do with Ditto. The Self should guide at all times. Onboarding should be the Self getting to know the user."
**Layers affected:** L6 Human (onboarding, navigation, suggestion engine), Conversational Self (ADR-016), L5 Learning (user model)
**Status:** active

## The Insight

Users — even technically literate ones — don't know what they can do with Ditto. The gap isn't "how do I use this tool?" (UX problem) but "what is possible and what should I do next?" (imagination problem). No amount of feature tours, empty states with hints, or documentation solves this. The solution is the Self as a persistent guide that understands who you are, what you're trying to achieve, and what Ditto can do for you — and actively bridges the gap.

### Cold Start is a Relationship, Not a Wizard

Traditional onboarding: "Set up your account → connect integrations → create your first workflow → here's a tutorial." This fails for our personas because:

- It requires the user to already know what they want (they don't — they know their pain, not the solution)
- It feels like work before you've seen any value
- It's a one-time event that doesn't help a week later when the user wonders "what else could this do?"

Ditto's cold start should be the Self getting to know the user — a conversation that feels like meeting a new colleague:

> Self: "Hi, I'm your Self — think of me as a colleague who'll learn how your business works and help you run it. I'd love to understand what you do. What's your business?"
>
> Rob: "I run a plumbing company. 12 staff."
>
> Self: "Got it — trades business, decent size team. What's eating most of your time right now? The stuff you wish someone else could handle?"
>
> Rob: "Quoting. I spend every evening writing up quotes."
>
> Self: "Quoting's a great place to start — it's exactly the kind of thing I can help with. Tell me roughly how it works: a customer gets in touch, and then what happens?"

This isn't onboarding. It's a relationship forming. By the time this conversation ends, the Self knows:
- Rob's business type and size
- His primary pain point (quoting)
- How his quoting process works
- His quality standards and pricing rules
- That he's on job sites most of the day

And Rob has — without realizing it — defined his first process.

### Guidance is Ongoing, Not Just Initial

The Self doesn't stop guiding after day 1. At every stage, the Self proactively suggests what's possible next:

**Week 1 (one process running):**
> "Your quoting is running well — 5 quotes out this week. By the way, you mentioned customers sometimes don't respond to quotes. Want me to start following up automatically after 3 days?"

**Week 3 (follow-up process added):**
> "I've noticed you get a lot of supplier emails about price changes. Other trades businesses I work with find it useful to track those automatically. Interested?"

**Month 2 (multiple processes):**
> "You've got quoting, follow-ups, and supplier tracking running. The next thing businesses like yours usually tackle is invoicing. Want to explore that, or is there something else bugging you?"

The Self acts like a good consultant: it observes what you're doing, understands what businesses like yours typically need, and suggests the next step — without being pushy. The user never wonders "what else can this do?" because the Self tells them, at the right moment, based on what they've already accomplished.

### The User Model Deepens Over Time

The initial conversation captures the basics: business type, size, pain points, how things work. But the model continues building:

- **From corrections:** Rob always bumps up bathroom labour → Self understands Rob's quality bar for bathroom jobs
- **From questions:** Lisa asks "why are widget descriptions so generic?" → Self understands Lisa's brand voice priority
- **From behavior:** Jordan checks process health every Monday morning → Self learns to prepare Monday briefings
- **From captures:** Rob voice-captures supplier price changes on site → Self understands Rob's information flow

This isn't a profile page the user fills out. It's accumulated understanding from every interaction — like a real colleague who gets better at their job the longer they work with you.

### What the User Never Sees

- "Onboarding wizard" (they have a conversation instead)
- "Feature tour" (the Self shows features when they're relevant)
- "Empty state with suggestions" (the Self suggests, the empty state just invites conversation)
- "What's new" (the Self mentions new capabilities when they match the user's needs)
- "Suggested templates" (the Self proposes processes based on the user's actual pain, not a generic library)

### Suggestions Must Be Grounded

The Self's suggestions are not random. They come from:
1. **The user's stated pain points** (from ongoing conversation)
2. **Industry knowledge** (APQC, ITIL patterns matched to business type)
3. **Observation of the user's work** (correction patterns, process gaps, time patterns)
4. **Maturity model** (what typically comes next for a business at this stage)

This is the Capability Catalog (human-layer.md) made alive through the Self — the user never browses a catalog, but the catalog's knowledge powers the Self's suggestions.

## Implications

- **Onboarding is the first conversation, not a separate flow.** There is no "setup wizard" screen. The first thing the user sees is the Self greeting them. The conversation IS the setup.
- **The Self needs a user model.** Beyond memory (what happened), the Self needs a structured understanding of: business type, size, industry, pain points, quality standards, working patterns, trust disposition. This is a new engine concept.
- **Suggestion engine is a first-class capability.** The Self needs a "what to suggest next" process — powered by user model + industry patterns + observation. This is a meta-process.
- **Empty states everywhere should point to conversation.** Instead of "No items yet. Create a process →", it's "Talk to Self" or the Self proactively appears: "I notice you haven't set anything up yet. Want to tell me what's on your plate?"
- **"What can I do?" should never be a question.** The Self always has a suggestion. Even if the user has 10 processes running, the Self should be able to say "Everything's running smoothly. Here's something I've been thinking about based on your business..."
- **This changes the MVP entry point.** The dashboard/feed is not the first thing a new user sees. The Self is.

## Where It Should Land

- **Phase 10 MVP brief** — onboarding interaction model, entry point design, Self as primary surface
- **ADR-016** — extend Self's role to include proactive guidance and user model building
- **human-layer.md** — update Conversation Thread primitive to include "ongoing guidance" as a function alongside "process definition" and "work creation"
- **architecture.md** — user model as a new engine concept (could be part of Memory layer or a distinct concern)
