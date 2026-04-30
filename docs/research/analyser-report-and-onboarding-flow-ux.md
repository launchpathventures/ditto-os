# Analyser Report + Project-Onboarding Flow — UX Spec

**Date:** 2026-04-27
**Status:** Designer pass complete, post-Reviewer, post-design-package integration
**Designer-mandatory for:** Brief 224 sub-brief #1 (Connection-as-process plumbing) + sub-brief #2 (In-depth analyser report rendering)
**Companion artefact for:** the Architect synthesising sub-brief #1 + #2 bodies (Briefs 225 + 226)
**Persona lens (primary → secondary):** Jordan (technologist who connects projects across departments) → Lisa (ecommerce — connects her marketing/shopify-helpers repo) → Nadia (governs project quality across her team's deliverables) → Rob (NOT primary — Rob is operator-only; he sees the resulting projects in the briefing but doesn't connect repos)
**Design-package provenance:** Anthropic Claude Design handoff bundle (id `iK3gPHe3rGAErdm4ua2V-A`, Workspace.html primary file). Visual identity tokens, layout, and chat-block primitives in this spec resolve to that package.

---

## Visual Identity Anchored to Design Package

The Anthropic Claude Design handoff bundle ships an in-progress visual identity for Ditto. Every visual choice below is grounded in tokens or component patterns that already exist in the bundle. Builder consumes the bundle's `colors_and_type.css` source-of-truth (mapped: *"Source of truth: ditto/packages/web/app/globals.css (@theme block)"*).

### Tokens

- **Two-green signature** — `--color-vivid: #059669` (emerald, primary CTA, brand green) + `--color-vivid-deep: #3D5A48` (forest, Alex's voice copy) + `--color-vivid-subtle: #ECFDF5` (tinted wash, suggestion bg, selected states). The `#D1F4E1` border accompanies vivid-subtle backgrounds.
- **Cool-grey canvas** — `--color-background: #FFFFFF` / `--color-surface: #FFFFFF` / `--color-surface-raised: #FAFAFB` (cards, inputs) / `--color-border: #E8E8ED`.
- **Text scale** — `--color-text-primary: #111118`, `--color-text-secondary: #4A4A55`, `--color-text-muted: #65656F`. Alex-voice copy uses `--color-vivid-deep` italic.
- **Semantic** — `--color-positive: #16a34a`, `--color-caution: #D4960A`, `--color-negative: #C4352A`, `--color-info: #2563eb`. Used as `rgba(R,G,B,0.05-0.10)` washes per `.pbadge` patterns.
- **Typography** — DM Sans (sans, primary) + JetBrains Mono (mono, timestamps + IDs only). Major Third scale, 16px base. Hero `--text-4xl: 49px` reserved for "Hey, I'm Alex." once-per-page.
- **Spacing** — 4px grid. Border radii: `--radius-md: 8px` (buttons, inputs) / `--radius-lg: 12px` (cards) / `--radius-xl: 16px` (sheets).

### Layout — chat-col-as-second-column (supersedes `human-layer.md`'s three-panel)

The design package's app shell is **two-column** (`.app` = sidebar + main); the main column is **one-column by default and splits to two columns when chat is open** (`.center.split` = left-col + chat-col with `var(--chat-w, 440px)` chat width). There is NO separate right-context panel — chat IS the right column when open.

This is a **legitimate divergence from `human-layer.md`'s three-panel layout**. The design package is more recent and authoritative for sub-briefs #1+#2. Architect flags this divergence to the Documenter for absorption into `human-layer.md` post-build.

**Implication:** the URL-paste form, the analyser ProgressBlock, and the AnalyserReport ALL render in the **chat-col**, not the composed canvas. Auto-promote-to-artifact is moot — the chat-col IS the artefact surface.

### Existing chat-block primitives

| Block class | Existing purpose | Used in this spec for |
|------------|------------------|----------------------|
| `block.decision` | Alex proposes 2-4 options, one marked `.dopt.rec` (vivid-subtle bg + `recbadge`), with `dfoot` rationale | **Runner picker** + **Trust-tier picker** — pre-selected = `.rec` class; alternatives = sibling `.dopt`; rationale = `dfoot` |
| `block.evidence` | List of `.eline` rows (label : value, dashed bottom border) | **Strengths / Watch-outs / Missing** — each finding is one `.eline` (text on left, evidence on right) |
| `block.plan` | Ordered `.pstep` rows with numbered `.num` (filled vivid when `.done`), `.st` step text, `.sm` step metadata | **Stage 2 wait state** — analyser steps render as `.pstep` items; `.done` class transitions on completion |

Plus atoms:
- **`alex-line`** — 20px green "A" mark + secondary-color body. Use everywhere Alex speaks inline.
- **`why?` button** — dashed-border-bottom expandable rationale link.

### Two-kind project model

`projects.kind: 'build' | 'track'` from the design package's `projects-data.js`. **Onboarding is build-shaped only** — `kind='build'` is hard-coded for URL-paste onboarding.

---

## The Flow End-to-End

### Stage 0 — Entry points

| Path | Surface | Trigger |
|------|---------|---------|
| **Conversational** | Center conversation | User pastes a GitHub URL or types "Connect github.com/foo/bar" / "Onboard the agent-crm repo" into the prompt input. Self recognises (URL + verb), fires `start_project_onboarding` tool, emits a `ConnectionSetupBlock` inline. |
| **Sidebar** | Projects composition intent | Sidebar → "+ Connect a project" CTA. **Tapping seeds a Self conversation message ("Connect a new project") which Self responds to with the same `ConnectionSetupBlock` rendered inline.** Both paths converge on the conversation; NO separate `/projects/new` page. |

Both paths converge on `POST /api/v1/projects` with `kickOffOnboarding: true` (per Brief 225) via the existing `form-submit` action namespace, with the dispatcher branching on `serviceName === 'github-project'` to route to projects-creation instead of `/api/credential` (the existing default).

### Stage 1 — URL paste + initial validation

Reuse the existing `ConnectionSetupBlock` (`packages/core/src/content-blocks.ts:234-241`) with `serviceName: 'github-project'`. The block already has the `connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'` state machine — perfect for URL-probe behaviour. Renderer extension (~30-80 LOC) adds: title "Connect a GitHub repository"; suppresses raw `serviceName` from subtitle; `.alex-line` annotation above form ("Paste a repo URL. I'll take a look at it before you commit to anything."); URL field gets inline `[Verify access]` button driving the block-level connectionStatus; display name + slug fields stay independent of probe state.

**URL-probe state mapping:**
- probing → `connecting` (spinner inline next to URL)
- public/probed-OK → `connected` (green checkmark + "Public repo, accessible")
- private-needs-auth → `disconnected` + `errorMessage: "Private repo. We'll need access to clone it."` + inline `[Connect GitHub]` OAuth flow
- invalid/unreachable → `error` + `errorMessage: "Couldn't reach this URL — typo, or repo doesn't exist?"`

**Field-level UX:**
- **Repo URL** — accepts `https://...`, `git@github.com:...`, bare `owner/repo`. Auto-fills display name from `repo` segment.
- **Display name** — auto-filled, editable (Jordan often connects "agent-crm" but labels it "AgentCRM (Acme prod)").
- **Slug** — auto-generated kebab-case; server-validated on submit; collision shows inline alternative.
- **Advanced disclosure (collapsed)** — `defaultBranch` (auto-fills from probed remote), `harnessType` (auto-detected: `.catalyst/` → `catalyst`; `package.json` etc. → `native`; else → `none`), `deployTarget` (defaults `manual`; user picks later).

### Stage 2 — "Now analysing" wait state

The analyser is read-only but not instant: clones, greps, classifies, cross-references against `landscape.md`. Empirical: small repos (≤500 files) take 30-90 seconds; large monorepos 3-5 minutes. **A blank wait kills the "first contact demonstrates value" moment.**

Render as `block.plan` with the analyser's step list:

```
┌────────────────────────────────────────────────────────────────┐
│  Analysing foo-bar                                             │
│                                                                │
│  ✓ Cloned repo (847 files, 12.3 MB)              · 4s          │
│  ✓ Detected build system: Node.js + pnpm         · 1s          │
│  ✓ Detected test framework: vitest               · <1s         │
│  ◐ Scanning CI configuration…                                  │
│  ○ Detecting existing harness/skills/tools                     │
│  ○ Scoring persona-fit                                         │
│  ○ Cross-referencing against gold-standard projects            │
│  ○ Recommending runner + trust tier                            │
│                                                                │
│  Cancel onboarding (this is read-only — nothing was changed)   │
└────────────────────────────────────────────────────────────────┘
```

**Key UX choices:**
- **Live-streamed steps** via `block.plan` + SSE `step-complete` / `gate-pause` / `gate-advance` events (existing `useHarnessEvents`).
- **Find-of-the-moment annotations** (`847 files`, `Node.js + pnpm`, `vitest`) — Jordan starts believing the analyser before the report renders. Insight-205 §6 in the loading state.
- **Cancel affordance is honest** — "this is read-only — nothing was changed." Cancel sets `projects.status='archived'`.
- **No estimated time** — false estimates erode trust. The step list IS the progress signal.
- **Mobile** — same vertical list, full-width on phone; `[Cancel onboarding]` tap-target full row.
- **Slow (>3 min)** — Self appends a TextBlock: "Still analysing — large repos can take a few minutes. You can leave this page; we'll notify you when the report's ready."

### Stage 3 — The Analyser Report

The user-acquisition surface of the entire phase per Insight-205 §6.

**Render shape:** a NEW ContentBlock type **`AnalyserReportBlock`** (additive to the existing 26 ContentBlock types — joins the "Onboarding" category). Renders as a sequence of design-package primitives in the chat-col:

1. **At-a-glance** — basic `.block` with stack summary + metadata + descriptor + nearest-neighbours. ("Node.js + pnpm · vitest · GitHub Actions · main branch · 847 files · 12.3 MB · 23 contributors · last commit 2d. Looks like: mid-size org tooling, mature CI. Closest match: ↗ packages like `linear-cli`.")
2. **Strengths** — `block.evidence` with `text-positive` + `bg-positive/5` washes per `.eline`. ("Tests exist (47 vitest specs, 82% coverage)" / "CI green on main (last run 2h ago)" / "Branch protection enabled" / "TypeScript strict mode on")
3. **Watch-outs** — `block.evidence` with `text-caution` + `bg-caution/5`. ("No `.claude/` or `AGENTS.md` — first time with AI?" / "3 long-lived branches — drift?" / "No `CONTRIBUTING.md` — onboarding ad-hoc")
4. **Missing** — `block.evidence` with `text-negative` + `bg-negative/5`. Each `.eline` may include the default Ditto picks ("No deployment config (Vercel/Fly/Railway) → I'll set deploy_target to 'manual' by default")
5. **Runner picker** — `block.decision` with two `.dopt` columns side-by-side; recommended option carries `.rec` class (vivid-subtle bg + `.recbadge`); user expands `.dfoot` rationale. **Direct reuse — no new component.**
6. **Trust-tier picker** — second `block.decision`, same shape.
7. **CTA row** — `[Looks good — start the project]` (vivid filled) / `[Edit before starting]` (default) / `[Don't onboard]` (ghost transparent).

**Severity colour coding** uses semantic design tokens from `.impeccable.md`:
- `text-positive` + `bg-positive/5` for strengths (NOT raw Tailwind `text-emerald-600`).
- `text-caution` + `bg-caution/5` for watch-outs.
- `text-negative` + `bg-negative/5` for missing.

**Pre-selected pattern** (Vercel + Codespaces): runner + tier sections render with the recommended option already selected; user expands disclosure (`▾`) only to override. The "Why" sentence is always visible (NOT behind a tooltip) — Insight-205 §3 + ADR-007 demand the user understands the recommendation's grounding.

**CTA semantics (per Brief 225's confirm endpoint):**
- **`[Looks good — start the project]`** → atomic three-write commit: `POST /api/v1/projects/<slug>/runners` enables `project_runners` row + `PATCH /api/v1/projects/<slug>` flips `status='active'` + sets `defaultRunnerKind` + bearer generated-and-hashed-and-returned-once. Server-side `validateStatusTransition` invariant (Brief 215). On success: Self speaks ("All set. Retrofit queued."), report collapses to one-line summary; right panel context-reactively swaps to project context. **No auto-navigation.**
- **`[Edit before starting]`** → enters edit mode; runner/tier selectors stay expanded; inline textarea for "Anything else to note?" saves into `workItems.body` for retrofitter context.
- **`[Don't onboard]`** → confirmation: "This will archive the project and stop onboarding. The repo wasn't modified." On confirm: `projects.status='archived'`, `workItems.briefState='blocked'`. User can re-onboard from the same URL.

**Mobile adaptations:**
- ≥1024px: full report inline in chat-col; right panel shows project-scoped context.
- <1024px: sections become full-width cards; CTA row sticky-bottom (existing bottom-sheet pattern).
- <768px (phone): "What I noticed" sections collapse to summary headers (`✓ 4 strengths · ⚠ 3 watch-outs · ✗ 1 missing`); recommendations stay expanded (decision is the priority); CTA sticky-bottom.

### Stage 4 — Post-confirmation transition

After `[Looks good — start the project]`:
1. **Self speaks immediately:** "All set. The retrofit is queued — I'll surface it for review as soon as it's ready."
2. **The report collapses** to a single-line summary card pinned to the conversation thread (history-preserving).
3. **The right panel context-reactively swaps** to project-scoped context (recent activity, link to project detail, queued retrofitter run via `ProgressBlock`). User STAYS in the conversation surface where they took the action — "chat position never moves between modes" honoured.
4. **The retrofitter (sub-brief #3) is queued** as the project's first process run.

**No auto-navigation.** The user reaches `/projects/<slug>` deliberately via sidebar/right-panel link.

---

## Six-Human-Jobs Mapping

| Job | Where | Block(s) |
|-----|-------|----------|
| **Define** | Stage 1 (URL-paste form) | `ConnectionSetupBlock` |
| **Capture** | Stage 1 conversational entry (paste URL into prompt) | `start_project_onboarding` tool |
| **Orient** | Stage 2 (live-streamed analyser steps) | `block.plan` |
| **Review** | Stage 3 (analyser report) | `AnalyserReportBlock` |
| **Decide** | Stage 3 (runner + tier picker — first delegation decision for this project) | `AnalyserReportBlock` runner/tier sub-cards |
| **Delegate** | Stage 4 implicit (confirming kicks the retrofit run; trust-tier picked here governs all subsequent runs) | `validateStatusTransition` invariant |

---

## New ContentBlock Types Required

This spec introduces **two new ContentBlock types** — both ARE refactor-able as compositions of existing types per Reviewer challenge + design-package primitives. Architect to confirm engine-vs-product split AND whether composition beats invention.

### 1. `ProjectConnectFormBlock` (Onboarding category) — REJECTED, REUSE INSTEAD

Reviewer challenge: `ConnectionSetupBlock` (`content-blocks.ts:234-241`) already has `connectionStatus` state machine + `serviceName: string` (unconstrained). Architect adopts: **NO new block type; reuse `ConnectionSetupBlock` with `serviceName: 'github-project'`**. Renderer extension (~30-80 LOC) handles the project-specific copy + URL-probe button.

### 2. `AnalyserReportBlock` (Onboarding category) — NECESSARY

```typescript
{
  type: 'analyser_report';
  entityType: 'work_item';
  entityId: string;          // workItems.id (existing FK convention from StatusCardBlock)
  projectId: string;         // FK to projects.id
  atAGlance: {
    stack: string[];
    metadata: string[];
    looksLike: string;       // user-facing descriptor — NOT "Jordan-shaped" (no persona-name leak)
    nearestNeighbours: Array<{ name: string; url: string; rationale: string }>;
  };
  strengths: Finding[];
  watchOuts: Finding[];
  missing: Finding[];
  recommendation: {
    runner: { kind: RunnerKind; rationale: string; alternatives: Array<{ kind: RunnerKind; rationale: string }> };
    trustTier: { tier: TrustTier; rationale: string; alternatives: Array<{ tier: TrustTier; rationale: string }> };
  };
  status: 'draft' | 'submitted' | 'active';
}

interface Finding {
  text: string;
  evidence?: string;         // one-line citation
  defaultAction?: string;
}
```

The renderer is product-side; the type is portable to core.

---

## Persona Walk-Throughs

### Jordan onboarding the HR reference-checking repo (Tuesday morning, mobile)

1. Commute. Pastes `https://github.com/acme/hr-references` into the conversation prompt: "Onboard this please."
2. Self emits `ConnectionSetupBlock` pre-filled. Yellow caution: "Private repo." Tap `[Connect GitHub]`, OAuth round-trip, badge flips green.
3. Tap `[Begin analysis →]`. ProgressBlock renders. Tunnel; SSE reconnects. 90 seconds.
4. Report renders: "Node.js + pnpm · jest · GitHub Actions · main branch · 234 files. Looks like: small org tooling, mature CI." Strengths / Watch-outs ("No `.claude/`") / Missing. Recommendation: claude-code-routine + spot-checked.
5. Convinced by rationale; doesn't override. Tap confirm. **4 minutes phone-only, no desktop.**

### Lisa connecting shopify-helpers (Wednesday between meetings, desktop)

Sidebar → "+ Connect a project." Pastes URL. Public repo. Display name "Shopify Helpers." Wait state. Report — Strengths: "Tests exist." Watch-outs: "3 long-lived branches" — Lisa knows about `feat/checkout-v2`. Missing: "No deploy config" — fine, ignore. Recommendation: claude-code-routine + supervised. Risk-averse on customer-facing repos — supervised is right. Confirm. **3 minutes desktop.**

### Nadia connecting analyst-reports repo (Thursday before standup, mobile)

Sidebar on phone. Display name: "Analyst Reports — Q2 cohort" (org-internal labeling, distinct from repo name). Wait state — "looks like: team-output review with quality gating" — exactly what she does. Recommendation: claude-code-routine + supervised. **Override**: taps disclosure, picks `local-mac-mini` (sensitive client data stays on her network). Confirm. Standup starts.

### Rob (counterexample)

Rob doesn't connect repos. He sees "Quote ready for review" notifications on his phone after a Jordan-equivalent connected the repo on a desk-day.

---

## Reviewer Pass Summary (2026-04-27)

Fresh-context Reviewer ran post-design-package integration. **Verdict: PASS WITH FLAGS.** All CRITICAL findings (4) + IMPORTANT findings (4) + MINOR findings (4) addressed.

- **CRITICAL #1 (schema field-name drift):** spec now references `defaultRunnerKind` + `project_runners.config_json` per Brief 215's actual shape; CTA semantics describe atomic two-write commit verbatim.
- **CRITICAL #2 (Cancel/Reject status unification):** both Cancel (Stage 2) and `[Don't onboard]` (Stage 3) set `projects.status='archived'`; no invented soft-delete value.
- **CRITICAL #3 (severity colour palette):** raw Tailwind tokens (`text-emerald-600` etc.) replaced with semantic design tokens (`text-positive`/`text-caution`/`text-negative`).
- **CRITICAL #4 (persona-name leak):** "Jordan-shaped" / "Lisa-shaped" / "Nadia-shaped" labels removed from user surface; descriptor-only labels ("mid-size org tooling, mature CI"). Persona match still informs internal scoring; never user-visible.
- **IMPORTANT #5 (FK convention):** `AnalyserReportBlock` schema uses `entityType + entityId` per existing `StatusCardBlock`; `projectId` retained as secondary FK.
- **IMPORTANT #6 (Stage 4 navigation violation):** removed auto-navigation; right panel context-reactively swaps; user stays in conversation.
- **IMPORTANT #7 (sidebar CTA fights center-column composition):** Stage 0 sidebar CTA seeds Self conversation message which Self responds to with `ConnectionSetupBlock` — both entry paths converge in conversation.
- **IMPORTANT #8 (CTA copy):** `[Tweak]` → `[Edit before starting]`; `[Reject]` → `[Don't onboard]`. Personas' voice, not developer-coded.
- **MINOR fixes:** six-jobs mapping clarified; SSE replay claim softened (Architect verifies); `analysing → archived` invariant verification flagged; YAML excerpt's `executor: script` annotated inline.

**Reviewer's open-question verdicts adopted:** Q1 inline-vs-artifact resolved (chat-col IS the artefact surface; auto-promote unnecessary); Q2 picker on-report confirmed; Q3 all-or-nothing report (not streaming) confirmed for MVP.

**Architect note carried forward:** at sub-brief #1 write time, evaluate whether `ProjectConnectFormBlock` should be a new block, an extension of `ConnectionSetupBlock`, or a composition using `WorkItemFormBlock`'s `InteractiveField[]`. Spec defaults to `ConnectionSetupBlock` reuse; Brief 225 architect adopted this.
