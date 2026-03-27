# Ditto — Prototype-as-Specification Strategy

**Date:** 2026-03-25
**Author:** Dev Designer
**Status:** Draft — awaiting human approval
**Scope:** How to close the gap between prototypes and the built UI, and prevent it from happening again

---

## The Problem

Phase 10 shipped 7 briefs in one day. The built UI is functional but visually and experientially disconnected from the 13 HTML prototypes that defined what Ditto should feel like. The screenshot shows a generic chat app with a sidebar. The prototypes show a warm, intelligent workspace where knowledge is visible, trust is earned through evidence, and the system feels alive.

The root cause: **prototypes were treated as inspiration, not specification.** Builder briefs were scoped around architectural deliverables (component protocol, feed assembler, workspace transitions) rather than "make this screen match this prototype." The prototypes froze at Draft v1 when the agent advised stopping refinement, and the gap between Draft v1 and build-ready was filled by generic implementation patterns.

---

## The Strategy: Prototypes ARE the Specification

### Principle

Every screen a user interacts with must exist as an approved HTML prototype before the Builder touches it. The prototype is the acceptance criterion. "Done" means "matches the prototype."

### How Impeccable Helps

The `/teach-impeccable` and `/frontend-design` skills solve a specific problem: they give the AI persistent design context so it doesn't default to generic patterns. Here's how they fit:

**Step 1: Run `/teach-impeccable` once.** This captures Ditto's design context — personas, brand personality (warm professional), aesthetic direction (cream/terracotta, Inter, quiet), accessibility requirements — and persists it to `.impeccable.md`. Every future design invocation reads this file first.

**Step 2: Use `/frontend-design` for every prototype.** Instead of the Designer hand-coding HTML prototypes (which is what happened for P08-P20), the Designer describes the screen's purpose, content, and interaction states, and `/frontend-design` produces the HTML with the correct design system baked in via `.impeccable.md`. This means:
- Consistent visual identity across all prototypes (no drift between sessions)
- Higher production quality per prototype (micro-interactions, transitions, responsive states)
- Faster iteration (describe changes, regenerate)

**Step 3: Use `/frontend-design` for the React build too.** When the Builder implements from prototypes, they also have `.impeccable.md` context. The same design DNA flows from prototype to production.

### What Changes in the Process

| Before | After |
|--------|-------|
| Designer produces HTML prototypes manually | Designer uses `/frontend-design` with `.impeccable.md` context |
| Prototypes are "Draft v1" — good enough to inspire | Prototypes are "Build-Ready" — exact pixel targets with all states |
| Builder briefs describe architecture | Builder briefs reference specific prototypes as AC |
| Review checks code against architecture checklist | Review compares screenshots against prototype screenshots |
| Prototypes stop when building starts | Prototypes evolve alongside the build (spec stays ahead) |

---

## The Complete Screen Inventory

Every screen the user interacts with, mapped to prototypes. Nothing hand-waved. All prototypes use **Libby's content** (doula → education business, brand voice, social content, knowledge capture) as the single consistent test case.

**Mobile deferred.** Mobile prototypes (P12, P21) are out of scope for now. We come back to them. Desktop-first for all screens.

### First-Principles Audit

This inventory was audited against the full design system:
- **Vision.md** — 8 principles, harness-as-product
- **Architecture.md** — 6 layers, nested harness model, 3 activity contexts
- **Human-layer.md** — 16 primitives, 8 view compositions, 6 human jobs
- **ADR-010** — workspace interaction model, work evolution, meta-processes
- **ADR-009** — process output architecture, catalog-constrained rendering
- **ADR-021** — surface protocol, 13+ content block types
- **Personas.md** — Libby (building phase), Rob (operating), Lisa, Jordan, Nadia

The audit surfaced **3 missing screens** not in the original inventory (marked NEW below): Process Index, Process Flow Map, and Improvement Queue. These map directly to human-layer.md primitives and view compositions that had no prototype coverage.

A deeper audit against all 22 ADRs and ~100 active insights surfaced **2 additional screens** (P00 Workspace Shell, P29 Process Model Library) and **7 spec enrichments** to existing screens. See "ADR/Insight Cross-Reference Audit" section below for full analysis.

### Foundational

| Screen | Prototype | What Libby sees | States needed | Status |
|--------|-----------|----------------|---------------|--------|
| **Workspace Shell** | P00 | The stable three-column frame everything lives inside. Left sidebar (collapsible), centre content area, right context panel (collapsible). Not a "screen" the user navigates to — it's the container for all screens. The Builder must implement this shell exactly before any content screens. | Sidebar expanded/collapsed, right panel open/closed/contextual, full-width mode (first visit before workspace emerges), responsive at 1280px+ | **NEW** — Insight-086: composable UI needs an explicit frame prototype. Without this, every screen implicitly reinvents the shell. |
| **Process Model Library** | P29 | "Start with a proven approach." Browse pre-built process templates: "Social Content for Solopreneurs," "Client Onboarding," "Weekly Newsletter." Each card shows: what it does (plain language), what apps it needs, trust starting point, estimated time-to-value. Tap to preview → bind your apps → activate. | Browsing (card grid), preview (expanded card with steps), binding (connect your Instagram/scheduler), activated (process appears in workspace), empty search | **NEW** — ADR-008 (process discovery), ADR-019 (standards library), Insight-099 (process model library). The bridge between "raw conversation" and "structured process." Not required for Act 1 (Libby's first process emerges from conversation) but critical for Act 2+ when she wants her second process faster. |

### Act 1: Getting Started (Week 0)

| Screen | Prototype | What Libby sees | States needed | Status |
|--------|-----------|----------------|---------------|--------|
| **Setup / Connection** | P23 | Connect to an LLM. Auto-detects Claude CLI. Warm, not technical. | Fresh install, CLI detected, API key entry, connection test, success | Not prototyped — must prototype before P08 |
| **Day Zero** | P08 | "Hi. I'm Ditto." Quick-start options matching her JTBD. No chrome. | First visit, warm welcome, quick-start buttons | Draft v1 — needs build-ready pass |
| **First Conversation** | P09 | Libby describes her doula → education business. Knowledge panel slides in showing what Ditto is capturing (brand voice, ideal client, content themes). Process proposal emerges. | Conversation flowing, knowledge accumulating (dots for captured/gaps), synthesis card ("What I'm learning"), process proposal card | Draft v1 — needs build-ready pass |
| **First Output Review** | P10 | Libby's first 5 Instagram posts. "Based on" strip showing knowledge used (voice, client persona, survey themes). Inline editing. Ditto notices edits ("you changed 'baby' to 'bub' — noted"). | Reviewing, editing with diff, approved, teach-this prompt, bulk progress ("2 of 5 approved") | Draft v1 — needs build-ready pass |
| **Workspace Emerges** | P11 | Home screen gains structure. Journey card showing progress. What was produced. What's next (highlighted). Knowledge summary in right panel. | First process active, feed with work-done cards, sidebar visible, next-step card prominent | Draft v1 — needs build-ready pass |

### Act 2: Building Confidence (Week 1-3)

| Screen | Prototype | What Libby sees | States needed | Status |
|--------|-----------|----------------|---------------|--------|
| **Daily Workspace (Home)** | P13 | Morning view. Brief at top ("2 things need you"). Review items typed by kind ("CONTENT TO REVIEW"). Process status grid. Ditto's thinking in right panel (what it checked, confidence, knowledge used, suggestions). | Feed populated, review in progress, right panel contextual, quiet day (nothing needs attention) | Draft v1 — needs build-ready pass |
| **Review Queue** | P14a | The primary workspace. Batched outputs with confidence scores, pre-review summaries ("Tone check: passed, 1 flag"), "approve batch" / "spot-check 3". Each item shows what harness already checked. | Items pending, batch approve, spot-check mode, empty queue, high-priority item | **NEW** — not prototyped. "The single most important UI element in Ditto" (human-layer.md Primitive 5) |
| **Process Detail** | P14 | Drill into Libby's social content process. "How it works" (plain language steps). "How it's going" (metrics, sparkline). Trust control ("Check everything" ↔ "Let it run") with evidence narrative. Activity log (human + system timeline). | Active process, healthy metrics, degraded metrics, trust upgrade available | Draft v1 — needs build-ready pass |
| **Process Index** | P26 | All of Libby's processes in one view. Cards showing name, health, trust tier, last run, trend. Filterable. At scale (4+ processes): where Libby goes to see everything at a glance. Not a list — each card is a Process Card (Primitive 2). | Few processes (1-2), growing (3-5), at scale (6+), empty (pre-first-process) | **NEW** — maps to human-layer.md View Composition but no prototype exists. The sidebar shows processes, but there's no dedicated index/browse view. |
| **Process Flow Map** | P27 | How Libby's processes connect. The Paperclip-inspired view — see detailed description below. | Few nodes (2-3), full graph (5+), health mixed, node selected, edge selected, impact propagation highlighted | **NEW** — maps to Process Graph (Primitive 13) and Map View (View Composition 3). "Primary navigation surface" per architecture. |
| **Knowledge Base** | P15 | "What Ditto knows about me." Brand voice, ideal client persona, content themes, survey findings. Each item shows provenance (which conversation captured it). Editable. Shows gaps (greyed, "not yet captured"). | Categories populated, gaps visible, editing an entry, search, knowledge growth over time | Draft v1 — needs build-ready pass |

### Act 3: Trust Forming (Month 1-2)

| Screen | Prototype | What Libby sees | States needed | Status |
|--------|-----------|----------------|---------------|--------|
| **Teach This** | P16 | Libby corrects a post (changes tone). Ditto spots the pattern across 3 corrections. "You consistently make the opening more personal. Want me to always do this?" | Correction made (diff shown), pattern detected, teach confirmed, teach rejected | Draft v1 — needs build-ready pass |
| **Trust Upgrade** | P17 | "Your social content has been solid. 15 posts reviewed, 13 approved clean, corrections decreasing. Want me to send routine posts to your scheduling tool automatically?" Evidence bar. User decides. | Upgrade suggested with evidence, accepted, kept current, evidence detail expanded | Draft v1 — needs build-ready pass |
| **Second Process** | P18 | Libby adds email newsletter process. Workspace grows. Knowledge shared between social and email (same voice, same client persona). Process Flow Map shows the connection. | Process creation conversation, workspace with 2 processes in sidebar, shared knowledge visible | Draft v1 — needs build-ready pass |

### Act 4: The Compound Effect (Month 3+)

| Screen | Prototype | What Libby sees | States needed | Status |
|--------|-----------|----------------|---------------|--------|
| **Multi-Process Workspace** | P19 | 4+ processes running (social, email, landing page, course content). Process Flow Map shows the full system. Libby manages exceptions, not operations. | Multiple processes in sidebar, graph view, process health at a glance | Draft v1 — needs build-ready pass |
| **Something Wrong** | P20 | Email engagement drops. Ditto surfaces it calmly: "Your email open rates dropped 15% this week. The last 3 subject lines were longer than usual — that correlates with lower opens in your history." Recovery: "Revert to shorter format?" Trust auto-downgrades email from spot-checked to supervised. | Degradation detected, calm explanation with evidence, recovery options, trust downgrade shown, resolved | Draft v1 — needs build-ready pass |
| **Improvement Queue** | P28 | What Ditto suggests changing. Improvement Cards from the learning layer: "You always add a personal anecdote to high-performing posts. Make this a quality criterion?" Each shows diagnosis, evidence, suggestion, confidence. Apply / Modify / Dismiss / Discuss. | Items pending, detail expanded, improvement applied, improvement dismissed with reason | **NEW** — maps to Improvements View (View Composition 7) and Improvement Card (Primitive 12). No prototype exists. |

### Cross-Cutting

| Screen | Prototype | What it covers | States needed | Status |
|--------|-----------|---------------|---------------|--------|
| **Knowledge in Output** | P22 | Close-up: "based on" provenance strip on an output. Shows which knowledge sources contributed, confidence per source, gaps flagged. | Multiple sources, confidence levels, missing knowledge flagged | Not started |
| **Error / Offline** | P24 | Connection lost. LLM error. Rate limited. Graceful degradation. | Disconnected, reconnecting, error with recovery, rate limited | Not prototyped |
| **Settings** | P25 | Connections, preferences. Minimal — not a settings-heavy product. | Connected services, preferences | Not prototyped |

**Total: 24 screens** (13 existing prototypes upgraded + 8 new: P00 Workspace Shell, P23 Setup, P14a Review Queue, P26 Process Index, P27 Process Flow Map, P28 Improvement Queue, P29 Process Model Library, P24 Error + P25 Settings)

**Deferred:** P12 (Morning Mobile), P21 (Mobile Workspace) — come back to mobile later. Full-screen Capture view also deferred with mobile (re-entry: when voice input and multi-modal capture are prioritised).

### P27: Process Flow Map — Detailed Interaction Spec

This is the screen the user specifically requested, inspired by Paperclip.ai's agent/process hierarchy view. It maps to Process Graph (Primitive 13, human-layer.md) and Map View (View Composition 3). The architecture calls it the "primary navigation surface."

**What Libby sees:** A visual graph of how her processes connect. At Month 2, Libby has 4 processes:

```
[Social Content] ──content feed──→ [Landing Page Copy]
       │                                    │
  brand voice                         waitlist data
       │                                    │
       ▼                                    ▼
[Email Newsletter] ◄──shared audience──→ [Course Outline]
```

**Node design:**
- Each node IS a Process Card (Primitive 2): name, health dot (green/amber/red), trust tier badge, last run timestamp, trend sparkline
- Nodes are colour-coded by health: green (healthy), amber (needs attention), red (degraded), grey (paused/draft)
- Active nodes have a subtle pulse or glow
- Clicking a node navigates to P14 (Process Detail) — the graph is navigation, not a detail view

**Edge design:**
- Edges show what flows between processes: labelled with the data type ("brand voice", "content feed", "waitlist data")
- Edge thickness indicates volume/frequency (thicker = more data flowing)
- Edges are directional (arrows show flow direction)
- Clicking an edge shows a tooltip: what data, how often, last transfer, any issues
- Dotted edges for event-based dependencies (vs solid for data dependencies)

**Impact propagation:**
- When Libby hovers a node, downstream processes that would be affected are highlighted with a warm amber glow
- A tooltip: "If Social Content quality drops, Email Newsletter and Landing Page Copy may be affected"
- This is read-only — just awareness, not action

**Goal layer:**
- Architecture.md specifies three layers: goals, processes, live state
- Goals appear as subtle grouping containers — a labelled region that contains related process nodes
- Libby at Month 2: one goal ("Build my education business") containing all 4 processes. The goal container is visible but unobtrusive.
- At scale (multiple goals): each goal is a distinct group. Processes can belong to one goal. Ungrouped processes sit in a "General" area.
- Goals are user-defined labels, not system-generated — they come from the sidebar hierarchy

**Layout:**
- Auto-layout by default (left-to-right flow for Libby's simple graph)
- At 2-3 nodes: horizontal flow, generous spacing, clear
- At 5+ nodes: auto-layout clusters related processes within goal groups, user can drag nodes to rearrange
- Layout persists between sessions (user's arrangement is remembered)

**States:**
- **Empty** (pre-first-process): soft illustration + "Your first process will appear here when it's running"
- **Single node** (first process): one card, no edges, message: "As you add more processes, you'll see how they connect"
- **Growing** (2-3 nodes): clean horizontal layout, edges appearing as connections are detected
- **At scale** (5+): auto-clustered layout with zoom/pan
- **Mixed health**: green + amber nodes, with amber drawing subtle attention (not alarming)
- **Node selected**: selected node enlarges slightly, right panel shows process summary

**What this is NOT:**
- Not a workflow builder (no drag-to-create-edge, no node palette)
- Not a DAG editor (connections emerge from process definitions, not user drawing)
- Not a monitoring dashboard (no real-time counters or streaming data)
- It IS a living map of "how my business operates as a system" — the view Jordan shows leadership

### P14a: Review Queue — Detailed Interaction Spec

human-layer.md calls this "the single most important UI element in Ditto." This is where Libby spends most of her Operate-context time. It must feel efficient, trustworthy, and never tedious.

**What Libby sees:** A focused queue of items that need her attention, batched by process and type.

**Queue structure:**
- Items grouped by process: "Social Content (3 items)" → "Email Newsletter (1 item)"
- Within each group, items ordered by confidence (lowest first — most likely to need attention at top)
- Each item shows: title/preview, process source, confidence score, pre-review summary
- Pre-review summary: what the harness already checked, per quality dimension ("Tone: passed. Accuracy: 1 flag — source date is 6 months old. Audience: passed.")

**Review actions per item:**
- **Approve** — accept as-is (green check). One click.
- **Edit** — open in Output Viewer (P10-style inline editing). Edits are implicit feedback — the system learns from every change.
- **Reject with tag** — structured rejection: select from process-specific tags ("tone wrong," "factually incorrect," "not what I asked," "off-brand," "too long/short"). Multiple tags allowed. Tags teach the process what specifically failed.
- **Gut reject** — "Just no" with no tag required. Still valid feedback (the system notes the pattern).
- **Discuss** — open a conversation thread about this item ("Why did you choose this angle?")

**Batch operations:**
- **Approve batch** — when confidence is high across a group, approve all at once. Only available when all items in the batch are above the process's confidence threshold.
- **Spot-check N** — "I trust these but want to verify 3 of 8." Randomly selects N items for review, auto-approves the rest.
- Batch rejection is NOT available — each rejection needs its own reason (this is feedback, not disposal).

**States:**
- **Queue populated** — items grouped, counts visible, highest-attention items at top
- **Reviewing item** — item expanded, output viewer inline, pre-review summary visible, action buttons prominent
- **Batch mode** — checkboxes appear, batch actions in toolbar
- **Empty queue** — warm message: "Nothing needs your attention right now." Shows last review summary: "Last reviewed 2h ago — 5 approved, 1 edited"
- **High-priority item** — visual flag (amber border), reason shown ("Confidence below threshold" or "Process flagged this for review")
- **Post-review** — approved items fade/collapse, queue shrinks, progress indicator ("3 of 7 reviewed")

**What this is NOT:**
- Not an email inbox (no archive, no folders, no threading)
- Not a notification centre (items are work products, not alerts)
- Not a kanban board (no columns, no drag-and-drop status changes)
- It IS a focused workspace for the human judgment that only humans can provide

### Earlier Prototypes (P01-P07)

P01-P07 are **superseded** by the journey-ordered P08-P20 series. They remain in `docs/prototypes/` as reference material — the PLAN.md disposition table specifies which are "Keep as reference" vs "Archive." They are not build targets.

---

## First-Principles Coverage Audit

Every primitive, view composition, human job, and activity context from the design system must appear in at least one prototype. Gaps are prototype gaps.

### 16 Primitives Coverage

| # | Primitive | Covered by | Notes |
|---|-----------|-----------|-------|
| 1 | Daily Brief | P13 (top of feed) | Morning brief integrated into daily workspace |
| 2 | Process Card | P14, P26, P27 | Appears in detail (P14), index (P26), and graph (P27) |
| 3 | Activity Feed | P13 (cross-process feed) + P14 (process-scoped activity log) | P13's main content area IS the cross-process activity feed (work-done cards, review items, status updates across all processes). P14 has the process-scoped variant. |
| 4 | Performance Sparkline | P14, P26, P13 | Inside process detail and process cards |
| 5 | Review Queue | P14a (dedicated) + P13 (inline) | Dedicated prototype + inline in daily workspace |
| 6 | Output Viewer | P10 (first output) + P14a (review items) | First output review + review queue items |
| 7 | Feedback Widget | P16 (teach this) | Teach-this is the feedback widget in action |
| 8 | Conversation Thread | P08, P09, P13, P18 | Day zero, first conversation, daily workspace, second process |
| 9 | Process Builder | P09 (right panel), P18 | Emerges during conversation, shown in second process setup |
| 10 | Agent Card | P27 (in graph nodes) | Agents visible as nodes/cards in process flow map. Partial coverage — Libby is a solo operator. Full Agent Card (with team attribution, cost, multi-agent performance) expands when Team view is built for Nadia's persona. |
| 11 | Trust Control | P14 (in detail), P17 (upgrade moment) | Trust slider in detail + upgrade decision |
| 12 | Quick Capture | P13 (input bar + capture interaction) | Always-present input at bottom of workspace. P13 should show the capture flow: type/paste → auto-classify ("Is this a new task or context for Social Content?") → route. Voice and multi-modal capture deferred with mobile. |
| 13 | Improvement Card | P28 (dedicated) | Improvement queue view |
| 14 | Process Graph | P27 (dedicated) | Full process flow map |
| 15 | Data View | P14 (metrics section) | Performance data inside process detail |
| 16 | Evidence Trail | P22 (dedicated) + P10 ("based on" strip) | Knowledge provenance in outputs |

**Result: All 16 primitives covered.** No gaps.

### 8 View Compositions Coverage

| View | Prototype | Notes |
|------|-----------|-------|
| Home | P13 (Daily Workspace) | Brief + cross-process activity feed + review items + quick capture. The activity feed in Home is cross-process (aggregates from all processes). This is the "Unified Task Surface" — review tasks, action items, and status updates combined in one stream, filtered by what needs attention. |
| Review | P14a (Review Queue) + P10 (First Output) | Dedicated review surface + first review moment. P14a is the focused view of the review subset of the unified task surface. |
| Map | P27 (Process Flow Map) | **NEW** — was missing, now covered |
| Process Detail | P14 | Detailed single-process view |
| Setup | P09 (First Conversation) + P23 (Connection) + P29 (Model Library) | Conversation + process builder dual-pane + template adoption |
| Team | **Deferred** | Libby is a solo operator. The full Team view (Agent Cards + Performance Sparklines + cost summary) is deferred until Nadia's persona is prototyped. Agent metadata is visible in P27 nodes but this is not Team view coverage — it's process metadata. |
| Improvements | P28 (Improvement Queue) | **NEW** — was missing, now covered |
| Capture | P13 (inline capture) | Full-screen mobile capture deferred with mobile |

**Result: All 8 compositions covered.** Team view is minimal (appropriate for Libby's single-operator context).

### 6 Human Jobs Coverage

| Job | Prototypes | Sufficient? |
|-----|-----------|-------------|
| Orient | P08, P11, P13, P19, P26 | Yes — day zero through compound effect |
| Review | P10, P14a, P16 | Yes — first output, batched review, correction feedback |
| Define | P09, P18 | Yes — first process and second process creation |
| Delegate | P14, P17 | Yes — trust control and trust upgrade |
| Capture | P09, P13 | Yes — knowledge capture and quick capture |
| Decide | P17, P20, P27, P28 | Yes — trust decisions, degradation response, process connections, improvements |

**Result: All 6 jobs covered.** No gaps.

### 3 Activity Contexts Coverage

| Context | Prototypes | Notes |
|---------|-----------|-------|
| Analyze | P15 (Knowledge Base), P27 (Process Flow Map) | Understanding what's known, how things connect |
| Explore | P09 (First Conversation), P18 (Second Process) | Defining and refining processes |
| Operate | P10, P13, P14, P14a, P16, P17, P19, P20, P28 | Daily execution, review, trust, improvements |

**Result: All 3 contexts covered.**

---

## ADR/Insight Cross-Reference Audit

All 22 ADRs and ~100 active insights were read and cross-referenced against the screen inventory. This section documents UI-relevant findings and how they're addressed.

### New Screens Added

| Screen | Source | Rationale |
|--------|--------|-----------|
| P00 (Workspace Shell) | Insight-086 (composable UI) | Every screen lives inside this three-column frame. Without an explicit prototype, each screen reinvents the container. Builder needs one unambiguous shell reference. |
| P29 (Process Model Library) | ADR-008, ADR-019, Insight-099 | Users need a way to discover and adopt pre-built process templates. The standards library is a first-class architectural concept with no UI coverage. |

### Spec Enrichments Required

These are not new screens but modifications to existing screen specs that must be reflected when the prototype is built:

| Existing Screen | Source | Enrichment |
|----------------|--------|------------|
| **P09 (First Conversation)** | Insights 079, 081, 082 | Must show **guided canvas** — structured input cards appearing in the workspace, not just chat text. Three-phase progression: gathering (Ditto asks, user provides) → proposing (synthesis card: "Here's what I'm learning") → working-through-it (process proposal card emerges). Chat is the seed, but artefacts materialise alongside it. |
| **P10 (First Output)** | ADR-013 (cognitive model) | Add **enriched rejection vocabulary**: approve / edit / reject-with-tag ("tone wrong," "factually incorrect," "not what I asked") / gut-reject ("just no"). Rejection is feedback — tagged rejections teach the process what to improve. |
| **P11, P13, P19 (sidebar)** | Insight-085 (design gaps) | Sidebar must show **goals → processes → items hierarchy**, not a flat process list. Goals are the top-level organiser. Processes nest under goals. Active items nest under processes. Collapsed by default, expandable. |
| **P13 (Daily Workspace)** | ADR-011 (attention model), ADR-016 (conversational self) | Add **digest mode** state: when a process earns high trust and runs autonomously, it appears as a one-line summary ("Social content: 5 posts published, all on schedule") not individual items. Also add **returning user** state showing session continuity: "Since yesterday: 3 posts published, 1 flagged for your review." |
| **P14 (Process Detail)** | ADR-022 (critical evaluation), Insight-101 (homeostatic quality) | Quality display must show **multi-dimensional balance**, not just green/amber/red. Dimensions: accuracy, tone consistency, audience relevance, timeliness. Each dimension has its own trend. Overall health is the balance across dimensions. Degradation in one dimension is visible even if others are healthy. |
| **P14a (Review Queue)** | ADR-013 (cognitive model) | Same enriched rejection vocabulary as P10. Add: batch actions respect rejection types (can't batch-reject — each rejection needs a reason). Pre-review summary shows what the harness already checked per dimension. |
| **P19 (Multi-Process)** | ADR-011 (attention model) | At scale, some processes are in **digest mode** (high trust, autonomous). The workspace doesn't show every item from every process — it shows digests for trusted processes and items for supervised ones. Silence is a feature for healthy autonomous processes. |

### ADR Findings Not Requiring Screen Changes

These ADR findings are architecturally important but don't affect the prototype specification:

- **ADR-001 (SQLite):** Storage layer, no UI impact
- **ADR-002 (Memory):** Episodic/semantic memory architecture — feeds P15 (Knowledge Base) which already covers it
- **ADR-003 (Integration):** App connection layer — feeds P23 (Setup) and P25 (Settings) which already cover it
- **ADR-004 (Human layer):** Process already embedded in Designer skill
- **ADR-005 (Discovery):** Process discovery from tools — covered by P29 (Process Model Library)
- **ADR-006 (Analyze mode):** Third activity context — already in coverage audit
- **ADR-007 (Trust):** Trust earning — covered by P14, P17
- **ADR-012 (Context):** Context engineering internals — no direct UI surface
- **ADR-014 (Cognitive architecture):** Agent internals — visible through Agent Card in P27
- **ADR-015 (Meta processes):** System self-improvement — visible through P28 (Improvement Queue)
- **ADR-017 (Delegation):** Weight classes — internal routing, no UI impact
- **ADR-018 (Runtime):** Deployment architecture — no UI impact
- **ADR-020 (Runtime adaptation):** Process self-modification — visible through P14 activity log

### Insight Findings Not Requiring Screen Changes

Key insights already addressed by the current spec or enrichments above:

- **Insight-067 (Conversation is alignment, work surface is manifestation):** Embedded in P09's dual-pane design
- **Insight-073 (User language not system language):** Covered by Quality Gates jargon scan
- **Insight-080 (Artefact-primary surfaces):** Addressed by P09 enrichment (guided canvas)
- **Insight-083 (Knowledge visibility):** Covered by P15, P22, P09 knowledge panel
- **Insight-087 (Provenance everywhere):** Covered by P22 and "based on" strips throughout
- **Insight-095 (Intake integrity):** Addressed by P09 enrichment (structured input cards)

### Deferred (Not Needed for Current Scope)

| Concept | Source | Why deferred |
|---------|--------|-------------|
| Workspace switcher | Insight-085 | Libby starts with one workspace. Multi-workspace switching is a future concern when users manage multiple business contexts. |
| Full Team view | human-layer.md View Composition 6 | Libby is a solo operator. Team view expands when Nadia's persona (team manager) is prototyped. |
| Mobile capture | human-layer.md View Composition 8 | Mobile deferred per scope decision. |

---

## Build-Ready Prototype Standard

A prototype is "Build-Ready" when:

### Content & Layout
- [ ] Real content from a specific persona/test case (not lorem ipsum, not abstract)
- [ ] Every text element is final copy (headings, labels, empty states, error messages)
- [ ] Layout matches the three-panel workspace structure (where applicable)
- [ ] Desktop (1280px+) is the required breakpoint. Mobile deferred.

### Visual Design
- [ ] Uses the full design token set from visual-identity-design-system-ux.md
- [ ] Warm professional palette: cream backgrounds, terracotta accent, warm greys
- [ ] Inter typography at correct scale (Major Third, 16px base)
- [ ] Correct spacing rhythm (4px grid)
- [ ] Shadows, borders, radii match spec

### Interaction States
- [ ] Default state
- [ ] Hover states (with transition timing)
- [ ] Active/pressed states (scale feedback)
- [ ] Focus states (accessibility ring)
- [ ] Loading state (where applicable)
- [ ] Empty state (where applicable)
- [ ] Error state (where applicable)
- [ ] Expanded/collapsed states (where applicable)

### Accessibility
- [ ] Colour contrast: WCAG AA (4.5:1 text, 3:1 UI elements)
- [ ] Keyboard navigation: all interactive elements reachable via Tab, activated via Enter/Space
- [ ] ARIA landmarks on major regions (nav, main, aside, complementary)
- [ ] Screen reader labels on interactive elements (buttons, inputs, controls)
- [ ] Respects `prefers-reduced-motion` (transitions disabled or shortened)

### Clickable Happy Path
- [ ] Primary user flow is clickable (buttons navigate, forms submit, panels open)
- [ ] Transitions between states are animated
- [ ] At minimum: the actions a user would take on this screen work

### Quality Gates (from PLAN.md)
- [ ] Persona test: Would Rob/Libby/Lisa/Jordan/Nadia understand this without explanation?
- [ ] Jargon scan: No developer/product terminology
- [ ] Knowledge visibility: User can see what Ditto knows, doesn't know, and used
- [ ] Progress clarity: User knows where they are, what's done, what's next
- [ ] Warm professional: Matches visual identity spec

### Copy Standard
- [ ] Act 1-2 screens: final copy (these are built first, copy must be exact)
- [ ] Act 3-4 screens: near-final copy using real persona test data (refinement allowed during build)

---

## Sequencing: How to Execute This

### Phase A: Foundation (do first)

1. **Run `/teach-impeccable`** — establish `.impeccable.md` with Ditto's design context. This is a 10-minute one-time setup that pays dividends on every future prototype and build.

2. **P00 (Workspace Shell) to Build-Ready.** The three-column frame everything lives inside. Must be prototyped first — every subsequent screen inherits this shell. Shows: sidebar expanded/collapsed, right panel states, full-width pre-workspace mode.

3. **P23 (Setup/Connection) to Build-Ready.** The first screen a new user sees. The current built version works but wasn't designed — it must match the warm professional standard.

4. **P08 (Day Zero) to Build-Ready** using `/frontend-design`. The simplest screen. Proves the workflow: Designer describes → `/frontend-design` produces → human reviews → approved prototype becomes AC.

5. **P09 (First Conversation) to Build-Ready**. The most complex Act 1 screen — guided canvas with structured input cards + knowledge panel + three-phase progression (gathering → proposing → working-through-it). Chat is the seed, artefacts materialise alongside.

6. **P10 (First Output) to Build-Ready**. THE trust moment. "Based on" provenance strip, inline editing, enriched rejection vocabulary, teach-this.

7. **P11 (Workspace Emerges) to Build-Ready**. Completes the Act 1 narrative arc — sidebar gains goal → process → item hierarchy, workspace structure emerges.

**Checkpoint after Phase A:** Review the workflow. Did `/frontend-design` + `.impeccable.md` produce specification-grade prototypes? Is the Build-Ready standard right? Adjust before committing to the remaining 14 screens.

### Phase B: Daily Driver

8. P13 (Daily Workspace — including digest mode + returning user states) → P14a (Review Queue — with enriched rejection) → P14 (Process Detail — with multi-dimensional quality) → P26 (Process Index)

### Phase C: Growth, Trust & System View

9. P16 (Teach This) → P17 (Trust Upgrade) → P15 (Knowledge Base) → P22 (Knowledge in Output) → P27 (Process Flow Map) → P29 (Process Model Library)

### Phase D: Scale & Edge Cases

10. P18 → P19 (with digest mode for trusted processes) → P20 → P28 (Improvement Queue) → P24 → P25

### After Each Prototype is Approved

The Builder gets a brief that says: "Make this screen match this prototype. The infrastructure exists. Here's which components map to which prototype elements."

### Visual Comparison Method

Screenshot comparison is the AC. The method:
1. Builder takes screenshots of the React implementation at desktop (1280px) breakpoint
2. Screenshots are placed side-by-side with the prototype screenshots
3. Human reviews for **structural and visual equivalence** (not pixel-perfect matching — layout, spacing, typography, colour, content, and interaction states must match; minor rendering differences from HTML→React are acceptable)
4. Any deviation must be justified ("React component library renders this 2px differently" is fine; "I used a different layout because it was easier" is not)
5. Screenshots are saved to `docs/verification/` for audit trail

### Prototype Versioning

- Prototypes live at `docs/prototypes/{number}-{name}.html` (e.g., `08-day-zero.html`)
- When a prototype is updated, the file is overwritten (git tracks history)
- The file's `<title>` and a comment block at the top include the version: `<!-- Build-Ready v1, approved 2026-03-25 -->`
- The Builder always works from the latest committed version on the working branch

---

## How `/frontend-design` Fits the Designer Role

The Designer's job is to think from the user's perspective — "How should this feel?" The `/frontend-design` skill is a tool that helps the Designer produce higher-fidelity artifacts faster. The workflow:

1. **Designer** defines the screen's purpose, content, persona context, and interaction requirements
2. **Designer** invokes `/frontend-design` with that specification + `.impeccable.md` context
3. **`/frontend-design`** produces the HTML prototype with correct design system, micro-interactions, responsive states
4. **Designer** reviews against persona test and quality gates — iterates if needed
5. **Human** approves the prototype
6. **Prototype becomes the Builder's AC**

This is not the Designer abdicating to a tool. It's the Designer using a tool to produce specification-grade artifacts instead of inspiration-grade sketches. The Designer still owns the "what" and "why" — the tool helps with the "how it looks."

---

## What This Means for the Current Build

The current React app is not thrown away. The infrastructure (content blocks, streaming, workspace transitions, feed assembler, right panel adaptation) is sound. What needs to happen:

1. Approved prototypes become the visual specification
2. A new Builder brief (047) references each prototype as its AC
3. The Builder maps existing React components to prototype elements
4. Where components exist but render wrong → fix the rendering
5. Where components are missing → add them
6. Where content is generic → make it specific (using prototype copy)

The gap closes by working from the outside in: get the screens right first, then wire the engine data to them.

---

## Insight to Capture

**Prototypes are specifications, not phases.** The prototype is a living document that stays ahead of the build. When the prototype stops being refined, the specification freezes and the implementation drifts. The build should never outrun the prototype — if a screen isn't prototyped and approved, it can't be built. This is the visual equivalent of "plan before build."

---

## Process Change for Review Checklist

Add to `docs/review-checklist.md`:

**Point 13: Visual Fidelity**
- Does this implementation match the approved prototype? (screenshot comparison)
- Are all interaction states rendered as specified in the prototype?
- Does the typography, spacing, and colour match the design token spec?
- Would the user experience match what was shown in the prototype?

---

## Resolved Decisions

- **Persona content:** All prototypes use Libby (doula → education business). Single consistent story across all screens.
- **Mobile:** Deferred. P12 (Morning Mobile) and P21 (Mobile Workspace) removed from scope. Desktop-first.
- **Content standard:** Libby's real workflows — brand voice definition, ideal client persona, social content creation, survey synthesis, course development, knowledge accumulation.

## Resolved: Prototype Navigation

**Decision:** All acts are clickable flows with a shared navigation bar.

Each act is a connected flow — clicking through the happy path advances from one screen to the next. A lightweight **top nav bar** provides:
- Act label ("Act 1: Getting Started") + screen name ("First Conversation")
- Prev / Next arrows to step through the flow
- Dot indicators showing position in the act (● ○ ○ ○ ○)
- Act switcher to jump between acts (Act 1 / Act 2 / Act 3 / Act 4 / Cross-cutting)

The nav bar is **minimal, warm, and consistent with the design system** — cream background, warm grey text, subtle. It sits at the top of the viewport, outside the prototype content area, clearly separated as navigation chrome (not part of the Ditto UI being prototyped).

**Not:** dark footer, sticky bottom bar, or anything that competes visually with the prototype content.
