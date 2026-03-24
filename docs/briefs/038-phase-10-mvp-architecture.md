# Brief: Phase 10 MVP — The Living Workspace (Parent Brief)

**Date:** 2026-03-24
**Status:** draft
**Depends on:** Brief 035 (Credential Vault), Brief 036 (Process I/O), Brief 037 (Integration Generation)
**Unlocks:** Engine tuning driven by dashboard visibility (Insight-070), first real user-facing product

## Goal

- **Roadmap phase:** Phase 10: Web Dashboard — The Living Workspace
- **Capabilities:** Conversation-first operating surface, contextual feed, proactive attention management, review/approval flows, process visualization, progressive reveal, risk detection, engine transparency

## Context

Ditto has a working engine: 6 architecture layers proven end-to-end, 279+ tests, Conversational Self, multi-provider LLM, integrations, trust tiers, memory, metacognitive checks. But the only user surface is Telegram (dogfooding) and CLI (developer tooling).

Phase 10 transforms Ditto from engine to product. The dashboard is the instrument for proving and tuning the engine (Insight-070). The UX interaction spec (`docs/research/phase-10-mvp-dashboard-ux.md` v3) establishes a **conversation-first, dashboard-earned** model:

- **The Self is the primary surface** — greets, briefs, guides, accepts work, presents outputs, handles approvals (Insights 074, 075)
- **The workspace (feed + sidebar + detail) is earned** when volume demands it
- **The Self proactively manages attention** across 5 dimensions + risk (Insights 076, 077)
- **User language throughout** — no system vocabulary in the UI (Insight-073)

## Objective

Deliver a working web application where a non-technical user can: talk to their Self, receive proactive briefings, review and approve outputs, see their work and recurring processes, drill into how things work, and have the Self guide them on what to do next — all through conversation first, structured workspace second.

## Non-Goals

- Native mobile app (Phase 13 — but responsive down to tablet)
- Full 16 primitives and 8 views from human-layer.md (MVP cut)
- Multi-tenancy / team management UX (Phase 13 — Nadia uses as single process owner)
- Process discovery from organizational data (Phase 11)
- Analyze mode (Phase 11)
- Full Learning layer — "Teach this" extraction, correction pattern automation (Phase 8 — we capture the UI pattern and feedback data, but the Learning engine is not in scope)
- Cognitive model fields (Phase 8)
- Process Builder visual editor (conversation-first is the MVP path)
- Capability map / systems view (MVP+1 — "How It Works" link is a placeholder)
- Batch review ("Approve batch" / "Spot-check N") — deferred
- Voice input (deferred — text-first MVP, voice is a future enhancement)

## Architecture Overview

### Monorepo Structure

```
ditto/
├── packages/
│   ├── engine/          ← Existing engine code (moved from src/engine/)
│   ├── web/             ← New: Next.js app
│   │   ├── app/         ← App Router pages
│   │   ├── components/  ← React components
│   │   │   ├── feed/    ← Feed item components
│   │   │   ├── self/    ← Conversation components
│   │   │   ├── detail/  ← Process detail components
│   │   │   └── ui/      ← shadcn/ui primitives
│   │   ├── lib/         ← Client utilities
│   │   └── hooks/       ← React hooks
│   ├── shared/          ← Types shared between engine + web
│   └── cli/             ← Existing CLI (moved from src/cli/)
├── src/                 ← Existing entry points (cli.ts, dev-bot.ts)
├── processes/           ← Existing YAML
├── integrations/        ← Existing YAML
└── data/                ← SQLite DB
```

**Decision: Monorepo with packages, NOT a separate repo.** The web app needs direct access to the engine (Self, harness, trust, memory) via function calls, not HTTP. The engine is not a service — it's a library. The web app imports engine functions directly. This avoids premature API design and keeps the system simple.

**Decision: Do NOT move existing code in the first sub-brief.** The monorepo restructure is deferred. The web app is added as `packages/web/` and imports from `../../src/engine/` initially. Clean package boundaries come later when the interfaces stabilize. This avoids a risky refactor before we know what the API surface actually needs to be.

### Tech Stack

| Category | Choice | Level | Rationale |
|----------|--------|-------|-----------|
| Framework | Next.js 15 (App Router) | depend | Server Components, Server Actions, streaming. The industry default for React apps. |
| React | React 19 | depend | Required by Next.js 15. |
| UI primitives | shadcn/ui | depend | Unstyled, composable. Card, Button, Dialog, Sidebar, Tabs, etc. |
| Styling | Tailwind CSS v4 | depend | Industry standard. shadcn/ui requires it. |
| Conversation | Vercel AI SDK v5 | depend | `useChat` hook, streaming, tool call rendering. Proven for conversation UIs. |
| Data fetching | TanStack Query v5 | depend | Cache, invalidation, optimistic updates. SSE/polling for real-time. |
| Process graph | @xyflow/react | depend (deferred) | For capability map in MVP+1. |
| AI Elements | ~12 components | adopt | Conversation, Message, PromptInput, Reasoning, Plan, Task, Queue. Source-adopt from Vercel AI SDK Elements examples. |
| json-render | Catalog/Registry/Renderer | adopt | For process output content within feed cards (ADR-009 v2). |

### Data Flow

```
Browser ←→ Next.js Server ←→ Ditto Engine (direct import)
              │                     │
              │ Server Actions      ├── selfConverse() — conversation
              │ Route Handlers      ├── review-actions — approve/edit/reject
              │ SSE streams         ├── harness events — real-time updates
              │                     ├── trust/memory — read operations
              │                     └── process-io — triggers, outputs
              │
              └── SQLite (shared) ← same DB file, WAL mode allows concurrent reads
```

**No separate API server.** Next.js Server Actions and Route Handlers call engine functions directly. SQLite WAL mode supports one writer + multiple readers, which is sufficient for single-user MVP. The engine runs in the Next.js server process.

### Two Surfaces, Progressive Reveal

The UX spec (section 5) defines entry point routing:

| User state | Entry point | Layout |
|-----------|-------------|--------|
| Brand new | Full-screen Self | Conversation only |
| First process, first week | Self briefs conversationally | Conversation primary |
| Growing (3-5 items) | Self suggests workspace | Conversation with workspace prompt |
| Established (5+ items) | Workspace with Self panel | Three-panel layout |
| User preference | Whatever user last chose | Adaptive |

Implementation: a `user_preferences` table or memory entry stores `preferredSurface: "conversation" | "workspace"`. The entry point page checks user state (process count, item count) and renders accordingly.

### Streaming Architecture

The Self already uses `selfConverse()` which calls `createCompletion()`. The web frontend uses Vercel AI SDK's `useChat` to stream the Self's responses:

1. Client sends message via `useChat` → hits a Route Handler (`/api/chat`)
2. Route Handler calls `selfConverse()` with the message
3. `selfConverse()` streams tokens back via the AI SDK's streaming protocol
4. Tool calls (delegation, review actions, work creation) execute server-side and stream results
5. Feed updates arrive via SSE (Server-Sent Events) — a separate Route Handler (`/api/events`) that emits harness events

This requires adapting `selfConverse()` to support streaming (currently it returns a complete response). The adapter pattern is: `selfConverse()` remains the engine function, a thin streaming wrapper in the web package adapts it for the AI SDK.

### Self Extensions for the Web

The Self (ADR-016) currently has 5 tools: `start_dev_role`, `consult_role`, `approve_review`, `edit_review`, `reject_review`. For the web dashboard, the Self needs additional tools:

| Tool | Purpose | UX spec section |
|------|---------|----------------|
| `create_work_item` | Create work from conversation | 2.2 (work creation) |
| `generate_process` | Define a process through conversation | 2.5 (process definition) |
| `get_briefing` | Assemble the morning briefing | 2.1 (morning briefing) |
| `quick_capture` | Store raw context for later classification | 2.6 (quick capture) |
| `adjust_trust` | Change trust level on a process | 2.4 (trust changes) |
| `get_process_detail` | Retrieve process detail for conversation | UX 2.3 (inline data) |
| `detect_risks` | Surface risk signals from engine | UX 4.4.1 (risk detection) |
| `suggest_next` | Draw from user model + industry patterns | UX 4.2 (proactive guidance) |

These tools are engine functions exposed to the Self via the existing tool_use mechanism. The Self decides when to call them based on conversation context.

### Risk Detection (MVP Scope)

Three risk types for MVP (Insight-077):

| Risk type | Signal source | Detection |
|-----------|--------------|-----------|
| **Temporal** | Work items aging, deadlines approaching | Query: items with no activity > N days, items with deadline < 3 days |
| **Data staleness** | Integration inputs not refreshed | Query: last successful poll > threshold per integration |
| **Correction pattern** | Correction rate trending up | Query: sliding window correction rate per process, compare to baseline |

Implementation: a `detectRisks()` engine function that queries the DB for these signals. The Self calls it during briefing assembly. Results are woven into the Self's narrative, not rendered as a separate UI.

### User Model

The Self needs structured understanding of the user beyond freeform memories (UX spec recommendation 2). Implementation:

```typescript
// In user_preferences or a dedicated table
interface UserModel {
  businessType?: string;       // "trades", "ecommerce", "consulting"
  businessSize?: string;       // "solo", "small (2-10)", "medium (10-50)"
  industry?: string;           // free text
  statedPainPoints: string[];  // captured from onboarding conversation
  workingPatterns: {           // learned from behavior
    preferredSurface: "conversation" | "workspace";
    activeHours?: string;      // e.g., "6am-7pm"
    checkFrequency?: string;   // e.g., "morning + evening"
  };
}
```

Populated progressively through the onboarding conversation and refined through observation. Stored as a structured memory entry (scope: `self`, type: `user_model`). The Self reads it at context assembly time.

## Sub-Brief Decomposition

This phase is split into 5 sub-briefs along natural dependency seams. Each is independently testable and shippable:

```
038 — Phase 10 Architecture (this parent brief — design reference)
 │
 ├── 039 — Web Foundation (Next.js scaffold, Self streaming, conversation UI)
 │         FIRST — gets the app running with the Self as primary surface
 │
 ├── 040 — Self Extensions (new tools: work creation, briefing, process def, trust, risk)
 │         Depends on 039. Extends the Self to be the full operating surface.
 │
 ├── 041 — Feed & Review (workspace feed, review cards, inline actions, feedback capture)
 │         Depends on 039. Can be built in parallel with 040.
 │
 ├── 042 — Navigation & Detail (sidebar, process detail, trust control, engine view)
 │         Depends on 041. The workspace structure.
 │
 └── 043 — Proactive Engine (briefing assembly, risk detection, user model, suggestion engine)
           Depends on 040. The intelligence layer.
```

### Dependency Graph

```
039 (Web Foundation)
 ├──→ 040 (Self Extensions) ──→ 043 (Proactive Engine)
 └──→ 041 (Feed & Review) ──→ 042 (Navigation & Detail)
```

040 and 041 can be built in parallel after 039.

### Sub-Brief Summaries

**039 — Web Foundation** (~12 AC)
- Next.js 15 project in `packages/web/`
- shadcn/ui setup + Tailwind v4
- Vercel AI SDK `useChat` connected to `selfConverse()`
- Streaming adapter for the Self
- Full-screen conversation UI (the day-1 experience)
- Entry point routing (conversation-only vs workspace)
- SSE event stream from harness events
- Smoke test: open app → Self greets → type message → Self responds

**040 — Self Extensions** (~14 AC)
- 8 new Self tools: create_work_item, generate_process, get_briefing, quick_capture, adjust_trust, get_process_detail, detect_risks, suggest_next
- Confirmation model for irreversible actions
- Self's onboarding conversation flow (user model building)
- Inline data rendering in conversation (tables, sparklines via components)
- Smoke test: create work via conversation → Self generates process → output appears

**041 — Feed & Review** (~15 AC)
- Feed component with 6 item types (shift report, review, update, exception, insight, process output)
- Feed item component registry (discriminated union)
- Review flow: approve/edit/reject inline on feed cards
- Feedback capture from review actions (diff recording)
- "Teach this" pattern detection prompt (UI only — Learning engine is Phase 8)
- Entity grouping and priority ordering
- Interaction states (empty, loading, error, content, single-process)
- Smoke test: run a process → output appears in feed → approve inline

**042 — Navigation & Detail** (~13 AC)
- Left sidebar (My Work, Recurring, Settings)
- Process detail view — living roadmap variant + domain process variant
- Trust control surface (natural language)
- Engine View (developer mode — toggle, inline engine metadata)
- Three-panel layout composition (sidebar + center + right panel)
- Progressive reveal: workspace appears when Self suggests it
- Smoke test: click sidebar item → process detail loads → trust control works

**043 — Proactive Engine** (~11 AC)
- `assembleBriefing()` — shift report generation from process runs + work items
- `detectRisks()` — temporal, data staleness, correction-pattern risk signals
- User model: structured memory entry, populated from conversation
- `suggestNext()` — draws from user model + pain points + industry patterns + process maturity
- Self weaves briefing + risks + suggestions into morning narrative
- Smoke test: return to app → Self delivers briefing with risks + suggestions

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Next.js App Router | Vercel | depend | Industry standard React framework. Server Components, streaming. |
| shadcn/ui | shadcn | depend | Unstyled composable primitives. Source-available, no lock-in. |
| Tailwind CSS v4 | Tailwind Labs | depend | Required by shadcn/ui. Industry standard. |
| Vercel AI SDK v5 | Vercel | depend | `useChat`, streaming protocol, tool rendering. Best-in-class for conversation UI. |
| TanStack Query v5 | TanStack | depend | Data fetching, cache invalidation. Mature, well-documented. |
| AI SDK Elements | Vercel AI SDK examples | adopt | ~12 conversation/plan/task components. Apache 2.0. Adopt source, own it. |
| json-render | Vercel Labs | adopt | Catalog/Registry/Renderer for process output. Apache 2.0. (ADR-009 v2) |
| Three-column layout | Paperclip, Cursor | pattern | Layout structure adapted for Ditto's progressive reveal. |
| SSE + React Query | Paperclip | pattern | Real-time feed updates via SSE, cache invalidation via React Query. |
| Conversation-first entry point | Original to Ditto | — | No surveyed product uses conversation as default operating surface. |
| Proactive attention management | Original to Ditto | — | 5 dimensions + risk detection woven into conversational briefing. |
| Trust control in natural language | Original to Ditto | — | "How closely do you watch this?" with plain-language labels. |
| Progressive reveal (dashboard-earned) | Original to Ditto | — | UI complexity matches user volume, not dumped on day one. |

## User Experience

- **Jobs affected:** All six — Orient, Review, Define, Delegate, Capture, Decide
- **Primitives involved:** Daily Brief (adapted as shift report), Process Card, Review Queue (inline in feed), Activity Feed (merged into feed), Feedback Widget (conversational), Conversation Thread (primary surface), Quick Capture (unified input), Trust Control (natural language), Performance Sparkline, Improvement Card (insights in feed)
- **Process-owner perspective:** See UX interaction spec sections 1-6 for full persona journeys. Key: Rob approves quotes in 3 minutes from conversation. Lisa reviews content at her desk via workspace. Jordan proves value in 48 hours. Nadia governs team quality through briefings.
- **Interaction states:** Defined in UX spec section 7 for all surfaces: conversation (6 states including confirmation pending), workspace (5 surfaces × 5 states).
- **Designer input:** `docs/research/phase-10-mvp-dashboard-ux.md` v3 — conversation-first, dashboard-earned model. All 12 architect recommendations addressed.

## Security Considerations

- **Authentication:** Not in MVP scope (single-user, local). But the architecture must not preclude auth — no hardcoded "current user" assumptions. A `userId` parameter threads through, defaulting to a single user.
- **Credential exposure:** Engine credentials (vault, API keys) never reach the browser. Server Actions and Route Handlers are the security boundary. The web client only receives rendered outputs, never raw credentials.
- **Trust enforcement integrity:** Trust gates run server-side in the engine. The web client can display trust state but cannot bypass it. Approve/edit/reject actions go through `review-actions.ts` server-side.
- **SSE event filtering:** The event stream must not leak engine internals to the browser unless Engine View is active. Default: only user-facing events (item updates, new feed items, briefing ready).
- **Process definition security:** The Self generates process YAML server-side. The browser never sends raw YAML — it sends natural language, the Self produces the definition.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief + UX spec
2. Review agent checks: layer alignment, tech stack justification, sub-brief sizing, dependency graph, security model, UX spec coverage, provenance
3. Present brief + review findings to human for approval

## Smoke Test

Each sub-brief has its own smoke test. The parent brief's integration smoke test:

```bash
# After all sub-briefs are complete:
# 1. Start the app
cd packages/web && pnpm dev

# 2. Open http://localhost:3000
# 3. Self greets → have onboarding conversation → first process created
# 4. Trigger a process run (via engine CLI or Self conversation)
# 5. Return to app → Self delivers briefing with output for review
# 6. Approve via conversation → output delivered
# 7. Click "Show me everything" → workspace appears with feed
# 8. Feed shows shift report + approved item
# 9. Sidebar shows the process under "Recurring"
# 10. Toggle Engine View → see routing/memory/cost metadata
```

## After Completion

1. Update `docs/state.md` with Phase 10 completion
2. Update `docs/roadmap.md` — Phase 10 status to done
3. Update `docs/architecture.md` — add Layer 6 web surface architecture
4. Update ADR-016 — Self as primary surface, new tools, user model
5. Update ADR-009 v2 — json-render implementation details
6. Update ADR-011 — risk detection as attention model extension
7. Phase retrospective: conversation-first bet validated? Engine gaps revealed?
