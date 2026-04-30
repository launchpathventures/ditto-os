# Brief 230: Design-System Component CSS Layer + Block-Renderer Promotion

**Date:** 2026-04-27
**Status:** complete (2026-04-29, post-Builder verification + separate-context Dev Reviewer (APPROVE: 0 CRIT, 3 IMP declined per scope discipline, 4 MIN noise) + /dev-review (0 issues across 5 passes); 6/6 renderer tests pass; class-fidelity verbatim across 10 spot-checks; engine-boundary compliance verified; visual non-regression smoke deferred to manual human walkthrough per AC #8.)
**Depends on:** none (the design tokens this brief consumes are already in `packages/web/app/globals.css`; the design package source-of-truth is preserved at `.context/attachments/design-package-2026-04-27/`).
**Unlocks:**
- Brief 226's `AnalyserReportBlock` renderer (`packages/web/components/blocks/analyser-report-block.tsx:1-24`) promotes from utility-mapped composition to bundled-class composition; the renderer's own gap-flag comment is discharged.
- Brief 228's `RetrofitPlanBlock` renderer can consume bundled classes from day one (Brief 228 §Constraints "Renderer composition" + §Open Question 6 explicitly cite this brief as the resolution path).
- Future block renderers that compose from design-package primitives (any future brief surfacing a `block.compare`, `block.breakdown`, or `block.people` artefact) consume bundled classes without reauthoring CSS per-renderer.
- A future brief covering workspace-shell adoption (chat-col/work-col layout, sidebar new-button menu, alex-line composition matching `Workspace.html`'s 1345-line shell) — explicitly NOT in scope here; surfaced as a follow-on candidate.

**Triggered by:** user request 2026-04-27 ("Consider this in your design Fetch this design file, read its readme, and implement the relevant aspects of the design") + Brief 226 Builder's flag at `analyser-report-block.tsx:1-24` ("the design-package's component CSS layer ... is not yet present in `packages/web/app/globals.css`. Tokens ARE present. This renderer uses Tailwind utilities mapped to those tokens for now; an Architect/Designer pass can promote to the bundled component classes when the CSS layer is imported"). Brief 228 §Open Question 6 (added 2026-04-27 in the design-package update) names this brief as the dedicated resolution path.

---

## Goal

- **Roadmap phase:** Cross-cutting design-system foundation. NOT a feature phase; this is platform CSS work that unblocks the block-renderer composition pattern Brief 226 + Brief 228 already commit to.
- **Capabilities delivered:**
  - **Six block-primitive CSS classes authored** in the codebase, mirroring the canonical class names from the Anthropic Claude Design package's `workspace/blocks.js` (preserved at `.context/attachments/design-package-2026-04-27/project/workspace/blocks.js`):
    - `.block.breakdown` + `.bopt` + `.bopts` + `.bintro` + `.num` + `.otitle` + `.odesc` (used by chat-row "Let's break it down" surfaces — none currently in our codebase but spec'd here so future renderers compose from a coherent base).
    - `.block.decision` + `.dopt` + `.dopt.rec` + `.recbadge` + `.dh` + `.dd` + `.dfoot` + `.dopts` + `.blead` (consumed by `AnalyserReportBlock` runner/trust-tier pickers — Brief 226; consumed by Brief 228's `RetrofitPlanBlock` spot_checked sample yes/no surface).
    - `.block.plan` + `.pstep` + `.pstep.done` + `.sbody` + `.st` + `.sm` + `.own` + `.plead` (consumed by Brief 228's `RetrofitPlanBlock` to render the planned `.ditto/` files as a step list with action icons).
    - `.block.compare` + `.ctable` + `.ctake` + `.amark` + `tr.rec` (no current consumers; spec'd for the design system completeness — future `CompareBlock` renderer composes here).
    - `.block.evidence` + `.eline` (a kv-pair list primitive per the design package's `blocks.js:97-106`; row format `<span>${k}</span><b>${v}</b>` — used here by Brief 228's `RetrofitPlanBlock` runner/tier/status metadata cards which ARE genuine kv pairs; **NOT used for AnalyserReportBlock's Strengths/Watch-outs/Missing surfaces** — those compose from the new `.block.findings` Ditto-original primitive instead, see below. Reviewer CRIT-3 corrected the original draft's misuse of `block.evidence` as a tone-coded section list).
    - `.block.people` + `.prow` + `.pinfo` + `.pname` + `.psub` + `.pwhy` + `.pscore` (no current consumers; spec'd for design system completeness — future `PeopleBlock` renderer for hire/people-detail surfaces).
  - **One Ditto-original block primitive** (Reviewer CRIT-3 introduced; provenance: `original`):
    - `.block.findings` + `.findings-section` + `.finding-icon` + `.finding-title` + `.finding-list` + `.finding-item` + tone modifiers `.tone-positive` / `.tone-caution` / `.tone-negative` / `.tone-info` / `.tone-vivid`. A sectioned-list-with-tone-coded-header primitive Ditto needs but the design package does not commit to. Used by `AnalyserReportBlock`'s Strengths (tone-positive), Watch-outs (tone-caution), Missing (tone-negative) sections. The semantic is "here are findings of a particular polarity"; the design package's `.block.evidence` (kv-pairs) is a different shape that doesn't fit. Naming and layout follow design-package CSS conventions (consistent with `.block.evidence`, `.block.plan` etc. — same `block-head` + `bbody` chrome) but the primitive itself is original to Ditto. NOT `block.evidence` extended; a separate sibling primitive.
  - **Block chrome classes** shared across all 6 primitives: `.block` (root), `.block-head`, `.bbody`, `.block-foot`, `.bkind`, `.bopen` (the "Why?" / "Open in main" affordance that opens the block content in the work-col).
  - **Composition helper classes** referenced by `Workspace.html` chat surfaces but used independently of block primitives: `.alex-line` + `.alex-mark` + `.alex-body` (Alex's chat-line annotation; one-line "Alex says" callout adjacent to a block).
  - **Three missing tokens** — `--text-3xl` + `--text-4xl` (per the design package's `colors_and_type.css:71-75`: `--text-3xl: 2.441rem / 39px` for hero, `--text-4xl: 3.052rem / 49px` for the front-door Alex greeting; both currently absent from `globals.css`; added with their `--text-3xl--line-height: 1.15` + `--text-4xl--line-height: 1.1` companion variables using Tailwind v4's idiomatic **double-dash** convention per existing scale at `globals.css:103-113`). Plus `--color-vivid-subtle-border: #D1F4E1` — a darker border companion to `--color-vivid-subtle: #ECFDF5` used by `Workspace.html:132,205,239,280,310` for vivid-subtle washes; gap caught by the Reviewer's IMP-5.
  - **`AnalyserReportBlock` renderer promoted from utility-mapped composition to bundled-class composition.** The renderer's gap-flag comment block (`analyser-report-block.tsx:18-23`) is removed; the renderer composes `.block.evidence` + `.block.decision` + `.dopt.rec` + `.recbadge` directly. Existing test (`analyser-report-block.test.tsx`) re-asserts on the bundled class names + still passes (visual non-regression).
  - **Architecture documentation** of the design-token-vs-component-class boundary in `docs/architecture.md` §Layer 6: tokens (colors, fonts, type scale, spacing, radius, shadows) live in `globals.css @theme`; component classes (the 6 block primitives + helpers) live in a sibling CSS layer imported into the app; the design package at `.context/attachments/design-package-2026-04-27/` is the source-of-truth-mirror.

## Context

The Anthropic Claude Design package has been the design-system source-of-truth for Ditto's chat-col rendering since Brief 226 first cited it ("Block renderer composition (`block.evidence` + `block.decision` + `block.plan`) | Anthropic Claude Design package `Workspace.html`"). The package contains:
- `colors_and_type.css` — design tokens (colors, fonts, type, spacing, radius, shadows). The header comment self-identifies as `Source of truth: ditto/packages/web/app/globals.css (@theme block)`. Tokens are already in our codebase (verified by the `dev-architect`-spawned Explore audit 2026-04-27); only the `--text-3xl` + `--text-4xl` hero variants are missing.
- `workspace/blocks.js` — six composable block primitives + their CSS class names + helper sub-classes. **The class names are canonical** — `block.evidence`, `block.decision`, `block.plan`, `block.compare`, `block.breakdown`, `block.people` are the design system's component vocabulary. Brief 226's renderer + the upcoming Brief 228 `RetrofitPlanBlock` renderer compose semantically from these classes, but **the classes themselves do not exist in our codebase** — they live only in the design package's JS prototype. This brief closes that gap: ports the canonical CSS into `packages/web/`, so renderers can use the bundled classes instead of utility-mapped Tailwind workarounds.
- `Workspace.html` — the full workspace shell (1345 lines). NOT in this brief's scope; surfaced as a follow-on candidate.

The audit (Explore agent, 2026-04-27) found:
- **27 block renderer files in `packages/web/components/blocks/` (3,301 LOC).** All use Tailwind utilities mapped to design-token CSS variables. **Zero bundled component classes** present.
- **All design tokens present** in `globals.css` lines 53-125 (Tailwind v4 `@theme` block) — `--color-vivid`, `--color-positive`, `--color-caution`, `--color-negative`, `--color-info`, `--color-vivid-deep`, `--color-vivid-subtle`, foundation greys, text scale, spacing, radius, shadows. **Type-scale gap: `--text-3xl` + `--text-4xl` missing** (the design package adds them at `colors_and_type.css:71-75`).
- **AnalyserReportBlock renderer at `packages/web/components/blocks/analyser-report-block.tsx:1-24`** explicitly flags the missing component classes ("the design-package's component CSS layer (`alex-line`, `block.evidence`, `block.decision`, `recbadge`, `.dopt.rec`) is not yet present in packages/web/app/globals.css"). Brief 226 Builder shipped utility-mapped composition as the workaround; Brief 230 promotes to bundled.
- **Renderer test infrastructure has been upgraded already** (Reviewer CRIT-2 corrected an earlier stale assumption). `@vitejs/plugin-react@6.0.1` is installed at the repo root + wired into `vitest.config.ts:3,9`; the existing `analyser-report-block.test.tsx` test runs JSX-or-React.createElement either way. Brief 230 makes NO test-infrastructure changes; the Builder may write JSX assertions or keep `React.createElement`-style — either is fine. The Brief 226 renderer-test comment at lines 9-12 is itself stale and gets refreshed during this brief's renderer touch.
- **Workspace shell** (`packages/web/components/layout/workspace.tsx`, `sidebar.tsx`, `workspace-page.tsx`) has structural abstractions (`AdaptiveCanvas`, `ArtifactLayout`, `ChatPanel`) that don't literally match `Workspace.html`'s `chat-col` / `work-col` divs. Adopting Workspace.html's shell is much bigger surgery; **out of scope for this brief**, surfaced as a follow-on.

The 6 block primitives split into three categories by current consumer status:
- **Currently consumed (utility-mapped — promoted by this brief):** `block.evidence` (used by AnalyserReportBlock + KnowledgeCitationBlock + Brief 228's RetrofitPlanBlock); `block.decision` (used by AnalyserReportBlock pickers + Brief 228's spot_checked sample); `block.plan` (used by Brief 228's RetrofitPlanBlock file list).
- **Spec'd for design-system completeness (no current renderer):** `block.breakdown`, `block.compare`, `block.people`. CSS authored here so future renderers consume bundled classes from day one.
- **Composition helpers (independent of block primitives):** `alex-line` + `alex-mark` + `alex-body` — Alex's "I'd suggest..." annotation row, used in chat-col surfaces adjacent to blocks. Authored here.

## Objective

Author the 6 block-primitive CSS class layer + helper classes + the two missing type-scale tokens in our codebase, then promote the existing `AnalyserReportBlock` renderer from utility-mapped to bundled-class composition (visual non-regression preserved). Brief 228's upcoming `RetrofitPlanBlock` renderer consumes the bundled classes from day one. Document the design-token-vs-component-class boundary in `docs/architecture.md` §Layer 6.

## Non-Goals

- **NO workspace shell adoption.** `Workspace.html`'s chat-col / work-col / sidebar / new-button menu / view-routing structure is OUT. The current `workspace.tsx` + `sidebar.tsx` abstractions stay. A separate brief (proposed: "Workspace Shell Alignment with Workspace.html") covers that work if/when prioritised.
- **NO promotion of the other 25 block renderers.** Only `AnalyserReportBlock` is promoted in this brief — it's the only renderer that explicitly flagged the gap, AND it's the renderer whose UX directly motivated the porting work (Brief 226's primary user-acquisition surface). The other 25 renderers continue to use Tailwind utilities mapped to tokens; per-renderer promotion happens organically as briefs touch them. Premature mass-promotion would risk regression across surfaces this brief hasn't reasoned through.
- **NO new test-infrastructure work** (Reviewer CRIT-2 corrected). `@vitejs/plugin-react@6.0.1` is already installed at the repo root + wired into `vitest.config.ts`; JSX is supported. The Builder may write JSX assertions OR keep `React.createElement` — either is fine. The Brief 226 renderer-test comment at `analyser-report-block.test.tsx:9-12` is itself stale and gets refreshed during Brief 230's renderer touch (drift-discharge per Insight-043).
- **NO Designer pass.** The block primitives are already designed (in the Anthropic Claude Design package); the bundled classes mirror the package's canonical CSS. Designer activation NOT required.
- **NO new ContentBlock types.** This brief is CSS + renderer-promotion only; the discriminated union at `packages/core/src/content-blocks.ts` is not modified.
- **NO breaking change to the renderer Public API.** `AnalyserReportBlockComponent({ block, onAction })` keeps its prop shape; only its internal class-name composition changes.
- **NO change to existing design tokens.** Only ADDS the two missing hero-scale tokens (`--text-3xl`, `--text-4xl` + their `--*-line-height` companions). The cool-grey-canvas + two-green-signature palette is preserved verbatim.
- **NO mobile-different bundled classes.** The block primitives compose responsively via existing Tailwind utility container queries on the renderer side; the bundled classes themselves don't carry breakpoint variants.
- **NO theme override surface.** Light/dark theme switching already works via `@media (prefers-color-scheme)` + token reassignment in `globals.css`; this brief preserves that. Bundled classes use the tokens (not the literal hex values), so theme inheritance is automatic.
- **NO `.context/attachments/` movement.** The design package preserved there is the source-of-truth-mirror for the porting work; the bundle stays as-is. Moving it into `docs/` would imply it's a documentation deliverable; it's a vendor handoff bundle (per its README) and stays gitignored.

## Inputs

1. `.context/attachments/design-package-2026-04-27/project/workspace/blocks.js` — canonical source of the 6 block primitives + their class names. The CSS structure mirrors this file's class-name conventions verbatim (e.g., `block.decision` → `.block.decision`; `dopt rec` → `.dopt.rec`; `recbadge` → `.recbadge`).
2. `.context/attachments/design-package-2026-04-27/project/colors_and_type.css` — design-token source of truth (mirrors the codebase's `globals.css`); `--text-3xl` + `--text-4xl` at lines 71-75 are the two missing tokens this brief adds. The header comment "Source of truth: ditto/packages/web/app/globals.css (@theme block)" confirms the codebase is canonical for tokens.
3. `.context/attachments/design-package-2026-04-27/project/Workspace.html` — full workspace shell (1345 lines); read-only reference for the `alex-line` composition + the chat-col / work-col layout. NOT being implemented in this brief; cited so the helper-class semantics (alex-line) are accurate.
4. `.context/attachments/design-package-2026-04-27/README.md` — bundle handoff instructions ("recreate them pixel-perfectly in whatever technology makes sense for the target codebase"; "match the visual output; don't copy the prototype's internal structure unless it happens to fit"). Brief 230 follows: ports the bundled-class CSS into Tailwind v4 + React, doesn't copy the JS prototype's `Blocks.evidence(data)` JS-template structure.
5. `.context/attachments/design-package-2026-04-27/chats/chat1.md` + `chat2.md` — design-conversation transcripts; consulted for intent on disputed UX choices (e.g., does `block.evidence` carry a `block-foot` CTA row? Per chat1: yes, optional). Read-only reference.
6. `packages/web/app/globals.css:1-301` — the existing token surface. This brief MODIFIES this file to add `--text-3xl` + `--text-4xl` + their line-height companions inside the existing `@theme` block.
7. `packages/web/app/globals.css` (or sibling) — destination for the new component-class CSS layer. The Builder picks the layout (inside `@theme` is unusual for non-token CSS; a sibling `@layer components` block OR a separate file imported via `@import` is preferred). Architect's default: a new file `packages/web/app/design-system.css` imported into `globals.css` keeps the layering visible.
8. `packages/web/components/blocks/analyser-report-block.tsx:1-408` — the renderer this brief promotes. Lines 1-24 carry the gap-flag comment that this brief discharges. Lines 27-408 are the JSX composition that swaps utility classes for bundled classes.
9. `packages/web/components/blocks/analyser-report-block.test.tsx` — the existing renderer test (Brief 226). This brief updates the test's class-name assertions (e.g., `bg-positive/5` → `block.evidence` plus tone variant) but preserves the test's `renderToStaticMarkup` + `React.createElement` shape (no JSX-test-toolchain change).
10. `packages/web/components/blocks/knowledge-citation-block.tsx` — read-only reference; does this renderer compose from `block.evidence` semantically? If yes, document at the audit-time gap (NOT promoted in this brief; flagged as a candidate for the next brief that touches it).
11. `packages/web/components/blocks/connection-setup-block.tsx` — read-only reference; same as above.
12. `docs/briefs/complete/226-in-depth-analyser.md` §Constraints + Provenance — the renderer composition spec this brief honours. Brief 226 §Constraints "Block renderer composition (`block.evidence` + `block.decision` + `block.plan`) | Anthropic Claude Design package `Workspace.html`" is the binding instruction.
13. `docs/briefs/228-project-retrofitter.md` §Constraints "Renderer composition" + §Open Question 6 — this brief is the resolution path Brief 228 explicitly cites. After Brief 230 ships, Brief 228 Builder consumes the bundled classes.
14. `docs/architecture.md` §Layer 6 — destination for the design-token-vs-component-class boundary documentation. Currently §Layer 6 covers UI primitives + ContentBlocks-as-universal-unit; this brief adds a §Legibility-adjacent subsection naming the design-system layering.
15. `tailwindcss` v4 documentation (Tailwind v4 `@theme` block syntax) — depend (existing); the codebase already uses it per the audit. The Builder picks whether new component classes live inside `@theme`, in `@layer components`, or in a sibling file imported into `globals.css`.

## Constraints

- **Engine-first per CLAUDE.md does NOT apply here.** This brief is product-layer (the `packages/web/` UI). NO engine-side changes; `packages/core/` is untouched. Ask: "could ProcessOS use this?" — yes, ProcessOS could absolutely consume this CSS layer if it picks up the same design-package primitives. But the CSS layer's correct home is per-app (Tailwind v4 + the @theme block are app-level concerns), so duplicating it into `@ditto/core` would be the wrong shape. ProcessOS authors its own CSS layer using the same canonical class names.

- **CSS layer organisation — Builder's call, but Architect's default is a sibling file.** Two options:
  - **Default: sibling file at `packages/web/app/design-system.css`** imported via `@import "./design-system.css"` from `globals.css`. Keeps tokens (in `globals.css @theme`) visually separate from components (in `design-system.css`). Easier to audit; matches how the design package itself ships (`colors_and_type.css` is sibling-but-imported-in-aggregate from the project's HTML files).
  - **Alternative: `@layer components` block inside `globals.css`.** Tailwind v4 supports this idiom verbatim; keeps everything in one file. Slightly more compact; less visible separation.
  Builder picks at implementation time; either choice is acceptable to the Architect. The brief's smoke test verifies the classes are visible to the renderer either way.

- **Class-name fidelity to the design package.** The CSS classes match the design package's `blocks.js` strings VERBATIM (e.g., `.block.decision`, `.dopt.rec`, `.recbadge`, `.alex-line`). The Builder MUST NOT rename to a Tailwind-style convention (`.block-decision` instead of `.block.decision`) — the dot-multiplier syntax is intentional and idiomatic for the design package. The renderer's JSX composes these exactly: `<div className="block decision">` (NOT `<div className="block-decision">`).

- **CSS specificity is the design package's specificity.** The design package uses `.block.decision .dopt` selector chains; bundle classes preserve this nesting. Tailwind v4 doesn't interfere with arbitrary CSS rules in `@layer components` or sibling files; no conflict.

- **Tokens-not-hex-codes.** Every property in the bundled classes uses CSS variables (`color: var(--color-vivid-deep)`) — never literal hex (`color: #3D5A48`). This is how theme switching (light/dark) works automatically.

- **NO token rename.** The design package's tokens already match the codebase verbatim. Token names like `--color-vivid`, `--color-positive`, `--color-caution`, `--color-negative`, `--color-info` are preserved; the bundled classes use them directly.

- **Hero type-scale tokens added at the same site as existing scale.** `--text-3xl` (`2.441rem`, line-height `1.15`) + `--text-4xl` (`3.052rem`, line-height `1.1`) added inside the existing `@theme` block in `globals.css` at the type-scale section (after `--text-2xl`). Both line-height companions added (`--text-3xl--line-height`, `--text-4xl--line-height`) for consistency with existing scale.

- **Renderer promotion — surgical, not rewrite.** `analyser-report-block.tsx`'s JSX structure stays; only the `className` strings change. Per-surface mapping (Reviewer CRIT-3 + IMP-1 corrected):
  - **Strengths/Watch-outs/Missing sections:** `bg-positive/5 text-positive` (utility-mapped) → `block findings tone-positive` (bundled — `.block.findings` is the new Ditto-original primitive; tone modifiers `.tone-positive` / `.tone-caution` / `.tone-negative` are part of `.block.findings`'s definition, NOT `.block.evidence`'s). Brief 228's RetrofitPlanBlock kv-pair metadata cards continue to use `.block.evidence` cleanly, with no semantic conflict.
  - **At-a-glance metadata card** (line 99 of analyser-report-block.tsx): `bg-surface-primary` (utility — note: `bg-surface-primary` is a pre-existing renderer utility class that doesn't map to a token; this brief leaves it alone — see "Pre-existing renderer issues" below) → kept as `bg-surface-primary` (out of promotion scope). Future renderer-cleanup brief addresses.
  - **Decision pickers** (runner kind + trust tier): `bg-vivid-subtle border-vivid` (utility) → `dopt rec` (bundled).
  - **Recommendation badge:** utility-flavoured `<span className="text-xs uppercase ...">` → `<span className="recbadge">` (bundled).
  - **Per-finding row layout within Findings sections:** `flex items-start gap-2` (utility, Tailwind layout primitive) → kept as Tailwind layout utilities (the bundled-class layer governs colour + tone semantics; layout stays utility-driven per the renderer-promotion's "surgical not rewrite" discipline).
  - **CTA row:** uses existing shadcn `<Button variant="default">` components (NOT bundled `.btn.primary` — the codebase already has shadcn buttons; `.block-foot` composes shadcn buttons inside, NOT new `.btn` CSS). Per Reviewer §Coverage check on `.btn`.
  - The Builder produces a class-name diff alongside the renderer change so the Reviewer + manual smoke check can verify visual non-regression.

- **Pre-existing renderer issues — out of scope** (Reviewer IMP-1). `analyser-report-block.tsx` references three utility classes that don't map to tokens in `globals.css`: `bg-surface-primary`, `bg-surface-secondary`, `text-info-deep` (closest tokens are `--color-surface`, `--color-surface-raised`, no `--color-info-deep` exists). These are pre-existing Brief 226 renderer issues. Brief 230 does NOT fix them — promotion is "surgical, not a Brief 226 bug-fix sweep." A future renderer-cleanup brief addresses; Brief 230 leaves them as-is so the AC #6 + #7 + #8 visual non-regression smoke is meaningful.

- **Hex-literal mapping at port time** (Reviewer IMP-4). The design package's `Workspace.html` carries ~130 hex literals in the relevant block.* CSS rules. Each maps mechanically to an existing token (e.g., `#FAFAFB` → `var(--color-surface-raised)`; `#E8E8ED` → `var(--color-border)`; `#3D5A48` → `var(--color-vivid-deep)`; `#ECFDF5` → `var(--color-vivid-subtle)`; `#D1F4E1` → `var(--color-vivid-subtle-border)` — newly added per IMP-5). The Builder uses the design package's own `colors_and_type.css:15-89` as the canonical hex→token mapping table. If a hex appears in `Workspace.html` that doesn't have a token equivalent, FLAG to Architect (token gap).

- **Existing renderer test preserved + class assertions updated.** `analyser-report-block.test.tsx` keeps its current shape (Builder picks JSX vs `React.createElement` — both supported). The test's existing assertions on rendered class names get refreshed: assertions like `expect(rendered).toContain("bg-positive/5")` become `expect(rendered).toContain("block findings tone-positive")` (NOT `block evidence tone-positive` — see Reviewer CRIT-3 re-modeling). Test count stays the same; assertion scope changes. The Brief 226 stale comment at `analyser-report-block.test.tsx:9-12` (claiming `@vitejs/plugin-react` isn't installed) gets removed as drift-discharge.

- **Visual non-regression smoke checklist.** Because the renderer test is a class-name smoke (not a pixel-perfect visual diff), the brief includes a manual smoke checklist for the Builder + Reviewer to walk through:
  - The chat-col page renders an `AnalyserReportBlock` with the same visual cues (positive / caution / negative tone separators on Strengths/Watch-outs/Missing) as before promotion.
  - The runner picker renders the recommended option with a visible "I'd pick" badge and a subtle outline (`.dopt.rec`).
  - The trust-tier picker renders the same.
  - The CTA row renders unchanged (button styles, hover states, focus rings).
  - Light theme + dark theme both render without colour drift.
  Builder records the smoke result inline in the Builder checkpoint.

- **NO modifications to `RetrofitPlanBlock` renderer** (Brief 228's territory). This brief produces the CSS + the AnalyserReportBlock promotion; Brief 228 Builder consumes the bundled classes when authoring `retrofit-plan-block.tsx` per Brief 228's existing §Constraints "Renderer composition" — which already cites these classes by name.

- **Reference docs touched in this brief** (Insight-043, point-of-contact discipline):
  - `docs/architecture.md` — §Layer 6 paragraph added: "Design-token-vs-component-class layering." Names tokens in `@theme`; component classes in a sibling layer; `.context/attachments/design-package-2026-04-27/` as the source-of-truth-mirror. **Drift discharge** (Reviewer IMP-3): the same edit refreshes §Layer 6's stale counts — "26 ContentBlock types" → "27" (verified at `packages/core/src/content-blocks.ts:542-569`); "22 renderers" → "27" (verified by `ls packages/web/components/blocks/*.tsx` excluding registry + tests).
  - `docs/landscape.md` — NO update (no new framework adoption; Tailwind v4 + the design package are already evaluated/in-use).
  - `docs/dictionary.md` — three new entries: `Block Primitive` (one of the 6 canonical design-package primitives), `Bundled Component Class` (the CSS implementation of a block primitive in our codebase), `Design-Token-vs-Component-Class Boundary` (the layering principle this brief codifies). Builder writes at implementation.
  - `docs/state.md` — Architect checkpoint (this session) + Builder checkpoint + Documenter closeout.
  - `packages/web/components/blocks/analyser-report-block.tsx:1-24` — the gap-flag comment block deleted. Reference-doc-drift discipline: comments-as-documentation get freshened when the underlying state changes.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Six block-primitive CSS classes + class names | Anthropic Claude Design package `workspace/blocks.js` (preserved at `.context/attachments/design-package-2026-04-27/project/workspace/blocks.js`) | depend (design-system source-of-truth) | The class names are canonical; the design package is the upstream the codebase mirrors. |
| Seventh block primitive `.block.findings` + tone modifiers | Original to Ditto (Reviewer CRIT-3) | original | The design-package's `.block.evidence` is a kv-pair list (`<span>k</span><b>v</b>`) — semantically distinct from the AnalyserReportBlock Strengths/Watch-outs/Missing UX which is a sectioned-list-with-tone. Ditto extends the design-package vocabulary with one new sibling primitive named consistently with design-package conventions. NO Designer pass — the existing AnalyserReportBlock Stage 3 UX (per `docs/research/analyser-report-and-onboarding-flow-ux.md`) IS the spec; this brief just gives that UX a CSS class name. |
| `.btn` + variants — NOT authored | Existing shadcn `Button` component (codebase) | depend (existing) | The design-package's `.block-foot .btn.primary` would author duplicate Button styles; instead the renderer composes `<div className="block-foot"><Button variant="default">...</Button></div>`. Reviewer §Coverage check on `.btn` resolved this way. |
| Block chrome + helper classes (`block-head`, `bbody`, `bkind`, `bopen`, `alex-line`) | Anthropic Claude Design package `Workspace.html` styles + `colors_and_type.css` | depend (design-system source-of-truth) | Same source; the chrome classes coordinate the blocks but are independent of any one primitive. |
| Hero type-scale tokens (`--text-3xl`, `--text-4xl`) | Anthropic Claude Design package `colors_and_type.css:71-75` | depend (design-token source-of-truth) | Existing codebase scale stops at `--text-2xl`; design package extends; aligning closes a known gap. |
| AnalyserReportBlock renderer composition pattern | Brief 226 `analyser-report-block.tsx:1-24` (gap-flag comment) + Brief 226 §Constraints | adopt (existing) | Brief 226 already shipped the renderer with the gap explicitly documented; Brief 230 discharges the gap. |
| Design-token-vs-component-class layering principle | Tailwind v4 `@theme` documentation + Brief 230 (this brief) | original (Ditto's call) | Tailwind v4 supports tokens-in-`@theme`; component classes in `@layer components` or sibling file is the standard idiom; this brief codifies the boundary for Ditto. |
| `.context/attachments/` design-bundle preservation | `feedback_grep_before_claiming_shared_namespace.md` (no shared namespace concern) + Conductor `.context/` convention (gitignored, persists across reboots) | depend (existing) | Preserved 2026-04-27 by Architect; durable + gitignored; serves as the source-of-truth-mirror for future briefs. |
| Stopgap test-infrastructure preservation | Brief 226 `analyser-report-block.test.tsx` (`renderToStaticMarkup` + `React.createElement` workaround) | adopt (existing) | Brief 226's stopgap is honest about its scope; mass test-infra change is a separate brief. |
| NO workspace shell scope (chat-col / work-col / sidebar / view routing) | Architect's call (size discipline per Insight-004) | reference (intentionally-deferred) | Workspace.html shell is multi-week surgery; bundled-class CSS layer is the focused-shippable seam. |
| NO promotion of 25 other renderers | Architect's call (size discipline per Insight-004) | reference (intentionally-deferred) | Per-renderer promotion happens as briefs touch them; mass-promotion risks regression across surfaces this brief hasn't reasoned through. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `docs/briefs/230-design-system-component-css-layer.md` | **This brief.** |
| `packages/web/app/globals.css` | **Modify:** add `--text-3xl` + `--text-3xl--line-height` + `--text-4xl` + `--text-4xl--line-height` inside the existing `@theme` block at the type-scale section (after `--text-2xl`). If the Builder picks the sibling-file CSS-layer organisation (Architect's default), add an `@import "./design-system.css"` at the top of `globals.css`. |
| `packages/web/app/design-system.css` | **Create (Architect's default):** the sibling component-class CSS file. Carries the 6 block-primitive class layers + their helper sub-classes + alex-line composition + tone modifiers (tone-positive / tone-caution / tone-negative / tone-info / tone-vivid). Header comment cross-references `.context/attachments/design-package-2026-04-27/project/workspace/blocks.js` as the source-of-truth-mirror. (Alternative: `@layer components` block inside `globals.css` if the Builder prefers the single-file shape; either is acceptable per §Constraints.) |
| `packages/web/components/blocks/analyser-report-block.tsx` | **Modify:** delete lines 1-24 (the gap-flag comment block); update className strings throughout to use bundled classes. JSX structure preserved. Public API unchanged. |
| `packages/web/components/blocks/analyser-report-block.test.tsx` | **Modify:** refresh class-name assertions to match the bundled class names. Test count + structure preserved. |
| `docs/architecture.md` | **Modify:** §Layer 6 — add a paragraph titled "Design-token-vs-component-class layering." Names the tokens-in-`@theme` vs component-classes-in-sibling-or-`@layer-components` boundary; cites the design package at `.context/attachments/design-package-2026-04-27/` as the source-of-truth-mirror; cites Brief 230 as the brief that codified the boundary. |
| `docs/dictionary.md` | **Modify:** add three entries (`Block Primitive`, `Bundled Component Class`, `Design-Token-vs-Component-Class Boundary`) at point of contact. |

## User Experience

- **Jobs affected:** None directly. This brief is platform CSS; no user job changes. Indirectly: every job involving an `AnalyserReportBlock` render (Define, Review, Decide on the project-onboarding flow) gets the bundled-class polish, but the Designer-spec'd content + interaction is preserved verbatim.
- **Primitives involved:** None of the 16 UI primitives change. The brief authors the **block primitives** (the 6 design-package compositional units) — these are at a layer below the 16 UI primitives (which are higher-level surfaces like KnowledgeCitationBlock, AnalyserReportBlock, etc.). Block primitives compose into renderers; renderers compose into views.
- **Process-owner perspective:** "I shouldn't notice anything different." The visual non-regression smoke checklist is the test: same colour cues, same card layout, same hover/focus/active states. If the user notices something different, the smoke checklist failed and the Builder rolls back.
- **Interaction states:** N/A (no interaction changes).
- **Designer input:** **NOT invoked.** The block primitives are already designed (in the Anthropic Claude Design package); the bundled classes mirror the package's canonical CSS verbatim. Per `dev-architect.md` constraints, the Architect fills the UX section as a lightweight check (this section).

## Acceptance Criteria

How we verify this work is complete. Each criterion is boolean.

1. [ ] **Six block-primitive bundled CSS classes authored** in `packages/web/app/design-system.css` (or `@layer components` block in `globals.css` per Builder's call): `.block.breakdown`, `.block.decision`, `.block.plan`, `.block.compare`, `.block.evidence`, `.block.people`. Each carries its sub-classes per `.context/attachments/design-package-2026-04-27/project/workspace/blocks.js` (e.g., `.block.evidence .eline`; `.block.decision .dopt.rec`; `.block.plan .pstep.done`). Class-name fidelity verified by grep against the design-package source.

2. [ ] **Block chrome + helper classes authored**: `.block` (root), `.block-head`, `.bbody`, `.block-foot`, `.bkind`, `.bopen`, `.alex-line` + `.alex-mark` + `.alex-body`. Names match the design package verbatim.

3. [ ] **`.block.findings` Ditto-original primitive authored** with sub-classes (`.findings-section`, `.finding-icon`, `.finding-title`, `.finding-list`, `.finding-item`) + tone modifiers (`.tone-positive`, `.tone-caution`, `.tone-negative`, `.tone-info`, `.tone-vivid`) for the AnalyserReportBlock Strengths/Watch-outs/Missing surfaces. Each tone modifier sets the appropriate `--color-positive`/`--color-caution`/etc. backgrounds + text colours via the existing tokens (NOT literal hex values). **Provenance: original (Ditto's call)** — distinct from the design-package's `.block.evidence` (kv-pair) primitive per Reviewer CRIT-3.

4. [ ] **Three missing tokens added** to `globals.css` `@theme` block: `--text-3xl: 2.441rem` + `--text-3xl--line-height: 1.15` + `--text-4xl: 3.052rem` + `--text-4xl--line-height: 1.1` (Tailwind v4 double-dash convention per existing scale at `globals.css:103-113`) + `--color-vivid-subtle-border: #D1F4E1` (the IMP-5 token gap). Existing tokens unchanged.

5. [ ] **CSS uses tokens, not hex.** Grep `packages/web/app/design-system.css` (or the new `@layer components` block) for hex literals — zero matches except inside font URLs or asset references. All colours via `var(--color-*)`.

6. [ ] **`AnalyserReportBlock` renderer promoted from utility-mapped to bundled-class composition.** Lines 1-24 (the gap-flag comment block) deleted. JSX `className` strings throughout updated per the §Constraints "Renderer promotion" mapping table: Strengths/Watch-outs/Missing sections → `block findings tone-{positive|caution|negative}`; pickers → `dopt rec` + `recbadge`; CTA row → existing shadcn `<Button>` components (not new `.btn` CSS). Pre-existing renderer issues (`bg-surface-primary`, `bg-surface-secondary`, `text-info-deep`) intentionally left alone (out of scope per IMP-1). JSX structure preserved (no element add/remove). Public API (`AnalyserReportBlockComponent({ block, onAction })`) unchanged.

7. [ ] **Existing `analyser-report-block.test.tsx` test still passes after promotion.** Class-name assertions refreshed (utility-class strings → bundled-class strings; e.g., `bg-positive/5` → `block findings tone-positive`); test count + structure preserved. The stale comment at `analyser-report-block.test.tsx:9-12` (claiming `@vitejs/plugin-react` isn't installed) is removed as drift-discharge (Reviewer CRIT-2). Builder may write JSX OR keep `React.createElement` — `@vitejs/plugin-react` is already wired into `vitest.config.ts:3,9`. `pnpm vitest run packages/web/components/blocks/analyser-report-block.test.tsx` is green.

8. [ ] **Visual non-regression smoke checklist completed.** Builder records inline in the Builder state.md checkpoint:
   - [ ] `AnalyserReportBlock` renders with the same Strengths/Watch-outs/Missing tone separators as before.
   - [ ] Runner picker renders with `.dopt.rec` "I'd pick" badge on the recommended option.
   - [ ] Trust-tier picker renders the same.
   - [ ] CTA row renders unchanged.
   - [ ] Light theme + dark theme both render without colour drift.

9. [ ] **`docs/architecture.md` §Layer 6 updated** with the design-token-vs-component-class layering paragraph. Names: tokens in `@theme`; component classes in a sibling layer (or `@layer components`); the design package at `.context/attachments/design-package-2026-04-27/` as the source-of-truth-mirror; Brief 230 as the brief that codified the boundary; Brief 230's Ditto-original `.block.findings` primitive listed as a documented extension to the design-package vocabulary. **Drift discharge (Reviewer IMP-3):** stale "26 ContentBlock types" → "27" + "22 renderers" → "27" counts in the same section refreshed.

10. [ ] **`docs/dictionary.md` carries three new entries**: `Block Primitive`, `Bundled Component Class`, `Design-Token-vs-Component-Class Boundary`. Each entry cross-references the others + the architecture.md paragraph.

11. [ ] **Brief 228 §Open Question 6 marked resolved.** The Documenter (or Architect at Brief 228 build time) appends a "Resolved by Brief 230 (2026-04-XX)" note to Brief 228's Q6. Cross-referenced.

**Total ACs: 11.** Within Insight-004's 8-17 envelope; well below the upper edge.

## Review Process

1. Spawn fresh-context Reviewer agent with `docs/architecture.md` + `docs/review-checklist.md` + this brief + the design-package source files (`.context/attachments/design-package-2026-04-27/project/workspace/blocks.js` + `colors_and_type.css`) + Brief 226's `analyser-report-block.tsx:1-24` (the gap-flag comment) + Brief 228 §Constraints "Renderer composition".
2. Reviewer specifically checks:
   - Class-name fidelity to the design package (no Tailwind-renamed classes; the design-package's `block.decision`, `dopt.rec`, `recbadge` etc. preserved verbatim).
   - Token-only colour discipline (no hex literals in component classes).
   - The two missing type-scale tokens (`--text-3xl`, `--text-4xl`) are added with the correct values from `colors_and_type.css:71-75`.
   - The `AnalyserReportBlock` promotion is surgical (no JSX structure change; no Public API change).
   - The existing test is preserved (no JSX-test-toolchain change in scope; the Brief 226 stopgap stays).
   - The 25 other renderers are intentionally NOT touched (per §Non-Goals).
   - Workspace shell adoption is intentionally NOT in scope (per §Non-Goals).
   - The visual non-regression smoke checklist is concrete (5 items; light + dark theme both checked).
   - The architecture.md paragraph correctly distinguishes tokens-in-`@theme` from component-classes-in-sibling-layer.
   - The dictionary entries cross-reference each other + architecture.md.
   - The Brief 228 Q6 resolution path is explicit (Brief 230 IS the resolution; Brief 228's Q6 gets a "Resolved by Brief 230" note).
   - Brief sizing within Insight-004 (11 ACs; one integration seam = the design-system CSS layer; independently testable + shippable).
3. Present brief + review findings to human for approval.

## Smoke Test

```bash
# 1. Type-check + existing renderer test pass.
pnpm --filter @ditto/web type-check
pnpm vitest run packages/web/components/blocks/analyser-report-block.test.tsx
# Expect: type-check clean; test green with refreshed class-name assertions.

# 2. CSS class-name fidelity grep.
# Verify all 6 block primitive classes + all helper classes are present in design-system.css.
# (Builder can shape this as a one-shot grep helper.)

# 3. Visual non-regression smoke (manual):
#    - Navigate to /projects/:slug/onboarding for a project with status='active' and an existing analyser report.
#    - Confirm AnalyserReportBlock renders with identical visual cues to pre-promotion (Strengths/Watch-outs/Missing tones; runner picker; trust-tier picker; CTA row).
#    - Toggle dark mode (system preference); confirm theme switching works without colour drift.
#    - Hover/focus the runner picker options; confirm `.dopt.rec` "I'd pick" badge + subtle outline render.

# 4. No-hex grep:
grep -rE "#[0-9A-Fa-f]{3,6}" packages/web/app/design-system.css
# Expect: zero matches.
```

## After Completion

1. Update `docs/state.md` with what changed (Brief 230 complete; design-system CSS layer authored; AnalyserReportBlock promoted; 2 type-scale tokens added; architecture.md §L6 updated; dictionary entries added; Brief 228 Q6 resolved).
2. Update `docs/roadmap.md` — add a one-line note in the cross-cutting design-system row (or create one if it doesn't exist) crediting Brief 230 as the design-system component-class layer.
3. Phase retrospective: did the bundled-class promotion meaningfully simplify the AnalyserReportBlock renderer (LOC delta? readability impact?), or does the bundled-class approach feel heavier than utility-mapped composition? Capture as insight if the comparison reveals something non-obvious.
4. ADR check: NO ADR (Tailwind v4 + the design package were already-evaluated; no architecturally-load-bearing decision in this brief). The design-token-vs-component-class boundary documentation in architecture.md §L6 IS the lightweight ADR-equivalent.
5. **Brief 228 cross-update.** When Brief 228 Builder runs (assuming Brief 230 ships first), the Builder consumes the bundled classes per Brief 228's existing §Constraints "Renderer composition" — the renderer at `packages/web/components/blocks/retrofit-plan-block.tsx` is authored from day one against bundled classes. NO retroactive promotion needed for Brief 228.
6. **Future-brief candidate flagged for Documenter:** "Workspace Shell Alignment with `Workspace.html`" — the chat-col / work-col / sidebar / view-routing surgery the user originally surfaced in 2026-04-27's "Implement: Workspace.html" ask. Sized at multi-week (Workspace.html is 1345 lines + 8 view JS files + significant divergence from current `workspace.tsx` abstractions). Not yet prioritised; surfaced as a follow-on for the user to decide on after Brief 230 + Brief 228 + Brief 229 ship.
7. **Future-brief candidate flagged for Documenter:** "Block-Renderer Test Infrastructure (`@vitejs/plugin-react` + JSX test suite)" — promotes the Brief 226 stopgap to a real test-infrastructure baseline. Per-renderer promotion of the other 25 renderers (utility-mapped → bundled-class) becomes feasible at scale once the test infrastructure exists.

---

## Open Questions

These flagged for the Reviewer to challenge before promotion to `Status: ready`:

**Q1.** Does the bundled-class layout go in `packages/web/app/design-system.css` (sibling file, Architect's default) OR in a `@layer components` block inside `globals.css` (Tailwind v4 idiom)? **Architect's default:** sibling file — keeps tokens visually separate from components, easier to audit, mirrors the design package's own `colors_and_type.css` sibling-pattern. **Open:** if the Builder finds the sibling import causes Tailwind v4 build-order issues (e.g., `@import` inside `@theme` is invalid), fall back to `@layer components` block in `globals.css`. Reviewer to challenge if there's a known constraint here.

**Q2.** ~~The design package's `block.evidence` doesn't carry an explicit "tone-positive / tone-caution / tone-negative" modifier; Brief 226's renderer applies tone via Tailwind utilities. This brief introduces tone modifiers as PART of the bundled-class layer.~~ **RESOLVED per Reviewer CRIT-3:** the design package's `.block.evidence` is a kv-pair list primitive (`<div class="eline"><span>k</span><b>v</b></div>` per `blocks.js:97-106`), NOT a tone-coded section list. The Strengths/Watch-outs/Missing UX is semantically different. Brief 230 introduces a NEW sibling primitive `.block.findings` (Ditto-original) with tone modifiers `tone-positive` / `tone-caution` / `tone-negative` / `tone-info` / `tone-vivid`. `.block.evidence` retains its kv-pair semantic verbatim from the design package (consumed by Brief 228's RetrofitPlanBlock metadata cards). NO Designer pass needed — the AnalyserReportBlock Stage 3 UX already exists and is approved (per `docs/research/analyser-report-and-onboarding-flow-ux.md`); this brief gives that existing UX a CSS class name.

**Q3.** The brief's §Goal lists `block.compare`, `block.breakdown`, `block.people` as "spec'd for design-system completeness (no current consumers)." Should these be authored as bundled CSS at all, or deferred to a future brief that introduces a renderer? **Architect's default:** author them — the design system is a coherent unit; authoring all 6 primitives at once is cheaper than authoring 3 now + 3 later (CLAUDE.md "boil the ocean" principle). The marginal CSS LOC cost is small; the consistency benefit is real. **Open:** if the Reviewer finds the "no current consumer" classes are speculative (e.g., the design package's `block.people` shape doesn't actually fit our future `PeopleBlock` use-case), defer them. Reviewer to challenge.

**Q4.** Should this brief promote `KnowledgeCitationBlock` and `ConnectionSetupBlock` alongside `AnalyserReportBlock`? Both renderers semantically compose `block.evidence`. **Architect's default:** NO — the audit didn't find them flagging the gap explicitly the way `AnalyserReportBlock` does (Brief 226 left a load-bearing comment block; the others didn't). Risk of incidental visual regression. Defer per-renderer promotion to the next brief that touches them. **Open:** if the Reviewer + Builder are confident the `block.evidence` semantic is identical across all three renderers, expanding the promotion scope might be cheap. Reviewer to assess.

**Q5.** The brief's §Smoke Test relies on a manual visual non-regression checklist. Is this acceptable, or should the brief require automated visual regression (Storybook + Chromatic / Percy / Playwright snapshot)? **Architect's default:** manual is acceptable — `packages/web/` doesn't yet have any automated visual regression infra; introducing it is multi-brief surgery. The Brief 226 renderer test (`renderToStaticMarkup` class-name smoke) catches structural drift; manual catches visual drift. Together they're a reasonable verification floor for this surgical change. **Open:** if the Reviewer feels strongly about automated visual regression, that's a separate brief candidate flagged in §After Completion #7.
