# Brief: Block Renderer Polish — Tier 2 Visual Activation

**Date:** 2026-03-31
**Status:** approved
**Depends on:** Brief 062 (Conversation Experience Activation) — conversation chrome activated
**Unlocks:** World-class conversation content rendering; dogfood-ready visual experience across all 22 ContentBlock types

## Goal

- **Roadmap phase:** Phase 11 — Chat UX & Experience
- **Capabilities:** Elevate Tier 2 block renderers to match Tier 1 quality and P30 prototype visual spec

## Context

The block rendering system has 22 ContentBlock types, all with React renderers. But they fall into two quality tiers:

**Tier 1 (world-class):** MetricBlock, RecordBlock, InteractiveTableBlock, ReviewCardBlock, ChartBlock, ChecklistBlock, ReasoningTraceBlock, CodeBlock, KnowledgeCitationBlock — these match P30 prototype quality with rich field tables, semantic badges, confidence indicators, sparklines, provenance strips, and action rows.

**Tier 2 (minimal/functional):** StatusCardBlock, ProgressBlock, DataBlock, ActionBlock, AlertBlock, SuggestionBlock, InputRequestBlock, ArtifactBlock, ImageBlock — these render correctly but lack the visual richness, compositional depth, and typography standards that P30 defines.

Brief 062 activates the conversation chrome (reasoning, tools, confirmations, citations, prompt input). This brief activates the content blocks that flow through that chrome. Together they deliver the full conversation experience.

The P30 prototype (`docs/prototypes/30-json-render-composability.html`) is the definitive visual reference. Tier 1 blocks already match it. Tier 2 blocks don't.

## Objective

Elevate 7 Tier 2 block renderers to match P30's visual vocabulary. After this brief, every ContentBlock type that appears in conversation renders with world-class visual quality. ActionBlock is already spec-compliant and ImageBlock has only a minor gap — both excluded from scope.

## Non-Goals

- **New ContentBlock types** — no schema changes; only renderer upgrades
- **Tier 1 blocks** — already world-class; don't touch
- **Engine changes** — no changes to `content-blocks.ts` type definitions
- **Block registry structure** — `block-registry.tsx` dispatch logic unchanged
- **Composition engine** — how blocks get assembled is separate work
- **Mobile-specific rendering** — responsive-friendly but no mobile-specific adaptations

## Inputs

1. `docs/prototypes/30-json-render-composability.html` — P30 block gallery: definitive visual spec for all 22 types
2. `packages/web/components/blocks/record-block.tsx` — Tier 1 gold standard for visual composition
3. `packages/web/components/blocks/metric-block.tsx` — Tier 1 reference for typography and sparklines
4. `packages/web/components/blocks/interactive-table-block.tsx` — Tier 1 reference for tables and row actions
5. `src/engine/content-blocks.ts` — ContentBlock type definitions (data shapes, available fields)
6. `.impeccable.md` — design tokens, typography scale, color system
7. `docs/research/conversation-experience-activation-ux.md` — Designer's interaction spec (broader context)

## Constraints

- **Type shapes unchanged.** ContentBlock types in `content-blocks.ts` must not change. Renderers consume existing data — if a field exists in the schema but isn't rendered, render it.
- **No new dependencies.** All design tokens and primitives needed are already available.
- **Tier 1 blocks untouched.** Do not modify any Tier 1 renderer.
- **Block registry dispatch unchanged.** `block-registry.tsx` exhaustiveness checking and dispatch logic stay the same.
- **Type-check clean.** `pnpm run type-check` must pass with zero errors.
- **All tests pass.** Existing 440+ tests continue to pass.
- **Design token compliance.** All styling uses `.impeccable.md` tokens: `--vivid`, `--vivid-deep`, `--vivid-subtle`, semantic colors, typography scale, spacing grid. No hardcoded colors or magic numbers.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Visual spec for all blocks | P30 prototype `30-json-render-composability.html` | pattern | Definitive visual reference for Ditto's block vocabulary |
| Left-border accent pattern | RecordBlock (`record-block.tsx`) | pattern | Tier 1 gold standard — border-left accent for visual hierarchy |
| Typography standards | `.impeccable.md` typography scale | pattern | Uppercase labels, letter-spacing, font weights |
| Semantic badge system | RecordBlock, InteractiveTableBlock | pattern | Status badges with semantic coloring |
| SVG icon library | Lucide icons (already in project) | depend | Consistent iconography |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/components/blocks/suggestion-block.tsx` | Modify: Add "Suggestion" label header (uppercase, vivid-deep, letter-spaced). Use `bg-vivid-subtle` background per P30. Increase padding to 12px vert / 16px horiz. |
| `packages/web/components/blocks/artifact-block.tsx` | Modify: Add artifact type icon (32×32 rounded-md, bg-vivid-subtle). Add vivid left-border accent (3px). Render `artifactType` and `version` as subtitle. Preserve `changed` timestamp rendering. |
| `packages/web/components/blocks/alert-block.tsx` | Modify: Replace 2×2 dot with full Lucide SVG icons per severity: `AlertTriangle` (warning), `XCircle` (error), `Info` (info). Size 18×18. Add `font-semibold` to title. |
| `packages/web/components/blocks/data-block.tsx` | Modify: Table header typography — uppercase, `text-xs`, `font-semibold`, `tracking-wider` (`letter-spacing: 0.04em`). Add format-hint rendering for table cells: badge, confidence dot, currency formatting. Preserve existing `provenance` and `flag` annotation rendering. Key-value and list formats are already acceptable quality — table format only. |
| `packages/web/components/blocks/status-card-block.tsx` | Modify: Add info-colored left-border accent (2px). Status badge supports severity variants (positive/caution/negative/info/neutral). Render `entityType` as subtitle. |
| `packages/web/components/blocks/progress-block.tsx` | Modify: Add status badge label next to step fraction (e.g., "4 of 5 • Running"). Show badge with semantic color matching bar fill. |
| `packages/web/components/blocks/input-request-block.tsx` | Modify: Replace Card wrapper with minimal left-border design (2px vivid). Remove border frame. Adjust padding to match P30 spec (padding-left: 12px). |

## User Experience

- **Jobs affected:** Orient (status cards, progress, alerts with proper icons), Review (suggestions with clear label, artifacts with type icons), Capture (input requests with cleaner design)
- **Primitives involved:** All 7 blocks render inline in conversation (center column) or in artifact mode
- **Process-owner perspective:** Every piece of structured content Self produces now matches the visual quality of the prototype. Status cards have accent borders. Alerts have proper icons. Suggestions are clearly labelled. Artifacts show their type at a glance. The conversation feels composed and confident, not minimal and placeholder.
- **Interaction states:** No new interaction states — these are rendering upgrades to existing block types in their existing states.
- **Designer input:** `docs/research/conversation-experience-activation-ux.md` + P30 prototype. No separate Designer pass needed — P30 IS the visual spec.

### Per-Block Visual Spec

**1. SuggestionBlock — Add label, vivid-subtle background**

```
Before:  [border-accent/20 container]
         "Copper is up 8%..."
         [action buttons]

After:   [vivid-subtle bg, rounded-lg, p-3/4]
         SUGGESTION                          ← uppercase, vivid-deep, text-xs, tracking-wider, font-semibold
         Copper is up 8% — 3 quotes may...
         [action buttons: vivid primary + secondary]
```

**2. ArtifactBlock — Add type icon, left border**

```
Before:  [border-border container]
         "Cost Estimate"  [status badge]
         "Summary text..."
         [Open button]

After:   [vivid left-border 3px, no full border]
         [icon circle]  "Cost Estimate"  [status badge]
                        "Cost Estimate · v2"     ← subtitle with type + version
         "Summary text..."
         [Open button]
```

Icon circle: 32×32 rounded-md (6px radius per P30), bg-vivid-subtle, vivid-deep icon. Icon selected by `artifactType` (FileText for document, Code for code, Mail for email, Image for image, FileSpreadsheet for data). Preserve existing `changed` timestamp rendering in the subtitle area.

**3. AlertBlock — Full SVG icons**

```
Before:  [severity bg]
         ● "Wilson kitchen — waiting 48h"
         "Client hasn't confirmed..."

After:   [severity bg, rounded-lg, p-2.5/3.5]
         ⚠ "Wilson kitchen — waiting 48h"     ← Lucide AlertTriangle (18×18) for warning
         "Client hasn't confirmed..."            ✕ = XCircle for error, ℹ = Info for info
```

Severity background tokens: use existing opacity-based approach (`bg-warning/5`, `bg-negative/5`, `bg-accent/5`) — `.impeccable.md` doesn't define per-severity subtle CSS variables. Keep `border-{severity}/20` for outer border.

**4. DataBlock — Table header typography**

```
Before:  Quote     Amount    Status    Days
         Henderson $18,400   Review    2

After:   QUOTE     AMOUNT    STATUS    DAYS    ← uppercase, text-xs, font-semibold, tracking-wider
         Henderson $18,400   [Review]  2        ← badge-rendered status, currency-formatted amounts
```

Format hints from schema (`format: "currency"`, `format: "badge"`, `format: "confidence"`) drive cell rendering: currency adds `$` + tabular-nums, badge renders as colored pill, confidence renders as colored dot.

**5. StatusCardBlock — Left border accent, severity badge**

```
Before:  [border-border container]
         "Invoice follow-up"  [accent badge]
         Step: Send reminder  |  Started: 2h ago

After:   [info left-border 2px]
         "Invoice follow-up"  [Running ● positive]   ← severity-aware badge
         "process_run"                                 ← entityType as muted subtitle
         Step: Send reminder  |  Started: 2h ago
```

Badge variant map (renderer-side presentation logic — not schema-driven): `running` → positive, `paused` → caution, `failed` → negative, `complete` → positive, `draft` → neutral. Fallback for unknown strings: neutral.

**6. ProgressBlock — Badge label**

```
Before:  Generate quote                    4/5
         [========>          ]

After:   Generate quote           4 of 5  [Running]   ← badge with semantic color
         [========>          ]
```

ProgressBlock badge map (schema-constrained: `running | paused | complete`): `running` → positive, `paused` → caution, `complete` → positive.

**7. InputRequestBlock — Minimal left border**

```
Before:  ┌──────────────────────────────┐
         │ ● I need a couple of details │
         │   [text input]               │
         │   [text input]               │
         │   [Submit]                   │
         └──────────────────────────────┘

After:   ▐ I need a couple of details
         ▐   [text input]
         ▐   [text input]
         ▐   [Submit]

         Left: 2px vivid border, 12px padding-left. No card wrapper.
```

## Acceptance Criteria

1. [ ] **AC1: SuggestionBlock label.** SuggestionBlock renders "SUGGESTION" label header in uppercase, `text-xs`, `font-semibold`, `tracking-wider`, `text-vivid-deep` color. Background is `bg-vivid-subtle`. Padding is `py-3 px-4`.
2. [ ] **AC2: ArtifactBlock icon.** ArtifactBlock renders a 32×32 icon (rounded-md/6px per P30, bg-vivid-subtle) with a Lucide icon matching `artifactType`. Shows `version` and preserves `changed` in subtitle. Left border is 3px vivid.
3. [ ] **AC3: AlertBlock icons.** AlertBlock renders Lucide SVG icons per severity: `AlertTriangle` (warning), `XCircle` (error), `Info` (info). Icons are 18×18. Title is `font-semibold`.
4. [ ] **AC4: DataBlock table headers.** DataBlock table headers render uppercase with `text-xs font-semibold tracking-wider`. Format hints in cell data (`badge`, `confidence`, `currency`) drive semantic rendering (colored pill, dot, tabular-nums). Existing `provenance` and `flag` annotation rendering preserved. Scope: table format only (key-value and list formats already acceptable).
5. [ ] **AC5: StatusCardBlock accent.** StatusCardBlock has a 2px left-border colored by status (info default). Status badge supports severity variants (positive/caution/negative/info/neutral). Renders `entityType` as muted subtitle.
6. [ ] **AC6: ProgressBlock badge.** ProgressBlock shows a semantic status badge label next to the step fraction (e.g., "4 of 5" + [Running] badge).
7. [ ] **AC7: InputRequestBlock minimal.** InputRequestBlock uses 2px vivid left-border + padding-left instead of Card wrapper. No full border frame.
8. [ ] **AC8: Design token compliance.** All new styling uses `.impeccable.md` design tokens (colors, spacing, typography). No hardcoded hex values, no magic pixel numbers outside the 4px grid.
9. [ ] **AC9: Schema field coverage.** Every field defined in `content-blocks.ts` for these 7 block types is rendered in the UI (no unused schema fields in modified blocks).
10. [ ] **AC10: Type-check clean.** `pnpm run type-check` passes with zero errors.
11. [ ] **AC11: Tests pass.** All existing tests pass. No new test additions required (these are visual-only changes to existing renderers).

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Visual output of each block matches P30 prototype spec
   - All styling uses design tokens from `.impeccable.md`
   - No Tier 1 block renderers modified
   - Block registry dispatch unchanged
   - ContentBlock type definitions unchanged
   - No regressions in existing block rendering
3. Visual comparison: open P30 prototype in browser alongside dev server conversation — blocks should match in visual weight, typography, color usage, and spatial rhythm
4. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Type-check
pnpm run type-check

# 2. Run tests
pnpm test

# 3. Visual verification against P30
# Open docs/prototypes/30-json-render-composability.html in browser
# Open pnpm --filter web dev in another tab
# Trigger a conversation that produces each block type
# Compare side-by-side:
#   a. Suggestion block — has "SUGGESTION" label? vivid-subtle bg?
#   b. Alert block — shows triangle/circle/info SVG icons, not dots?
#   c. Status card — has left border accent? severity badge?
#   d. Data table — headers uppercase with tracking?
#   e. Progress — shows status badge next to fraction?
#   f. Artifact — shows type icon circle? left border?
#   g. Input request — no card wrapper? minimal left border?
```

## After Completion

1. Update `docs/state.md` — all 22 ContentBlock types now at Tier 1 visual quality
2. Update `docs/roadmap.md` — Phase 11 block rendering milestone reached
3. Update `docs/human-layer.md` §What's Next if any remaining gaps resolved
4. Capture Insight: "Tier-based quality tracking for rendering components prevents invisible quality drift"
5. Phase retrospective
