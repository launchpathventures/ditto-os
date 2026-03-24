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

- Native mobile app (Phase 13 — but responsive down to tablet, breakpoints per UX spec 3.7)
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
- OAuth integration auth (Phase 11 — requires managed cloud infrastructure). MVP uses API key entry only (see G9 in architecture validation)
- Standards library runtime (ADR-019) — quality profiles are designed but the engine runtime that evaluates them against process outputs is Phase 11. The web app can display quality criteria but doesn't execute quality profile checks.
- Full composable UI where the Self dynamically composes layouts (Insight-086) — the MVP builds standard React components for the workspace shell. Self-driven content within conversation uses a component catalog (ADR-009 v2 pattern). Full composable layout composition is Phase 11+.

**Note:** This parent brief (038) supersedes the earlier Brief 037 draft (`037-phase-10-mvp-dashboard.md`), which predates the UX v3 spec and architecture validation.

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
| Visual identity | `docs/research/visual-identity-design-system-ux.md` | original | Warm professional design system: colour palette (warm neutrals + terracotta accent), Inter/JetBrains Mono typography, 8px spacing grid, elevation system. Baked into Tailwind/shadcn theme config as design tokens in `globals.css`. |
| Build strategy | `docs/research/ui-build-strategy-ux.md` | original | Strategy D: design tokens → HTML prototypes as visual targets → reference-driven build → visual QA gate. HTML prototypes in `docs/prototypes/` are the pixel-level references the Builder works from. |

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
| `create_work_item` | Create work from conversation | 2.2 (work creation) | Brief 040 |
| `generate_process` | Define a process through conversation | 2.5 (process definition) | Brief 040 |
| `quick_capture` | Store raw context for later classification | 2.6 (quick capture) | Brief 040 |
| `adjust_trust` | Change trust level on a process | 2.4 (trust changes) | Brief 040 |
| `get_process_detail` | Retrieve process detail for conversation | UX 2.3 (inline data) | Brief 040 |
| `connect_service` | Guide user through integration auth (API key entry) | Integration auth research (G9) | Brief 040 |
| `get_briefing` | Assemble the morning briefing | 2.1 (morning briefing) | Brief 043 |
| `detect_risks` | Surface risk signals from engine | UX 4.4.1 (risk detection) | Brief 043 |
| `suggest_next` | Draw from user model + industry patterns | UX 4.2 (proactive guidance) | Brief 043 |

These tools are engine functions exposed to the Self via the existing tool_use mechanism. The Self decides when to call them based on conversation context.

### Integration Auth (MVP Scope — G9)

Architecture validation identified G9 (conversational integration auth) as HIGH severity. Every real process needs external system access. MVP scope: **API key entry only** (OAuth requires managed cloud infrastructure, deferred to Phase 11).

The `connect_service` Self tool:
1. Self detects a process needs an external service (e.g., "I'll need access to your Stripe account")
2. Self explains what's needed and provides step-by-step setup guidance (stored in integration registry's `connection` metadata)
3. Self presents a **masked input field** for the API key — key is never written to conversation history or activity logs
4. Key goes directly to credential vault via `credentialVault.store()`
5. Self verifies the connection by making a test call
6. Self confirms: "Connected. I'll only use this for [process name]."

This reuses the existing credential vault (Brief 035) but adds a conversational UX path. The integration registry is extended with `connection` metadata (auth_type, provider_name, setup_url, scopes).

### Risk Detection (MVP Scope)

Three risk types for MVP (Insight-077):

| Risk type | Signal source | Detection |
|-----------|--------------|-----------|
| **Temporal** | Work items aging, deadlines approaching | Query: items with no activity > N days, items with deadline < 3 days |
| **Data staleness** | Integration inputs not refreshed | Query: last successful poll > threshold per integration |
| **Correction pattern** | Correction rate trending up | Query: sliding window correction rate per process, compare to baseline |

Implementation: a `detectRisks()` engine function that queries the DB for these signals. The Self calls it during briefing assembly. Results are woven into the Self's narrative, not rendered as a separate UI.

### User Model (Insight-093)

The Self needs deep structured understanding of the user — not just business type and pain points, but enough to power proactive suggestions for weeks. Nine dimensions, populated progressively through multi-session intake:

```typescript
interface UserModel {
  // Captured first (immediate value — powers first process)
  problems: string[];          // what's broken, what hurts
  tasks: string[];             // what's on their plate right now
  work: string[];              // how they actually do things today

  // Captured early (first-week deepening)
  businessType?: string;       // "trades", "ecommerce", "consulting"
  businessSize?: string;       // "solo", "small (2-10)", "medium (10-50)"
  industry?: string;           // free text
  concerns: string[];          // worries about AI/automation → trust calibration
  frustrations: string[];      // what they've tried that didn't work → what to avoid
  communicationPreferences: {  // when, how, how much
    preferredSurface: "conversation" | "workspace";
    activeHours?: string;
    checkFrequency?: string;
    briefingVerbosity?: "detailed" | "concise";
  };

  // Deepened across sessions (strategic guidance)
  vision: string[];            // where they want to be
  goals: string[];             // short and medium term
  challenges: string[];        // what's hard, what fails
}
```

Populated progressively: most important first (problems, tasks for immediate value), deepened across sessions (vision, goals for strategic guidance). Stored as structured self-scoped memory. The Self reads it at context assembly time and draws from all 9 dimensions for proactive suggestions.

### The Self as AI Coach (Insight-093)

The Self doesn't just learn from the user — it teaches the user how to work effectively with AI:

- **After corrections:** "When you tell me *why* you changed the labour estimate, I learn faster"
- **After good teaching:** "You've taught me 4 things about bathroom quotes this week — here's what I know now"
- **Setting expectations:** "I'll get the first few wrong — that's how I learn your standards"
- **Showing the return:** Making accumulated knowledge visible so the user sees the payoff

This is woven into natural conversation, not a separate mode. The cognitive framework (`cognitive/self.md`) should include AI coaching principles.

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
 ├── 044 — Onboarding Experience (onboarding YAML, adapt_process, conversation components, AI coaching)
 │         Depends on 040. The first-run experience. Validates conversation-first model.
 │
 └── 043 — Proactive Engine (briefing assembly, risk detection, user model, suggestion engine)
           Depends on 040. The intelligence layer.
```

### Dependency Graph

```
039 (Web Foundation)
 ├──→ 040 (Self Extensions) ──→ 044 (Onboarding Experience)
 │                          ──→ 043 (Proactive Engine)
 └──→ 041 (Feed & Review) ──→ 042 (Navigation & Detail)
```

040 and 041 can be built in parallel after 039.

### Sub-Brief Summaries

**039 — Web Foundation** (~14 AC)
- Next.js 15 project in `packages/web/`
- shadcn/ui setup + Tailwind v4 + **design tokens from visual identity spec** (warm professional, not default shadcn)
- Vercel AI SDK `useChat` connected to `selfConverse()`
- Streaming adapter for the Self
- Full-screen conversation UI (the day-1 experience)
- Entry point routing (conversation-only vs workspace)
- SSE event stream from harness events
- HTML prototypes used as visual references during build (visual QA gate)
- Smoke test: open app → Self greets → type message → Self responds

**040 — Self Extensions** (~15 AC)
- 6 new Self tools: create_work_item, generate_process, quick_capture, adjust_trust, get_process_detail, **connect_service** (conversational integration auth — API key entry)
- Confirmation model for irreversible actions
- **Deep intake onboarding** — multi-session, 9-dimension user model (not a thin form), Self drives and deepens across sessions (Insight-093)
- **AI coaching** — Self teaches users to be better collaborators, woven into corrections and reviews (Insight-093)
- Inline data rendering in conversation (tables, sparklines, structured cards via component catalog)
- **Masked credential input** — API keys never touch conversation history
- Smoke test: create work via conversation → Self generates process → connect service → output appears
- Note: `get_briefing`, `detect_risks`, `suggest_next` moved to Brief 043 (no stub-then-rewrite)

**041 — Feed & Review** (~15 AC)
- Feed component with 6 item types (shift report, review, update, exception, insight, process output)
- Feed item component registry (discriminated union)
- Review flow: approve/edit/reject inline on feed cards
- Feedback capture from review actions (diff recording)
- "Teach this" pattern detection prompt (UI only — Learning engine is Phase 8)
- Entity grouping and priority ordering
- Interaction states (empty, loading, error, content, single-process)
- Smoke test: run a process → output appears in feed → approve inline

**042 — Navigation & Detail** (~15 AC)
- Left sidebar (My Work, Recurring, Settings)
- Process detail view — living roadmap variant + domain process variant
- Trust control surface (natural language)
- Engine View (developer mode — toggle, inline engine metadata)
- Three-panel layout composition (sidebar + center + right panel)
- Progressive reveal: workspace appears when Self suggests it
- **Responsive breakpoints** (≥1280px three-panel; 1024-1279px icon rail; <1024px drawer/hamburger)
- User preference persistence
- Smoke test: click sidebar item → process detail loads → trust control works

**044 — Onboarding Experience** (~14 AC)
- Onboarding as native system process (`processes/onboarding.yaml`)
- `adapt_process` Self tool — runtime YAML mutation (Insight-091). Self adapts onboarding steps based on what it learns.
- Knowledge synthesis card — shows what Self knows, completeness indicators, editable
- Process-proposal-card — plain language steps, approve/adjust
- AI coaching behavioural layer — woven into corrections and reviews
- Heartbeat re-read verification (process definitions mutable at runtime)
- Smoke test: new user → conversation → knowledge reflected → first process → first real work → coaching moment

**043 — Proactive Engine** (~14 AC)
- 3 new Self tools: `get_briefing`, `detect_risks`, `suggest_next` (full implementations, not stubs)
- `assembleBriefing()` — shift report generation from process runs + work items
- `detectRisks()` — temporal, data staleness, correction-pattern risk signals
- User model behaviour tracking: update working patterns from observed usage
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
# 4. Self detects integration needed → guides API key entry → masked input → vault → verified
# 5. Trigger a process run (via engine CLI or Self conversation)
# 6. Return to app → Self delivers briefing with output for review
# 7. Approve via conversation → output delivered
# 8. Click "Show me everything" → workspace appears with feed
# 9. Feed shows shift report + approved item
# 10. Sidebar shows the process under "Recurring"
# 11. Toggle Engine View → see routing/memory/cost metadata
# 12. Resize to <1024px → responsive layout with hamburger + drawer
```

## After Completion

1. Update `docs/state.md` with Phase 10 completion
2. Update `docs/roadmap.md` — Phase 10 status to done
3. Update `docs/architecture.md`:
   - Reconcile Layer 6 view compositions (current spec lists 8 views: Home, Review, Map, Process Detail, Setup, Team, Improvements, Capture) with the actual MVP model (conversation-only surface + workspace with feed/sidebar/detail). Note which spec views are aspirational vs implemented.
   - Reconcile UI primitives: the separate Review Queue and Activity Feed primitives are merged into a single feed in the MVP. Document this as a design decision.
4. Update ADR-016 — Self as primary surface, 14 tools (5 original + 6 Brief 040 + 3 Brief 043), user model, confirmation model, streaming adapter
5. ~~Update ADR-009 v2~~ — json-render is deferred (not implemented in Phase 10). No ADR update needed until json-render is built.
6. Update ADR-011 — risk detection as attention model extension (3 MVP risk types)
7. Update ADR-005 — integration registry connection metadata extension
8. Phase retrospective: conversation-first bet validated? Engine gaps revealed?
