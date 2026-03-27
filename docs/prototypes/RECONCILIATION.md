# Prototype → Screen Reconciliation

**Date:** 2026-03-27
**Purpose:** Map 35 prototype files to the actual screens we build. Prototypes told a narrative story (acts); the app needs distinct screens that handle all lifecycle states.

---

## The Problem

Prototypes were built as a journey — Act 1 through Act 4 — showing the same screens at different maturity stages. This was right for design exploration but creates confusion for building:

- **P11, P13, P19** all show the Today screen (1 process → 3 processes → multi-department)
- **P09, P10, P16, P22** all show conversation (first chat → output → teaching → knowledge provenance)
- **P12, P21** both show mobile
- **P14, P27, P31** all show process detail (single → graph → health)
- **P14a, P33** both show review work

For building, we implement **screens**, not acts. Each screen handles its own lifecycle states internally.

---

## Screen Map

### Screen 1: Onboarding

**What it is:** Multi-step flow from first launch to first working routine.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P08 Day Zero | Empty state, first impression, invitation to start | **Primary** — first screen state |
| P08a Intake Conversation | The onboarding IS a conversation. Knowledge capture, process proposal. | **Primary** — core onboarding flow |
| P23 Setup Connection | LLM provider selection, API key entry | **Primary** — precedes P08 on first run |

**Implementation:** One route (`/onboarding`) with steps: connection setup → intake conversation → first process emerges. States managed internally.

**Archive after build:** P08, P08a, P23 become design references only.

---

### Screen 2: Today

**What it is:** The home screen. What needs attention, what's running, what completed.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P11 Workspace Emerges | Early state — 1 process, workspace just born | **State** — "new user" variant of Today |
| P13 Daily Workspace | Established state — 3 processes, feed items, right panel | **Primary** — the daily driver layout |
| P19 Multi-Process Workspace | Mature state — departments, sparklines, cross-process view | **State** — "power user" variant of Today |

**Implementation:** One route (`/`) with the same three-column layout. Content adapts based on how many routines exist. P11's simplicity is the 1-routine state. P19's richness is the 5+-routine state. No separate screens needed.

**Key blocks used:** RecordBlock (feed items), MetricBlock (summary stats), ChartBlock (sparklines), ProgressBlock.

**Archive after build:** P11, P13, P19 become design references only.

---

### Screen 3: Conversation

**What it is:** The primary interaction surface. User talks to Ditto, Ditto responds with structured blocks.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P09 First Conversation | Conversation flow, knowledge capture moments, process proposal | **Primary** — conversation layout and interaction |
| P10 First Output | Output with provenance, editing, trust moment | **State** — first output within conversation |
| P16 Teach This | Correction → learning pattern | **State** — teach moment within conversation |
| P22 Knowledge in Output | "Based on" provenance detail, clinical vs summary views | **Enrichment** — provenance rendering within any output |

**Implementation:** One conversation component. All these "moments" happen naturally within the same conversation UI. The blocks (TextBlock, ReviewCardBlock, RecordBlock, KnowledgeCitationBlock, etc.) handle contextual rendering. No separate screens — P10's output moment and P16's teach moment are just different block sequences in the same conversation.

**Key blocks used:** All 21 content block types render here.

**Archive after build:** P09, P10, P16, P22 become design references only.

---

### Screen 4: Inbox

**What it is:** Action queue. Things that need the user's attention, grouped by urgency.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P24 Inbox | Urgency groups (Now / This week / FYI), filter tabs, metric cluster | **Primary** — standalone screen |

**Implementation:** One route (`/inbox`). Grouped RecordBlock items with urgency sections. No duplication — P24 is the only inbox prototype.

**Design note:** Record-list (not table) is correct here. Inbox is an action queue you work through and clear, not reference data you browse. Email clients, triage queues, and notification centres all use grouped records.

**Key blocks used:** RecordBlock (items), MetricBlock (summary counts).

---

### Screen 5: Work

**What it is:** Task and work-item view. What's running, what needs input, what's scheduled.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P25 Tasks/Work | Three groups (Needs You / Running / Scheduled), progress bars, routine labels | **Primary** — standalone screen |

**Implementation:** One route (`/work`). Grouped RecordBlock items with progress indicators. Could evolve to InteractiveTableBlock if task count grows large.

**Key blocks used:** RecordBlock (tasks), ProgressBlock (inline progress).

---

### Screen 6: Knowledge

**What it is:** Everything Ditto knows. Browse, assess freshness, find gaps, edit.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P15 Knowledge Base | Content structure, health strip, categories, gap identification | **Primary** — needs redesign from records to table |

**Implementation:** One route (`/knowledge`). **Rebuild as InteractiveTableBlock** with columns: Status, Name, Type, Freshness, Used By, Actions. Health strip stays as hero summary. Clicking a row opens detail in the right panel as a RecordBlock with fields, provenance, edit controls.

**Why table, not records:** Knowledge is reference data. Users need to scan status at a glance, sort by freshness, filter by category. The current vertical record list doesn't scale past ~10 items. A table with 50+ rows works; 50+ records in a scroll does not.

**Key blocks used:** InteractiveTableBlock (main view), RecordBlock (detail panel).

---

### Screen 7: Routines

**What it is:** The user's routine library — list of all routines, with detail/flow/health views.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P14 Process Detail | Single routine detail — steps, performance, knowledge used | **Primary** — detail view (tab or panel) |
| P27 Process Flow Map | Inter-routine dependency graph, impact analysis | **View** — "Map" tab within routines |
| P29 Process Model Library | Browse available routines, Self recommendations, setup flow | **View** — "Library" tab (discover new routines) |
| P31 Process Health | Health timeline, 30-day dot visualization | **View** — "Health" tab within routine detail |

**Implementation:** One route (`/routines`) with sub-views:
- **List** — all routines as InteractiveTableBlock (name, status, trust level, runs, last run)
- **Detail** — clicking a routine opens P14-style detail (steps, performance, knowledge connections)
- **Map** — P27-style graph showing inter-routine dependencies (separate tab or view toggle)
- **Library** — P29-style catalog for discovering and adding new routines

**Key blocks used:** InteractiveTableBlock (list), RecordBlock (detail sections), ChartBlock (performance).

**Archive after build:** P14, P27, P29, P31 become design references only.

---

### Screen 8: Review

**What it is:** Not a standalone screen — review lives inside Conversation (inline) and Inbox (queue).

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P14a Review Queue | Lisa's dedicated review — batch items across routines | **Pattern** — feeds Inbox screen design |
| P33 Review Primitives | Inline records, batch tables, deep detail, conversation flow | **Pattern** — block rendering patterns for RecordBlock + InteractiveTableBlock |

**Implementation:** Review is composed from blocks, not a separate screen:
- **Inline review** (in Conversation) → RecordBlock with checks, confidence, provenance, actions
- **Batch review** (in Inbox or Conversation) → InteractiveTableBlock with row actions and batch operations
- **Deep review** (in right panel) → RecordBlock detail with source blocks and diff view

P14a's "review queue" is really the Inbox filtered to review items. P33's primitives are block rendering patterns already implemented in the block registry.

**Archive after build:** P14a, P33 become block pattern references only.

---

### Screen 9: Agents

**What it is:** Team overview — what roles exist, their performance, cost, activity.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P26 Agent Team | Role records, cost table, activity timeline, trust upgrade suggestion | **Primary** — standalone screen |

**Implementation:** One route (`/agents`). InteractiveTableBlock for the role list, RecordBlock for role detail in right panel, activity timeline below.

**Key blocks used:** InteractiveTableBlock (role table), RecordBlock (role detail), ChartBlock (sparklines).

---

### Screen 10: Settings

**What it is:** Configuration — connections, preferences, trust defaults.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P32 Settings | Connection management, trust defaults, preferences | **Primary** — standalone screen |
| P17 Trust Upgrade | Trust tier change flow with evidence | **Pattern** — trust upgrade modal, triggered from routine detail or Settings |

**Implementation:** One route (`/settings`). P17's trust upgrade flow is a modal/drawer triggered from either Settings or a routine's detail view — not a standalone screen.

**Archive after build:** P17 becomes a modal pattern reference.

---

### Screen 11: Mobile

**What it is:** Responsive version of screens 2-6, optimised for phone.

| Source prototype | What it contributes | Build disposition |
|-----------------|--------------------|--------------------|
| P12 Morning Mobile | Rob's 3-minute morning — brief + approve actions | **Primary** — mobile Today variant |
| P21 Mobile Workspace | Full mobile workspace — feed, review, process view | **Primary** — mobile layout patterns |

**Implementation:** Not a separate codebase — responsive CSS within the same screens. Mobile collapses the three-column layout to single-column with bottom nav. Conversation is the primary mobile surface.

**Key design decision:** Mobile is conversation-forward. The bottom nav provides: Today, Inbox, Conversation (primary), Work, More.

**Archive after build:** P12, P21 become responsive design references only.

---

## Situation-Specific States (Not Screens)

These prototypes show moments that happen WITHIN other screens, not standalone views:

| Prototype | What it shows | Where it lives in the app |
|-----------|--------------|---------------------------|
| P18 Second Process | Adding a second routine | Modal/flow within Routines → Library |
| P20 Something Wrong | Routine degradation, trust auto-downgrade | Alert state within Today + Routine detail |
| P35 Improvements | Self-suggested improvements to routines | Section within Routine detail |

---

## Legacy Prototypes (Pre-Journey)

These were built before the act-based journey. Already marked for disposition in PLAN.md:

| File | Disposition |
|------|-------------|
| P01 conversation-surface | **Archive** — superseded by P09 |
| P02 workspace-feed | **Archive** — superseded by P13 |
| P03 process-detail | **Archive** — superseded by P14 |
| P04 onboarding (v1 + v2) | **Archive** — superseded by P08a |
| P05 strategy-session | **Archive** — dual-pane pattern captured |
| P06 knowledge-capture | **Archive** — components fed P15 |
| P07 guided-unfolding | **Archive** — input patterns fed P09 |

---

## Developer Reference (Not User Screens)

| File | Purpose | Disposition |
|------|---------|-------------|
| P00 Workspace Shell | Structural reference — sidebar, centre, right panel | **Keep** — CSS foundation reference |
| P30 Block Gallery | All 21 block types with JSON examples | **Keep** — block vocabulary reference |

---

## Summary: 35 Files → 11 Screens

| # | Screen | Route | Source prototypes | Primary layout |
|---|--------|-------|-------------------|---------------|
| 1 | Onboarding | `/onboarding` | P08, P08a, P23 | Centred conversation |
| 2 | Today | `/` | P11, P13, P19 | Three-column workspace |
| 3 | Conversation | `/conversation/:id` | P09, P10, P16, P22 | Three-column workspace |
| 4 | Inbox | `/inbox` | P24 | Three-column workspace |
| 5 | Work | `/work` | P25 | Three-column workspace |
| 6 | Knowledge | `/knowledge` | P15 | Three-column workspace (table + detail panel) |
| 7 | Routines | `/routines` | P14, P27, P29, P31 | Three-column workspace with sub-views |
| 8 | Review | (not a route) | P14a, P33 | Blocks within Conversation + Inbox |
| 9 | Agents | `/agents` | P26 | Three-column workspace |
| 10 | Settings | `/settings` | P32, P17 | Three-column workspace |
| 11 | Mobile | (responsive) | P12, P21 | Single-column with bottom nav |

**States within screens (not separate):** P18, P20, P35

**Developer references (keep):** P00, P30

**Archive after build:** P01-P07

---

## Sidebar Navigation → Screen Mapping

The sidebar defined in `.impeccable.md` maps directly:

| Sidebar label | Screen | Route |
|--------------|--------|-------|
| Today | Screen 2 | `/` |
| Inbox | Screen 4 | `/inbox` |
| Work | Screen 5 | `/work` |
| Projects | (future) | — |
| Routines | Screen 7 | `/routines` |
| Settings | Screen 10 | `/settings` |

Knowledge (`/knowledge`) and Agents (`/agents`) are accessed from within Routines or Settings, or via conversation. They're important screens but not top-level nav items — keeping the sidebar focused on daily-use surfaces.

---

## Block Vocabulary Coverage

Every screen composes from the 21 ContentBlock types. No screen needs bespoke rendering:

| Screen | Primary blocks |
|--------|---------------|
| Today | RecordBlock, MetricBlock, ChartBlock, ProgressBlock |
| Conversation | All 21 types |
| Inbox | RecordBlock, MetricBlock |
| Work | RecordBlock, ProgressBlock |
| Knowledge | InteractiveTableBlock, RecordBlock |
| Routines | InteractiveTableBlock, RecordBlock, ChartBlock |
| Agents | InteractiveTableBlock, RecordBlock, ChartBlock |
| Settings | RecordBlock, DataBlock |
| Review (inline) | RecordBlock, InteractiveTableBlock |

This confirms the block vocabulary is complete for the initial build.
