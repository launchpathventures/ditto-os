# Brief 260: Network Share Modal + Three-Voice Variants + Dynamic OG + Downloadable PNG

**Date:** 2026-05-13
**Status:** draft
**Depends on:**
- Brief 263 (complete) — `networkDb` proxy + Postgres tier; required because share-variant generation reads KB facts from network tier.
- Brief 256 (complete) — `NetworkProfileCardBlock` content block with `shareUrl: string` and `ogImageUrl: string` fields already present (verified via `packages/core/src/content-blocks.ts:68-85`). This brief POPULATES those endpoints — it does not extend the schema.
- Brief 258 (complete) — `networkUserKbFacts` and KB visibility helper; share-variant generation cites only `public`-visibility facts.
- Brief 259 (designed; build pending) — `/people/[handle]` page exists with `<meta property="og:image">` placeholder; this brief replaces the placeholder with the dynamic OG route. Architecturally independent at the brief level — if 259 lands first, this brief consumes its page; if not, the OG route is reachable directly by URL.
- Brief 248 (complete) — AuthorizationRequestBlock pipeline; NOT touched by this brief (intro emission is Brief 261's scope).
- Parent Brief 254 — Surface F layout, Soul Move #7 (one iconic card across four contexts), Design Rules #1/#2/#10/#11.

**Unlocks:**
- Brief 261-equivalent (introductions + free counter + workspace upsell) — Brief 261 may reference the canonical share URL surface in upsell copy where useful but does not depend on PNG/OG completion.
- Future LinkedIn integration brief (paid Unipile or similar) — this brief delivers copy-paste-to-LinkedIn only; native autopost is downstream.

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Deliver Surface F from parent brief 254 — the share modal where the Greeter drafts three voiced variants of the user's listing (quiet / loud / ask), the user picks or remixes, and copies to clipboard, opens a LinkedIn share intent, or downloads a print-contrast PNG. Deliver the dynamic OG image route at `/people/[handle]/opengraph-image.tsx` so any `ditto.partners/people/{handle}` URL pasted into LinkedIn, X, iMessage, Slack, or Discord renders the iconic card silhouette at 1200×630. Land Soul Move #7 — the single iconic card silhouette that renders identically across in-product chat, OG, downloadable PNG, and LinkedIn link previews.

## Context

Two converging pressures make this the right work now.

1. **The card is the asset.** Brief 256 shipped `NetworkProfileCardBlock` as a structured content block with `shareUrl` and `ogImageUrl` fields already declared. Both fields currently point at routes that do not exist. The card itself is rendered in-product (Surface B/C and Surface D). It cannot leave the product surface without the OG + PNG renderers — and without those, the LinkedIn-pasted share URL renders as a bare link, which kills the viral loop the parent brief is engineered to create. Parent §"Soul Move #7" mandates that the silhouette renders identically across four contexts; three of those contexts (OG / PNG / LinkedIn) all flow through this brief.

2. **The Greeter has the voice.** Generic share buttons return generic copy. Parent §Surface F locks the design: Greeter drafts three pre-composed variants (quiet / loud / ask) from the user's card + KB so the user is choosing tone, not writing copy. This is the parent's "share-as-conversation" move — the share modal is a chat fragment that the Greeter just composed, not a social-media widget bolted on. The `generate_share_variants` self-tool is the engine seam where that composition happens, and it is side-effecting (it calls the LLM), so it inherits Insight-180's stepRunId guard.

The dynamic OG renderer choice is bundled with Next.js 15 — `ImageResponse` from `next/og` is Vercel's Satori-backed primitive, already on the dependency tree (`next@^15.3.3` in `packages/web/package.json`). No new top-level dependency is introduced; a one-line landscape note records the choice (Insight-043).

## Objective

A user on Surface B/C or D clicks `⤴ Share` on their `NetworkProfileCardBlock` and lands in a backdrop-blurred modal showing the live card preview LEFT and three Greeter-drafted voice variants RIGHT (Ethos v32 pattern). They pick a variant, click `[Copy]` (clipboard), `[Post to LinkedIn]` (opens LinkedIn share intent with prefilled text + URL), or `[Download card PNG]` (downloads the iconic-card silhouette as a print-contrast PNG). Independently, any `ditto.partners/people/{handle}` URL pasted into any LinkedIn / X / iMessage / Slack / Discord preview surface renders the same iconic card silhouette at 1200×630 via the dynamic OG route. The four-context rendering is verified by snapshot + manual check.

## Non-Goals

- **No new content-block schema.** `NetworkProfileCardBlock` already carries `shareUrl` and `ogImageUrl`. This brief POPULATES the endpoints those fields refer to.
- **No native LinkedIn / X autopost.** Copy-paste / share-intent only in v1. Unipile or X API integration is a future brief.
- **No public expert directory.** Per parent Non-Goal.
- **No share analytics / click tracking.** v1 ships the share affordance; engagement instrumentation is a downstream brief.
- **No video / GIF / animated share assets.** Static PNG + OG image only.
- **No Twitter Card meta tag tuning beyond standard `<meta name="twitter:card" content="summary_large_image">`.** OG is the authoritative source.
- **No new schema migration.** This brief writes no rows; it reads `networkUsers` + `networkUserKbFacts` only.
- **No intro emission, free-counter logic, or workspace upsell.** All Brief 261.
- **No editing of the card silhouette.** The card layout is locked by Brief 256; this brief renders it identically into two new contexts (OG, PNG). Any silhouette drift between contexts requires an ADR per Design Rule #11.
- **No budget rendering anywhere.** Parent §Constraint — budget never appears on shareable surfaces. Variants are generated from the EXPERT card + KB only (not from a client-lane `JobRequestCardBlock`); the share surface is expert-side.

## Inputs

1. `docs/briefs/254-network-two-sided-conversational-front-door.md` — parent. **§Surface F (lines 486-526)**, **§Soul Move #7 (line 203)**, **§Design rules (1, 2, 10, 11)** are load-bearing.
2. `docs/briefs/complete/256-network-expert-intake-card.md` (or current location) — `NetworkProfileCardBlock` shape + Surface C iconic-card layout.
3. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` — KB schema; `networkUserKbFacts.visibility` field; per-fact visibility helper.
4. `docs/briefs/259-public-profile-as-chat-and-representative-rule.md` — `/people/[handle]` page that consumes the OG image via `<meta property="og:image">`. Coordination point only; this brief replaces the placeholder.
5. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — applies to `generate_share_variants`.
6. `docs/insights/043-knowledge-maintenance-at-point-of-contact.md` — landscape entry required for `next/og` (Vercel's Satori-backed ImageResponse).
7. `packages/core/src/content-blocks.ts` — `NetworkProfileCardBlock` shape (lines 68-85). `shareUrl` and `ogImageUrl` fields already present.
8. `packages/core/src/db/network/schema.ts` — `networkUsers` (handle, card columns) + `networkUserKbFacts` (visibility filtering).
9. `src/engine/network-chat-prompt.ts` — Greeter directive structure; the `generate_share_variants` tool reference is added here.
10. `src/engine/tool-resolver.ts` — `builtInTools` registry; this brief adds an entry. Insight-180 silent-failure guard: tool name in the resolver MUST match the directive reference.
11. `packages/web/components/blocks/` (existing renderer for `NetworkProfileCardBlock`) — the `⤴ Share` button click handler is wired to this modal.
12. `.context/attachments/image-v32.png` — Ethos Post Opportunity modal: live preview LEFT, structured form RIGHT. Parent-cited pattern.
13. `packages/web/package.json` — confirms `next@^15.3.3` (provides `next/og` `ImageResponse`). No new dependency added.
14. `docs/landscape.md` — line 94 (Tambo catalog mentions Satori). Brief adds an explicit `next/og` evaluation entry per Insight-043 / Architect constraint (no unevaluated dependencies referenced in briefs).

## Constraints

- **`generate_share_variants(stepRunId, card, kb)` requires `stepRunId`** (Insight-180). The tool calls an LLM (side effect: spends model tokens + writes audit row). Refuses without `stepRunId` outside `DITTO_TEST_MODE`. The harness pipeline supplies the parameter. Direct HTTP route invocation (e.g. `/api/v1/network/people/[id]/share`) MUST traverse the audited-route wrapper (Insight-232) that injects `stepRunId` before calling the tool.
- **Tool name parity (Insight-180 silent-failure guard).** The string registered in `src/engine/tool-resolver.ts` `builtInTools` MUST match the string the Greeter directive references in `src/engine/network-chat-prompt.ts`. The brief's acceptance includes a test that asserts equality.
- **One iconic card silhouette across four contexts** (Soul Move #7 + Design Rule #11). The card layout component is the SAME React tree used by:
  1. In-product chat block (existing Brief 256 renderer in `packages/web/components/blocks/`).
  2. OG image route (`packages/web/app/people/[handle]/opengraph-image.tsx`) — server-rendered via `ImageResponse`.
  3. Downloadable PNG endpoint (`packages/web/app/api/v1/network/people/[id]/card-png/route.ts`) — also `ImageResponse`.
  4. LinkedIn preview — consumes the OG image automatically via the `<meta property="og:image">` tag set in `/people/[handle]/page.tsx`.
  Achieve identity by extracting the card layout to a single shared component (e.g. `packages/web/components/network/card-silhouette.tsx`) consumed by all three render paths. Drift between contexts is an architectural defect and requires an ADR.
- **Budget never appears on any share surface.** Parent §Constraint. The share-variant generation prompt MUST explicitly forbid budget language. Acceptance includes a regex test rejecting `$\d`, `/(hour|hr|month|mo|project)\s*[:=]?\s*\$`, and variant text matching `budget`, `rate`, `hourly`, `monthly`.
- **Phoenix gradient appears at most twice per render** (Design Rule #2). On the OG image: orb + side wisp at 8% opacity. Same for PNG. Same for the modal's live-preview pane (which uses the in-product silhouette unchanged).
- **Italic Instrument Serif only on the verb** (Design Rule #1). The card silhouette already follows this; the OG / PNG renderers MUST not introduce additional italic serif usage.
- **Three voices, each ending with canonical URL.** Each of `quiet`, `loud`, `ask` is a complete shareable string that ends with the user's canonical share URL (`https://ditto.partners/people/{handle}`). Verified by suffix assertion in the tool's unit test.
- **The share modal is a directive variant, not a separate runtime.** The `[Copy] [Post to LinkedIn] [Download card PNG]` action row is rendered in the modal component; the variant text is the output of the Greeter's tool call, surfaced through the existing conversation primitive. No parallel chat engine.
- **Visibility honored.** The OG + PNG routes serve the silhouette regardless of `wantsVisibility` (parent line 132: card exists at `/people/[handle]` for direct sharing; `wantsVisibility` drives `<meta name="robots">`, not page existence). Variant generation is INDEPENDENT of `wantsVisibility` — if the user is sharing themselves, the variants don't care about discoverability semantics.
- **No engine boundary violation.** The card layout component lives in `packages/web/components/network/`, NOT in `packages/core/`. Core defines the block shape (`NetworkProfileCardBlock` in `content-blocks.ts`); the renderer is a Ditto product opinion.
- **No re-litigation of the iconic-card layout.** Brief 256 owns the in-product silhouette. This brief consumes it unchanged. If the OG/PNG context surfaces a layout bug (e.g. text overflows at 1200×630), the fix lands as a tightening of Brief 256's component, not as an OG-only divergence.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Backdrop-blurred modal with live preview LEFT + variant cards RIGHT | Ethos Post Opportunity modal (`.context/attachments/image-v32.png`) | pattern | Validated $22.75M-Series-A pattern. Parent brief locks the structural choice; this sub-brief implements. |
| Three pre-drafted voice variants (quiet/loud/ask) from card + KB | Original to Ditto | original | No direct external precedent. Closest analogue is LinkedIn's post-suggestions, but those are bait, not Greeter-composed. The "Greeter drafts, user chooses" framing comes from parent §"share-as-conversation". |
| Dynamic OG image generation | Next.js 15 `next/og` `ImageResponse` (Vercel docs) | depend | Already in dependency tree via `next@^15.3.3`. Vercel's Satori-backed primitive — Satori already noted in landscape line 94 via Tambo catalog. No new top-level dependency; this is a feature of an already-adopted dependency. Landscape entry added below for Insight-043 traceability. |
| Downloadable PNG via same `ImageResponse` primitive | Next.js docs (App Router metadata + `ImageResponse` in route handlers) | pattern | Same renderer, different `Content-Disposition` header — `attachment; filename="ditto-card-{handle}.png"`. |
| LinkedIn share intent URL pattern | LinkedIn developer docs `https://www.linkedin.com/sharing/share-offsite/?url={encoded}` | pattern | Standard share-intent endpoint; no auth required; client-side anchor target. |
| `navigator.clipboard.writeText` for copy | Web Platform / MDN | pattern | Standard browser API; no library needed. Surfaces secure-context behavior already handled by Next dev/prod server. |
| Shared card-silhouette component used by 3 render paths | Soul Move #7 (parent) | original | Encodes the "one silhouette, four contexts" rule as a single React component. |

**Landscape entry added by this brief** (Insight-043):

```markdown
### next/og ImageResponse (Vercel / Next.js 15 — bundled, Added 2026-05-13)

- What: Server-side OG/social-card image generation primitive bundled with Next.js
  via `import { ImageResponse } from "next/og"`. Powered by Satori (HTML/CSS to SVG)
  + Resvg (SVG to PNG). 1200×630 default OG dimensions supported out of the box.
- Why we adopt: We already depend on Next.js. The bundled primitive avoids
  introducing a separate image-rendering service. Performance is server-side at
  edge runtime; render time well under 1s for our card layout.
- Boundary: Server route handler only (`opengraph-image.tsx` + custom route
  handlers). No client-side use. Style is a subset of CSS (flex + absolute
  positioning supported; CSS grid not). Custom fonts must be loaded via the
  `fonts` option as ArrayBuffer.
- Used by: Brief 260 (network share + OG + PNG).
```

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/people/[handle]/opengraph-image.tsx` | Create: dynamic OG image route. Reads `networkUsers` by handle via `networkDb`, renders the shared card silhouette at 1200×630 via `ImageResponse`. Handles 404 (returns a generic "Ditto" fallback OG, not a 404 status — broken OG previews are worse than generic ones). Exports `runtime = "edge"` if compatible; otherwise `"nodejs"` (decision deferred to Builder based on `networkDb` compatibility — document the choice in code comment). |
| `packages/web/app/people/[handle]/page.tsx` | Modify: replace placeholder `<meta property="og:image">` from Brief 259 with Next.js metadata API export pointing at the dynamic OG route. Add `<meta name="twitter:card" content="summary_large_image">`. Per parent line 132, `<meta name="robots">` reflects `wantsVisibility`; this brief does NOT change that semantic — only the OG image source. |
| `packages/web/app/api/v1/network/people/[id]/card-png/route.ts` | Create: GET endpoint that returns the iconic card silhouette as a PNG download. Uses the same `ImageResponse` primitive with `Content-Disposition: attachment; filename="ditto-card-{handle}.png"` header. Resolves `[id]` to a user via `networkDb` by handle. Public route — no auth (the card silhouette itself is the share asset). Rate-limited per IP to prevent abuse. |
| `packages/web/components/network/card-silhouette.tsx` | Create: shared React layout component that renders the iconic card silhouette. Used by (a) the in-product `NetworkProfileCardBlock` renderer (Brief 256's existing component delegates to this OR adopts its layout in a follow-up — defer choice to Builder; the constraint is that all three render paths consume the SAME component, not that Brief 256's existing renderer is rewritten in this brief). (b) the OG route, (c) the PNG route. |
| `packages/web/components/network/share-modal.tsx` | Create: Surface F modal component. Backdrop blur (`bg-black/40 backdrop-blur-md`). Live preview LEFT (consumes `card-silhouette.tsx`). RIGHT: three voice cards (QUIET / LOUD / ASK) with radio-style selection; default is LOUD per parent §Surface F line 510 ("● LOUD" highlighted in ASCII). Action row at bottom: `[Copy] [Post to LinkedIn] [Download card PNG]`. |
| `packages/web/components/blocks/network-profile-card.tsx` (Brief 256 renderer) | Modify: wire the `⤴ Share` button click handler to open `share-modal.tsx`. |
| `packages/web/app/api/v1/network/people/[id]/share/route.ts` | Create: POST endpoint that invokes `generate_share_variants` via the audited-route wrapper (Insight-232). Returns `{ quiet, loud, ask }` to the modal. Public route — but only callable for the authenticated user's own card, OR (if the share modal is later surfaced to visitors as a "share Tim's card" affordance) for any visible card; v1 scope is the user's own card only. Brief 261 may revisit. |
| `src/engine/generate-share-variants.ts` | Create: `generateShareVariants({ stepRunId, card, kb }) → { quiet, loud, ask }`. Constructs a tightly-scoped LLM prompt; cites only `public`-visibility KB facts; suppresses budget and on-request/off facts; returns three variants ending in the canonical share URL. Refuses without `stepRunId` outside `DITTO_TEST_MODE` (Insight-180). |
| `src/engine/generate-share-variants.test.ts` | Create: tests for stepRunId enforcement, output shape, suffix-URL assertion, budget-language refusal regex, KB visibility filtering (off and on-request facts MUST NOT appear in any variant), and verify the tool name string matches the directive reference in `network-chat-prompt.ts`. |
| `src/engine/tool-resolver.ts` | Modify: register `generate_share_variants` in `builtInTools` keyed by the exact same string the directive references. Insight-180 silent-failure guard applies. |
| `src/engine/network-chat-prompt.ts` | Modify: extend Greeter directive (expert lane, post-card-emission) to include the `generate_share_variants` tool affordance + a one-line cue describing when the Greeter should call it. ChatContext extension is NOT required — share generation is triggered by user click on `⤴ Share`, not a free-form chat utterance, and is invoked via the HTTP route. The directive line ensures the Greeter knows what the tool returns so it can introduce the modal in-chat ("I drafted three ways to share — pick one or remix"). |
| `docs/landscape.md` | Modify: add the `next/og ImageResponse` entry described in Provenance above. |

## User Experience

- **Jobs affected:** Capture (Greeter composes three voice variants — user-facing capture as conversation), Decide (user picks a voice), Orient (Surface F LIVE preview LEFT shows what they're sharing).
- **Primitives involved:** `NetworkProfileCardBlock` (existing, unchanged), conversation primitive (the Greeter's "here are three ways" message that opens the modal), modal primitive (new Surface F).
- **Process-owner perspective:** The expert user has just landed on their card (Surface C). They click `⤴ Share`. The modal opens with the Greeter's three voices pre-drafted. They pick LOUD, click `[Copy]`, paste into LinkedIn. Or they click `[Post to LinkedIn]` directly — LinkedIn opens with the text prefilled. Or they click `[Download card PNG]` and save the iconic card to their desktop for use in slides / email signature / etc.
- **Interaction states:**
  - **Loading:** Variant generation takes ~2-4s (LLM call). Show three skeleton card placeholders with shimmer animation; "Alex is drafting…" copy under the live preview.
  - **Empty:** Not applicable — the user always has a card by the time they can click Share.
  - **Error:** LLM call fails → show "Alex couldn't draft variants right now. Try again?" with retry button. Modal stays open.
  - **Success:** Three voices populated; user selects one (highlight border + radio fill); action buttons enabled.
  - **Partial:** Not applicable — the tool returns all three or none.
  - **Copy success:** Action button briefly flashes "Copied!" for 1.5s before reverting to "Copy".
  - **LinkedIn:** New tab opens to LinkedIn share intent URL. Modal stays open in case the user wants to also copy or download.
  - **PNG download:** Browser-native download initiated; no extra UI feedback.
- **Designer input:** Designer should be invoked for the modal IA (radio-style voice selection vs. tabs vs. accordion — parent ASCII suggests stacked voice cards with radio selection, which the Builder should implement faithfully); the live-preview re-render behavior (does it re-render as the user remixes the variant text? — parent line 499 says "(re-renders as you type below)" — Builder MUST implement edit-then-re-render); skeleton shimmer treatment during LLM call. **Lightweight Architect-filled check if Designer not invoked:** the modal follows parent brief 254 §Surface F ASCII verbatim — live preview LEFT, three voice cards RIGHT, action row at bottom. Default selection = LOUD (per parent ASCII).

## Acceptance Criteria

How do we verify this work is complete? Each criterion is boolean: pass or fail.

1. [ ] `generate_share_variants(stepRunId, card, kb)` exists in `src/engine/generate-share-variants.ts`; refuses with thrown error when called without `stepRunId` outside `DITTO_TEST_MODE`. Verified by test `generate-share-variants.test.ts`.
2. [ ] Tool name registered in `src/engine/tool-resolver.ts` `builtInTools` is the exact string referenced in `src/engine/network-chat-prompt.ts` directive (Insight-180 silent-failure guard). Verified by an equality assertion in the test file.
3. [ ] Tool returns shape `{ quiet: string, loud: string, ask: string }` — non-empty strings. Verified.
4. [ ] Each variant string ends with `https://ditto.partners/people/{handle}` (exact suffix match). Verified by test with three string assertions.
5. [ ] No variant contains budget language. Test rejects substring matches against the regex `/(\$\d|hourly|monthly|hr rate|budget|\bk\/(month|hour|hr|year))/i` across all three variants. Verified.
6. [ ] Tool reads only KB facts where `visibility = "public"`. Test seeds three facts at `public`, `on-request`, `off` and verifies the `on-request` and `off` text never appears in any of the three returned variants.
7. [ ] Shared `card-silhouette.tsx` component exists at `packages/web/components/network/card-silhouette.tsx` and is consumed by (a) the share modal live preview, (b) the OG route, (c) the PNG route, AND (d) the Brief 256 `NetworkProfileCardBlock` renderer (either by direct import or via a verified import chain from it — the in-product block MUST NOT remain unlinked to `card-silhouette.tsx`, since Soul Move #7 mandates one silhouette across four contexts). Verified by import-graph assertion (a Vitest test or grep that asserts all four render paths reach the same module path).
8. [ ] `packages/web/app/people/[handle]/opengraph-image.tsx` exists and returns a 1200×630 `ImageResponse` for a known existing handle. Verified by an integration test or by Playwright fetching `/people/timhgreen/opengraph-image` and asserting `200 OK` + `image/png` content type + dimensions.
9. [ ] `packages/web/app/people/[handle]/page.tsx` sets `<meta property="og:image">` pointing at the dynamic OG route AND `<meta name="twitter:card" content="summary_large_image">`. Verified by Playwright/Vitest snapshot of the head tags or by direct HTML assertion.
10. [ ] OG route handles 404 gracefully (handle does not exist) by returning a generic "Ditto" fallback OG image at HTTP 200 — not a 404 status. Verified by test fetching `/people/handle-that-does-not-exist/opengraph-image` and asserting `200 OK` + a fallback signature (e.g. a known marker pixel or a generic-fallback-flag in render).
11. [ ] PNG download endpoint at `packages/web/app/api/v1/network/people/[id]/card-png/route.ts` returns `200 OK` + `image/png` content type + `Content-Disposition: attachment; filename="ditto-card-{handle}.png"` header. Verified.
12. [ ] Share modal renders from the `⤴ Share` button on `NetworkProfileCardBlock`. Backdrop blur present (`bg-black/40 backdrop-blur-md` class). Live preview LEFT renders the same `card-silhouette` component used by OG. Three voice cards (QUIET / LOUD / ASK) RIGHT, default-selected card is LOUD. Verified by component test or Playwright test.
13. [ ] Action row contains exactly `[Copy] [Post to LinkedIn] [Download card PNG]` buttons. Copy writes the selected variant to clipboard (mocked `navigator.clipboard.writeText` in test). LinkedIn opens `https://www.linkedin.com/sharing/share-offsite/?url={encoded canonical share URL}` in a new tab. Download triggers a request to the PNG endpoint.
14. [ ] **Live-preview re-render on edit.** When the user edits the selected variant text in the modal textarea, the live-preview LEFT re-renders to show the edited copy (parent line 499: "re-renders as you type below"). Verified by component test simulating user input on the variant textarea and asserting the preview's text node updates.
15. [ ] Phoenix gradient appears at most twice per OG render and at most twice per PNG render. Verified by inspecting the rendered SVG/HTML structure passed to `ImageResponse` (two gradient nodes max).
16. [ ] Italic Instrument Serif applies only to the narrative verb (one word). Verified by snapshot of the rendered card-silhouette JSX/SVG showing the italic-class attribute appears on exactly one text node per card.
17. [ ] `docs/landscape.md` contains the new `next/og ImageResponse` entry. Verified by grep.
18. [ ] Visual identity across the four contexts. Manual verification matrix in Smoke Test below — Builder and Reviewer both run it before approval. (Boolean: all four contexts produce visually-identical card silhouettes at their native resolutions, modulo rendering aliasing.)

## Review Process

How to validate the work after completion:

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + parent brief 254 (§Surface F, §Soul Move #7, §Design Rules) + `docs/insights/180-steprun-guard-for-side-effecting-functions.md`.
2. Review agent checks:
   - All 18 acceptance criteria.
   - Layer alignment: Layer 6 (human surface — share modal) + Layer 2 (agent — `generate_share_variants` self-tool with stepRunId guard). No Layer 1 process changes.
   - Provenance: `next/og` landscape entry present.
   - Composition: shared card-silhouette component consumed by all three render paths (not duplicated).
   - Trust model: tool refuses without stepRunId; no auto-execution paths.
   - Side-effect guard (review-checklist item 13): `generate_share_variants` enumerated in parent §Constraints and verified by test.
   - Reference doc accuracy (review-checklist item 12): landscape.md updated.
   - Engine boundary: `card-silhouette.tsx` and `share-modal.tsx` live in `packages/web/`, not `packages/core/`. Core defines the block; product renders it.
   - Landscape coverage (review-checklist item 15): `next/og` evaluated.
3. Present brief + review findings to human for approval before Builder starts.

## Smoke Test

Manual matrix proving the brief is working end-to-end.

```bash
# 0. Pre-requisite: a real expert handle exists in dev DB (e.g. "timhgreen").
#    If not, claim one via the existing expert-intake flow.

# 1. Verify tool & test pass.
pnpm vitest run src/engine/generate-share-variants.test.ts
# EXPECT: all tests pass, including stepRunId-rejection, suffix-URL,
# budget-rejection, visibility-filtering, tool-name-parity.

# 2. Type-check.
pnpm run type-check
# EXPECT: zero errors.

# 3. Start dev.
pnpm --filter @ditto/web dev

# 4. Open the user's card in-product (Surface C).
open http://localhost:3000/network?mode=expert
# Walk through expert intake until card emits; click "⤴ Share" on the card.
# VERIFY:
#   - Modal opens with backdrop blur.
#   - Live preview LEFT renders the iconic card silhouette.
#   - Three skeleton variant cards animate (~2-4s) while "Alex is drafting…"
#     renders under the preview.
#   - Three variants populate: QUIET, LOUD, ASK. LOUD is highlighted by default.
#   - Each variant text ends with "https://ditto.partners/people/{handle}".
#   - No variant text mentions "$", "rate", "budget", "hourly", "monthly".

# 5. Test Copy action.
# Click [Copy]. VERIFY: button flashes "Copied!"; pasting into a text editor
# yields the LOUD variant.

# 6. Test LinkedIn action.
# Click [Post to LinkedIn]. VERIFY: new tab opens to
# https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fditto.partners%2Fpeople%2F{handle}

# 7. Test PNG download.
# Click [Download card PNG]. VERIFY: browser downloads ditto-card-{handle}.png.
# Open the PNG: it is 1200×630 (or per-spec dimensions), shows the iconic card
# silhouette identical to the in-product preview.

# 8. Test dynamic OG route directly.
curl -I http://localhost:3000/people/{handle}/opengraph-image
# EXPECT: 200 OK, Content-Type: image/png.
open http://localhost:3000/people/{handle}/opengraph-image
# VERIFY: rendered image is visually identical to the downloaded PNG (the
# silhouette is one component used by both).

# 9. Test OG 404 fallback.
curl -I http://localhost:3000/people/nonexistent-handle/opengraph-image
# EXPECT: 200 OK, Content-Type: image/png (generic fallback, not a 404).

# 10. Test LinkedIn preview (real-world).
# Paste https://ditto.partners/people/{handle} (production OR a Vercel preview
# URL — localhost will not work because LinkedIn fetches from public internet)
# into LinkedIn's "Start a post" composer.
# VERIFY: LinkedIn link preview renders the iconic card silhouette image
# matching the OG route.

# 11. Visual identity matrix — Soul Move #7.
# Open ALL FOUR contexts side-by-side:
#   (a) in-product chat block,
#   (b) OG route at /people/{handle}/opengraph-image,
#   (c) downloaded PNG,
#   (d) LinkedIn preview from step 10.
# VERIFY: all four show the same silhouette. Drift between any two is a defect.
```

## After Completion

1. Update `docs/state.md` with what changed: Brief 260 complete; share modal + OG + PNG live; `card-silhouette.tsx` is now the single source of truth for the iconic card shape.
2. Update `docs/roadmap.md` row 803 (Brief 260) status to `complete` with deliverable path.
3. Update `docs/briefs/254-network-two-sided-conversational-front-door.md` table row 260 to `complete`.
4. Move this brief to `docs/briefs/complete/` per the established convention.
5. Phase retrospective: did the Soul Move #7 four-context identity hold up in practice? If silhouette drift emerged between contexts, capture as an insight.
6. ADR consideration: if a layout change had to be made to accommodate OG rendering (e.g. Satori subset of CSS forced a flex restructure), document the chosen pattern as an ADR — "OG-Renderer Layout Constraints for Iconic Card." Likely yes if any flex/grid swap was needed. Likely no if the existing layout rendered cleanly.

## Reference Docs

This brief was authored against the following sources, each verified current at 2026-05-13. If a Builder finds any of these stale at implementation time, FLAG and resolve before coding (Insight-043).

| Doc | Status at 2026-05-13 | Why it matters |
|-----|----------------------|----------------|
| `docs/briefs/254-network-two-sided-conversational-front-door.md` | parent, current | §Surface F, §Soul Move #7, §Design Rules — all locks this brief honors |
| `packages/core/src/content-blocks.ts` (lines 68-85) | current | `NetworkProfileCardBlock` shape with `shareUrl` + `ogImageUrl` fields already declared |
| `packages/core/src/content-blocks.ts` (lines 287-306) | current | `AuthorizationRequestBlock.costLabel` field present (Brief 256); NOT touched by this brief |
| `packages/core/src/db/network/schema.ts` | current | `networkUsers.handle` + `networkUserKbFacts.visibility` available for share-variant generation |
| `src/engine/tool-resolver.ts` | current | `builtInTools` registry; new entry added by this brief |
| `src/engine/network-chat-prompt.ts` | current | Greeter directive structure; new tool affordance added by this brief |
| `packages/web/package.json` | current | `next@^15.3.3` confirms `next/og` `ImageResponse` available |
| `docs/insights/180-steprun-guard-for-side-effecting-functions.md` | active | applies to `generate_share_variants` |
| `docs/insights/043-knowledge-maintenance-at-point-of-contact.md` | active | landscape entry added per Architect's reference-doc duty |
| `docs/insights/232-audited-http-route-wrapper-step-run-for-guarded-tools.md` | active | applies to `/api/v1/network/people/[id]/share` route |
| `docs/landscape.md` | needs entry — added by this brief | `next/og ImageResponse` landscape evaluation per Architect constraint |

**Reference docs updated** (during design):
- `docs/landscape.md` — new `next/og ImageResponse` entry added (composition pattern: depend, already in tree via Next.js 15).
- `docs/briefs/254-network-two-sided-conversational-front-door.md` — row 260 status update to `design-ready` after this brief lands.

**Reference docs checked** (no drift found):
- `docs/adrs/041-agency-model-three-layer-ontology.md` — Brand/Greeter/Self separation preserved. Share modal is a Greeter affordance (the user's representative drafting their share copy); Self memory is not touched.
- `docs/adrs/048-network-tier-postgres-migration.md` — share-variant generation reads `networkDb`; tier boundary respected.
- `packages/core/src/content-blocks.ts` (line 297, `costLabel?: string | null`) — NOT touched by this brief; Brief 261 populates it.
