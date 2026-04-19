# Research: Browserbase Product Family (Hosted Runtime, Stagehand Cloud Features, Browse CLI, Director)

**Date:** 2026-04-19
**Requested by:** Human (question: "Would we benefit from something like browserbase.com/pricing?" with follow-up pointers to `/stagehand`, `/browse-cli`, `/director`)
**Status:** Complete
**Consumers:** Dev Architect (for potential amendment to Brief 182 family or a new ADR under `BrowserRuntime` interface), Dev PM (sequencing against Phase 9 / Network deployment)

## Research Question

Prior research (`authenticated-saas-browser-automation.md`, 2026-04-17) catalogued Browserbase as one sub-option under Modality 4 in four lines. It did not drill into Browserbase's specific product surface as it exists today. The human has pointed at three product pages — Stagehand (`/stagehand`), Browse CLI (`/browse-cli`), Director (`/director`) — plus the pricing page (`/pricing`), and asks whether Ditto benefits from adopting any of them.

This report characterises each Browserbase product factually, where it would plug into Ditto, where the overlap vs distinctness sits against what Brief 182 has already scoped, and the resulting option space. Per the Researcher contract, no recommendation is made.

## Relationship to Prior Research

- **`authenticated-saas-browser-automation.md`** (2026-04-17) — parent research. Browserbase/Director appears there in four lines under Modality 4. This report deepens, not supersedes.
- **`linkedin-ghost-mode-and-browser-automation.md`** — earlier READ-only / messaging-domain research; not affected by this report.
- **Brief 182 family** (`182-browser-write-capability.md` parent, `183`/`184`/`185`/`186` sub-briefs) — approved 2026-04-17, scoped the write-capable browser protocol. Explicit constraint at line 85: *"MUST NOT require Browserbase cloud. Default runtime is local headless Chromium via `playwright` package. Browserbase is a later DEPEND candidate for scale; not in any sub-brief here."* Brief 182 line 73 requires a `BrowserRuntime` interface "so a later sidecar or container runtime implementation drops in without touching call sites." This report's findings are consumed primarily as input to a future `BrowserRuntimeBrowserbase` implementation decision, not to the 183/184/185 path.
- **Brief 134** (shipped) — `browse_web` self-tool uses `@browserbasehq/stagehand` configured with `env: "LOCAL"`, so Stagehand is an in-process dependency today; Browserbase cloud is **not** a Ditto dependency.

## Current Ditto Browser Surface (Baseline for Comparison)

- **`browse_web` self-tool** — `src/engine/self-tools/browser-tools.ts`. Stagehand LOCAL, headless Chromium, stateless, READ-only, SSRF-guarded, token-budgeted, activity-logged.
- **Planned integration protocol** — `browser` as a fourth ADR-005 protocol (ADR-032 to be created in sub-brief 183). Handler dispatches to `BrowserRuntime` interface. In-process local Playwright is the v1 runtime implementation.
- **Trust gate** — per-tool-call approval (ADR-007), reused from CLI/REST handlers.
- **Audit artefact** — Playwright trace file (`.trace.zip`) per stepRun; 250 MB cap with chunked eviction; viewed via `npx playwright show-trace`.
- **Credential vault** — `credentials` table (ADR-005 §3), AES-256-GCM. storageState blobs will land here under `service=browser:<service>` discriminator.
- **Fingerprint-based bulk auto-promotion** — sub-brief 185's original-to-Ditto primitive. No Browserbase product provides an equivalent.

## Product-by-Product Factual Inventory

### 1. Stagehand (OSS SDK — already adopted)

**Source:** `github.com/browserbase/stagehand` (MIT, TypeScript + Python, 8k+ stars). npm package: `@browserbasehq/stagehand` v3.2.1 currently installed in Ditto.

**Primitives (per https://www.browserbase.com/stagehand):**
- `act(instruction)` — plain-English action (click, fill, navigate, scroll).
- `extract(schema)` — structured data extraction with Zod schema validation.
- `observe()` — surfaces actionable DOM elements before action commit.
- `agent({ instructions })` — autonomous multi-step loop.

**Runtime modes:**
- `env: "LOCAL"` — Stagehand drives a local headless Chromium via Playwright (current Ditto configuration at `browser-tools.ts:184`).
- `env: "BROWSERBASE"` — Stagehand drives a remote Chromium in Browserbase's infrastructure via CDP; same SDK surface, different transport.

**Browserbase-only capabilities referenced on the Stagehand product page:**
- **Agent Identity authentication** — named agent-identity feature; product page does not specify mechanism.
- **Session replay** — recorded session playback accessible via Browserbase dashboard.
- **Captcha solving** — automatic, behind auth tier (gated to Developer plan and above per pricing page).
- **Prompt observability** — LLM prompt/response trace per action, surfaced in dashboard.
- **Functions** — zero-infrastructure serverless deployment of Stagehand scripts on Browserbase.
- **Model Gateway** — single API key routes to OpenAI, Anthropic, Google Gemini via Vercel AI SDK.

**Pros (factual, for Ditto):**
- No SDK migration cost — Stagehand is already a dependency; switching from LOCAL to BROWSERBASE is a runtime config change (`env` + API key).
- TypeScript-native, MIT.
- Browserbase features (session replay, captcha) do not change the calling code.

**Cons (factual, for Ditto):**
- Brief 182 plans Playwright (not Stagehand) for the integration track. Stagehand remains scoped to the self-tool track. Using Stagehand-on-Browserbase for the integration track would re-open the Stagehand-vs-Playwright choice that Brief 182 closed.
- `agent` primitive is a black-box autonomous loop — Brief 182 non-goal #1 explicitly excludes it; Brief 186 defers it. Adopting BROWSERBASE runtime does not change that non-goal.
- Session replay duplicates Playwright trace files for Ditto's audit purpose. Two artefact sources to reconcile.

**Composition level for Ditto:** Stagehand itself is **already adopted**. The BROWSERBASE runtime mode is an unadopted peripheral.

### 2. Browserbase Cloud Runtime (the underlying hosted-browser service)

**Source:** https://www.browserbase.com/ (commercial). Connection mechanism: CDP (Chrome DevTools Protocol) over WebSocket to a Browserbase-hosted session; Playwright can connect to an existing CDP endpoint via `chromium.connectOverCDP(wsEndpoint)` (playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp).

**What it provides (per https://www.browserbase.com/pricing):**
- Hosted, long-running Chromium sessions accessible by CDP.
- Concurrent session pool (3 / 25 / 100 / 250+ across tiers).
- Residential + datacenter proxy rotation (1 GB / 5 GB / custom).
- Stealth mode (Basic from Developer tier; Advanced in Scale).
- Auto captcha solving (Developer tier and above).
- Session recording, live view, dashboard UI.
- Model Gateway (Stagehand-adjacent, pay-as-you-go LLM routing).
- HIPAA BAA, DPA, SSO on Scale tier.

**Pricing (as of 2026-04-19):**

| Tier | Monthly | Concurrent | Hours included | Overage | Proxies | Retention | Notes |
|------|---------|------------|----------------|---------|---------|-----------|-------|
| Free | $0 | 3 | 1 | — | — | 7 days | No captcha, no stealth, 15 min/session |
| Developer | $20 | 25 | 100 | $0.12/hr | 1 GB / $12/GB | 7 days | Basic stealth, captcha |
| Startup | $99 | 100 | 500 | $0.10/hr | 5 GB / $10/GB | 30 days | Basic stealth, captcha |
| Scale | custom | 250+ | custom | custom | custom | 30+ days | Advanced stealth, HIPAA BAA, DPA, SSO |

**Afirmo-scale cost shape (factual, 2026-04-19 pricing):**

| Scenario (498 rows × ~4 writes) | Session-hours | Free $0 | Developer $20/mo | Startup $99/mo |
|--------------------------------|---------------|---------|------------------|----------------|
| 30-sec/row deterministic replay | ~4.2 hr | N/A — 15-min session cap + 1-hr budget breaks the run | $20 flat (within 100 hr) | $99 flat (within 500 hr) |
| 2-min/row agentic per-step LLM  | ~16.6 hr | N/A | $20 flat (within 100 hr) | $99 flat (within 500 hr) |
| Supervised trust tier with approval latency of X minutes per hold (session stays open during wait, per Brief 182 BrowserContext lifecycle) | base + (holds × X / 60) hr | N/A | Within 100 hr envelope for X ≤ ~30 min assuming ~12 supervised holds before fingerprint auto-promote (sub-brief 185) | Within 500 hr envelope for almost any X |

Assumptions: first three rows supervised (12 approvals, sub-brief 185 behaviour); rows 4–498 auto-approve on matching fingerprint. Single-tenant single-concurrent. Approval-latency X is user-dependent and not predictable from product docs. Multi-user or multi-concurrent scenarios change the calculus. Free tier is unusable for any realistic run (15-min session cap, 1-hr budget, no overage). Meaningful dev evaluation starts at $20/mo Developer tier.

**Pros (factual, for Ditto):**
- No Chromium binaries to ship or install on the deployment host (Network Service in Phase 9).
- Per-tenant isolation for free in a multi-tenant deployment (each Ditto user → distinct Browserbase session).
- Residential proxies / stealth exist out of the box — useful where anti-bot fingerprinting blocks datacenter IPs.
- Captcha solving automated on Developer+.
- HIPAA BAA available on Scale — may matter for compliance-bound tenants.
- Drops in behind Brief 182's `BrowserRuntime` interface seam without re-opening call-site code.

**Cons (factual, for Ditto):**
- Commercial single-vendor dependency. No second source for an identical CDP-hosted-browser feature set at matching pricing (alternatives — Steel, Anchor, Hyperbrowser, Airtop — differ per section below).
- Session-hour pricing is per-tenant-scale, not per-action. Long-running sessions (waiting for a human approval in supervised trust tier) bill for wall-clock, not work-done. A 498-row reconciliation held at row 3 for 8 hours awaiting approval burns 8 paid session-hours.
- Duplicate audit surface (Browserbase session recording + Playwright trace) — both record the same session; pick one or reconcile.
- Network egress of cookies / storageState over CDP to a third-party endpoint is a data-governance decision separate from Ditto's scrub/vault posture.
- Free tier's "no stealth, no captcha" makes it unsuitable for evaluation against real targets; meaningful dev evaluation starts at $20/mo.

**Composition level for Ditto:** **depend** candidate as a future `BrowserRuntimeBrowserbase` implementation of the interface introduced in Brief 183. Out of scope for 183–185 per Brief 182 line 85.

### 3. Browse CLI (`@browserbasehq/cli`, invoked as `bb`)

**Source:** https://www.browserbase.com/browse-cli. OSS per product-page language. Installation: `npm i -g @browserbasehq/cli`.

**Surface (per product page):**
- `bb fetch <url>` — clean content extraction, automatic fallback from lightweight HTTP to full browser render.
- `bb search <query>` — structured web search via a single command.
- `bb browse open <url>` — full browser session over CDP; supports click, scroll, form fill, authentication handling, multi-step navigation.
- `bb sessions list / logs` — inspect active / recent sessions.
- `bb functions init / dev / publish` — package and deploy Stagehand scripts to Browserbase Functions.

**State persistence:** "Browserbase contexts persist cookies, localStorage, and browser state across sessions" — sessions are named and resumable without re-auth.

**Intended audience (per product page):** "Coding agents to control the browser" — Claude Code, Cursor, Codex. Positioned as a terminal tool for LLM-driven dev loops.

**Operational model:** "Local development with a standard browser, then routing through Browserbase infrastructure for production use without code changes." The CLI shape is identical across local and hosted.

**Pros (factual, for Ditto):**
- Already-shaped CLI surface that maps roughly to Brief 184's `pnpm cli browser auth <service>` intent (interactive session capture). Overlap point — see Gaps below.
- `bb fetch` and `bb search` provide cheap READ paths that duplicate `browse_web` functionally but with different transport (CLI subprocess vs SDK import).
- `bb browse` session resume semantics are analogous to Brief 184's storageState vault use case.

**Cons (factual, for Ditto):**
- `bb` is a CLI, not an in-process SDK. Integration via subprocess adds a process boundary where Brief 182's Playwright approach keeps everything in-process.
- Session persistence is Browserbase-account-scoped (named sessions persist in Browserbase cloud), not Ditto-vault-scoped. Credential ownership divergence.
- Functions (`bb functions init/dev/publish`) is a Browserbase deployment mechanism, not a Ditto deployment mechanism. Adopting Functions would fork Ditto's runtime model.
- No stated language binding beyond the CLI executable. "Works with Claude Code / Cursor / Codex" is an integration statement, not an SDK statement.
- Output formats are undocumented on the product page; the `docs.browserbase.com` introduction hub (checked 2026-04-19) does not pin `bb fetch` output shape either. A deeper docs-set search could surface this; left as a knowable-but-not-pinned fact.

**Composition level for Ditto:** **pattern** candidate (the CLI shape is prior art for Brief 184's session-capture CLI); **not a depend candidate** because the functionality overlaps cleanly with existing Ditto CLI + vault + integration handler surfaces already planned in 183/184.

### 4. Director (UI for browser-agent authoring)

**Source:** https://www.browserbase.com/director. Described on page as "a complete UI for building useful browser agents." Free trial tier; no pricing line on the pricing page specifically for Director — Director runs on the tenant's Browserbase usage budget per the product page.

**Surface (per product page):**
- Natural-language task description → executable browser agent.
- Real-time visual playback of agent execution.
- Mid-execution NL correction ("no, click the Reconcile tab instead").
- **Output: exportable Stagehand code** — code handed to the user for deployment into their own runtime or hosted on Browserbase.
- Execution modes: single-run, scheduled (daily/weekly/triggered), parallel-scaled.
- 1Password integration for credentials.

**Stated scale reference (product page):** "20,000+ developers, 50M+ sessions, serving Vercel, Perplexity, 11x."

**Pros (factual, for Ditto):**
- Covers a gap Brief 182 explicitly defers: **process authoring for a new SaaS**. Brief 186 (`stagehand-agent-authoring.md`) is the deferred sub-brief that would address this; Director is existing prior art for the same problem.
- Exports Stagehand code — the output format is a text artefact compatible with Ditto's Process YAML authoring flow (translation layer needed).
- 1Password integration is a deployed UX pattern in the same problem space as Brief 184's session-capture credential handoff.
- Scheduling and parallel-scaling are operational capabilities Ditto already has equivalents for (`work_items`, scheduler) — cross-reference, not adopt.

**Cons (factual, for Ditto):**
- Director is a **UI product**, not an SDK. Ditto cannot embed Director's UI; it can only consume Director's export artefacts or pattern-study its UX.
- The NL → Stagehand code export path is agentic authoring; Ditto's current Process authoring is via `generate_process` self-tool + YAML. Two authoring pipelines would need reconciling.
- Licensing of Director itself — checked `github.com/browserbase` organisation page (2026-04-19): visible repos include `stagehand`, `stagehand-python`, `sdk-node`, `sdk-python`, `integrations`, `stagehand-php`, `stagehand-net`, `templates`, `skills`, `open-operator`, `mcp-server-browserbase`, `playbook`. No repo named `director` or with "Director" in the description. Org lists "Showing 10 of 64 repositories" so an unindexed repo remains possible, but on the evidence available Director is a **hosted product**, not open source, distinct from the OSS Stagehand SDK and OSS `@browserbasehq/cli`.
- Scheduled/triggered/parallel execution on Browserbase bills as session-hours. Ditto's existing scheduler bills as Ditto's own infrastructure.

**Composition level for Ditto:** **pattern** candidate for Brief 186's deferred authoring-flow UX. Not a depend or adopt candidate (UI product, not a library).

## Alternatives to Browserbase Cloud Runtime (for Interface-Backed Swap)

If the `BrowserRuntimeBrowserbase` decision is evaluated later, these are the non-Browserbase hosted-browser services Brief 183's interface could equivalently target. Catalogued in the parent research (`authenticated-saas-browser-automation.md:119-125`) but not individually evaluated there. Surfacing names here for Architect visibility when/if that decision arrives:

- **Steel Browser** (`github.com/steel-dev/steel-browser`) — OSS browser sandbox API. Self-hostable; distinguishes on "zero vendor lock-in".
- **Anchor Browser** (`anchorbrowser.io`) — commercial hosted browser with agent API.
- **Hyperbrowser** (`hyperbrowser.ai`) — commercial hosted browser with stealth/session features.
- **Airtop** (`airtop.ai`) — commercial hosted browser with agent API.

Full evaluation deferred. This list is intentionally non-exhaustive; comparative research is a separate Researcher invocation if Architect requests it.

## Cross-Cutting Facts

### Where each Browserbase product plugs into the Brief 182 seams

| Brief 182 seam | Stagehand-on-Browserbase | Browserbase raw (CDP) | Browse CLI | Director |
|----------------|--------------------------|-----------------------|------------|----------|
| `BrowserRuntime` interface (183) | Yes — Stagehand honours the env switch; wrapped runtime feasible | Yes — direct Playwright `connectOverCDP` to Browserbase endpoint | No — CLI is a subprocess, not a runtime interface | No — UI product |
| Session capture CLI (184) | — | — | Overlapping (`bb browse` + Browserbase session persistence is an alternative to storageState vault) | — |
| Fingerprint-based auto-promotion (185) | No Browserbase equivalent | No Browserbase equivalent | No Browserbase equivalent | No Browserbase equivalent |
| Authoring (186, deferred) | — | — | — | Direct prior art (NL → Stagehand code export) |
| Trust gate (ADR-007) | Gate still at Ditto's handler boundary | Gate still at Ditto's handler boundary | Gate would need to wrap CLI subprocess | N/A |
| Audit artefact (Playwright trace) | Duplicates Browserbase session recording | Duplicates Browserbase session recording | Duplicates `bb sessions logs` | Handled in Browserbase UI, not exportable to Ditto audit path |

### Credential / session-state ownership

- Brief 182 stores `storageState` in the Ditto vault under `service=browser:<service>` and hydrates a Playwright BrowserContext per step.
- Browserbase hosts named sessions in its own account. Persisting a session in Browserbase means the authoritative session-state lives off-host. storageState can still be exported from a Browserbase session and re-imported to the Ditto vault, but this is an operational step the Brief 182 family does not currently budget for.

### Per-action vs per-minute billing asymmetry

- Ditto today pays no browser-runtime cost at rest (local Chromium is free).
- Browserbase bills session-hours. The asymmetry between "action active" (a few seconds of tool execution) and "session open awaiting approval" (potentially hours at supervised tier) means Brief 182's supervised → auto-promoted trust lifecycle multiplies paid session-hours by approval latency. Structural fingerprinting (sub-brief 185) collapses the approval count but not the session-hours per row (each row still opens a session).
- Browserbase's Scale tier includes advanced stealth and HIPAA BAA that cannot be replicated by self-hosted Playwright without engineering work (custom proxy pool, CG-NAT residential IP vendor, compliance audit). Whether that work is cheaper than paying Scale is an Architect / commercial decision, not a Researcher output.

## Gaps Identified

1. **Session-state ownership boundary.** No Browserbase product surfaces a policy for "session persists in Ditto vault, compute runs in Browserbase." A hybrid (vault-owned storageState, Browserbase-CDP execution) is technically feasible via Playwright's `context.addCookies(storageState.cookies)` after CDP connect, but is not a Browserbase-documented pattern. Original engineering required if pursued.

2. **Trust gate per CDP step.** Brief 182's trust gate intercepts at the integration-handler boundary (each `browser.click` tool call). A hosted runtime does not change the boundary, but the handler's latency doubles (local → Browserbase → target site → Browserbase → local) compared to in-process Playwright. No Browserbase product addresses trust-gating at the CDP layer.

3. **Fingerprinting for bulk auto-promotion.** Ditto-original per sub-brief 185. No Browserbase product (Stagehand, Cloud, Browse CLI, Director) provides an equivalent. Browserbase's Director has "repeat on schedule" but not "promote-after-N-supervised-approvals on structurally-identical rows." *Verification scope:* checked against landing pages, pricing page, and the `docs.browserbase.com` introduction hub — not against Browserbase's full API reference or changelog. A deeper docs search could surface a feature not marketed on the landing page.

4. **Audit-artefact reconciliation.** If Ditto adopts Browserbase runtime, two session-recording artefacts exist per run: Browserbase's session replay (dashboard-hosted) + Playwright's `.trace.zip` (Ditto-vaulted). Gap: which is authoritative for audit, and whether one can be suppressed to halve cost/overhead. No Browserbase product documents trace-suppression.

5. **Multi-provider LLM and Model Gateway compatibility with ADR-026 / ADR-012.** Stagehand's Model Gateway (on Browserbase) routes LLM calls via Browserbase's gateway. ADR-026 (multi-provider goal) and ADR-012 (context-and-token-efficiency, Ditto's own routing) place LLM routing inside Ditto. Using Model Gateway would re-home LLM routing at Browserbase, bypassing both ADRs' routing decisions. The Architect decision is whether that is desirable (single API key simplicity, Browserbase-side observability) or a lock-in (Browserbase becomes the LLM billing path; Ditto's routing can still be re-enabled by configuring Stagehand with an explicit provider key instead of the Model Gateway).

6. **Director's export format.** Director exports "Stagehand code." Whether this export is faithful enough to regenerate a Ditto Process YAML (inputs, schemas, tool calls, per-row iteration) is not documented on the product page. Verification would require using Director and reading the export; outside Researcher scope without SPIKE approval.

7. **Pricing page vs product page mismatch for Director.** Director's product page states "Free tier available for trial." The pricing page shows no Director-specific tier — Browserbase usage presumably meters Director sessions. The pricing model for "Director + 498-row afirmo-class batch job" is not pinned by any Browserbase page alone.

## Reference Docs Status

**Reference docs to update (this Researcher — per contract, landscape is Researcher-owned):**
- `docs/landscape.md` — Browser Automation section (lines 527–549) needs three additions + one refinement. Additions: (a) Browserbase Cloud Runtime as a separate entry from Stagehand (currently subsumed in the Stagehand line); (b) Browse CLI as a new entry; (c) Director as a new entry. Refinement: Stagehand entry's "$99/mo" note is on the Startup tier — the four-tier table from the pricing page is the accurate structure.

**Reference docs checked, no drift found:**
- `docs/research/authenticated-saas-browser-automation.md` — not superseded. This report is a deepening of its Modality 4 Browserbase/Director sub-entry, not a replacement. Parent report stands.
- `docs/research/linkedin-ghost-mode-and-browser-automation.md` — unrelated (READ-only / messaging domain).
- `docs/adrs/005-integration-architecture.md` — not affected by Browserbase per se; ADR-032 (to be written under Brief 183) carries the stateful fourth protocol. Hosted vs local runtime is below ADR-032's abstraction.

**Flagged for Architect (not Researcher scope):**
- The hybrid `BrowserRuntimeBrowserbase` option is unarticulated in Brief 182. If trigger-fire produces a sub-brief, it would need a dedicated ADR because of the session-state ownership boundary question (Gap 1). No brief number is reserved; per Insight-200 the number is claimed at trigger-fire, not now. (Earlier draft of this line pre-named "187" as an example — struck out because the pre-naming leaked as a soft reservation, which Insight-200 explicitly prohibits.)
- Open Question 1 in Brief 182 ("Runtime isolation for Network") is the decision gate under which Browserbase adoption would re-surface. Flagged to PM for sequencing against Phase 9 Network Service timeline.

## Summary Table

| Product | Nature | Ditto composition level | Blocking reason (if any) |
|---------|--------|-------------------------|--------------------------|
| Stagehand SDK | OSS MIT TS+Py library | **Adopted** (already) | — |
| Stagehand-on-Browserbase | Runtime flag + commercial cloud | **Depend candidate** | Brief 182 line 85 excludes from 183–185 |
| Browserbase Cloud Runtime (CDP) | Commercial hosted browser | **Depend candidate** | Brief 182 line 85 excludes from 183–185 |
| Browse CLI (`bb`) | OSS CLI wrapping Browserbase | **Pattern candidate only** | Overlaps 184 CLI; subprocess boundary |
| Director | Hosted UI for NL authoring | **Pattern candidate only** | UI product, not a library; pattern for Brief 186 |

## Handoff

Per Researcher contract — neutral, no recommendation. Candidate next steps:

- **Dev Architect** to evaluate (a) whether any of the four products warrants a landscape upgrade from "candidate" to a scheduled sub-brief, and (b) whether Open Question 1 in Brief 182 ("Runtime isolation for Network") should be reopened now or remain deferred.
- **Dev PM** to sequence: Phase 9 Network Service is active; hosted browser runtime most likely sits alongside the Network deployment brief, not inside it.
- **Dev Documenter** to checkpoint state.md with this research and the landscape refresh.
