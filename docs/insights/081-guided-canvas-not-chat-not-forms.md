# Insight-081: Guided Canvas — Not Chat, Not Forms, But Structured Visual Intake

**Date:** 2026-03-24
**Trigger:** User challenge: "How do you help someone who is not text-first or fails to truly understand how much depth and volume of content the AI needs? Getting clarity is sometimes like battleships — behind the scenes the Self has a model where it keeps probing for information needed."
**Layers affected:** L6 Human (fundamental input model), Conversational Self, all intake processes
**Status:** active — extends Insight-080

## The Battleships Model

Behind every Self-initiated process is an **information model** — a structured understanding of what the Self needs to know to do its job. Think of it as a hidden grid:

```
┌────────────┬────────────┬────────────┬────────────┐
│ Business   │ Ideal      │ Brand      │ Stage      │
│ type       │ client     │ voice      │            │
│ ████████   │ ██████░░   │ ░░░░░░░░   │ ░░░░░░░░   │
├────────────┼────────────┼────────────┼────────────┤
│ Pain       │ Competitors│ Pricing    │ Content    │
│ points     │            │ model      │ frequency  │
│ ░░░░░░░░   │ ░░░░░░░░   │ ░░░░░░░░   │ ░░░░░░░░   │
└────────────┴────────────┴────────────┴────────────┘
```

Each cell has a completeness score. The Self's job is to fill the grid — not by dumping all the questions at once, but by intelligently probing the most important gaps next.

**The user should see the grid, not just the questions.**

## The Problem with Chat-Based Intake

When the Self asks "Tell me about your ideal client" in a chat, three things go wrong:

1. **The user doesn't know what level of depth is needed.** "First-time mums" — is that enough? Or does the Self need age range, income, location, psychographics, buying triggers, fears, aspirations? The user can't tell.

2. **The user doesn't know what else is needed.** After answering about ideal client, they don't know that pricing model, content frequency, and competitive landscape are ALSO needed. The full picture is invisible.

3. **Open text is the wrong input type for half the questions.** "What stage are you at?" has 4-5 natural answers — a selector is better. "What price range?" is a number. "Pick 3 words that describe your brand" is a tag picker. Forcing everything through text is like using a screwdriver for every fastener.

## The Solution: Guided Canvas

The primary surface is a **canvas of cards** that represent knowledge areas. Each card:

- Shows what it's about (label)
- Shows its completeness state (empty → partial → complete)
- Has the RIGHT input type for its content (not always text)
- Can be filled by the Self's questions, by direct user input, or by file upload
- Updates in real-time as context is gathered

The Self guides the user through the canvas — highlighting the next most important card, asking targeted questions, offering structured inputs. But the user can also jump to any card and fill it directly.

### Input Types Per Knowledge Area

| Knowledge area | Input type | Why not free text |
|---|---|---|
| Business type | Short text + category picker | Faster, helps Self match industry patterns |
| Ideal client | Guided card with sub-fields (age, role, fears, goals) | Users don't know what "enough detail" means |
| Brand voice | Pick from archetypes → refine with sliders | Abstract concept, options help crystallise |
| Brand words | Tag picker (select 3-5 from suggestions + custom) | Spatial, visual, not prose |
| Business stage | Select one of 4-5 stages | Discrete, not a paragraph |
| Pain points | Rank/sort cards | Relative priority matters more than description |
| Competitors | Add cards (name + what they do) | Structured, not narrative |
| Pricing model | Options + number range | Structured data |
| Content frequency | Simple selector (daily/3x week/weekly/etc) | Discrete choice |
| Target platforms | Multi-select (Instagram/TikTok/Email/etc) | Finite options |
| Tone examples | "More like this / Less like this" on sample content | Comparison is easier than description |

### The Canvas Experience

```
┌──────────────────────────────────────────────────────────────┐
│  Getting Started with Your Business              ███░░ 40%   │
│                                                              │
│  ┌─ You ──────────┐  ┌─ Your Client ──┐  ┌─ Your Voice ──┐ │
│  │                 │  │                │  │                │ │
│  │ Doula →         │  │ First-time     │  │ Pick your      │ │
│  │ Education +     │  │ mums, 30s,     │  │ archetype:     │ │
│  │ Coaching        │  │ professional   │  │                │ │
│  │                 │  │                │  │ ○ Warm expert  │ │
│  │ ████████████    │  │ ┌───────────┐  │  │ ○ Trusted      │ │
│  │ Complete        │  │ │Age: 30-45 │  │  │   friend       │ │
│  │                 │  │ │Role: Prof │  │  │ ○ Straight     │ │
│  │                 │  │ │Fear: judg │  │  │   talker       │ │
│  │                 │  │ │Goal: safe │  │  │ ○ Something    │ │
│  │                 │  │ └───────────┘  │  │   else         │ │
│  │                 │  │                │  │                │ │
│  │                 │  │ ████████░░░░   │  │ ░░░░░░░░░░░░  │ │
│  │                 │  │ Good           │  │ → Next         │ │
│  └─────────────────┘  └────────────────┘  └────────────────┘ │
│                                                              │
│  ┌─ Your Stage ───┐  ┌─ Pain Points ──┐  ┌─ First Goal ──┐ │
│  │                 │  │                │  │                │ │
│  │ ○ Idea          │  │                │  │                │ │
│  │ ● Building      │  │  (after voice  │  │  (after pain   │ │
│  │ ○ Launching     │  │   is defined)  │  │   points)      │ │
│  │ ○ Running       │  │                │  │                │ │
│  │                 │  │                │  │                │ │
│  │ ████████████    │  │ ░░░░░░░░░░░░  │  │ ░░░░░░░░░░░░  │ │
│  │ Complete        │  │ Waiting        │  │ Waiting        │ │
│  └─────────────────┘  └────────────────┘  └────────────────┘ │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ● Self: Your voice is the next unlock. Pick the         │ │
│  │   archetype that feels closest, then we'll refine it.   │ │
│  │                                                         │ │
│  │   [Or just tell me in your own words →]                 │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **The canvas IS the form, but it doesn't feel like one.** Cards appear progressively (not all at once). Completed cards shrink. The next card is highlighted. It feels like building, not filling out.

2. **The Self guides but doesn't block.** The Self highlights the recommended next card, but the user can tap any card and fill it out of order. Non-linear by nature.

3. **Every card has the right input type.** Selectors for discrete choices. Sliders for ranges. Tag pickers for multi-select. Short text for names and descriptions. The Self asking "tell me about X" in chat is the FALLBACK, not the default.

4. **Completeness is always visible.** Each card shows its state. The overall progress bar shows how much the Self knows. The user never wonders "does the AI have enough?"

5. **Cards unlock other cards.** "Pain points" unlocks after "Ideal client" and "Voice" are defined — because the Self needs that context to offer relevant pain point options. This is progressive disclosure applied to information gathering.

6. **The Self's guidance appears AT the card, not in a sidebar.** A small Self prompt appears below or inside the active card: "Pick the archetype that feels closest, then we'll refine." The conversation is embedded in the canvas, not separate from it.

7. **Chat is the escape hatch.** If the user doesn't like the structured input, they can always say "let me just explain" and type freely. The Self extracts structure from their prose and fills the cards. But structured input is the DEFAULT, free text is the fallback.

## Behind the Scenes: The Information Model

Every Self-initiated process has an **information model** — a schema of what needs to be known:

```yaml
process: onboarding
information_model:
  - field: business_type
    priority: 1
    input_type: short_text + category
    required: true
    unlocks: [ideal_client, competitors]

  - field: ideal_client
    priority: 2
    input_type: guided_card
    sub_fields: [age_range, role, fears, goals, triggers]
    required: true
    depends_on: [business_type]
    unlocks: [pain_points, content_themes]

  - field: brand_voice
    priority: 3
    input_type: archetype_picker + refinement_sliders
    required: true
    unlocks: [brand_words, tone_examples]

  - field: business_stage
    priority: 2
    input_type: single_select
    options: [idea, building, launching, running]
    required: true

  - field: pain_points
    priority: 4
    input_type: rank_cards
    depends_on: [ideal_client, brand_voice]
    auto_suggest: true  # Self suggests based on industry patterns
```

The Self uses this model to:
1. Decide what to ask next (highest priority unfilled field that has its dependencies met)
2. Determine the right input type
3. Pre-populate suggestions from industry knowledge
4. Know when it has "enough" (all required fields filled)
5. Transition from gathering to proposing (Insight-079) when the model is sufficiently complete

## The "Enough" Signal

The user never has to wonder "does the AI have enough?" The canvas shows it:

- **Overall progress bar:** "40% → 60% → 85% → Ready to build your plan"
- **Per-card completeness:** Green = complete, orange = partial, grey = empty
- **The Self tells you:** "I've got enough to suggest your first process. Want to keep filling in details, or start building?"
- **Diminishing returns are visible:** Once core cards are filled, remaining cards show "(optional — helps me be more specific)" labels

## What This Changes

This is not a small UI tweak. This redefines how Ditto gathers information:

- **From:** Open-ended conversation where the user guesses what to say
- **To:** Visual canvas where the user can SEE what's needed, fill it in using the right input type, and watch their business model take shape

Chat doesn't disappear — it's always available. But it's the FALLBACK, not the primary input. The canvas with structured inputs is the primary experience.

## Relationship to Other Insights

- **Insight-079** (Conversation is intake, process is the product): The canvas IS the intake process made visual
- **Insight-080** (Artefact-primary surfaces): The canvas IS the artefact during onboarding
- **Insight-075** (Conversation-first, dashboard-earned): Revise — GUIDED CANVAS first, conversation available, dashboard earned
- **ADR-009 v2** (Catalog-constrained rendering): Canvas cards are catalog components rendered from the information model

## Where It Should Land

- **New prototype:** Onboarding as guided canvas (not chat, not form)
- **Phase 10 MVP brief:** Redefine the onboarding surface
- **Architecture:** Information models as first-class engine concept
- **Component catalog:** Card input types (selector, slider, tag picker, rank, guided sub-fields)
- **human-layer.md:** Guided canvas as a new interaction primitive alongside conversation
