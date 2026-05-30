# Brief 277: Share Loop and Public Profile Conversion (Parent / Design Overview)

**Date:** 2026-05-19
**Status:** draft (architect synthesis — pending human approval)
**Depends on:** Brief 272; Brief 260; Brief 259; Brief 271
**Unlocks:** Brief 278 (Trust/Privacy/Admin parent); sub-briefs 290, 291, 292
**Split into:** Sub-brief 290 (Share Studio + Channel Variants); Sub-brief 291 (Attribution + Visitor Conversion); Sub-brief 292 (Outcome-Led Share + Useful Feedback)

## Goal

- **Roadmap phase:** Phase 14 — Network Agent.
- **Capabilities:** Turn the approved Member Signal into a recognition-driven, multi-channel share loop and convert visitors who arrive at `/people/[handle]` into the right next flow (own signal / request / intro / watch / keep-watching).

## Context

The viral loop should not be "invite your contacts" or "I joined another network." It is identity- and recognition-driven:

> Ditto saw something specific and valuable about me. I want to share that.

Brief 260 already shipped the single-channel share modal, the OG/PNG render, and the three-voice triplet. Brief 277 expands the loop across LinkedIn, X, Instagram story, email signatures, website badges, plus public-profile visitor conversion — while preserving user control, avoiding auto-spam, and gating any outcome-led sharing behind consent + scrub.

The original 17-AC brief crosses three independently testable subsystems (member share authoring, visitor attribution + conversion, outcome-led share + consent). Per Insight-004 (8–17 ACs, one integration seam, independently testable), it splits into a parent + three sub-briefs. This parent retains the structural design, the side-effect matrix, and the Q1–Q9 rulings. The sub-briefs hold the work products, ACs, and review processes for build.

## Objective

After approving a Member Signal, a user opens a Share Studio with channel-specific variants, channel-appropriate visual assets, and editable copy — never autopost. After a useful connection or reported outcome (a minimal "Useful?" hook added in Sub-brief 292), the user can opt into an outcome-led variant gated by an explicit consent + scrub-check preview. The public profile at `/people/[handle]` carries intent-aware visitor CTAs (ask Ditto / request intro / build your own signal / create a request) that preserve referral context across the `.ditto.partners → {handle}.ditto.you` apex boundary via signed query-param re-emission.

## Non-Goals

- No native social autopost in v1.
- No mass invite or address-book import.
- No automatic DMs.
- No dark-pattern referral wall.
- No broad public directory.
- No paid referral incentive.
- No share-link signal-version pinning. Share URLs always resolve to current signal (per UX spec §Signal-Version Coherence).
- No team-member sharing permission UI (Nadia-deferred).
- No Bluesky / Threads / WhatsApp / Substack-note native channels in v1.

## Inputs

1. `docs/briefs/272-member-signal-onboarding-research-provenance.md` — approved Member Signal source.
2. `docs/briefs/260-network-share-modal-og-and-png.md` — single-channel share modal, OG, PNG, three voices.
3. `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md` — public profile-as-chat + visitor intro contract.
4. `docs/briefs/271-network-doctrine-ia-copy-superconnector.md` — copy system, superconnector posture.
5. `docs/briefs/276-email-chat-consent-introductions.md` — intro consent path (Useful? hook attaches here).
6. `docs/briefs/282-network-audit-scrubber-stoprun-substrate.md` — scrubber + audit substrate (outcome-share dependency).
7. `docs/research/277-share-loop-public-profile-conversion.md` — Researcher report (build-FROM inventory, 6 external evaluations, 5 cross-cutting patterns, 6 Original-to-Ditto gaps, 9 open questions).
8. `docs/research/277-share-loop-public-profile-conversion-ux.md` — Designer UX spec (two-process decomposition, four visitor-intent shapes, surface diagrams, channel × voice matrix).
9. `packages/web/components/network/share-modal.tsx` — existing single-channel share UI.
10. `packages/web/components/network/card-silhouette.tsx` — canonical iconic-card module (Soul Move #7).
11. `packages/web/app/people/[handle]/` — public-profile visitor surface.
12. `packages/web/app/api/v1/network/people/[id]/share/route.ts` — existing share route (wrapper-run + bypass-rejection already in place).
13. `packages/web/middleware.ts:79-95` — in-house HMAC cookie pattern (Edge-compatible baseline).
14. `src/engine/network-privacy-scrubber.ts` — `scrubForSurface` + `NETWORK_PRIVACY_SURFACES` tuple.
15. `src/engine/network-step-run.ts` — `createNetworkLaneStepRun` wrapper-run helper (Insight-232).
16. `packages/core/src/content-blocks.ts` — `SuggestionBlock` (394), `ActionDef.payload` (21), `ChecklistBlock` (667), `AuthorizationRequestBlock`, `NetworkProfileCardBlock`.

## Constraints

- **Share is user-led.** No autoposting, no auto-DM, never. Copy/post buttons are offline-or-offsite-intent only.
- **Recognition beats promotion.** Copy highlights specific approved professional magic, not generic membership.
- **Outcome beats vanity.** The strongest loop is "Ditto helped create useful work / connection / outcome," not "I joined another network."
- **Every shared claim must be approved public signal.** Variant generation reads only `approved-public` KB facts; private/hidden/on-request claims are scrubbed by `scrubForSurface` before variant generation.
- **Outcome shares require explicit consent + scrub.** No other-party name, deal details, request text, or outcome value without consent. Scrub-check failure blocks Continue with no override.
- **Channel copy must fit the channel.** LinkedIn (~3000 char long-form), X (≤280), IG (visual-first, 1 link sticker max), email-sig (one quiet line), badge (static text). Voice × channel matrix governs which voices apply per channel.
- **Visitor conversion is contextual, never modal-takeover.** Soft pills with optional highlight on inferred intent. Visitor can always click any CTA. Inference is hint, never gate.
- **Attribution is privacy-safe.** Cookie shape carries only `{channel, ph, ts}` — no visitor identity, no chat content, no IP fingerprint beyond what the request already exposes.
- **Side-effecting functions require `stepRunId` per Insight-180.** Per-channel variant generation, outcome-share variant generation, badge/signature generation (if guarded), and attribution writes all run inside lane-appropriate wrapper step-runs minted by the HTTP route (Insight-232). Caller-supplied `stepRunId` — including falsy values — is rejected (Insight-180 silent-failure pattern). Inputs persisted into the wrapper-run row (e.g., `action`, `channel`) are validated against allow-lists *before* `createNetworkLaneStepRun` (Insight-239).
- **Engine code does not `fetch()` its own routes.** Operations are extracted into `src/engine/` callables and invoked in-process (Insight-211). HTTP routes are thin adapters.
- **Insight-234 does NOT apply to any Brief 277 path.** No artifact crosses the Network → workspace deployment boundary. Share-variant gen, attribution writes, outcome-share consent, intent inference, and CTA rendering all live entirely on `ditto.partners`. The cross-apex referral handoff at sign-up is a query-string emission consumed at first workspace load, not a durable cross-deployment delivery. (Researcher §CC-2 / Designer §Surface 4 cross-confirmed.)
- **`.ditto.partners` cookies do NOT cross to `{handle}.ditto.you`.** Verified via `packages/web/app/people/[handle]/page.tsx:59`. Cross-apex handoff is by signed query-param re-emission at sign-up.
- **No `aspect-ratio` CSS in Satori-rendered components.** `next/og` reflows via Yoga/Flexbox only; explicit pixel dimensions on every `<img>` (Vercel/Satori issue #264).
- **No host-page CSP friction for website badge.** Use the `<a> + <img>` shape (no `<script>`, no `<iframe>`, no inline event handlers).
- **Email signature HTML safety is server-rendered + server-escaped only.** No client-side template interpolation. No `<script>`, `<style>`, `<iframe>`, `<form>`, `<input>`, `<video>` in the snippet. Plain-text variant is the default; HTML variant is a server-rendered table-based inline-style fragment.
- **Multi-instance rate limit substrate only.** Attribution writes and per-channel variant POSTs use `checkRateLimit({ limitName, actor })` from `src/engine/network-abuse-controls.ts`. No in-memory maps. Visitors get `actor: { kind: "ip", id: hashedIp }`.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Three-voice triplet, OG 1200×630, PNG, single-channel modal | Brief 260 | adopt | Existing share primitive — extend, don't replace. |
| Card silhouette (single canonical iconic module) | Brief 254 Soul Move #7 + `card-silhouette.tsx` | adopt | One iconic surface across in-product/OG/IG story. |
| `NetworkProfileCardBlock` extension for channel modes | Brief 256 NetworkProfileCardBlock | adopt | Existing block accommodates `channelMode`; no new primitive. |
| `AuthorizationRequestBlock` carrying `preview: ContentBlock[]` for outcome consent | Brief 248/259 transcript-carrying pattern | adopt | Same pattern used elsewhere for previewable consent. |
| Public profile-as-chat + quick-start pills | Brief 259 (complete) | adopt | Visitor surface foundation; Brief 277 extends. |
| Privacy scrubber + `NETWORK_PRIVACY_SURFACES` tuple | Brief 282 `src/engine/network-privacy-scrubber.ts` | adopt + extend (new `outcome-share` surface) | The scrubber is the contract; Brief 277 adds the surface enum + composes scrub-check rows. |
| HMAC-signed cookie (Edge-compatible, in-house) | `packages/web/middleware.ts:79-95` (Brief 143) | adopt (reuse pattern as shared helper) | Already proven, Edge-confirmed, no new dependency, payload non-sensitive. |
| Wrapper-step-run lane helper | `src/engine/network-step-run.ts` (Brief 258 + Insight-232) | adopt | New routes mint wrappers via existing helper. |
| Audit event substrate (`writeNetworkAuditEvent`) | `src/engine/network-audit.ts` (Brief 282) | adopt (new event classes) | Single audit chain, no parallel mechanism. |
| Multi-instance rate limit (`checkRateLimit`) | `src/engine/network-abuse-controls.ts` (Brief 278/282) | adopt | Canonical limiter. The in-memory map in `card-png/route.ts` is not canonical. |
| `next/og` `ImageResponse` multi-dimension rendering | `next/og` (already adopted, Brief 260) | depend (extend USE to 1080×1920) | Single render substrate; new dimensions only. |
| Per-channel system-prompt registry pattern | github.com/langchain-ai/social-media-agent | pattern (study, not import) | The `POST_STRUCTURE_INSTRUCTIONS` + per-channel `BUSINESS_CONTEXT` / `EXAMPLES` constants are the cleanest external reference for channel-branched prompting. Do NOT import LangChain. |
| Pure `<a> + <img>` badge embed | buymeacoffee.com/brand | pattern | Lowest CSP friction; no XSS surface; matches Brief 277 AC-11 contract. |
| Email-signature cross-client safe subset (inline-styled `<table>`) | emailsignaturerescue.com, dev-wp.co.uk | pattern | Static knowledge of what survives Gmail/Outlook/Apple Mail rendering. |
| `SuggestionBlock` + `ActionDef.payload` (intent metadata on actions) | `packages/core/src/content-blocks.ts:394,17` | adopt | Documented escape hatch for caller-defined metadata; no schema extension. |
| `ChecklistBlock` for scrub-check rows | `packages/core/src/content-blocks.ts:667` | adopt | Purpose-built for `done`/`warning` lines with optional `detail`. |
| `ScrubDecision.withheldByReason` for consent-check telemetry | `src/engine/network-privacy-scrubber.ts:41` | adopt | Existing scrubber output already enumerates withholding reasons. |
| Recognition-led share psychology | Original to Ditto | original | User direction: sharing must feel specific, valuable, and earned. |
| Per-channel × per-voice × scrub-aware composition | Original to Ditto | original | No surveyed tool enforces budget-redaction + KB-visibility + URL-suffix + step-run guard together. |
| Visitor-intent inference + four-intent CTA mapping | Original to Ditto | original | No external attribution tool infers visitor *intent* from session behavior. |
| Outcome-share with consent + other-party scrub | Original to Ditto | original | No external pattern combines outcome reporting with other-party privacy enforcement. |
| Cross-apex signed-query-param referral handoff | Original to Ditto | original | Forced by `.ditto.partners` ≠ `.ditto.you` cookie isolation. |

## Architect Rulings (Q1–Q9 + Designer OQ-1..8)

### Q1 (variant-gen shape) — RULING: **Shape A** (add `channel` param to existing `generateShareVariants`)

Branch the system prompt per channel inside the existing tool. Returns `{quiet, loud, ask}` per channel. Builds on the per-channel prompt registry pattern from `langchain-ai/social-media-agent` (constants for `POST_STRUCTURE_INSTRUCTIONS` / `BUSINESS_CONTEXT` / `EXAMPLES`).

**Why:** Channels are genuinely different in voice and length (LinkedIn long-form, X 280 chars, IG visual-first). A deterministic formatter over a canonical triplet (Shape C) cannot meaningfully reshape voice per channel — only truncate/append. Shape A keeps one guarded tool surface (one entry in `builtInTools`), one audit event class per channel call (`share_studio_variant_generated`), and one rate-limit family. Cost: ~5 LLM calls per Studio open vs 1 — mitigated by active-channel-first generation (Q7) + per-channel ratelimit (Q9).

**Coupling resolved:** Q7 (route fan-out) → Shape A (per-channel POST), consistent with Q1=A.

### Q2 (attribution storage) — RULING: **New dedicated `network_share_attribution` table** + parallel audit-event entry

Write to a dedicated table on every conversion (channel, profileHandle, visitorSidHash, action, ts), plus a `share_attribution_recorded` row in the existing audit chain.

**Why:** Admin dashboards (Brief 286) need to query "conversion by channel" patterns directly; a dedicated table is indexable on `(profileHandle, channel, ts)` and decouples high-volume attribution writes from the signed audit chain. The audit row preserves the signed-chain invariant; the dedicated table preserves the analytic query path.

### Q3 (cookie library) — RULING: **In-house HMAC (Shape A)** — extend `packages/web/middleware.ts:79-95` pattern as a shared helper

Lift the HMAC sign/verify into `packages/web/lib/signed-cookie.ts` (new). No new npm dependency.

**Why:** Payload `{channel, ph, ts}` is non-sensitive (channel + handle already in URL). Encryption (iron-session) adds Edge-compat risk for no concrete value. JWT (jose) adds JOSE-format complexity for portability we don't need within Ditto. The in-house HMAC pattern is already proven, already Edge-confirmed (Web Crypto `crypto.subtle.sign`), and the format `value|hex-signature` is one helper away from being reusable. **Add to landscape: in-house signed-cookie helper as a `pattern`-level in-repo asset.**

### Q4 (cross-apex handoff format) — RULING: **Compact HMAC token** matching cookie format

Server emits `?ditto_ref={channel}|{ph}|{ts}|{hexsig}` at sign-up. Workspace deployment imports the same secret (`SESSION_SECRET || NETWORK_AUTH_SECRET`) and verifies on first onboarding-step load.

**Why:** Symmetric with Q3. Single secret-rotation surface. No JOSE library needed in either deployment. Token is short (a few dozen bytes), URL-safe (hex-only signature), and verifies in Edge runtime.

**TTL:** 24 hours from cookie issuance. Rotation tied to `SESSION_SECRET` rotation (cookie + handoff token co-invalidate).

### Q5 (outcome-share surface) — RULING: **Shape A** — add `"outcome-share"` to `NETWORK_PRIVACY_SURFACES` tuple

Plus route-level consent gate, plus other-party-name suppression composed at the route (the scrubber doesn't know "this is an outcome-share" — the route enforces the outcome-specific composition).

**Why:** Adding a surface enum forces every switch on `NetworkPrivacySurface` to handle the new case — a *good* exhaustiveness pressure. The reused-`"share"` shape (Shape B) hides the outcome path inside the route and creates a parallel quasi-surface that the scrubber doesn't audit.

### Q6 (IG story rendering) — RULING: **Shape A** — extend `NetworkCardOgFrame` with `storyMode` flag

Three sizes on one component: `imageMode: false` (in-product card), `imageMode: true` (1200×630 OG), `storyMode: true` (1080×1920 IG story).

**Why:** The single-canonical-iconic-card doctrine (Soul Move #7) is the doctrine. Conditional sprawl on three sizes is manageable; duplicating the silhouette inner content into a sibling frame component would fragment the visual identity.

**Spike-test note (Researcher §Smoke Verification step 6):** Before W-10 build, render `NetworkCardOgFrame` at `{ width: 1080, height: 1920 }` as a one-off route to confirm Satori/Yoga portrait reflow behaves. Builder runs this spike first; if reflow is broken, lift to Shape B (sibling component) and re-rule. This unblocks the build path without committing to A or B sight-unseen.

### Q7 (variant-route fan-out) — RULING: **Shape A** — per-channel POST per Studio open

Active channel POSTs immediately on Studio open. Other channels lazy-POST on first tab click. Each POST is its own wrapper run + audit event + rate-limit hit.

**Why:** Perceived latency is better (first variant renders ~1 LLM call, not ~5). Per-channel ratelimit is more granular for abuse control. Coupling with Q1=A is clean.

**Caching:** Once a channel's variant is generated for a given Studio open, it caches client-side for that session; switching tabs back to a cached channel does NOT re-POST.

### Q8 (badge embed shape) — RULING: **Shape A** — pure `<a> + <img>`

```html
<a href="https://ditto.partners/people/{handle}?ref=badge" target="_blank" rel="noopener">
  <img src="https://ditto.partners/people/{handle}/badge.png" alt="Available through Ditto" width="200" height="40">
</a>
```

**Why:** Lowest CSP friction on the host page (no `script-src` allowance needed). No XSS surface for user text — text only appears URL-encoded in `href`; alt text is server-escaped and fixed. No runtime config. No iframe network footprint. Satisfies AC-11 ("cannot execute arbitrary user text as HTML") by construction.

### Q9 (rate-limit name) — RULING: New dedicated limit names

- `limitName: "share-studio-variant"` (per-user, per Studio-open + per-channel POST) — the share route **switches to this name**; `invite-send` is NOT removed (it remains for invite paths and other callers).
- `limitName: "share-attribution"` (per-IP, per-handle, visitor-side) — new.
- `limitName: "outcome-share-consent"` (per-user, low-rate) — new, gates the outcome-share consent route.

**Registration (closed-enum constraint).** `src/engine/network-abuse-controls.ts:21-31` declares `networkRateLimitNameValues` as a closed `as const` array; `NetworkRateLimitName` is its union; `CheckRateLimitInput.limitName` is typed to it; `DEFAULT_POLICIES` (line 117) is `Record<NetworkRateLimitName, …>` (every name needs a policy); `requireLimitName` (line 132) throws `unknown_network_rate_limit:` for unlisted names. **All three new names must be added to `networkRateLimitNameValues` AND `DEFAULT_POLICIES`** or the first call fails type-check and throws at runtime. **Sub-brief 290 ships first and owns this registration for all three names** (even though 291/292 consume two of them); 291 and 292 declare the dependency, not the edit. Stated default policies: `share-studio-variant` `{ max: 60, windowMs: 3_600_000 }`, `share-attribution` `{ max: 120, windowMs: 3_600_000 }`, `outcome-share-consent` `{ max: 10, windowMs: 3_600_000 }` (builder may tune within reason; brief states them for determinism).

**Why:** Conflating attribution writes (visitor-side, high-volume per-handle) with `invite-send` (member-side, low-volume per-user) creates wrong cardinality + wrong actor type. Brief 286 admin dashboard surfaces these by name; explicit names match observability.

### Designer OQ-1 — RULING: **Accept** — minimal "Useful?" hook on Brief 276 intro accept/decline

Sub-brief 292 adds a minimal post-intro outcome capture: a single "Was this useful?" thumbs-up/down attached to the intro-accept and intro-decline events in Brief 276's consent flow. Schema lives in `network_intro_outcomes` (new). This is the seed for outcome-led variants — no broader feedback platform.

### Designer OQ-2 — Brief 282 dependency confirmed

Sub-brief 292 hard-blocks on Brief 282's `scrubForSurface` returning structured `ScrubDecision.withheldByReason` (already in place per `network-privacy-scrubber.ts:41`). Builder verifies via the smoke step: `pnpm vitest run src/engine/network-privacy-scrubber.test.ts`.

### Designer OQ-3 — RULING: **Accept** — `aside` column on desktop, below chat on mobile

Insertion point: `packages/web/app/people/[handle]/profile-chat-client.tsx`'s existing `aside`. No new layout region.

### Designer OQ-4 — RULING: **Accept** — cookie for in-session, durable row only on conversion

Cookie carries `{channel, ph, ts}` (24h). Durable `network_share_attribution` row written ONLY on visitor click (not on landing).

### Designer OQ-5 — RULING: **Accept** — `storyMode` flag on `NetworkCardOgFrame` (matches Q6)

### Designer OQ-6 — RULING: **Accept** — active-channel-first variant gen (matches Q7)

### Designer OQ-7 — RESOLVED via Q3+Q4 — cookie TTL 24h, token TTL 24h, both rotate with `SESSION_SECRET`

### Designer OQ-8 — RULING: **Accept** — badge as static `<a> + <img>`, server-rendered + server-escaped (matches Q8)

## Sub-Brief Split (per Insight-004 — 17 ACs across 3 subsystems, must split)

| Sub-brief | Owns | ACs (approx) | Integration seam | Depends on |
|----------|------|--------------|------------------|------------|
| **290 — Share Studio + Channel Variants** | Member-facing share authoring loop: Studio modal (compact + Studio mode), `channel` param on `generateShareVariants`, per-channel POST fan-out, IG `storyMode` on `NetworkCardOgFrame`, email-sig snippet component, website badge component (`<a> + <img>`), voice × channel matrix. | 11 (parent ACs 1–7, 10–12 + asset routes) | `packages/web/components/network/share-studio.tsx` + extended share route | Brief 272, Brief 260 |
| **291 — Attribution + Visitor Conversion** | Visitor-facing: in-house HMAC cookie helper, share-attribution POST + new `network_share_attribution` table, intent-aware CTA strip (4-shape inference with score/margin/decay rules), `SuggestionBlock` + `ActionDef.payload` composition, cross-apex signed-query-param handoff, audit event classes, rate-limit name. | 11 (parent ACs 8, 9, 13–15 + cookie + intent inference + handoff) | `packages/web/app/api/v1/network/share-attribution/route.ts` + `public-profile-visitor-ctas.tsx` | Sub-brief 290 (Studio emits `?ref=` URLs; 290 registers the shared rate-limit names) |
| **292 — Outcome-Led Share + Useful Feedback** | Privacy-critical: minimal Useful? hook on intro accept/decline (Brief 276), `network_intro_outcomes` table, outcome-share consent flow (`AuthorizationRequestBlock` + `ChecklistBlock`), add `"outcome-share"` to `NETWORK_PRIVACY_SURFACES`, route-level other-party-name suppression, outcome variant generation. | 11 (parent AC 9a + outcome capture + consent + scrub composition + variant gen + audit + tests) | `src/engine/network-privacy-scrubber.ts` (new surface) + new consent + outcome-variant routes | Sub-brief 290 (Studio receives outcome variant; 290 registers the shared rate-limit names); Brief 282; Brief 276 |

Sub-brief 290 ships first. 291 depends on Studio emitting `?ref=` URLs (asset-side dependency only — Studio can ship without 291 because copy/post intent is offline/offsite; 291 enriches the inbound path). 292 depends on Brief 282 substrate AND Sub-brief 290's Studio mode (consent flow continues into Studio with outcome variant pre-loaded).

## Side-Effect and HTTP Seam Matrix

| Route / function | Side effect | `stepRunId` guard | Wrapper-run creator | Bypass-rejection assertion | Mint-input validation (Insight-239) |
|------------------|-------------|-------------------|---------------------|----------------------------|-------------------------------------|
| `POST /api/v1/network/people/[id]/share` (extended with `channel`) | LLM token spend; per-channel `ShareVariants` write to short-lived store; audit event | Required (existing tool); approved-public claims only | Existing wrapper; lane `network-share` | Caller-supplied `stepRunId` rejected (existing test). Body's `channel` rejected with 400 if not in `VALID_CHANNELS`. | `channel` validated against `["linkedin","x","instagram","email-signature","website-badge"]` BEFORE `createNetworkLaneStepRun`. |
| `POST /api/v1/network/share-attribution` (new) | Cookie set; on conversion: `network_share_attribution` row + `share_attribution_recorded` audit event | Visitor-side; no engine-tool call. Route still mints wrapper for audit-chain coherence and for rate-limit pass-through. | New `createNetworkLaneStepRun({ route: "network-share-attribution", ... })`; `action` validated before mint. | Caller-supplied `stepRunId` rejected. Body's `action` validated against `["land","convert"]` before mint. | `action` allow-list checked pre-mint per Insight-239. |
| `POST /api/v1/network/outcome-share` (new) | LLM token spend (outcome variant); scrub-check write; conditional consent-recorded audit event | Required; consent-gate must pass; scrubber returns `ScrubDecision` with no withheld reasons matching `other-party`. | New `createNetworkLaneStepRun({ route: "network-outcome-share", action: validated, ... })`. | Caller-supplied `stepRunId` rejected. Body's `action` validated against `["preview-scrub","approve-and-generate"]` before mint. | `action` allow-list checked pre-mint. `subjectIntroId` validated as a known intro row before mint. |
| `POST /api/v1/network/intros/[id]/useful` (new — Sub-brief 292) | `network_intro_outcomes` row + audit event | No engine tool; route mints wrapper for audit-chain coherence. | New `createNetworkLaneStepRun({ route: "network-intro-useful", action: validated, ... })`. | Caller-supplied `stepRunId` rejected. Body's `verdict` validated against `["useful","not-useful"]` before mint. | `verdict` + `introId` allow-list checked pre-mint. |
| `GET /api/v1/network/people/[id]/badge.png` (asset route — Sub-brief 290) | `next/og` render; no DB write | No engine tool; pure asset route. Wrapper not required (no audited side effect). | n/a | n/a | n/a |
| `GET /api/v1/network/people/[id]/story-card.png` (new asset — Sub-brief 290, 1080×1920) | `next/og` render; no DB write | n/a | n/a | n/a | n/a |

## Outcome-Led Share Moments (eligibility, Sub-brief 292)

Eligible only when ALL of:

1. The reporting user has clicked "Useful" on a Brief 276 intro accept/decline event.
2. The reporting user explicitly opens the outcome-share consent flow (no auto-popup).
3. The scrubber returns no `withheldByReason` keys matching `other-party` / `private-request-text` / `deal-details` / `outcome-value`.
4. The reporting user checks the explicit consent checkbox.

Outcome-led copy must not imply guaranteed results, paid placement, or other-party endorsement. The default tone is "Ditto helped find a thoughtful connection that changed the brief," not "I got X dollars / Y client."

## Visitor Conversion Paths (Sub-brief 291)

| Intent shape | Signal | Highlighted CTA | Whisper line | Routes to |
|--------------|--------|-----------------|--------------|-----------|
| Curious peer | `?ref=` present, no chat engagement | None highlighted; all four soft | "{member} shared this on {channel}." | n/a — visitor stays in chat |
| Similar-expertise | Chat question overlaps member's signal keywords | Build your own signal | "You seem to be in a similar space — Ditto can build a signal for you too." | Brief 272 onboarding with referral preserved |
| Helper-seeker | "Can {name} help with X" / "Do you know someone who" | Create a request | "Sounds like you have something specific in mind — Ditto can keep watch." | Brief 273 entry with referral preserved |
| Intro-seeker | "How do I reach" / clicks intro pill | Request an intro | "Here's how the consent-gated intro works." | Brief 276 consent path with referral preserved |

**Inference rules** (Designer §Surface 3, accepted):

1. Score each intent shape 0–1 per visitor turn.
2. Single winner: one shape ≥ 0.6 AND margin over runner-up ≥ 0.2 → highlight that single CTA.
3. Two-way tie: two shapes within 0.2 of each other AND both ≥ 0.6 → highlight both equally; whisper: "Sounds like you have a couple of things in mind — pick whichever feels right."
4. Three-way / noisy → revert to all-four-soft default.
5. Decay: highlight persists one turn; resets if next turn doesn't reinforce.

Inference is hint, never gate. Visitor can always click any CTA.

## User Experience

- **Jobs affected:** Define, Delegate, Review, Decide, Capture, **Curate** (per Insight-238, pending human ratification).
- **Primitives involved:** `SuggestionBlock`, `ActionBlock`, `AuthorizationRequestBlock`, `ChecklistBlock`, `NetworkProfileCardBlock` (extended with `channelMode`).
- **Process-owner perspective:** A non-technical observer reading Share Studio runs sees, in order: signal approved → Studio opened → variants generated per channel (parallel) → member edited / copied / dismissed → visitor arrived with `?ref=` → visitor asked question → intent inferred → CTA clicked → routed to downstream brief with referral preserved. The Share Studio is decomposed as a managed process (`share_studio`); the visitor surface is decomposed as a separate process (`visitor_conversion`). The two meet at the `?ref=` query string as their interface contract.
- **Interaction states:** Full coverage in Designer UX spec §Interaction States (empty / loading-variants / success / error-channel / error-all / outcome-scrub-failed / copied for Studio; empty / inferred-intent / loading-route / success-routed / error-route for visitor CTA; presenting-scrub / presenting-scrub-fail / consenting / continuing / skipped for outcome consent).
- **Designer input:** `docs/research/277-share-loop-public-profile-conversion-ux.md` (CLEAN-PASS 2026-05-19, reviewer-fixed inline).
- **Curate disposition:** Insight-238 is *applied provisionally* in this brief and in Sub-brief 292. If the human declines Insight-238 adoption, the outcome-consent surface re-labels as ORIENT (scrub-preview communicates state) + DECIDE (checkbox is explicit choice). **Functional design is identical** — only job-label changes. No build work changes.

## Acceptance Criteria

This parent brief has **no ACs of its own**. The 17 ACs from the original draft are redistributed across Sub-briefs 290, 291, and 292 with explicit coverage:

| Original AC | Sub-brief | Notes |
|-------------|-----------|-------|
| 1 — Share Studio after Member Signal approval | 290 | Studio mode trigger; compact mode preserved (AC 10 below). |
| 2 — Multi-channel support | 290 | LinkedIn, X, IG story, email sig, badge, PNG, URL. |
| 3 — Approved public claims only | 290 | Scrubber pre-pass on KB facts before variant gen. |
| 4 — Channel-specific copy | 290 | `channel` param branches system prompt; per-channel voice × matrix. |
| 5 — User can edit | 290 | Remix textarea per channel. |
| 6 — No autopost | 290 | Footer actions are offline (Copy) or offsite-intent (Post). |
| 7 — Instagram asset-first | 290 | 1080×1920 PNG + one-line caption; link sticker only. |
| 8 — Intent-aware visitor CTAs | 291 | Four-shape inference + 5-rule fallback. |
| 9 — Attribution privacy | 291 | Cookie shape `{channel, ph, ts}`; new dedicated table; per-IP rate limit. |
| 9a — Outcome consent + scrub | 292 | `AuthorizationRequestBlock` + `ChecklistBlock`; scrub-fail blocks Continue. |
| 10 — Brief 260 OG/PNG continues | 290 | Compact mode + existing OG/PNG routes untouched. |
| 11 — Badge HTML escape | 290 | `<a> + <img>` with server-escaped alt + URL-encoded href. |
| 12 — Email plain text + HTML-safe | 290 | Plain-text default; HTML variant is server-rendered + server-escaped table fragment. |
| 13 — Visitor can ask before signup | 291 | Existing Brief 259 surface preserved. |
| 14 — Build-own-signal preserves referral | 291 | Cross-apex signed-query-param handoff. |
| 15 — Create-request preserves referral | 291 | Cross-apex signed-query-param handoff. |
| 16 — Tests cover stated cases | 290 + 291 + 292 | Each sub-brief carries its own test ACs (approved-claim gen, channel variants, no autopost, attribution privacy, outcome-share consent/scrub, wrapper bypass rejection including falsy values, visitor CTA routing). |
| 17 — Playwright Share Studio + visitor CTAs | 290 (Studio) + 291 (visitor CTAs) | Each sub-brief owns its Playwright surface. |

## Review Process

This parent brief is reviewed for design coherence (Q1–Q9 rulings, sub-brief seam map, side-effect matrix, constraint completeness). Sub-brief reviews are separate (each sub-brief carries its own Review Process).

1. Spawn review agent (fresh context) with this parent brief + Sub-briefs 290, 291, 292 + `docs/architecture.md` + `docs/review-checklist.md` + Researcher report + Designer UX spec.
2. Review agent checks:
   - Each Q1–Q9 ruling is justified, internally consistent, and consistent with the cited insights/ADRs/landscape entries.
   - Sub-brief split honors Insight-004 sizing (8–17 ACs each, one integration seam, independently testable).
   - Side-effect matrix is exhaustive (every new route + side-effecting function listed; mint-input validation present per Insight-239).
   - Constraints section captures every Brief 277 doctrinal rule + every Insight-180/211/232/234/238/239 application.
   - Provenance entries cover all referenced patterns/files.
   - No invented file paths or undocumented dependencies.
   - Designer UX spec is fully reflected in user-experience section + sub-brief 290/291/292 surfaces.
3. Present design + review findings to human.

## Smoke Test

Parent brief smoke is the cross-sub-brief integration path (each sub-brief has its own focused smoke):

```bash
# Sub-brief substrate sanity (must pass before any of 290/291/292 build)
pnpm vitest run src/engine/generate-share-variants.test.ts
pnpm vitest run src/engine/network-privacy-scrubber.test.ts
pnpm vitest run packages/web/app/api/v1/network/people/\[id\]/share/route.test.ts
pnpm run type-check

# Cross-sub-brief manual integration (after 290 + 291 + 292 builds complete):
# 1. Approve a Member Signal in a sandbox member account.
# 2. Open Share Studio (Sub-brief 290).
# 3. Generate variants for LinkedIn, X, Instagram story, email signature, website badge.
# 4. Verify per-channel variant gen is active-channel-first; switching tabs background-generates lazy channels.
# 5. Edit one variant; copy it.
# 6. Open public profile with ?ref=linkedin (Sub-brief 291).
# 7. Confirm referral cookie set; ask Mira a chat question that biases similar-expertise.
# 8. Confirm Build-your-own-signal CTA highlights with the expected whisper line.
# 9. Click Build-your-own-signal; verify cross-apex signed-query-param handoff to {handle}.ditto.you onboarding.
# 10. From a separate intro flow (Brief 276), click "Useful" on an accepted intro (Sub-brief 292).
# 11. Open the outcome-share consent flow.
# 12. Confirm scrub-check rows render via ChecklistBlock; uncheck/recheck the consent checkbox; verify Continue disable/enable.
# 13. Continue; verify Studio opens with outcome variant pre-loaded.
# 14. Verify no autopost / auto-DM occurred anywhere.
```

## After Completion

1. Sub-brief 290 ships first. After 290 merges, builder picks up 291. 292 builds in parallel with 291 if Brief 282 substrate is confirmed ready; otherwise sequential after 282.
2. Update `docs/state.md` and `docs/roadmap.md` row 277 with each sub-brief completion.
3. If outcome-led share pattern proves out, write a design insight in `docs/insights/` titled "Recognition-led, consent-gated outcome sharing as the lowest-friction-highest-trust viral loop."
4. Per Insight-238 ratification path: when the human ratifies Curate as the 7th human job, the Documenter absorbs it into `docs/human-layer.md`. Sub-brief 292's Curate-vs-Orient/Decide framing is the second realisation; this brief is the second cross-surface evidence point cited there.
5. After all three sub-briefs merge, consider whether the per-channel system-prompt registry pattern (Q1=A, channel-branched prompts) warrants its own brief if Brief 278+ surfaces similar multi-channel composition needs.

## Open for Sub-Brief Builders (architect ruled, builder discovers)

- The exact channel-prompt-registry shape inside `src/engine/share-studio-variants.ts` is the builder's call within the Q1=A constraint. Two reasonable shapes (single function with prompt-branch table vs separate `*ShareSystemPrompt` constants per channel composed in one helper) — either is acceptable.
- Hashed-IP function for visitor rate-limit actor (Sub-brief 291) — use the existing pattern if one exists in `network-abuse-controls.ts`; if not, salt-and-SHA the visitor IP into an opaque 16-char id. Builder reviews the existing limiter's `actor.kind: "ip"` usage to match.
- IG storyMode font-loading: if the existing Geist font ArrayBuffer load works at 1080×1920, no font change. If not, fallback to system Arial/Verdana per the Yoga-Flexbox subset.
- Email-signature HTML variant: plain text is the default; HTML variant is OPTIONAL in Sub-brief 290 (AC 12 is satisfied by plain text). Builder may skip HTML variant if effort outpaces value — document the deferral in `docs/state.md`.
