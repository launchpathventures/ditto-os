# Insight-082: Chat is the Universal Seed — The Self Unfolds the Right Process

**Date:** 2026-03-24
**Trigger:** User clarification: "Everything does start with a chat, a task, a goal, a project, an outcome, a problem — and the Self should unfold the right process visual experience to guide someone through the process to produce the outcome."
**Layers affected:** L6 Human (interaction model), L2 Process (recognition + selection), Conversational Self, ADR-009 (catalog)
**Status:** active — synthesises Insights 079, 080, 081 into a unified model

## The Unified Model

```
User says something (chat input — always the starting point)
  ↓
Self recognises: what kind of thing is this?
  (goal, task, problem, project, question, capture, complaint...)
  ↓
Self reaches for the right process
  (onboarding, strategy, capture, execution, planning, research...)
  ↓
Process produces visual components from the catalog
  (input cards, guided fields, documents, checklists, maps...)
  ↓
Conversation surface renders the guided experience
  ↓
User is guided through to outcome
```

**Chat is the universal entry point.** It never goes away. It's always the input.

**What unfolds from it is process-specific and visual.** The Self's response is rarely just more text — it's structured, interactive components from the catalog, tailored to the specific outcome being pursued.

## This Resolves Three Tensions

1. **Conversation-first (Insight-075) vs Artefact-primary (Insight-080):** They're sequential, not competing. Conversation is the seed, artefact is the flower.

2. **Chat vs Forms (Insight-081):** Chat is the input method. What the Self produces in response can include form-like structured inputs — they're catalog components, not a separate system.

3. **Simple vs Complex processes:** A quick question gets a text answer. A brand strategy need gets a full guided canvas. The same surface handles both — the process determines the complexity of the visual response.

## The Recognition Layer

The Self's most important capability is **recognising what the user needs and selecting the right process.** This is not keyword matching — it's intent + context:

- "I need help with my brand" + (new user, no brand defined) → Brand strategy process
- "I need help with my brand" + (established user, brand defined) → Brand refinement / consistency check
- "Henderson wants a quote" → Quoting execution process
- "What should I focus on?" → Prioritisation / roadmap review process
- "I feel stuck" → Coaching / strategic thinking process
- "Here's my survey results" + (file attached) → Knowledge capture + synthesis process

The Self uses: user model, workspace context, conversation history, and the information model's gap analysis to determine the right process.

## The Catalog Expansion

The catalog needs two categories of components:

**Display components** (existing): work-item-card, synthesis-card, status-cards, metrics, sparklines, etc.

**Input components** (new): These accept user input and feed the process.

| Component | Input type | When used |
|---|---|---|
| `select-card` | Single choice from options | Stage, category, archetype |
| `multi-select-card` | Multiple choices | Platforms, features, pain points |
| `guided-fields-card` | Sub-fields with labels | Client profile, project brief |
| `tag-picker-card` | Add/remove tags from suggestions | Brand words, skills, themes |
| `slider-card` | Range or scale | Price range, frequency, priority |
| `rank-card` | Drag to reorder items | Priority ranking |
| `text-input-card` | Short text with context | Name, description, URL |
| `comparison-card` | "More like this / Less like this" | Tone, style, voice refinement |
| `confirmation-card` | Review + approve/adjust | Reflecting back understanding |

Each input component:
- Has a clear label and context ("Why I'm asking this")
- Shows what the Self will do with the answer
- Has a "just tell me in your words" fallback (always — never trap the user in a form)
- Feeds the process's information model when submitted
- Updates the progress/completeness signal

## What the User Experiences

**Libby, minute 0:**
She types: "I'm a doula trying to build an online education business and I don't know where to start."

**Libby, minute 0:30:**
The Self responds with text ("Great — let me help you figure that out") and immediately produces a getting-started process-proposal-card with structured input cards starting to appear:

- A `select-card` for business stage (Idea / Building / Launching / Running)
- A `guided-fields-card` for ideal client (with sub-fields appearing one at a time)
- The Self explains: "I'll ask you a few things to understand your business, then suggest what to work on first. You can fill these in or just talk to me — either works."

**Libby, minute 5:**
Three cards are filled. The Self has enough context. A process-proposal-card appears: "Here's what I'd suggest working through." Five steps. Two already done from what she shared.

**Libby, minute 6:**
She taps "Start with brand voice." A `comparison-card` appears: three sample Instagram posts in different tones — "Which of these sounds most like you?" She taps one. The Self refines. A brand guide document starts forming.

**At no point was Libby trapped in chat.** She typed one sentence. The Self unfolded the right visual experience. She interacted mostly through taps, selections, and short responses — not walls of text.

## The Principle

**The conversation surface is one component. The Self is the intelligence. The process determines the experience. The catalog constrains the rendering.**

- Chat is always available
- Text responses are always available
- But the DEFAULT path through any process uses structured, visual, interactive components
- The Self selects the components, the catalog renders them, the user experiences a guided journey to their outcome

## Where It Should Land

- **ADR-009 v2 extension** — input components in the catalog alongside display components
- **Engine: information models** — per-process schemas of what needs to be gathered, with field types, dependencies, and completeness scoring
- **Engine: intent recognition** — the Self's ability to classify user input and select the right process
- **Phase 10 MVP** — the conversation surface renders both display and input components from the catalog
- **All prototypes** — rebuild to show the chat-seed → visual-unfolding pattern
