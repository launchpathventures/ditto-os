# Research: Authenticated SaaS Browser Automation (Write/Act Mode)

**Date:** 2026-04-17
**Requested by:** Human (afirmo.co.nz expense reconciliation use case — 498 rows)
**Status:** Complete
**Consumers:** Dev Architect (if this becomes a brief), Dev PM (roadmap sequencing)

## Research Question

The user has a SaaS accounting platform (afirmo.co.nz) with 498 expenses needing reconciliation. How could Ditto get a persistent, authenticated, write-capable browser capability — one suitable for bulk, repetitive, trust-sensitive tasks against arbitrary web apps that don't expose APIs?

This is a **different question** from prior browser research (`linkedin-ghost-mode-and-browser-automation.md`), which was about:
- DM/messaging automation on well-served platforms (LinkedIn) — largely solved by unified APIs (Unipile, per Insight-174)
- READ-only research and extraction — already delivered via Stagehand in Brief 134

The afirmo case is distinguished by:
- **No public API** (internal NZ SaaS; common for mid-market vertical tools)
- **Authenticated session required** (user-owned login)
- **Bulk, repetitive** (498 near-identical interactions)
- **Write operations** (click row → match → categorize → submit per item)
- **Trust-sensitive** (financial data; errors are costly)
- **Long-tail by definition** — no unified API vendor will ever cover afirmo

---

## Current State in Ditto

### What exists (from prior work)

- **Stagehand adopted** (Brief 134) as the `browse_web` self-tool — `src/engine/self-tools/browser-tools.ts`.
- Explicitly **READ-only**: WRITE intent blocked by regex pattern-match on extraction goals (`WRITE_INTENT_PATTERNS` in `browser-tools.ts:52-79`).
- **Stateless, headless** — no persistent cookies, no login state, no Browserbase cloud dependency.
- Session timeout 30s, token budget ~500 tokens per call, SSRF guard.
- Logged to `activity` table per ADR-005.

### What architecture says

- ADR-005 ("Integration Architecture") formalises **three protocols**: CLI, MCP, REST. Browser is not in this list — it was treated as a distinct "self-tool" capability layer in Brief 134.
- Insight-174 ("Unified Channel APIs Over Per-Platform Automation") scopes to well-served domains (messaging, email) where unified API vendors exist. afirmo falls outside that scope — no unified API covers vertical NZ accounting SaaS.
- Insight-163 ("Find-or-Build Orchestration"): a missing capability is a build signal. A 498-row reconciliation is the archetypal Ditto process — repetitive, trust-progressive, human-gateable at first run.

### The gap

Ditto has no path from "user asks Alex to reconcile 498 expenses" → authenticated browser session → per-row action loop → trust-gated write → audit trail. All of the following are currently absent:

1. WRITE/act browser capability (blocked by design)
2. Persistent authenticated session handling (cookies, storage state, OAuth tokens in user-owned SaaS)
3. Interactive login hand-off (user completes MFA/SSO, browser persists the state)
4. Bulk/looping browser execution bound to a Process primitive
5. Structured audit trail per row (what was matched, what was submitted, reversible?)

---

## Option Space

Presented neutrally. No ranking. Five modalities, roughly ordered by abstraction level.

### Modality 1: Extend Stagehand to WRITE mode

Stagehand is already an adopted dependency. Its `act`, `agent`, and `observe` primitives support writes.

- **Source:** github.com/browserbase/stagehand — TypeScript, MIT, 8k+ stars.
- **Surface:**
  - `page.act("click the first unreconciled row")` — single-step imperative action.
  - `page.agent({ instructions, maxSteps })` — autonomous multi-step loop with LLM in the driver's seat.
  - `context.storageState()` / `context.addCookies()` — Playwright-native session persistence.
- **Current Ditto constraints on using this mode:** `WRITE_INTENT_PATTERNS` gate in `browser-tools.ts:52-79` blocks at tool boundary; no `storageState` persistence; `browse_web` is the only exposed surface. Extending to write would require removing or redesigning those three constraints — the shape of that redesign is an Architect decision.
- **Pros (factual):** Already in dependency graph; TypeScript-native; Anthropic-compatible via Vercel AI SDK; Browserbase cloud available when scaling is needed ($99/mo published pricing).
- **Cons (factual):** Session persistence not currently wired to Ditto's credential vault. `agent` primitive is less mature than `extract`/`act` per Stagehand's own docs positioning. Per-step LLM cost compounds on repeat workflows; `observe` + cached action replay is documented as the cost-optimisation path but its stability claims are not independently verified here.
- **Level:** already **adopted**.

### Modality 2: Anthropic Computer Use

Anthropic's Computer Use tool ships in Claude 4.x models. The LLM is given a screenshot + cursor/keyboard primitives (`click`, `type`, `key`, `screenshot`).

- **Source:** Anthropic SDK. Tool type identifier versioned (`computer_20250124` was a historical stable; a newer version exists at research date but exact identifier not verified in-report — Insight-180 spike-test applies before adoption). Docs: `docs.anthropic.com/en/docs/build-with-claude/computer-use`.
- **Surface:** LLM issues `computer` tool calls; a harness-side loop executes clicks/typing against a running browser (or full desktop) and returns screenshots.
- **Ditto-adjacent requirements (factual, not prescriptive):** an execution environment hosting the browser (container or VM); a per-call screenshot budget since each loop burns vision tokens.
- **Pros (factual):** Works on any visual UI — never-seen-before SaaS, PDFs, canvas-based apps, Electron, Citrix. Generalises without DOM knowledge. No page-structure breakage risk (vision robust to minor DOM refactors).
- **Cons (factual):** Expensive per step (vision tokens per screenshot). Slow (screenshot + model + action round-trip per click). Claude-only (violates ADR-026 multi-provider goal). Requires desktop or containerised Chromium (more infra than headless Playwright). No structured action log by default — audit trail must be synthesised from tool-call history.
- **Level:** **pattern / depend-on-SDK-tool** (no separate library).

### Modality 3: Playwright MCP server (Microsoft)

Microsoft publishes an official MCP server that exposes Playwright as MCP tools — cleanly fits ADR-005's MCP protocol slot.

- **Source:** github.com/microsoft/playwright-mcp — TypeScript, Apache-2.0, maintained by the Playwright team (exact activity level not re-verified in this report).
- **Surface:** MCP tools (per README at research date): `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot` (accessibility-tree snapshot, not pixels), `browser_select_option`, `browser_wait_for`, `browser_pdf_save`, `browser_file_upload`, and others. Snapshot-based — returns a structured accessibility tree rather than pixels.
- **Composition fit (factual):** maps to ADR-005's existing MCP protocol slot; a persistent user profile via Playwright's `--user-data-dir` is a standard Playwright flag surfaced in the MCP server (README reference; line not pinned here).
- **Pros (factual):** Accessibility-tree is lossless for most SaaS (cheaper and more reliable than vision for structured UIs). Official Microsoft project (high maintenance confidence). Maps to existing MCP pattern — no new protocol category needed; ADR-005 already supports it. Composable with Claude, GPT-4o, Gemini — provider-neutral.
- **Cons (factual):** Token-heavier than a cached action replay (each step sends an a11y snapshot). Not Playwright-vanilla — runs an MCP wrapper process. Multi-tab state management is explicit. No built-in "bulk row loop" primitive — that's an agent-level concern.
- **Level:** would be **depend** (published package) or **adopt** (vendor the handful of tool handlers into Ditto's MCP registry).

### Modality 4: Autonomous browser agent libraries

Higher-level frameworks where the library owns the click-loop, not Ditto.

#### browser-use
- **Source:** github.com/browser-use/browser-use — Python-first (78k+ stars at last research). TypeScript port (`browser-use-typescript`) remains less mature.
- **Surface:** `Agent(task, llm).run()` — full autonomous planner + DOM/vision hybrid executor built on Playwright. Built-in memory, self-correction, file-system persistence.
- **Pros (factual):** Most mature autonomous web agent in OSS. Handles login flows, captchas (partial), multi-tab. Active development.
- **Cons (factual):** Python — requires subprocess/sidecar in Ditto's TypeScript stack (pattern exists but adds surface). License MIT. Opaque agent loop — hard to insert Ditto trust gate mid-loop without forking.
- **Level:** **pattern** (study the loop, implement TS equivalent on Stagehand) — matches prior research classification.

#### Skyvern
- **Source:** github.com/Skyvern-AI/skyvern — Python, AGPL-3.0.
- **Surface:** Multi-agent swarm (navigation, interaction, extraction, password). Vision-first. Workflow chaining.
- **Pros (factual):** Purpose-built for never-seen-before SaaS. Self-generating Playwright code (a form of record-and-replay).
- **Cons (factual):** AGPL — copyleft, not viable as a direct dependency for Ditto's commercial-ready posture. Python. Heavy.
- **Level:** **pattern** only (AGPL rules out adopt/depend).

#### Browserbase / Director (hosted)
- **Source:** browserbase.com (commercial). Director is Browserbase's orchestration layer.
- **Surface:** Hosted browser sessions + higher-level `agent`-style orchestration over their cloud.
- **Pros (factual):** No infra to run. Session persistence, proxy rotation, and anti-detection managed by the vendor.
- **Cons (factual):** Commercial dependency. Single-vendor coupling for the browser modality.
- **Level:** **depend** candidate.

#### Adjacent cloud-browser infrastructure (mentioned for completeness, not evaluated in depth)
- **Steel Browser** — github.com/steel-dev/steel-browser — OSS browser sandbox API; noted in prior report (`linkedin-ghost-mode-and-browser-automation.md` line 147-150).
- **Anchor Browser** — anchorbrowser.io — commercial hosted browser with agent API.
- **Hyperbrowser** — hyperbrowser.ai — commercial hosted browser.
- **Airtop** — airtop.ai — commercial hosted browser with agent API.
- **AgentQL** — agentql.com — query-language approach to DOM targeting; different stability model than a11y-tree.
- These are Browserbase alternatives in the hosted-browser tier. Full evaluation deferred; flagged so the Architect can request a comparative follow-up if hosting becomes a decision point.

#### Alternative LLM-driven browser agents (mentioned for completeness)
- **OpenAI Operator / ChatGPT Agent Mode** — vision-based LLM-driven browser, OpenAI-hosted, analogous to Modality 2 (Computer Use) but OpenAI-side. Not available as an SDK for embedding; user-product only at research date.
- **Firecrawl `actions`** — firecrawl.dev now exposes click/type/wait actions on top of its scraper. Write-lite modality, not full agent.
- **Gumloop** — gumloop.com — commercial low-code recorded-flow product.
- **n8n browser nodes** — n8n.io — self-hostable workflow automation with Puppeteer-based browser steps.

### Modality 5: Record-and-replay

Different pattern: user demonstrates the workflow once, Ditto replays it 498 times with per-row parameterisation.

- **Primitives:** Playwright `codegen` (generates TypeScript Playwright code from recorded actions — `playwright.dev/docs/codegen`); Playwright trace files (`.trace.zip`); Chrome DevTools Recorder (`.json` user-flow format); Selenium IDE `.side` files; Puppeteer + puppeteer-recorder.
- **AI-augmented variants:** Stagehand publishes an `observe` → cached action plan → replay pattern in its docs (specific API/file reference not pinned in this report — Architect should verify before committing); browser-use `workflow` feature (github.com/browser-use/browser-use README); Skyvern self-generates Playwright code (github.com/Skyvern-AI/skyvern README).
- **Surface:** user reconciles row 1 while Ditto records; Ditto parameterises (`amount`, `category`, `vendor`) and replays for rows 2-498.
- **Pros (factual):** Deterministic, cheap (no per-step LLM calls after first recording), fast, auditable (trace file = evidence). Maps cleanly to Ditto's Process primitive — the recording IS the process definition. Matches Insight-098 ("Prototypes are specifications"): a recorded flow is a specification.
- **Cons (factual):** Brittle to DOM changes between runs — needs a healing strategy (LLM fallback when replay fails). First recording is synchronous user work. Not suited to flows where per-row state differs non-trivially (e.g. row needs a judgment call mid-flow).
- **Level:** **pattern** (concept) + **depend** on Playwright primitives.

---

## Cross-Cutting Concerns (not modality-specific)

These are concerns any write-capable browser modality will encounter, and the ecosystem primitives that exist to address them. Design choices among them are the Architect's call.

### Authenticated session handling

- **Playwright `storageState`** (JSON blob of cookies + localStorage) is the de-facto format across all Playwright-based modalities (1, 3, 4, 5). Generated via `playwright.dev/docs/auth` documented flow (`page.context().storageState({ path: 'state.json' })` or `playwright codegen --save-storage`).
- **Credential vault (ADR-005 §3)** — `credentials` table exists with `(processId, service)` UNIQUE, AES-256-GCM. Any `storageState` persistence would consume this existing infrastructure rather than introduce new storage.
- **Login-handoff patterns observed in the ecosystem:** headed-Chromium dump (Playwright codegen `--save-storage`); manual cookie paste; remote streamed browser (Browserbase, Anchor, Hyperbrowser all expose this).
- **MFA / SSO** — all modalities require the user physically present for first login. This is a constraint of the authentication systems, not of any particular tool.

### Bulk execution as a Process

- Ditto's Process primitive and `work_items` table are structurally compatible with per-row iteration. Trust tier progression (Phase 3) exists and is orthogonal to which browser modality is chosen.
- At 498 rows, wall-clock duration depends on per-row cost of the chosen modality — which varies by orders of magnitude between vision-heavy (Modality 2), a11y-snapshot (Modality 3), and cached replay (Modality 5).

### Audit trail

- `activity` table (ADR-005) logs tool calls. Playwright `trace` files (zip of DOM snapshots + screenshots per action — `playwright.dev/docs/trace-viewer`) are the industry audit artefact for browser actions. How (or whether) these compose is an Architect question.

### Trust gate for writes

- Modalities 1-5 all produce discrete tool calls or step boundaries the harness could intercept. Each modality's granularity differs: Stagehand `act` is per-action; Computer Use is per-screenshot; Playwright MCP is per-MCP-call; record-and-replay is per-recorded-step.
- Existing Ditto trust tiers and approval primitives do not currently reason about browser actions specifically. Whether they need to (and how) is an Architect question.

### Rate limiting / TOS

- SaaS TOS for automation of the authenticated user's own data varies per-product. Out of scope to evaluate afirmo's specifically — user would need to read the terms.

---

## Gaps Identified

Factual gaps between what the libraries above provide and what a write-capable browser capability in Ditto would additionally need:

1. **Binding to Ditto's trust tiers** — no library surveyed reasons about per-user, per-process, earned-trust-based gating of browser actions. Every library produces events the harness could intercept, but the gating logic is absent.

2. **Structural fingerprinting of browser actions** — no library surveyed provides "this write is structurally identical to the last three approvals". This is the primitive that would let trust tiers auto-promote browser writes. Not found in any modality.

3. **Ditto-credential-vault integration for `storageState`** — Playwright provides `storageState` capture (`codegen --save-storage`); Stagehand and browser-use each provide their own session-persistence helpers. What doesn't exist is the wiring from any of them into Ditto's existing `credentials` table (ADR-005 §3). Integration, not invention.

4. **Cross-session workflow healing with user escalation** — library-level answer (browser-use, Stagehand `agent`) is "re-plan with the LLM". The gap is the specific semantics of detecting deviation, pausing, escalating to the user, and capturing the new learned pattern as a durable Process update. Partially addressed by agent re-planning; the Ditto-original piece is the escalation/capture semantics.

5. **Per-row reversibility evidence** — for financial/reconciliation contexts, no library surveyed produces "here's exactly what changed and how to undo it". Playwright traces record actions but not semantic diffs. This is Process + audit-trail work orthogonal to which browser library is chosen.

---

## Reference Docs Status

Reference docs updated:
- **`docs/landscape.md`** — Browser Automation section extended (2026-04-17): added Playwright MCP server and Anthropic Computer Use entries; annotated existing Stagehand entry to record WRITE/act modality as unexplored in Ditto; catalogued surveyed-but-not-individually-evaluated alternatives with pointer back to this report.

Reference docs checked, no update required here:
- **`docs/research/linkedin-ghost-mode-and-browser-automation.md`** — not superseded. Remains accurate for the LinkedIn/DM domain. This report is complementary (authenticated-SaaS domain).
- **`docs/insights/`** — no new insight produced. Insight-174 (unified channels over per-platform) already anticipates that long-tail SaaS needs its own answer; this report describes the option space. An insight may emerge once the Architect picks a direction.

Flagged for Architect (not Researcher scope):
- **`docs/architecture.md`** / ADR-005 currently lists three integration protocols (CLI, MCP, REST). A browser modality isn't cleanly any of those. Whether to (a) extend ADR-005 with a browser protocol, (b) treat Browser as a self-tool category orthogonal to integration protocols, or (c) route it entirely through the MCP slot (via Playwright MCP) is an architecture decision.

---

## Summary Table

| Modality | Language/License | Session Persistence | Audit Surface | Ditto Composition Level |
|----------|------------------|--------------------|--------------|-----------------------|
| Stagehand (act/agent) | TS / MIT | Playwright storageState | Per-action LLM trace | Already adopted; extend |
| Anthropic Computer Use | SDK tool / Anthropic | Manual (screenshots only) | Tool-call history | Depend (on SDK); build loop |
| Playwright MCP (Microsoft) | TS / Apache-2.0 | Playwright storageState / user-data-dir | A11y-tree snapshots | Depend or adopt |
| browser-use | Python / MIT | Built-in | Agent memory file | Pattern (TS port immature) |
| Skyvern | Python / AGPL-3.0 | Built-in | Self-generated Playwright | Pattern only (AGPL) |
| Record-and-replay (Playwright codegen + Stagehand deterministic replay) | TS / MIT | Playwright storageState | Playwright trace files | Depend |

---

## Handoff

Neutral — no recommendation made per Researcher role contract. Candidate next steps:

- **Dev Architect** to evaluate against the architecture (trust gate integration, Process primitive fit, ADR-005 extension vs. self-tool category) and decide on a brief.
- **Dev PM** to sequence against the roadmap (Phase 9 Network Agent is active; this capability most naturally sits alongside, not inside, current phase).
