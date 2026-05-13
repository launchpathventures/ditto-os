# UX Research + Interaction Spec: `/people/[handle]` Public Profile-as-Chat

**Date:** 2026-05-12
**Role:** Dev Designer
**Consumers:** Dev Architect (Brief 259), Dev Builder (Brief 259)
**Companion docs:** `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md`, `docs/briefs/254-network-two-sided-conversational-front-door.md` §Surface D, `docs/research/network-agent-character-and-experience-ux.md`, `docs/research/ai-chat-ux-patterns-competitive-audit.md`

---

## Context

The page at `ditto.partners/people/{handle}` is the **outward face** of a Ditto user — what a stranger sees when they click a shared LinkedIn link, a forwarded URL, an email signature, an OG card preview. Unlike every other Ditto surface, the primary user is NOT a process owner. They're someone considering whether to invest social capital reaching out to the absent owner.

This is the load-bearing reputational surface for Ditto's two-sided network. Five UX decisions remain open after parent brief 254 §Surface D locks the macro layout (card-left / chat-right desktop, card-chip / chat-full mobile, quick-start-pill position, voice-mode link). This spec covers those five:

1. Quick-start pill micro-typography, ordering, and tap behavior
2. Forwarded-note confirm UI ("want me to ask {first_name}?")
3. Rate-limit copy + visual treatment
4. Transcript-attached-to-intro-request preview composition
5. Representative-posture identity affordance — the load-bearing trust signal

---

## Two Audiences, One Surface

This page must serve two people simultaneously:

| Audience | Presence | Their job | Risk if we get it wrong |
|---|---|---|---|
| **Visitor (primary)** | Active, anonymous, ephemeral | Orient + Decide — do I reach out? | Bounces. Or worse, forms a false impression of the owner. |
| **Owner (secondary)** | Absent. Receiving Capture artifacts asynchronously into their workspace inbox. | Trust the system to represent them faithfully and bring high-signal asks. | Reputation damage if Greeter impersonates / fabricates / leaks anti-persona. Inbox noise if low-signal asks land. |

Every design decision below is checked against both audiences. The Greeter prompt's six hard rules (Brief 259 §Constraints) defend the owner's reputation at the semantic layer; the UX must reinforce that same posture at the visual/interaction layer.

---

## How the Six Human Jobs Map to This Surface

The Ditto six-jobs framework was built for process owners. Here's how each job applies on this surface:

| Job | Visitor view | Owner view (async) |
|---|---|---|
| **Orient** | "Who is this person? What are they about?" — read card, ask Greeter, get grounded responses. | n/a (already knows themselves) |
| **Decide** | "Do I reach out? With what?" — pills → free-form → intro request. | "Do I take this intro?" — happens in workspace inbox via existing Brief 248 affordances. **Out of scope for this surface.** |
| **Capture** | Forwarded notes land in owner inbox; intro requests land with full transcript. | Owner reviews forwarded notes / intro requests later. **Out of scope for this surface.** |
| **Review** | Visitor reviews the Greeter's draft intro before sending. | (See Decide above — owner reviews in workspace inbox.) |
| **Define / Delegate** | n/a | n/a |

This surface is essentially **Orient + Decide for the visitor, with downstream Capture for the owner**. No Define, no Delegate, no Review-in-the-Ditto-sense (Brief 248's `AuthorizationRequestBlock` review happens on the workspace side).

---

## Design Decision 1 — Quick-Start Pills

### What's locked by parent

- 4 pills, dynamically generated from card + KB at server-render
- Position: between the Greeter's first turn and the chat input
- Affordance: clickable, prefills the chat input

### What's open

- Micro-typography (weight, size, casing)
- Visual treatment (outlined vs filled vs ghost)
- Order / sequence logic
- Tap behavior: prefill vs send-immediately

### UX Patterns Surveyed

| Source | Pattern | Why it's relevant |
|---|---|---|
| **process-os Ask Charlie** (`_components/charlie-quick-pills.tsx`) | Outlined pills, sentence case, single line per pill, prefills the input on tap | Direct adoption candidate — visitor lands cold, identical mental model |
| **Claude.ai new conversation** | "Suggested prompts" appear as outlined buttons in a 2x2 grid; tap sends immediately | Send-immediately pattern — works because Claude prompts are exploratory |
| **Perplexity follow-up suggestions** | Outlined pills appearing BELOW each answer; tap sends immediately | "Continue exploring" pattern — not appropriate for first-turn |
| **Linear / Notion AI** | Pills appear as small caps under a prompt label "Try asking..." | Adds visual hierarchy / framing — slightly more clinical |

### Recommendation

**Outlined pills, sentence case, prefill-on-tap.** Specifically:

- **Visual:** 1px border in muted ink, no fill, no shadow. Hover/focus: border darkens. Tap: subtle background flash. Border-radius matches the chat input (consistent geometry).
- **Typography:** 14-15px, regular weight, sentence-case. NOT bold (would compete with the Greeter's first turn). NOT all-caps (too clinical). Each pill is one line; truncate with ellipsis if it overflows.
- **Order matters (Insight: dynamic pill ordering reflects the visitor's likely path of inquiry):**
  - Pill 1 — **Orient** ("What's he hunting?" / "What's she working on?")
  - Pill 2 — **Differentiator** ("Why does he turn away big logos?" / "What's her ICP?")
  - Pill 3 — **Fit probe** ("Is this a fit for {visitor's-likely-context}?") — generated from KB anti-persona hints; in v1 may default to a generic "Is this a fit for me?"
  - Pill 4 — **Action** ("I'd like an intro.")
- **Tap behavior: prefill, not send-immediately.** This is non-obvious — Claude.ai and Perplexity send immediately because the prompts are exploratory and reversible. On `/people/[handle]`, the visitor is talking to (or about) a real person; **the visitor should always see their own message before it goes**. Prefill puts the pill text into the chat input as a draft; the visitor can edit it before hitting Send. This also doubles as an implicit teaching moment: "you can ask other things too — here's what an ask looks like."
- **Mobile:** pills stack vertically, full-width, generous tap targets (44pt min height).

### Why this serves both audiences

- **Visitor:** lowers cognitive load — they don't have to compose a question from scratch. The sequence (Orient → Differentiator → Fit → Action) follows natural curiosity.
- **Owner:** prefill-not-send protects the owner from low-signal asks. Visitors who edit a pill before sending are signaling intent; visitors who edit nothing at least produce a question the Greeter knows how to ground in KB.

---

## Design Decision 2 — Forwarded-Note Confirm UI

### What this is

When the visitor asks about an `on-request` fact (or says "tell {first_name} X"), the Greeter responds: *"They can speak to that. Want me to ask {first_name}?"* The visitor confirms; the Greeter calls `forward_note_to_user(stepRunId, ...)`; the question lands in the owner's inbox.

### What's locked by parent

- The Greeter's offer copy: *"They can speak to that. Want me to ask {first_name}?"*
- The confirm triggers `forward_note_to_user`
- The note carries: visitor name (if offered), org (if offered), the verbatim question

### What's open

- Confirm UI: inline button vs modal vs auto-capture
- Whether the visitor can edit the note before it's sent
- Whether/how the visitor is asked for their identity (name/org)
- Visible acknowledgment after confirm

### UX Patterns Surveyed

| Source | Pattern | Why it's relevant |
|---|---|---|
| **Cal.com booking flow** | Inline confirm card with editable preview + "Send" button — never auto-sends | Same trust posture: "you're about to interact with a real person; review before sending" |
| **Linear inline replies / mentions** | Auto-capture, no confirm — but only because the user is authenticated and the action is reversible | NOT applicable — visitor is anonymous, action is one-way |
| **Intercom widget** | "Send" button with optional name/email fields appearing above | Closer to right tone for an anonymous-but-identifying visitor |
| **process-os contact form** | Modal opens with editable text + name/email — feels heavyweight, kills momentum | Cautionary example |

### Recommendation

**Inline confirm card, no modal.** Specifically:

- The Greeter's offer appears as a normal chat bubble: *"They can speak to that. Want me to ask {first_name}?"*
- Immediately below, an **inline confirm card** appears as a child of that turn:
  ```
  ┌─────────────────────────────────────────┐
  │ I'll pass this to {first_name}:         │
  │ ┌─────────────────────────────────────┐ │
  │ │ {visitor's question, editable}      │ │
  │ └─────────────────────────────────────┘ │
  │                                         │
  │ Your name (optional):  [____________]   │
  │ Your org (optional):   [____________]   │
  │                                         │
  │ [ Cancel ]      [ Yes — pass it on ]    │
  └─────────────────────────────────────────┘
  ```
- **Editable question:** the visitor can edit before sending. Defaults to their original verbatim question. This is the visitor's last chance to be precise / withdraw / soften.
- **Optional identity fields:** name and org are optional. If the visitor leaves them blank, the note lands in the owner's inbox marked "anonymous visitor." Visible micro-copy: *"{first_name} sees this with your name if you share it."* (reassures both directions: the visitor knows what they're sharing; reminds them the owner sees their identity if offered.)
- **After confirm:** the inline card collapses into a single confirmation chat bubble: *"Sent. {first_name} usually replies within a day or two."* The collapse is a visible state change (the visitor sees the form fold up); soft fade transition.
- **No modal.** A modal would feel adversarial — like the system is interrupting the conversation. The inline card keeps the visitor in flow.

### Edge cases

- **Visitor changes mind mid-edit:** "Cancel" closes the inline card without sending; the Greeter says: *"No worries — let me know if anything else comes up."*
- **Multiple forwarded notes in one session:** each gets its own inline card. The owner sees them as separate inbox rows (not coalesced).
- **Visitor types their name/org in the chat earlier:** the fields prefill from the typed context (the Greeter has already parsed it for the prompt — same field reuse).

### Why this serves both audiences

- **Visitor:** lightweight, in-flow, reviewable. Doesn't feel like signing up for anything.
- **Owner:** every forwarded note carries either an identified asker (better signal) or an explicit "anonymous" marker (so they know to weigh accordingly). The editable preview prevents the long-tail of "I asked the Greeter a weird question and now Tim's reading it"-regret.

---

## Design Decision 3 — Rate-Limit Copy + Treatment

### What's locked by parent

- Caps: 30 messages per visitor session, 200 per IP per hour
- Pattern: polite copy on hit

### What's open

- Exact copy
- Visual treatment (banner vs inline vs toast vs disabled-input)
- What happens after the limit clears

### UX Patterns Surveyed

| Source | Pattern | Why it's relevant |
|---|---|---|
| **Claude.ai usage cap** | Inline message in chat: "You've reached the limit. Try again at 4pm." with a faint disabled state on the input | Right tone — the system pauses without scolding |
| **ChatGPT rate-limit** | Banner at top of conversation, persists until limit clears | Heavy-handed — the visitor feels watched |
| **Linear AI assistant** | Toast notification, ephemeral | Too easy to miss |
| **process-os Charlie** | Inline 429 response from API, frontend renders a generic "try again later" | Underdesigned — what we should do better |

### Recommendation

**Inline chat-style message from the Greeter, NOT a system banner.** Specifically:

- When the rate limit hits, the Greeter's NEXT response slot is replaced with a polite system-styled message that LOOKS LIKE a Greeter turn (same avatar, same persona name) but is flagged as a pause-state:
  ```
  ⊙ Alex
  ┌─────────────────────────────────────────┐
  │ I need a minute — we've covered a lot.  │
  │ Back in {retryAfter}, where were we?    │
  └─────────────────────────────────────────┘
  ```
- **Copy variants by trigger:**
  - **Session cap (30 msgs):** *"I need a minute — we've covered a lot. Back in {retryAfter}, where were we?"*
  - **IP cap (200/hr):** *"There's been a lot of traffic through me today. Try me again in an hour?"* (no specific countdown — discourages scripted retry)
- **Visual state:** the chat input below the message becomes disabled (cursor disabled, placeholder reads "Resting…"), but the input is NOT hidden. The visitor can still scroll the conversation. After `retryAfter`, the input re-enables silently — no banner saying "you're back!" because that would be condescending.
- **No retry button.** Encouraging retry encourages abuse. The visitor either waits or leaves.

### Mobile behavior

Same — inline message, same disabled-input state. No special mobile treatment.

### Why this serves both audiences

- **Visitor:** doesn't feel kicked out. Feels like the Greeter is being human ("I need a minute"). The persona consistency is maintained.
- **Owner:** rate-limiting protects them from harvesting / scraping. The polite tone protects their reputation — no visitor leaves the page thinking "Tim's chat thing is broken."

### Subtle risk

The "pause-state Greeter turn" is the only place where the Greeter speaks in first-person ("I need a minute"). This MIGHT be flagged by a strict reading of the six hard rules. BUT — Hard Rule #3 (No AI self-disclosure) forbids "I'm an AI / chatbot / language model." The pause-state copy says "I need a minute," which is the Greeter persona, not the AI. It's the same first-person the Greeter uses to introduce themselves ("I'm Alex"). This is consistent. **For Architect: confirm this reading is acceptable; if not, replace with a system-styled message that doesn't speak as the Greeter.**

---

## Design Decision 4 — Transcript-Attached Intro-Request Preview

### What this is

When the visitor says "I'd like an intro" (or taps the action pill), the Greeter emits an `AuthorizationRequestBlock` to be queued for the owner's inbox. The visitor sees a preview of what's being sent — the intro draft + the transcript. They confirm send (or cancel).

### What's locked by parent

- `AuthorizationRequestBlock` primitive (Brief 248)
- `preview: ContentBlock[]` carries the visitor transcript (Insight-231)
- `costLabel: null` in this brief (downstream fills the free-counter string)
- Greeter's confirm copy: *"I'll send this to {first_name}; if it lands, you'll hear back in a day or two."*

### What's open

- Visual composition of the visitor-side preview
- Whether the visitor edits the draft, the transcript, both, or neither
- Whether the transcript is collapsed by default
- The confirm/cancel affordance

### UX Patterns Surveyed

| Source | Pattern | Why it's relevant |
|---|---|---|
| **LinkedIn intro request** | Edit-the-message before send; recipient name visible; non-editable provenance | Standard pattern visitors will recognize |
| **Intercom contact form** | Editable message body + non-editable email-thread context below | Two-zone pattern: "what you write" vs "what's attached" |
| **Cal.com event booking** | Editable note + non-editable booking details (date/time/duration) | Same two-zone clarity |
| **Gmail forward dialog** | Editable composition + collapsed original thread, expandable | Direct parallel to "draft + transcript" |

### Recommendation

**Two-zone editable preview, transcript collapsed by default.** Specifically:

- The card appears inline in chat, replacing the Greeter's send-confirmation bubble:
  ```
  ┌─────────────────────────────────────────────────┐
  │ I'll send this to Tim                           │
  │ ─────────────────────────────────────────────── │
  │                                                 │
  │ Hi Tim — {visitor draft, editable}              │
  │                                                 │
  │ This came from a conversation I had with        │
  │ {visitor name or "a visitor"} on your page.     │
  │                                                 │
  │ ▾ What Tim will see (transcript)                │
  │   {collapsed by default}                        │
  │                                                 │
  │ ─────────────────────────────────────────────── │
  │             [ Cancel ]    [ Send to Tim ]       │
  └─────────────────────────────────────────────────┘
  ```
- **Editable: the draft intro message only.** The transcript is not editable — it's a record of what happened, surfaced for transparency, not for redaction.
- **Collapsed-by-default transcript:** click `▾` to expand. The visitor can read everything Tim will see, but the default state is uncluttered. Expanded state shows transcript turns inline (visitor messages + Greeter responses), in the order they happened.
- **No identity fields here** (unless the visitor never offered them and they're needed). If the visitor already shared name/org via the forwarded-note path or via free-form chat, those are passed through. If they never did, an optional name/org input row appears above the transcript fold, similar to the forwarded-note pattern.
- **Confirm button label:** "Send to {first_name}" — names the recipient explicitly so the visitor is never confused about where it goes.
- **After send:** the card collapses into a single Greeter bubble: *"Sent. If it lands, you'll hear back in a day or two."* (Note: "if it lands" — sets expectation that the owner may not accept; avoids the false promise that every intro is honored.)

### Edge cases

- **Visitor edits the draft heavily / removes key context:** the draft is what the owner reads. The transcript provides the full ground truth. If the visitor's edit removes context, the transcript still carries it. This is the owner's safety valve.
- **Anti-persona refusal path:** if the Greeter has silently determined an anti-persona violation (Hard Rule #5), the intro-request preview never appears. Instead, the Greeter responds with a soft decline: *"I don't think this is a fit right now — but feel free to follow up directly if you'd like."* (no anti-persona text exposed.) The visitor can still ask follow-up questions; they just can't trigger an intro.
- **Free-counter exhaustion (downstream brief):** when the counter is 0, the preview card shows a different state. **Out of scope for Brief 259** — the brief emits `costLabel: null` and the downstream brief handles the exhaustion UI.

### Why this serves both audiences

- **Visitor:** total transparency. They see exactly what Tim sees. They can edit their pitch but not redact the conversation. They learn what high-signal intro requests look like.
- **Owner:** the transcript carries provenance even if the visitor's edited draft is misleading. The owner can read the full conversation in their inbox if the draft seems off. The "if it lands" framing also protects the owner — they're not implicitly committed to every request.

---

## Design Decision 5 — Representative-Posture Identity Affordance

### What this is

The Greeter is NOT the user. The Greeter REPRESENTS the user. This is the load-bearing trust signal. The Brief 259 system prompt enforces it semantically (six hard rules, all unit-tested). The question for design: **does the UI also signal it, and how heavily?**

### The risk

Too much visual scaffolding ("you're talking to an AI representative, not the actual person") becomes adversarial — the page feels like it's constantly disclaiming itself. The Charlie / Ethos patterns lean on conversational trust, not on chrome.

Too little scaffolding and the visitor might miss the signal entirely on a fast scroll, leaving them with a false impression of "this person is a chatbot" or worse, "I just talked to Tim."

### UX Patterns Surveyed

| Source | Pattern | What it signals |
|---|---|---|
| **process-os Ask Charlie** | Avatar = Charlie's face; chat header "Ask Charlie"; first turn says "I'm Charlie" | Identifies WITH the person (the inversion we're avoiding) |
| **Intercom Resolution Bot** | Avatar = generic bot icon; chat header "Resolution Bot"; first turn says "I'm a virtual assistant" | Heavy disclaimer; legalistic feel |
| **Klarna AI assistant** | Avatar = Klarna logo; chat header "Klarna Assistant"; first turn just gets to the point | Identifies WITH the brand, not the person — sidesteps the inversion |
| **Sandi (real estate AI rep)** | Avatar = the agent's face but stylized; subtitle "ai-assisted by Sandi" | Honest about the assist; still warm |
| **Original to Ditto** | Avatar = Greeter persona color/glyph (distinct from owner); chat header "{Greeter} · representing {first}"; first turn introduces the representative posture conversationally | What we recommend below |

### Recommendation

**Minimal visual scaffolding, semantically reinforced.** Specifically:

- **Chat header (top of chat panel):**
  ```
  ⊙ Alex · representing Tim
  ```
  - `⊙` (or similar persona-color glyph — same color the user picked in onboarding for Alex vs Mira). NOT the owner's profile photo. The Greeter is a distinct entity visually.
  - Persona name first ("Alex"), separator (`·`), then "representing {first}". The phrase "representing {first}" is the trust signal — it's NOT a disclaimer ("I am an AI"), it's a posture statement ("I speak for them").
  - Small subtext underneath, optional: *"Talks to people about Tim's work. Tim sees what you ask."* — six words, sets expectation, never disclaims AI nature.
- **Greeter avatar in chat bubbles:** small `⊙` glyph in the persona color, consistent. The owner's profile photo only ever appears on the `NetworkProfileCardBlock` (left/top). Visual separation reinforces "Greeter ≠ Owner" without requiring text.
- **First Greeter turn:** establishes the posture conversationally:
  > *"Hi — I'm Alex. I help Tim think out loud about who he's hunting. Ask me about him — or tell me what you're up to."*
  - "I help Tim" — third-person reference to the owner, immediately. Posture clear in the first sentence.
  - "Ask me about him" — third-person pronoun. Reinforces it.
  - This first turn is GENERATED per-owner — the Greeter prompt knows the owner's first name + persona assignment + a one-line hook from the KB.
- **NO persistent banner** saying "This is an AI representative." That's disclaimer chrome. The first turn IS the disclosure; the chat header IS the persistent reminder.
- **NO repeated "I'm Alex, Tim's representative" in every turn.** The Greeter only restates the posture when the visitor explicitly tests it ("are you Tim?" — Hard Rule #1).

### Mobile

- The card collapses to a chip in the top-right (per parent §Surface D). The chip shows the owner's face + name.
- The chat fills the screen. The chat header still reads "⊙ Alex · representing Tim" — this becomes the persistent visual anchor of who the visitor is talking to on mobile.

### Why this serves both audiences

- **Visitor:** the trust signal is everywhere but never intrusive. They get it in the first turn, in the header, in the avatar. They don't get hit with disclaimers.
- **Owner:** the page never confuses the visitor about who they're talking to. No legal exposure from impersonation, no reputational damage from "I thought I was chatting with Tim and it was a bot." The "representing" framing protects them.

### Edge case: voice mode

When the visitor enters voice mode (v33 pattern):
- The voice card replaces the chat area but the header stays: `⊙ Alex · representing Tim`. The owner's name remains visible.
- The Greeter's first voice utterance: *"Hi — Alex here. I represent Tim. What do you want to know?"* — shorter than the text version because voice is higher-friction; same posture.
- Visual indicator while the Greeter is speaking: the persona-color glyph pulses (the dot animates). When the visitor speaks, a different indicator (e.g., a soft inner gradient). Two distinct states reinforce "this is a two-party conversation, not a self-recording."

---

## Interaction States (across all decisions)

For each open item, here are the required interaction states the Builder must implement:

| Item | Loading | Empty / First-load | Streaming | Error | Success | Refused / Edge |
|---|---|---|---|---|---|---|
| **Quick-start pills** | n/a (server-rendered) | "Generating questions…" (only if pills fetch async; default is sync render) | n/a | If pill generation fails, fall back to 3 generic pills (parent-locked: "What is {first} working on?" / "Is there a fit for me?" / "I'd like an intro.") | Pills visible, tappable | n/a |
| **Forwarded-note confirm** | Greeter's offer arrives | Confirm card not yet shown | Confirm card slides in | If `forward_note_to_user` fails, show inline error: *"I couldn't pass it on right now — try again in a sec."* | Card collapses; confirmation bubble | Visitor cancels → card dismisses; Greeter says *"No worries…"* |
| **Rate-limit** | n/a | n/a | n/a | n/a (this IS the limit state) | After `retryAfter`, input re-enables silently | n/a |
| **Intro-request preview** | "Drafting…" shown briefly while Greeter composes | Card appears with draft + collapsed transcript | n/a (card is non-streamed) | If send fails, inline error in card: *"Couldn't send it — try again?"* with Retry button | Card collapses; Greeter confirms with "if it lands…" | Anti-persona refusal path: card never appears; soft decline message instead |
| **Representative-posture** | Greeter first turn streams in | Header + avatar visible from page load | First turn streams character-by-character (Ethos v32 / chat-streaming convention) | If Greeter prompt fails, show *"⊙ Alex needs a minute — try refreshing."* | First turn complete, pills appear | n/a |

---

## Process-Owner Perspective

The owner (Tim) shares `ditto.partners/people/timhgreen` on LinkedIn. A few hours later, Tim opens his workspace inbox:

- He sees one `forward_note_to_user` row: *"Anonymous visitor asked: 'Does Tim work with consumer companies?' — passed via Alex. {time ago}"* He answers in 30 seconds. The visitor (anonymous) doesn't get a direct reply, but the answer is now in the KB as `on-request` and the next visitor who asks gets the new answer cited.
- He sees one `AuthorizationRequestBlock` row with the Brief 248 affordances [Approve] / [Edit] / [Decline]. The card shows the draft intro message, the visitor's name/org, and the transcript (expandable). Tim reads the transcript first — gets the full context — then reads the draft. He hits [Edit] to soften one sentence, then [Approve]. The visitor gets an email reply from Tim directly.

The owner never sees the Greeter "behind the scenes" — they trust that Alex represented them faithfully because the page (a) made the representative posture clear to every visitor, and (b) brought only high-signal asks into the inbox. **The UX recommendations above are the design defense of that trust.**

---

## Original-to-Ditto Patterns

Three patterns in this spec are not adapted from existing products — they're original to this surface:

1. **"⊙ {Greeter} · representing {first}" chat header** — sidesteps both the "AI representative" disclaimer pattern (Intercom) and the "this IS the person" pattern (process-os Charlie). Honest about the posture without disclaiming AI nature.
2. **Prefill-not-send quick pills** — most chat products send immediately; this surface holds the visitor's draft in the input so they can edit before talking to (about) a real person.
3. **Pause-state Greeter turn for rate-limit** — instead of system banners, the Greeter says "I need a minute." Preserves persona consistency and the warmth of the surface.

The Architect should consider whether any of these patterns deserves an insight doc — particularly #1, which generalizes to any "AI representing an absent human" surface.

---

## Designer Recommendations to the Architect

Adopt these into the Brief 259 §User Experience section (or, equivalently, reference this doc inline as the canonical UX spec):

| # | Recommendation | Brief 259 location |
|---|---|---|
| 1 | Pill ordering: Orient → Differentiator → Fit → Action | §What Changes / quick-start-pills.tsx |
| 2 | Pills prefill, do not send-immediately | §What Changes / profile-chat-client.tsx |
| 3 | Forwarded-note inline confirm card with editable question + optional name/org | §What Changes / profile-chat-client.tsx (new sub-component) + §Constraints update if needed |
| 4 | Rate-limit pause-state Greeter turn (NOT system banner) | §Constraints + §What Changes |
| 5 | Intro-request preview: two-zone layout, transcript collapsed by default | §What Changes / profile-chat-client.tsx |
| 6 | Chat header: `⊙ {Greeter} · representing {first}` — persistent representative-posture anchor | §What Changes / profile-chat-client.tsx (header sub-component) |
| 7 | Greeter avatar = persona color glyph, distinct from owner's profile photo | §What Changes |
| 8 | First Greeter turn template (generated per-owner) — establishes posture conversationally | §Constraints + §What Changes / network-chat-prompt.ts |

**Open question for the Architect (Decision 3 risk):** the pause-state Greeter turn uses first-person ("I need a minute"). Confirm this is consistent with Hard Rule #3 (No AI self-disclosure — which forbids "I'm an AI / chatbot / language model" but not first-person Greeter speech in general). If the reviewer flags this, fall back to a system-styled message: *"⊙ Alex is resting — back in {retryAfter}."*

---

## Reference Docs Updated

- *None yet* — this doc is the canonical UX spec for Brief 259. After Architect absorbs it into the brief, this doc becomes a historical companion.

## Reference Docs Checked

- `docs/human-layer.md` — six human jobs map to this surface as **Orient + Decide for visitor, downstream Capture for owner**. No drift to update.
- `docs/personas.md` — the visitor on this surface is **NOT one of the four canonical personas**. The owner is one of the four (Lisa or Jordan most likely cohort). Personas doc does not need a "visitor" persona added — this surface's primary user is an explicitly out-of-system actor, and the spec calls that out. No drift.
- `docs/research/network-agent-character-and-experience-ux.md` — the three-layer journey framing (network participant → active user → workspace user) applies: the visitor on this page is at Layer 1 ("I've heard of Ditto") if anywhere. No drift; this spec extends rather than contradicts.
- `docs/research/ai-chat-ux-patterns-competitive-audit.md` — competitive patterns surveyed are consistent with this spec's recommendations. No drift.

---

## Status

**Draft — pending review by Dev Reviewer and absorption by Dev Architect into Brief 259.**
