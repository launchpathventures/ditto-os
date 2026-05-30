# Brief 290: Share Studio + Channel Variants

**Date:** 2026-05-19
**Status:** COMPLETE (2026-05-19) — implemented, fresh-context Dev Reviewer APPROVE (0 fail/0 flag, 4 non-blocking minors), then `/dev-review` 5-pass post-review surfaced 6 minor/nit items all fixed (close-time state reset, story-card-png Cache-Control, full WAI-ARIA tabs keyboard pattern, 2 clarifying comments). Gate green: root+core type-check 0, 41/41 targeted vitest, 1/1 Playwright. Insight-204 recurrence noted (effect-deps async stomp).
**Depends on:** Brief 272 (Member Signal); Brief 260 (single-channel share modal, OG, PNG); parent Brief 277
**Unlocks:** Sub-brief 291 (Attribution + Visitor Conversion); Sub-brief 292 (Outcome-Led Share + Useful Feedback)

## Goal

- **Roadmap phase:** Phase 14 — Network Agent.
- **Capabilities:** Member-facing share authoring loop — turn the approved Member Signal into channel-specific, voice-appropriate, editable share variants for LinkedIn, X, Instagram story, email signature, and website badge, with no autopost.

## Context

Brief 260 shipped the single-channel share modal (one set of `{quiet, loud, ask}` variants, one 1200×630 OG render, one PNG download route, copy-only footer). Brief 277 expands the loop across five channels with channel-aware copy, voice constraints per channel, and channel-specific asset rendering. This sub-brief carries the member-facing authoring loop. The visitor conversion (Sub-brief 291) and outcome-led consent flow (Sub-brief 292) build on the URLs and Studio-mode entry surface this sub-brief ships.

The parent brief (277) carries the Q1–Q9 rulings, side-effect matrix, and constraint set that this sub-brief implements. Read the parent first.

## Objective

After approving a Member Signal, a member opens a Share Studio with channel tabs. The active channel renders first via a single-channel LLM call; other channels lazy-generate on first tab click. Each channel surface respects channel-specific copy bounds (LinkedIn long-form, X ≤280, IG visual-first with one-line caption, email-sig one quiet line, badge static text) and a channel × voice matrix that governs which of `{quiet, loud, ask}` apply. The Instagram tab renders a 1080×1920 portrait card. The website badge is a pure `<a> + <img>` snippet. The email signature is plain text by default, with an optional server-rendered HTML-safe table variant. Every post button is offline (`navigator.clipboard`) or offsite-intent (open share URL in new tab) — never auto-post.

## Non-Goals

- No native social autopost (parent constraint).
- No mass invite or address-book import (parent constraint).
- No automatic DMs (parent constraint).
- No attribution writes, visitor-side cookies, or CTA inference — owned by Sub-brief 291.
- No outcome-led share variant, no consent flow, no `outcome-share` scrub surface — owned by Sub-brief 292.
- No Bluesky / Threads / WhatsApp / Substack-note channels.
- No Studio open analytics beyond the existing `share_generated` audit class extension.
- No team-member sharing permission UI (Nadia-deferred per parent).
- No replacement of the `card-png` route's in-memory rate-limit map (Brief 282's `checkRateLimit` substrate exists, but in-scope replacement is deferred — `card-png/route.ts:18` stays as-is here, flagged for follow-up).

## Inputs

1. `docs/briefs/277-share-loop-public-profile-conversion.md` — **parent brief; required reading.** Carries Q1, Q6, Q7, Q8, Q9 rulings, side-effect matrix row 1, and channel × voice doctrine.
2. `docs/briefs/272-member-signal-onboarding-research-provenance.md` — approval gate that opens Studio.
3. `docs/briefs/260-network-share-modal-og-and-png.md` — existing share primitive (do not replace; extend).
4. `docs/research/277-share-loop-public-profile-conversion.md` — Researcher report; §W-1 (channel-branched variant gen), §W-2 (Studio shell), §W-3 (IG 1080×1920), §W-10 (story card asset), §W-11 (badge/email-sig snippets), §CC-3 (rate-limit substrate).
5. `docs/research/277-share-loop-public-profile-conversion-ux.md` — Designer UX spec; §Surface 1 (Share Studio modal), §Channel × Voice Matrix, §Email HTML Safety Contract, §Interaction States (Studio).
6. `src/engine/generate-share-variants.ts` — existing single-channel variant generator (extend with `channel` param; lines 22–28 define the input shape).
7. `packages/web/components/network/share-modal.tsx` — existing single-channel modal (modify to launch Studio mode).
8. `packages/web/components/network/card-silhouette.tsx` — `NetworkCardSilhouette` (line 54), `NetworkCardOgFrame` (line 269); extend with `storyMode` per Q6.
9. `packages/web/app/people/[handle]/opengraph-image.tsx` — existing 1200×630 OG render (do not change; new story-card route mirrors its shape).
10. `packages/web/app/api/v1/network/people/[id]/card-png/route.ts` — existing 1200×630 download route (pattern source for new story-card route).
11. `packages/web/app/api/v1/network/people/[id]/share/route.ts` — existing route (extend with `channel` param; `stepRunId` bypass rejection already in place at line 38–40).
12. `src/engine/network-step-run.ts` — `createNetworkLaneStepRun` (used in existing share route line 82).
13. `src/engine/network-abuse-controls.ts` — `checkRateLimit` (used in existing share route line 49; rename limit per Q9).
14. `src/engine/network-privacy-scrubber.ts` — `scrubForSurface({surface: "share", ...})` (pre-pass already in `generateShareVariants:139`).
15. `src/engine/member-signal-review.ts` — `applyApprovedPublicClaimsToCard` + `loadApprovedPublicMemberSignalClaims` (used in existing share route lines 11, 88–89).
16. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — guard already in place via `requireServerMintedNetworkLaneStepRunId`; extend per channel.
17. `docs/insights/232-audited-http-route-wrapper-step-run-for-guarded-tools.md` — wrapper pattern already in place; per-channel POSTs each mint their own wrapper.
18. `docs/insights/239-validate-input-shape-before-minting-step-runs.md` — `channel` allow-list validated BEFORE `createNetworkLaneStepRun`.
19. `docs/insights/211-no-self-http-from-engine-context.md` — variant gen stays in-engine; route is thin adapter (already correct shape).
20. `src/engine/network-abuse-controls.ts:21-31,117,132` — closed `networkRateLimitNameValues` enum + `DEFAULT_POLICIES` + `requireLimitName`. This sub-brief registers all three Brief 277 rate-limit names here (parent Q9).

## Constraints

- **Inherits every constraint from parent Brief 277.** Do not restate; read the parent's Constraints section.
- **`channel` allow-list validation runs BEFORE `createNetworkLaneStepRun`** (Insight-239). Allowed: `"linkedin" | "x" | "instagram" | "email-signature" | "website-badge"`. Unknown channel → HTTP 400 `invalid_channel` before any wrapper-run audit record is appended.
- **Channel × voice matrix is normative.** LinkedIn supports all three voices (`quiet`, `loud`, `ask`); X supports `loud` + `quiet` (truncated to ≤280 chars on render); Instagram exposes one-line `quiet` only (asset is the post); email-signature exposes `quiet` only (one line); website-badge is static text (no voice selector). Matrix lives in Designer spec §Channel × Voice Matrix — Builder reads from there.
- **`stepRunId` bypass-rejection covers falsy values** per Insight-180 silent-failure pattern. The existing share route's `Object.prototype.hasOwnProperty.call(body, "stepRunId")` check at line 38 already covers `null`/`undefined`/`""`. Per-channel POST inherits this; verify in new test.
- **Per-channel POSTs each mint their own wrapper-run** (Insight-232). One `share_studio_variant_generated` audit event per channel POST. No batching.
- **No engine self-HTTP roundtrip** (Insight-211). `generateShareVariants` stays in `src/engine/`; the share route is the only HTTP adapter and invokes it in-process.
- **Public claims only.** `scrubForSurface({surface: "share", viewerContext: {viewerType: "visitor"}})` runs before LLM call (existing pattern at `generate-share-variants.ts:139`). `SHARE_BUDGET_LANGUAGE_PATTERN` test still fires post-generation (existing at line 148).
- **No autopost, no auto-DM.** Footer actions: `Copy` (`navigator.clipboard.writeText`), `Open in [channel]` (`window.open(intentUrl, "_blank", "noopener,noreferrer")`), `Download` (for Instagram 1080×1920 PNG). Never any fetch to a third-party post endpoint.
- **No `aspect-ratio` CSS in Satori-rendered components** (parent constraint, Vercel/Satori issue #264). `storyMode` on `NetworkCardOgFrame` uses explicit pixel dimensions on every `<img>`; Flexbox-only layout.
- **Website badge HTML cannot execute arbitrary user text.** Text appears only as URL-encoded `href` (handle is path segment, escaped server-side) or `alt` (server-escaped, fixed string). No `<script>`, no `<iframe>`, no inline event handlers.
- **Email signature HTML safety is server-rendered + server-escaped only.** No client-side template interpolation; no `<script>/<style>/<iframe>/<form>/<input>/<video>`. The HTML variant is OPTIONAL — plain-text is the default and satisfies AC 12 alone. Builder may defer HTML variant if effort outpaces value (parent §Open for Sub-Brief Builders).
- **Switch the share route's rate-limit name to `share-studio-variant`** per Q9 ruling. The share route's `checkRateLimit` call at `share/route.ts:50` switches from `"invite-send"` to `"share-studio-variant"`; `invite-send` is **NOT** removed — it remains a registered name for its other callers. **Closed-enum constraint (parent Q9):** `networkRateLimitNameValues` at `network-abuse-controls.ts:21-31` is a closed `as const` union and `DEFAULT_POLICIES` at line 117 is keyed `Record<NetworkRateLimitName, …>`; an unregistered name fails `pnpm run type-check` and throws `unknown_network_rate_limit` at `requireLimitName` (line 132). **Sub-brief 290 ships first and owns registering all three Brief 277 names** in BOTH `networkRateLimitNameValues` and `DEFAULT_POLICIES`: `share-studio-variant` `{ max: 60, windowMs: 3_600_000 }`, `share-attribution` `{ max: 120, windowMs: 3_600_000 }`, `outcome-share-consent` `{ max: 10, windowMs: 3_600_000 }`. Sub-briefs 291 and 292 depend on this registration and must NOT re-edit the enum (avoids the merge collision the closed enum would otherwise force).
- **No Studio-open analytics beyond audit events.** Audit chain is the observability path. No separate analytics emit.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Channel-branched system prompt (POST_STRUCTURE_INSTRUCTIONS / EXAMPLES per channel constants) | github.com/langchain-ai/social-media-agent | pattern | Cleanest external reference for per-channel prompt registry; do NOT import LangChain. |
| Pure `<a> + <img>` badge embed | buymeacoffee.com/brand | pattern | Lowest host-page CSP friction; no XSS surface by construction. |
| Email-signature cross-client safe subset (inline-styled `<table>`) | emailsignaturerescue.com, dev-wp.co.uk | pattern | Static knowledge of what survives Gmail/Outlook/Apple Mail rendering. |
| Three-voice triplet (`quiet`, `loud`, `ask`) | Brief 260 `generate-share-variants.ts:16` | adopt | Existing primitive; channel matrix selects which subset applies per channel. |
| Canonical iconic-card silhouette | Brief 254 Soul Move #7 + `card-silhouette.tsx:54,269` | adopt | One iconic surface across in-product card / OG / IG story; `storyMode` adds the third dimension. |
| `next/og` `ImageResponse` rendering | `next/og` (Brief 260) | depend | Existing render substrate; new dimensions only (1080×1920). |
| Wrapper-step-run lane helper | `src/engine/network-step-run.ts` (Brief 258 + Insight-232) | adopt | Existing helper; per-channel POST each mints. |
| Audit event substrate | `src/engine/network-audit.ts` (Brief 282) | adopt + extend | New `share_studio_variant_generated` event class. |
| Multi-instance rate limit | `src/engine/network-abuse-controls.ts` (Brief 278/282) | adopt | Canonical limiter; rename limit name per Q9. |
| Public-claim scrubber pre-pass | `src/engine/network-privacy-scrubber.ts:scrubForSurface` | adopt | Already in `generate-share-variants.ts:139`; extend invariant per channel. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/generate-share-variants.ts` | **Modify.** Add `channel: ShareChannel` to `GenerateShareVariantsInput`. Add `ShareChannel` type union (`"linkedin" \| "x" \| "instagram" \| "email-signature" \| "website-badge"`). Branch the system prompt + max-token budget per channel (channel-prompt registry shape; either single function with prompt-branch table or separate `*ShareSystemPrompt` constants — Builder discretion per parent §Open for Sub-Brief Builders). Channel-specific output sanitization: X truncated to ≤280 incl. URL, IG caption to one line, email-sig to one line, badge returns fixed text (no LLM call needed for badge — short-circuit). Public-claim scrubber pre-pass + budget-language test unchanged. |
| `src/engine/generate-share-variants.test.ts` | **Modify.** Per-channel tests: each channel returns appropriate voice subset; X variants ≤280; IG one line; email-sig one line; badge short-circuits without LLM call; budget language still rejected post-gen on any channel; `stepRunId` falsy still rejected via `requireServerMintedNetworkLaneStepRunId`. |
| `src/engine/network-abuse-controls.ts` | **Modify.** Extend the closed `networkRateLimitNameValues` `as const` union (line 21–31) with all three Brief 277 names — `"share-studio-variant"`, `"share-attribution"`, `"outcome-share-consent"` — and add matching entries to `DEFAULT_POLICIES` (line 117) with the parent-Q9 policies: `share-studio-variant` `{ max: 60, windowMs: 3_600_000 }`, `share-attribution` `{ max: 120, windowMs: 3_600_000 }`, `outcome-share-consent` `{ max: 10, windowMs: 3_600_000 }`. Do NOT remove `"invite-send"`. This sub-brief owns the registration for all three names so 291/292 do not collide on the closed enum (parent Q9). |
| `packages/web/app/api/v1/network/people/[id]/share/route.ts` | **Modify.** Accept `channel` field in body. Validate `channel` against `VALID_CHANNELS` set BEFORE `createNetworkLaneStepRun` (Insight-239) → 400 `invalid_channel`. Switch the `checkRateLimit` name from `"invite-send"` to `"share-studio-variant"` (Q9; `invite-send` retained for other callers — name is switched, not renamed). Pass `channel` into `generateShareVariants`. Audit event class becomes `share_studio_variant_generated`; `metadata` includes `{handle, channel, variantKeys, approvedPublicClaimCount}`. Existing `stepRunId` bypass-rejection at line 38 unchanged. |
| `packages/web/app/api/v1/network/people/[id]/share/route.test.ts` | **Modify.** Add tests: each `channel` value returns 200 with expected variant shape; unknown `channel` returns 400 `invalid_channel`; rate-limit hit returns 429; `stepRunId` falsy values (`""`, `null`, `undefined` as explicit body key) still rejected; missing `channel` defaults to `"linkedin"` for backward compat with Brief 260 callers OR returns 400 (Builder picks one consistent with Brief 260 call sites; document the choice). |
| `packages/web/components/network/card-silhouette.tsx` | **Modify.** Extend `NetworkCardOgFrame` (line 269) with `storyMode?: boolean` prop. When `storyMode` true: 1080×1920 portrait layout, explicit pixel dimensions on every `<img>`, Flexbox-only (no `aspect-ratio`). When `storyMode` false: existing 1200×630 behavior unchanged. `NetworkCardSilhouette` may or may not need internal extension — Builder discretion. |
| `packages/web/app/api/v1/network/people/[id]/story-card-png/route.ts` | **Create.** Mirror of `card-png/route.ts` for 1080×1920. Same load path: `loadCard` → `applyApprovedPublicClaimsToCard` → `ImageResponse(NetworkCardOgFrame storyMode, {width: 1080, height: 1920})`. Same `Content-Disposition: attachment; filename="ditto-story-{handle}.png"`. Same rate-limit pattern as `card-png` (parent: deferred substrate swap). |
| `packages/web/components/network/share-modal.tsx` | **Modify.** Accept `mode?: "compact" \| "studio"` prop (default `"compact"` preserves Brief 260 callers). In `studio` mode: render channel-tab strip (LinkedIn / X / Instagram / Email signature / Website badge), per-tab variant pane, per-tab voice selector gated by channel × voice matrix, per-tab footer actions (Copy + channel-appropriate offsite-intent button + Download for IG). Active-channel-first POST on open; lazy-POST on tab click; client-side cache keyed by `{channel}` for the Studio open session (parent Q7 caching rule). |
| `packages/web/components/network/share-modal.test.tsx` | **Modify.** Compact-mode tests unchanged. Studio-mode tests: opens to LinkedIn tab; POST fires for LinkedIn only on open; X tab click triggers X POST; cache prevents re-POST on second tab visit; Copy button calls `navigator.clipboard.writeText`; channel × voice matrix gates which voice tabs render. |
| `packages/web/components/network/instagram-story-asset.tsx` | **Create.** Wrapper that renders the IG tab pane: Download button → fetches `/api/v1/network/people/{handle}/story-card-png`; one-line caption with copy-to-clipboard; "Use as link sticker" instruction text. No autoposting. |
| `packages/web/components/network/email-signature-snippet.tsx` | **Create.** Two-tab view: Plain text (default — selectable text block with copy-to-clipboard) and HTML (server-rendered fragment fetched from new asset route OR inlined from a server component). Plain-text variant is the default; HTML is OPTIONAL — if Builder defers, AC 12 is still satisfied by plain text. |
| `packages/web/components/network/website-badge-snippet.tsx` | **Create.** Renders a code block containing the pure `<a> + <img>` snippet, with copy-to-clipboard. Server-renders the snippet so the handle appears URL-encoded; alt text fixed and server-escaped. |
| `packages/web/app/network/signal/page.tsx` OR equivalent post-approval entry point | **Modify.** After Member Signal approval, open `ShareModal` in `mode="studio"`. Compact mode call sites (existing Brief 260 / Brief 254 ones) remain unchanged. |
| `e2e/network/share-studio.spec.ts` | **Create.** Playwright smoke: log in test member → approve a signal → Studio opens to LinkedIn tab with variant rendered → click X tab → X variant renders ≤280 chars → click IG tab → Download fetches PNG with `Content-Disposition` attachment → click email-sig tab → plain text variant copies → click badge tab → snippet copies; verify no fetch to any third-party post endpoint occurs at any point. |

## User Experience

- **Jobs affected:** Define (Studio open kicks the share-authoring loop), Delegate (member dispatches the channel-appropriate copy/asset), Decide (member picks voice + channel + edit), Curate (per Insight-238 provisional ruling — member shapes what represents them publicly; functional design identical if human declines and we re-label as Define + Decide).
- **Primitives involved:** Existing share modal (compact mode preserved); new Studio mode (channel-tab strip + per-tab pane); `NetworkProfileCardBlock` (rendered at 1200×630 OG and 1080×1920 IG-story dimensions); copy buttons; offsite-intent buttons; download buttons.
- **Process-owner perspective:** A non-technical observer reading a Share Studio run sees, in order: signal approved → Studio opened → LinkedIn variant generated (first call) → member switched to X → X variant generated (second call) → member edited X variant → member copied → Studio closed. No autopost. Each variant generation is a single audit row.
- **Interaction states:** Designer spec §Interaction States (Studio) — empty (no variants yet) / loading-active-channel / loading-lazy-channel / success-channel / error-channel (one failed, others ok) / error-all (entire Studio failed) / copied (transient).
- **Designer input:** `docs/research/277-share-loop-public-profile-conversion-ux.md` (CLEAN-PASS 2026-05-19) §Surface 1, §Channel × Voice Matrix, §Email HTML Safety Contract, §Interaction States.

## Acceptance Criteria

1. [ ] After Member Signal approval, the post-approval entry point opens `ShareModal` in `mode="studio"`; existing compact-mode call sites continue to work unchanged.
2. [ ] `generateShareVariants` accepts a `channel` parameter; valid values are `"linkedin" | "x" | "instagram" | "email-signature" | "website-badge"`; unknown values cause the share route to return HTTP 400 `invalid_channel` BEFORE `createNetworkLaneStepRun` runs (Insight-239 — verified by test that no wrapper-run audit record is appended on rejection).
3. [ ] Per-channel POST behavior: opening Studio fires one POST for the active channel (LinkedIn default); each other channel POSTs on its first tab click; switching back to a cached channel does NOT re-POST (Q7 caching).
4. [ ] All three Brief 277 rate-limit names — `share-studio-variant`, `share-attribution`, `outcome-share-consent` — are registered in BOTH `networkRateLimitNameValues` AND `DEFAULT_POLICIES` in `src/engine/network-abuse-controls.ts` with the parent-Q9 default policies; `invite-send` remains registered (not removed); `pnpm run type-check` passes with the extended closed union. The share route switches its `checkRateLimit` call from `"invite-send"` to `"share-studio-variant"`; a rate-limit hit returns HTTP 429 with a `retry-after` header. (Sub-brief 290 owns this registration for all three names; 291/292 depend on it and do not re-edit the enum.)
5. [ ] Channel × voice matrix is enforced in the Studio UI: LinkedIn shows quiet/loud/ask tabs; X shows loud + quiet (variants ≤280 chars including URL); Instagram shows one-line quiet caption only; email-signature shows one-line quiet only; website-badge shows no voice selector (static text).
6. [ ] Public-claim-only invariant holds per channel: scrubber pre-pass runs in `generateShareVariants` (existing pattern); `SHARE_BUDGET_LANGUAGE_PATTERN` test fires post-generation and throws on any budget language; test asserts no `on-request` / `off` / archived KB fact appears in any channel variant.
7. [ ] No autopost / auto-DM: every Post-style button opens an offsite-intent URL via `window.open(url, "_blank", "noopener,noreferrer")` or copies text via `navigator.clipboard.writeText`; the Playwright spec asserts no third-party post-endpoint fetch occurs at any point in the Studio flow.
8. [ ] Instagram tab renders 1080×1920 portrait: `NetworkCardOgFrame` accepts `storyMode` prop; new route `GET /api/v1/network/people/[id]/story-card-png` returns `image/png` at width 1080 / height 1920 with `Content-Disposition: attachment; filename="ditto-story-{handle}.png"`; one-link-sticker instruction text renders in the tab pane.
9. [ ] Website-badge snippet is pure `<a> + <img>` with: `href="https://ditto.partners/people/{URL-encoded handle}?ref=badge"`, `target="_blank"`, `rel="noopener"`, `<img>` with fixed `width="200" height="40"` and server-escaped `alt="Available through Ditto"`. Snippet contains no `<script>`, no `<iframe>`, no inline event handlers; test asserts the snippet is byte-identical regardless of member's `name`, `oneLineRole`, or `narrativeMd` content.
10. [ ] Email-signature plain-text variant is one quiet line ending with the canonical share URL; copy-to-clipboard works; HTML variant is OPTIONAL — if shipped, it is a server-rendered inline-styled `<table>` fragment with NO `<script>/<style>/<iframe>/<form>/<input>/<video>` tags (test asserts the rendered HTML string does not contain any of those tag opens). Builder may defer HTML variant per parent §Open for Sub-Brief Builders.
11. [ ] Brief 260 single-channel modal (compact mode), the 1200×630 OG render at `packages/web/app/people/[handle]/opengraph-image.tsx`, and the existing `card-png` download route all continue to behave unchanged (regression test: existing `share-modal.test.tsx` compact-mode tests pass without modification; existing OG image is byte-stable for a fixed test card; `card-png` route returns 1200×630 image).

## Review Process

1. Spawn review agent (fresh context) with this sub-brief + parent Brief 277 + `docs/architecture.md` + `docs/review-checklist.md` + `docs/research/277-share-loop-public-profile-conversion-ux.md` + `docs/research/277-share-loop-public-profile-conversion.md`.
2. Review agent checks:
   - Every parent constraint that applies to this sub-brief is honored (autopost prohibition, public-claim-only, channel × voice matrix, `stepRunId` guard, Insight-239 pre-mint validation, no engine self-HTTP, no `aspect-ratio` in Satori components, badge `<a>+<img>` shape, email-sig HTML-safety subset).
   - All file references in Work Products are valid paths in the current repo; no invented files.
   - ACs are boolean, testable, and cover this sub-brief's ACs 1–11 plus the tests/Playwright the parent AC list assigns to Sub-brief 290.
   - No leakage into Sub-brief 291 (attribution / visitor) or 292 (outcome / consent) scope.
3. Present sub-brief + review findings to human for approval.

## Smoke Test

```bash
pnpm run type-check
pnpm vitest run src/engine/generate-share-variants.test.ts
pnpm vitest run packages/web/app/api/v1/network/people/\[id\]/share/route.test.ts
pnpm vitest run packages/web/components/network/share-modal.test.tsx
pnpm vitest run packages/web/components/network/card-silhouette-imports.test.ts
pnpm exec playwright test e2e/network/share-studio.spec.ts
```

Manual smoke (web):
1. Log in as a member with an approved Member Signal in a sandbox account.
2. Trigger Studio open (post-approval entry point).
3. Confirm LinkedIn tab renders with a variant within ~2s; no other channel POST has fired (network panel).
4. Click X tab — POST fires; variant renders; assert text ≤280 chars including the trailing URL.
5. Click Instagram tab — POST fires; one-line caption renders; click Download — 1080×1920 PNG downloads as `ditto-story-{handle}.png`.
6. Click Email signature tab — POST fires; plain-text variant renders; Copy works.
7. Click Website badge tab — snippet renders as `<a> + <img>` text in a code block; Copy works.
8. Switch back to LinkedIn — no second POST fires (cache).
9. Edit a variant; copy; verify clipboard content matches edited text.
10. Confirm in the audit-events table: one `share_studio_variant_generated` row per channel POST, each anchored to its own wrapper-run audit record (the per-POST `createNetworkLaneStepRun` JSONL append).

## After Completion

1. Update `docs/state.md` rolling log with Sub-brief 290 completion.
2. Update `docs/roadmap.md` row 277 status.
3. Hand off to Sub-brief 291 build (visitor surface depends on Studio emitting `?ref=` URLs — Sub-brief 290 already emits these via the share URL pattern; 291 enriches the inbound conversion path).
4. If the channel-prompt registry shape (per-channel `*ShareSystemPrompt` constants + composer) proves clean, consider lifting to a shared `src/engine/prompt-registry.ts` if Brief 278+ surfaces similar multi-channel composition needs (deferred — do not pre-extract).
5. If the `card-png/route.ts:18` in-memory rate-limit map proves to be a follow-up cleanup target alongside the new `story-card-png` route, log an entry in `docs/state.md` rolling log proposing the substrate swap in a follow-up brief; do not in-scope it here.
