# UX Interaction Spec: Self-Driven Workspace Transitions

**Date:** 2026-03-25
**Role:** Dev Designer
**Triggered by:** Unresolved question: when a user starts a conversation, how does the centre column adapt and evolve as Self determines the right mode?
**Status:** Draft v1
**Consumers:** Dev Architect (new brief or Brief 045 extension), Dev Builder
**Human jobs served:** Orient, Review, Define, Delegate, Capture (Decide partially — see gap note in scenarios)
**Provenance:** Melty + v0 patterns at composition level (pattern). Full provenance table in output-as-artifact-ux.md.
**Depends on:** Insight-086 (Composable UI), ADR-021 (Surface Protocol), Brief 045 (Component Protocol)

---

## The Problem

Ditto has a chat input at the bottom of the centre column. The user types something. What happens to the content above it?

Currently: nothing. The conversation grows in conversation-only mode OR the user is in workspace mode with a feed. There's no mechanism for the Self to transition the workspace based on what the user asked. The Self can respond with text and structured data, but it cannot change what the centre canvas shows, what the right panel renders, or how the workspace frame adapts.

This is the missing connective tissue between:
- Conversation and feed (when does chat become the dominant surface?)
- Conversation and process creation (when does the Process Builder appear?)
- Conversation and artifact review (when does an output fill the right panel?)
- Conversation and navigation (when does the user end up at a process detail view?)

Without this, every mode transition is manual — the user clicks in the sidebar or the Self suggests "go look at your workspace." That breaks the composable UI principle (Insight-086): the Self should compose the experience based on context.

---

## Design Principle: The Conversation Is Always In The Centre

The user's primary interaction is always through the chat input at the bottom of the centre column. The centre column can show:
- Feed cards (when the user is orienting)
- Conversation messages (when the user is talking to the Self)
- Process detail (when the user drills into a process)
- Guided input cards (when the Self is collecting information)

These are **not separate pages.** They're different compositions of the same centre canvas. The conversation doesn't replace the feed — it grows from the input upward, and the Self determines what else to show alongside it.

**Key insight from the Melty/v0 analysis:** The conversation IS the primary workspace. Everything else is contextual to what's being discussed.

---

## The Mechanism: Context Signals

### What Exists Today (and works well)

The `credential-request` pattern is already proven:
1. Self calls a tool (`connect_service`)
2. Tool result includes a signal (`credentialRequest: {...}`)
3. Streaming layer emits a typed event (`{ type: "credential-request", ... }`)
4. Frontend renders a completely different UI element (masked input field)
5. The Self never mentions panels, inputs, or layout — it just calls a tool

### Extending This: `context-shift` Events

The streaming layer (`self-stream.ts`) already translates tool results into UI events. Extend this with a new event type:

```
{ type: "context-shift", context: ContextShift }
```

Where `ContextShift` is one of:

| Context | Meaning | Triggered by tool |
|---------|---------|-------------------|
| `{ mode: "process-builder", yaml?, slug? }` | Self is helping define/refine a process | `generate_process` (save=false) |
| `{ mode: "process-detail", processId }` | Self wants to show a specific process | `get_process_detail`, `generate_process` (save=true) |
| `{ mode: "artifact-review", runId, outputType }` | A process output is ready for review | `approve_review`, `start_dev_role` completion, or heartbeat producing output |
| `{ mode: "briefing", data }` | Morning briefing / proactive summary | `get_briefing` |
| `{ mode: "feed" }` | Return to default feed view | Conversation naturally ending, or explicit "show me my feed" |

**The Self never says "switch panels."** It calls tools. The streaming layer detects the tool result and emits the appropriate context-shift. Each surface interprets the signal its own way.

### Reconciliation with `artifact_focus` (output-as-artifact-ux.md)

The output-as-artifact spec proposes an `artifact_focus` signal for telling the right panel to render an artifact. `context-shift` subsumes `artifact_focus` — it's a superset that also covers process-builder, briefing, and feed modes, not just artifacts. The `artifact_focus` signal from the artifact spec should be understood as a specific `context-shift` variant: `{ mode: "artifact-review", ... }`. The Architect should unify these into one signal taxonomy, not two.

### Why Not Just Watch Tool Names on the Frontend?

Simpler, but:
1. Couples every surface to knowing tool names and parsing their results
2. Each surface independently decides what a tool result means — inconsistent
3. The streaming layer is already the translation point (it already does this for `credential-request`)
4. The context-shift is a **semantic signal** — "we're now building a process" — not an implementation detail

### Phasing Strategy

**Phase 10 (now):** Frontend watches for tool names in `tool-call-result` events. Simple. No protocol change. Gets the behaviour working so we can validate the UX. **Guardrail:** Use a single constant map (`TRANSITION_TOOL_MAP = { generate_process: "process-builder", get_process_detail: "process-detail", ... }`) rather than string matching scattered across components. Makes the Phase 11 migration to `context-shift` events a single-point replacement.

**Phase 11 (protocol):** Graduate to `context-shift` events in `self-stream.ts`. Needed when Brief 045 ships the component protocol and we have proper content block rendering. This is when the streaming layer becomes the canonical translation point.

---

## The Five Transition Scenarios

### Scenario 1: Quick Question (Ambient)

Rob is on the feed. Types: "how's the Henderson quote going?"

**What happens:**
1. Messages appear above the input. The feed scrolls up naturally.
2. Self responds: "Henderson quote was sent 2 hours ago. Customer hasn't responded yet. I'll flag it if nothing by tomorrow."
3. That's it. 2 messages in the conversation. Feed is still accessible by scrolling up.

**Centre column:** Feed → feed with conversation overlay (messages at the bottom, feed scrolled up above)
**Right panel:** No change (stays on contextual intelligence / morning thoughts)

**Key design:** The conversation doesn't replace the feed. It grows from the bottom. Short exchanges stay ambient — the user can scroll up to see the feed again. This is the "asking your colleague a quick question" model.

**What the Self emits:** Text response only. No tool call. No context-shift. The frontend does nothing special.

### Scenario 2: Process Creation (Explore)

Lisa types: "I spend hours writing listing descriptions for every new property"

**What happens:**
1. Self recognises this as process definition territory.
2. Self asks clarifying questions: "Where do property details come from? Do you have a template or style guide?"
3. After 2-3 exchanges, Self has enough to propose a process.
4. Self calls `generate_process(save=false)` with a preview YAML.
5. Streaming layer emits: `{ type: "context-shift", context: { mode: "process-builder", yaml: "..." } }`

**Centre column:** Conversation (messages accumulated from the exchanges)
**Right panel transitions:** Contextual intelligence → Process Builder

```
┌────────┬──────────────────────────┬──────────────────┐
│ Nav    │ Conversation             │ PROCESS BUILDER  │
│        │                          │                  │
│        │ Lisa: "I spend hours     │ Listing          │
│        │  writing listing desc-   │ Description      │
│        │  riptions..."            │ ● Drafting (3/6) │
│        │                          │                  │
│        │ Ditto: "This sounds like │ INPUTS           │
│        │  content generation.     │ ☑ Property brief │
│        │  Where do details come   │ ☑ Photos (6-12)  │
│        │  from?"                  │ ☑ Style guide    │
│        │                          │                  │
│        │ Lisa: "Inspection notes  │ STEPS            │
│        │  and photos"             │ 1. Extract       │
│        │                          │    features [AI] │
│        │ Ditto: "Here's what I'd  │ 2. Draft copy    │
│        │  suggest..."             │    [AI]          │
│        │                          │ 3. Review [Lisa] │
│        │                          │                  │
│        │                          │ QUALITY          │
│        │                          │ ○ Not yet defined│
│        ├──────────────────────────┤                  │
│        │ "What about your         │                  │
│        │  brand voice?"        ↑  │                  │
└────────┴──────────────────────────┴──────────────────┘
```

**As the conversation continues:** Each time the Self calls `generate_process(save=false)` with updated YAML, the right panel updates. The Process Builder shows the emerging structure. Lisa sees her process taking shape as she talks.

**When Lisa says "save it":** Self calls `generate_process(save=true)`. Streaming layer emits `{ type: "context-shift", context: { mode: "process-detail", processId: "listing-description" } }`. Centre transitions to process detail view. Right panel shows trust evidence ("Supervised — new process"). Self says: "Your listing description process is live. I'll check every output until I've earned your trust."

**Critical transition:** The shift from conversation → process detail is the only layout change that's NOT gradual. The conversation has served its purpose — the process exists. The centre canvas switches to show the process detail. The conversation history is accessible via a "back to conversation" affordance or the nav sidebar.

### Scenario 3: Output Review (Operate)

Rob opens the app. Feed shows: "Henderson quote ready — $14,200"

**What happens (without conversation):**
1. Rob clicks the feed card.
2. Centre shows the review detail (quote specifics, Ditto's narrative about what it checked).
3. Right panel shows the artifact (the actual quote) with review controls.
4. Rob approves or edits on the artifact. Done.

This is NOT a Self-driven transition — it's user-initiated navigation. No conversation involved. The right panel adapts to "artifact-review" mode based on what the centre is showing (this is the existing reactive right panel from the workspace redesign spec).

**What happens (with conversation):**
1. Rob types: "show me the Henderson quote"
2. Self calls `get_process_detail` or retrieves the process run.
3. Context-shift: `{ mode: "artifact-review", runId: "...", outputType: "quote" }`
4. Centre: conversation stays (Self narrating what it did). Right panel: the artifact.

```
┌────────┬──────────────────────────┬──────────────────┐
│ Nav    │ Conversation             │ HENDERSON QUOTE  │
│        │                          │ ● Under Review   │
│        │ Rob: "show me the        │                  │
│        │  Henderson quote"        │ Labour    $6,200 │
│        │                          │ Materials $5,800 │
│        │ Ditto: "Here's the       │ Margin    $2,200 │
│        │  Henderson quote. I      │ Total    $14,200 │
│        │  bumped labour to $22/hr │                  │
│        │  — you've corrected      │ ✓ Margin: 15.5%  │
│        │  bathroom rates 3 times  │ ✓ All fields     │
│        │  now."                   │ ! Labour bumped  │
│        │                          │                  │
│        │                          │ [Approve & send] │
│        │                          │ [Edit]           │
│        │                          │                  │
│        │                          │ Based on:        │
│        │                          │ · 34 past quotes │
│        │                          │ · Your corrects  │
│        ├──────────────────────────┤                  │
│        │ "Looks good, approve"  ↑ │                  │
└────────┴──────────────────────────┴──────────────────┘
```

### Scenario 4: Dev Mode — Code Output (Explore/Operate hybrid)

Jordan types: "Add intake classification to the Self tools"

**What happens:**
1. Self calls `start_dev_role` (dev-architect → dev-builder → dev-reviewer pipeline).
2. During execution: Self streams status updates. Centre shows the conversation with collapsible progress blocks.
3. When complete: Self emits the review result. Context-shift to `artifact-review` with code output.
4. Right panel shows the Melty-inspired file changes view.

```
┌────────┬──────────────────────────┬──────────────────┐
│ Nav    │ Conversation             │ CHANGES 6        │
│        │                          │ ● Review (2 flags│
│        │ Jordan: "Add intake      │                  │
│        │  classification"         │ self-tools/      │
│        │                          │  intake.ts   +53 │
│        │ Ditto: "I'll design and  │ self.ts       +12│
│        │  build an intake tool."  │ schema.ts      +8│
│        │                          │ tests/           │
│        │ ▸ Architect: 4 decisions │  intake.test +47 │
│        │                  1.2m    │ processes/       │
│        │ ▸ Builder: 23 tool calls │  intake.yaml  +2 │
│        │                  2.1m    │ docs/            │
│        │ ▸ Reviewer: PASS w/ 2   │  state.md    +15 │
│        │   flags (1 fixed)        │                  │
│        │                          │ ✓ Tests passing  │
│        │ "Done. The intake tool   │ ✓ Types clean    │
│        │  routes by keywords      │ ● 1 open flag    │
│        │  first, falls back to    │                  │
│        │  LLM routing."           │ [Approve] [Edit] │
│        ├──────────────────────────┤                  │
│        │ "Show me the flag"    ↑  │                  │
└────────┴──────────────────────────┴──────────────────┘
```

### Scenario 5: Mid-Conversation Mode Escalation

Rob types: "the Henderson customer called, they want to add hot water to the quote"

**What happens:**
1. Self recognises this as a capture + potential process invocation.
2. Self responds: "Got it. I can revise the Henderson quote to add hot water. Do you have specs — electric or gas, what size cylinder?"
3. Rob: "Gas, standard 180L"
4. Self calls `create_work_item` (to log the change request) and then triggers the quoting process with the update.
5. While running: context-shift to `{ mode: "artifact-review" }` — the revised quote appears in the right panel as it's being built.

**The escalation:** This started as ambient (capture), became focused (Self asking questions), then became creative (quote being revised in the artifact panel). The mode escalated naturally based on what the conversation needed. Rob didn't choose a mode. The Self chose for him.

### Scenario 6: Trust Upgrade Decision (Decide)

Ditto has been tracking Rob's quoting process. 20 runs, 0 corrections, all approved within minutes. The Self proactively surfaces this during the morning briefing:

**What happens:**
1. Self includes in the morning brief: "Your quoting process has been flawless for 20 runs. I'd recommend upgrading from Supervised to Spot-checked — I'd only show you ~1 in 5 quotes instead of every one."
2. Rob types: "show me the evidence"
3. Self calls `get_process_detail` for the quoting process.
4. Context-shift: `{ mode: "process-detail", processId: "quoting" }` — but the right panel emphasises trust evidence, not the general process view.

```
┌────────┬──────────────────────────┬──────────────────┐
│ Nav    │ Conversation             │ TRUST EVIDENCE   │
│        │                          │                  │
│        │ Ditto: "Your quoting     │ Quoting Process  │
│        │  process has been        │ Current: Superv. │
│        │  flawless for 20 runs.   │ Proposed: Spot-  │
│        │  I'd recommend..."       │  checked         │
│        │                          │                  │
│        │ Rob: "show me the        │ EVIDENCE         │
│        │  evidence"               │ 20 runs, 0 corr. │
│        │                          │ Avg review: 45s  │
│        │ Ditto: "Here's what      │ Accuracy ████████│
│        │  I'm basing this on."    │ Quality  ████████│
│        │                          │                  │
│        │                          │ SAFETY NET       │
│        │                          │ Auto-downgrade   │
│        │                          │ if 2+ issues in  │
│        │                          │ next 10 runs     │
│        │                          │                  │
│        │                          │ [Approve upgrade]│
│        │                          │ [Keep supervised]│
│        ├──────────────────────────┤                  │
│        │ "Yeah upgrade it"     ↑  │                  │
└────────┴──────────────────────────┴──────────────────┘
```

**The Decide job:** Rob is deciding whether to change the trust level. The right panel shows evidence (not just data, but a recommendation with safety net). The conversation provides the narrative. This is the Decide pattern: proposal + evidence + action.

**Gap note:** The `context-shift` taxonomy doesn't have a dedicated "decision" mode — this reuses `process-detail` with emphasis on trust evidence. A future "decision" context-shift mode may be warranted when Ditto surfaces more decision types (process improvements, model routing changes, cost optimisations). Deferred to Phase 12+.

---

## Transition Rules

### Session Boundaries and App Reopen

When the user closes the tab and returns later, the centre column state depends on session status (Briefs 029/030):

- **Session still active (within 30min idle timeout):** Centre shows feed with the previous conversation messages below it (scrolled above the input). The user can scroll down to resume.
- **Session suspended (>30min idle):** Centre shows feed only. The previous conversation is accessible via session history in the sidebar (if implemented) but doesn't persist visually in the centre column. Clean slate.
- **Process detail was active:** Centre returns to feed. The process detail was a navigation state, not a persistent one. The user can re-navigate via sidebar.

**Principle:** Each app open feels like a fresh start with the feed. The Self greets contextually ("Welcome back. Since you left, Henderson approved the quote."). Previous conversations don't clutter the centre — they're history, not context.

### When Does the Conversation Take Over the Centre?

**Rule:** The first user message always appears above the input, pushing the feed upward. The conversation doesn't "take over" — it coexists. The feed is above, conversation is below (nearest to the input). As the conversation grows, the feed naturally scrolls out of view.

**There is no "conversation mode" toggle.** The conversation is always happening at the bottom of the centre column. The feed is always above it. The ratio shifts based on how much conversation has occurred.

**Exception:** When a context-shift to `process-detail` occurs (process saved, or user navigated to a process), the centre canvas changes entirely. The conversation history is accessible but the canvas shows the process detail. This is a navigation event, not a conversation event.

### When Does the Right Panel Change?

| Trigger | Right panel becomes | Reversible? |
|---------|-------------------|-------------|
| Self calls `generate_process(save=false)` | Process Builder | Yes — clears when conversation topic changes |
| Self calls `generate_process(save=true)` | Trust evidence for new process | Follows centre to process detail |
| Self calls tool that retrieves a process run output | Artifact viewer | Yes — clears when user moves on |
| User clicks a review card in the feed | Artifact viewer | Yes — clicking elsewhere dismisses |
| User navigates to process detail via sidebar | Process trust + performance | Standard navigation |
| Conversation ends / user scrolls up to feed | Returns to contextual intelligence | Automatic |
| Self calls `get_briefing` | Briefing panel | Yes — clears after interaction |

**Rule:** The right panel always has a **default state** to return to: contextual intelligence (what Ditto is thinking about, proactive suggestions). Any context-shift is temporary — when the triggering context goes away, the panel returns to default.

### How Does the User "Go Back"?

1. **Scroll up** — conversation messages are below, feed is above. Scrolling up reveals the feed.
2. **Click Home in nav** — explicit navigation. Clears the conversation from view (but doesn't destroy it — the session persists).
3. **Click a sidebar item** — navigates to that process. Conversation slides away.
4. **Right panel auto-returns** — when the conversation topic changes or ends, the right panel returns to contextual intelligence.

There is no "close conversation" button. The conversation is always present at the bottom. It simply becomes less prominent when the user hasn't typed recently and the feed has new content to show.

---

## Mobile Adaptation

The three-tier responsive model (aligned with output-as-artifact-ux.md):

| Breakpoint | Layout | Context-shift behaviour |
|-----------|--------|------------------------|
| **>=1280px** | Full three-panel | Right panel transitions persistently |
| **1024-1279px** | Collapsed sidebar (icon rail) + centre + right panel as overlay | Context-shifts open the right panel as a slide-in overlay |
| **<1024px** | Single column, hamburger nav | Context-shifts render inline or as bottom sheets (see below) |

### How Context-Shifts Render on Mobile (<1024px)

| Context-shift | Mobile rendering |
|--------------|-----------------|
| `process-builder` | Self summarises the emerging process inline in the conversation. "Here's what we've defined so far: [inline card]" |
| `process-detail` | Full-screen navigation to process detail (like clicking a sidebar item) |
| `artifact-review` | Bottom sheet slides up with the artifact. Swipe down to dismiss. "View quote →" affordance in conversation. |
| `briefing` | Inline in conversation (already works — the briefing IS a conversation response) |
| `feed` | Return to feed view (the default mobile home) |

**Key principle:** On mobile, the Self does the cognitive work that the right panel does on desktop. Instead of a persistent artifact panel, the Self narrates: "I've revised the Henderson quote. Total is now $16,400 with the hot water addition. [View quote →]"

The "View quote →" tap opens the artifact as a full-screen sheet — same rich rendering, provenance, review controls. Swipe to dismiss, back to conversation.

---

## Interaction States

### Centre Column States

| State | Content | Transition in | Transition out |
|-------|---------|--------------|----------------|
| **Feed only** | Feed cards, shift report, no recent conversation | App load, "Home" click | User types → conversation appears |
| **Feed + conversation** | Feed above (scrolled up), conversation at bottom | User sends first message | Conversation grows; or user scrolls up to feed |
| **Conversation dominant** | Multi-turn conversation fills the centre. Feed far above. | Extended back-and-forth | User clicks Home, or navigates via sidebar |
| **Process detail** | Process steps, health, trust — replaces conversation | Context-shift to process-detail, or sidebar click | Back button, Home click, or new conversation starts |

### Right Panel States

| State | Content | Source |
|-------|---------|--------|
| **Contextual intelligence** (default) | Morning thoughts, proactive suggestions, general guidance | Default; returns here when no context-shift active |
| **Process Builder** | Emerging YAML structure with progress badge | `generate_process(save=false)` context-shift |
| **Artifact viewer** | Full rendered output with review controls + provenance | Review card click, or artifact-review context-shift |
| **Trust evidence** | Trust tier, evidence narrative, performance data | Process detail navigation |
| **Briefing** | Structured morning briefing with priorities | `get_briefing` context-shift |
| **Loading** | Skeleton of expected content shape | Any context-shift while data loads |
| **Empty** | "Ask Ditto anything" placeholder | No context available, no recent activity |

---

## What This Spec Does NOT Cover

- **The composition model** (Insight-086) — how the Self decides WHICH components to compose in the centre canvas. That's a broader question about the Self's compositional intelligence. This spec covers the transition mechanism (context-shifts), not the composition algorithm.
- **Content block rendering** — how individual components (review cards, data tables, code diffs) render. That's Brief 045 (Component Protocol).
- **The Self's intent classification** — how the Self knows "this is a process creation conversation" vs "this is a quick question." That's the Self's cognitive framework + tool selection logic.
- **Conversation session lifecycle** — when sessions start, suspend, resume. That's already designed (Briefs 029/030).

---

## Persona Stress Test

### Rob (plumber, phone between jobs)

**Morning (mobile):** Opens app. Sees feed with shift report. Types "anything urgent?" Self responds inline: "Henderson quote was approved by the customer — they want to start Monday. You have 2 new quote requests." Rob scrolls down to see them. Taps one → bottom sheet shows the quote artifact. Approves. Done.

**No mode switches felt.** The conversation was 2 messages. The artifact appeared as a sheet. Rob never left the feed.

**Midday (phone on site):** Types "Henderson customer wants to add hot water, gas 180L". Self captures, asks one question, triggers quoting. "I'll revise the quote. Check back in a few minutes."

**No mode switches felt.** The conversation was 3 messages. The revised quote will appear in the feed when ready. Rob doesn't need the process builder or artifact panel — those are desktop experiences.

### Lisa (agency manager, desktop)

**Morning (desktop):** Feed shows 3 listing descriptions ready. She clicks the first → right panel shows the artifact (the listing description with photos). She reads, approves. Clicks next → right panel swaps. Approve. Next. Approve. Three reviews in 90 seconds.

**The mode switch is user-initiated** (clicking feed cards). The right panel reacts. The conversation isn't involved.

**Afternoon (desktop):** Types "I want a process for social media posts from new listings." Conversation grows. Self asks questions. After 3 exchanges, Process Builder appears in the right panel. Lisa sees the process taking shape. Refines. Saves.

**The mode switch was Self-initiated** — the Process Builder appeared when the Self called `generate_process`. Lisa didn't configure anything. She just talked.

### Jordan (dev, desktop)

**Dev session:** Types "implement the context-shift event type we discussed." Self calls `start_dev_role`. Conversation shows collapsible progress blocks. When complete, right panel shows code changes (Melty-style). Jordan reviews diffs, checks the flags, approves.

**The mode was always "creative."** The conversation started, the artifact panel appeared during execution, and review happened in the right panel. One continuous flow.

### Nadia (executive, desktop)

**Weekly check (desktop):** Opens app. Feed shows weekly summary. Types "how are we doing on the new hire onboarding?" Self calls `get_process_detail` for the onboarding process. Context-shift: `{ mode: "process-detail", processId: "onboarding" }`. Right panel shows trust evidence + performance sparklines for onboarding. Centre stays in conversation — Self narrates the health data ("14 hires processed this month, average onboarding time down 20%, document review step is the bottleneck — 3 days average vs 1 day target").

Nadia asks: "why is the document review step taking so long?" Self drills into step-level data in the conversation. Right panel stays on process detail with the relevant step highlighted.

**One context-shift** (`process-detail`) triggered by `get_process_detail`. Nadia stays in conversation. The right panel provides the data backdrop while the Self provides the narrative.

---

## Primitives Affected

| Primitive | Change | Human Job |
|-----------|--------|-----------|
| Conversation Thread (P8) | Conversation grows from bottom of centre; coexists with feed above | Define, Review, Capture |
| Process Builder (P9) | Appears in right panel via context-shift, not as a dedicated page | Define |
| Output Viewer (P6) | Renders in right panel via context-shift when artifact is ready | Review |
| Activity Feed (P3) | Coexists with conversation in centre column | Orient |
| Daily Brief (P1) | Can be triggered as a context-shift to right panel via `get_briefing` | Orient |
| Trust Control (P11) | Appears in right panel when process detail is shown | Delegate |

---

## Implementation Recommendation

### Phase 10 (immediate — can absorb into Brief 045 or standalone)

1. **Conversation coexists with feed in centre column.** Messages appear above the input, below the feed. No toggle, no mode switch. Just scrolling.
2. **Right panel reacts to tool results.** Frontend watches `tool-call-result` events for `generate_process` and `get_process_detail`. Switches right panel content accordingly. Simple. No protocol change.
3. **Process Builder component** as a right panel variant. Renders YAML structure with progress badge.
4. **Artifact viewer component** as a right panel variant. Renders process output with review controls.

### Phase 11 (protocol — when Brief 045 ships component protocol)

5. **`context-shift` event type** in `SelfStreamEvent`. Streaming layer emits these instead of frontend parsing tool names.
6. **Surface-specific interpretation.** Web handles context-shifts as panel transitions. Telegram ignores them (Self text is sufficient). Mobile renders as inline cards + bottom sheets.

### Phase 12+ (composition intelligence)

7. **Self composition logic.** The Self doesn't just emit context-shifts — it composes the entire centre canvas from the component catalog (Insight-086). This is the full vision. Context-shifts are the stepping stone.

---

## Relationship to Existing Specs

| Spec | Relationship |
|------|-------------|
| [workspace-layout-redesign-ux.md](workspace-layout-redesign-ux.md) | This spec extends it. The three-panel layout is correct. This adds the transition mechanics between panel states. |
| [output-as-artifact-ux.md](output-as-artifact-ux.md) | This spec provides the mechanism. That spec said "the right panel should become an artifact viewer." This spec says HOW and WHEN. |
| Brief 045 (Component Protocol) | The rendering infrastructure. This spec says what transitions happen; 045 says how content renders once the transition occurs. |
| Insight-086 (Composable UI) | The long-term vision. This spec is step 1: context-shifts. Step 2 (Phase 12+): full composition. |
| ADR-021 (Surface Protocol) | The content block types. `context-shift` is a new event type that sits alongside content blocks, not inside them. |

---

## Reference Doc Status

- `docs/architecture.md` — **Drift detected:** Explore mode is defined as "Conversation + Process Builder (dual pane)" in the centre canvas. This spec proposes Process Builder in the right panel instead, keeping the centre as a pure conversation surface. Architect to evaluate and update.
- `docs/human-layer.md` — **Drift detected:** No mention of conversation coexisting with feed in centre column. Primitive 8 (Conversation Thread) describes a dedicated dual-pane, not conversation-growing-from-input. Needs update by Architect.
- `docs/insights/086-composable-ui-not-fixed-pages.md` — **Reinforced.** This spec is the first concrete mechanism toward composable UI.
- `docs/research/workspace-layout-redesign-ux.md` — **Extended, not superseded.** Layout fixes stand. Transition mechanics are new.
- `docs/research/output-as-artifact-ux.md` — **Extended.** The "how and when" for artifact panel transitions.

---

## Next Steps

→ Dev Reviewer (mandatory — spawned below)
→ Dev Architect: Design `context-shift` into ADR-021 or Brief 045. Evaluate whether this is a Brief 045 extension or Brief 046.
→ Dev Builder: Implement Phase 10 items (conversation + feed coexistence, right panel reacting to tool results)
