# Brief 277 — Share Loop and Public Profile Conversion (Technical Research)

**Date:** 2026-05-19
**Researcher:** Dev Researcher (Claude Opus 4.7)
**Status:** Draft (pending Dev Reviewer)
**Companion (UX):** `docs/research/277-share-loop-public-profile-conversion-ux.md` (Designer spec, CLEAN-PASS 2026-05-19)
**Brief:** `docs/briefs/277-share-loop-public-profile-conversion.md`
**Roadmap:** Phase 14 — Network Agent

## Purpose

Per the Researcher contract: *what can we build FROM?* This report inventories existing in-repo seams and external building blocks for every Brief 277 work product. Neutral by construction — no recommendations, no ranking, no preferred option. The Architect synthesises with the Designer's interaction spec.

Companion UX spec already exists at `docs/research/277-share-loop-public-profile-conversion-ux.md`. This report deliberately does NOT re-cover UX surfaces — the Designer's spec is the user-facing source of truth. This report covers code-level seams, contracts, and libraries.

---

## Build-FROM Inventory (per work product)

The brief lists 11 work products. For each, this section names the existing source file(s) we extend or the external pattern/library we'd compose with, with line numbers where relevant.

### W-1. `src/engine/share-studio-variants.ts` — per-channel variant generation

**Existing seam:** `src/engine/generate-share-variants.ts` (Brief 260, already shipped). Exports:
- `GENERATE_SHARE_VARIANTS_TOOL_NAME = "generate_share_variants"` (line 7)
- `GenerateShareVariantsInput = { rootDir?, stepRunId?, card, kb?, completion? }` (line 22)
- `ShareVariants = { quiet, loud, ask }` (line 16)
- `generateShareVariants(input)` (line 133) — single LLM call via `createCompletion({ purpose: "writing", maxTokens: 900, system: "..." })` returning JSON `{quiet, loud, ask}`. Internal scrub via `scrubForSurface(card, { surface: "share", viewerContext: { viewerType: "visitor" } })` (line 139). Fallback variants on LLM failure. Budget-regex `SHARE_BUDGET_LANGUAGE_PATTERN` (line 30) gates output.
- StepRunId guard via `requireServerMintedNetworkLaneStepRunId` (line 134, Insight-180 + Insight-232).

**What's missing for Brief 277:** No channel parameter. Single voice triplet, not channel × voice matrix. No 280-char (X) or 220-word (LinkedIn) or asset-first (IG) variation. No outcome-led variant generator.

**Two extension shapes available (neutral):**

Shape A: **Add a `channel` parameter to `generateShareVariants`** and branch the system prompt; return a per-channel `ShareVariants`. Caller specifies `channel: "linkedin"|"x"|"instagram"|"email-signature"|"website-badge"|"outcome"` and gets one `{quiet, loud, ask}` per channel. The LangChain `social-media-agent` open-source project uses this approach (per-channel constants for `BUSINESS_CONTEXT` and `EXAMPLES`, shared `POST_STRUCTURE_INSTRUCTIONS` + `POST_CONTENT_RULES`). Source: github.com/langchain-ai/social-media-agent (`src/agents/generate-post/prompts/`).

Shape B: **Create `generate_share_studio_variants` as a sibling tool** that wraps `generate_share_variants` per channel — i.e., one LLM call per channel rather than one model + post-process. The 0xmetaschool/Social-Media-Post-Generator open-source project uses a single-completion-with-channel-instruction approach (one model, inline platform instructions). Source: github.com/0xmetaschool/Social-Media-Post-Generator.

Shape C (hybrid): single LLM call returning a canonical voice triplet, plus a deterministic per-channel formatter (truncate to 280 for X, append `{url}` suffix per channel, strip URL for IG, etc.). No new LLM call per channel.

**Original to Ditto:** none of the surveyed open-source tools enforce *budget-redaction + KB-visibility filtering + URL-suffix + step-run guard* the way Brief 260 already does. The Brief 277 extension inherits all four constraints regardless of shape.

### W-2. `src/engine/tool-resolver.ts` — guarded-tool registration

**Existing seam:** `src/engine/tool-resolver.ts` `builtInTools` registry; `generate_share_variants` already registered. If Brief 277 adds a new guarded tool (per-channel variant gen or outcome-share gen), it MUST be registered by the same string the directive references (Insight-180 silent-failure guard, also re-affirmed in Brief 260 AC-2).

**Pattern (Original to Ditto):** Insight-180 + Insight-232 require: (a) `builtInTools` registration, (b) directive references the same string, (c) HTTP route mints `stepRunId` via wrapper, (d) caller-supplied `stepRunId` rejected with 4xx. Already enforced by `packages/web/app/api/v1/network/people/[id]/share/route.ts:38-40`.

### W-3. `packages/web/components/network/share-studio.tsx` — full Share Studio surface

**Existing seam:** `packages/web/components/network/share-modal.tsx` (Brief 260, shipped). Single-modal three-voice picker with `[Copy]`, `[Post to LinkedIn]` (LinkedIn share-offsite intent URL), `[Download card PNG]` actions. Lives in `packages/web` (engine boundary respected — Brief 260 Constraint).

**What's missing for Brief 277:** No channel tabs; no IG story preview; no email-signature snippet; no website badge generator; no outcome-share path; no edit-then-re-render across channels.

**Two composition shapes available (neutral):**

Shape A: **Extend `share-modal.tsx` in place** with a channel-tab strip at the top of the right pane. Each tab swaps the voice triplet, action row, and overlay preview. Single component, gradual diff.

Shape B: **New `share-studio.tsx` component** at `packages/web/components/network/`, with `share-modal.tsx` retained for "quick share" and `share-studio.tsx` as the full-fledged multi-channel surface. Two entry-points (compact vs full per the brief §What Changes row 1).

**Refero / Designer UX surface scout (already done by Designer):** `docs/research/277-share-loop-public-profile-conversion-ux.md` covers the tab-per-channel vs unified-edit choice and the IG asset-first vs link-first distinction. Researcher does not duplicate.

### W-4. `packages/web/app/api/v1/network/people/[id]/share/route.ts` — share-variant route

**Existing seam:** `packages/web/app/api/v1/network/people/[id]/share/route.ts:1-117`. Already implements Insight-232 wrapper-step-run + Insight-180 caller-bypass-rejection. Already calls `generateShareVariants`. Reads KB via `networkUserKbFacts`. Writes audit via `writeNetworkAuditEvent({ eventClass: "share_generated", ... })`. Rate-limited via `checkRateLimit({ limitName: "invite-send", actor: { kind: "user", id: session.userId } })` (line 49).

**What's missing for Brief 277:** No `channel` param. No outcome-share path. Returns flat `ShareVariants`, not `Record<Channel, ShareVariants>`.

**Two extension shapes (neutral):**

Shape A: Accept `channel?: Channel` in body; same route returns `ShareVariants` per the channel passed. Client makes N requests for N channels. Each call is its own wrapper run + audit event.

Shape B: Accept no channel param; return `Record<Channel, ShareVariants>` in one response (server fans out N LLM calls inside one wrapper run, or one LLM call if Shape C of W-1 is chosen). Single audit event.

Neither shape is closer to existing patterns; the rate-limit accounting differs (A: per-channel ratelimit hits, B: one ratelimit hit per Studio open).

### W-5. `packages/web/app/api/v1/network/share-attribution/route.ts` — attribution write

**No existing seam.** Original to Ditto.

**Three building-block shapes available (neutral):**

Shape A: **In-house HMAC cookie** matching `packages/web/middleware.ts:78-95`. Already adopted pattern: Web Crypto `crypto.subtle.sign("HMAC", ...)` with format `value|hex-signature`, secret from `SESSION_SECRET || NETWORK_AUTH_SECRET`. Edge-compatible by construction. Cookie format: `ditto_share_ref={channel}|{handle}|{visitorSid}|{hexsig}` on `.ditto.partners`. Source: `packages/web/middleware.ts:79-95`.

Shape B: **`iron-session` (vvo/iron-session)** — stateless encrypted (AES-GCM + HMAC) sealed cookies. API: `getIronSession(cookies(), { password, cookieName })` returns a typed mutable session object. Documented for App Router. Edge-runtime support not explicitly confirmed in README. Source: github.com/vvo/iron-session.

Shape C: **`jose` (panva/jose)** — full JWS/JWT signed-token library, zero deps, Web Crypto only, explicit Edge-runtime support. API: `await new SignJWT({...}).setProtectedHeader({alg:"HS256"}).setExpirationTime("30d").sign(secret)` / `jwtVerify(token, secret)`. Source: github.com/panva/jose.

**Cross-domain handoff note:** `.ditto.partners` cookies do not cross to `{handle}.ditto.you` (verified via `packages/web/app/people/[handle]/page.tsx:59` confirming `ditto.partners` as Network front-door domain). The Designer's UX spec resolves the visitor → workspace handoff via signed-query-param re-emission at sign-up. Any of the three shapes above can sign that handoff token; only Shape C and the in-house HMAC pattern (Shape A) are confirmed Edge-compatible.

**Write target:** the brief mentions a new `network_share_attribution` events table. Existing `network_audit_events` (Brief 282) is already write-once + signed-chain (`docs/research/278-trust-privacy-admin.md` §audit-log model). The brief's §Side-Effect matrix says "Server wrapper run or audited server event; no private text" — so the write either reuses the audit-events table or adds a new dedicated table. The Architect chooses.

**Rate limit:** existing `checkRateLimit({ limitName, actor })` substrate in `src/engine/network-abuse-controls.ts` already supports per-IP and per-user limits. The visitor here has no userId; the actor would be `{ kind: "ip", id: hashedIp }` or similar. The Brief 286 admin dashboard already covers rate-limit observability.

### W-6. `packages/web/app/people/[handle]/profile-chat-client.tsx` — visitor conversion CTAs

**Existing seam:** `packages/web/app/people/[handle]/profile-chat-client.tsx` (Brief 259 + Brief 271; status: in network workspace updates per `b911557f`). Public profile-as-chat surface already supports asking about a member.

**What's missing for Brief 277:** Intent-aware CTA strip (`SuggestionBlock` driven). The Designer's UX spec specifies four visitor-intent shapes (curious / similar-expertise / helper-seeker / intro-seeker) with a 5-rule fallback (score ≥0.6 + margin ≥0.2 = single winner; two-way tie within 0.2 = dual highlight; three-way / noisy = default; one-turn decay).

**Existing primitive:** `SuggestionBlock` (packages/core/src/content-blocks.ts:394) — `{ content, reasoning?, actions?: ActionDef[] }` where `ActionDef = { id, label, style?, payload?: Record<string, unknown> }` (line 17). The Designer's spec encodes intent on `actions[0].payload.intentShape` + `payload.referralContext`. This is already a valid primitive composition — no schema change needed.

**Original to Ditto:** the four-intent inference itself. No external project has the same visitor-conversion contract because the Greeter-led representative posture (Brief 271) is itself Original.

### W-7. `packages/web/components/network/public-profile-visitor-ctas.tsx` — CTA renderer

**Existing seam:** The `SuggestionBlock` renderer already exists (Brief 256 / 259 era — surface F renderer). New component wraps it for the public-profile context with intent dispatcher.

**Pattern:** intent → CTA mapping is a lookup table; the action `payload` carries the `referralContext: { channel, sourceHandle }` so downstream sign-up / signal-build / request-create flows can preserve it via query-string emission.

### W-8. `packages/web/components/network/website-badge.tsx` — copyable badge embed

**No existing seam.** Original to Ditto. Three production-SaaS shapes documented in scouting (Topic 4):

Shape A: **Pure `<a>` + hosted image** (Buy Me a Coffee default pattern): `<a href="https://ditto.partners/people/{handle}" target="_blank"><img src="https://ditto.partners/people/{handle}/badge.png" alt="Available through Ditto"></a>`. No script. User text only appears URL-encoded in href; alt text HTML-entity-escaped server-side. No CSP impact on host page. Source: buymeacoffee.com/brand.

Shape B: **Inline `<script>` widget loader** (Calendly badge widget pattern): `<script src="https://ditto.partners/widget/badge.js"></script>` + `Ditto.initBadge({ handle: "..." })`. User config passed as JS object literal (not innerHTML interpolated). Requires host-page CSP allowance for `cdn.ditto.partners` in `script-src`. Source: help.calendly.com/hc/en-us/articles/360019861794.

Shape C: **`<iframe>` embed** (Substack subscribe form pattern): iframe `src` is a server-controlled URL; user content never injected into the snippet. Heaviest network footprint per pageload but tightest XSS isolation. Source: substack.com embed docs.

**Common XSS contract across all three:** user-supplied text never appears as raw HTML in the snippet — only URL-encoded in href, JS string literal in init payload, or absent (rendered server-side in iframe).

**Brief 277 AC-11 enforces:** "Website badge/embed snippet cannot execute arbitrary user text as HTML; it is escaped/sanitized." All three shapes satisfy this when implemented correctly.

### W-9. `packages/web/components/network/email-signature-snippet.tsx` — copyable signature line

**No existing seam.** Original to Ditto. Pattern is well-documented in production tools (Topic 5):

**Cross-client safe subset:** table-based layout (`<table>`, `<tr>`, `<td>`), inline `style=""` on every element (no `<style>` blocks, no classes), absolute `https://` image URLs (Gmail strips base64), web-safe fonts only (Arial / Tahoma / Verdana), no `<script>`, `<iframe>`, `<form>`, `<input>`, `<video>`. Source: emailsignaturerescue.com (blog post), dev-wp.co.uk (HTML email signatures guide), barboraruzickova.com (HTML email signature how-to).

**Sanitization library options:**
- `sanitize-html` (npm) — explicit allow-list config: `allowedTags`, `allowedAttributes`, `allowedSchemes`. Permits exactly the cross-client safe subset. Source: npmjs.com/package/sanitize-html.
- `mat-sz/lettersanitizer` — DOM-based, removes `<script>` while preserving inline CSS. Source: github.com/mat-sz/lettersanitizer.

**Brief 277 AC-12 enforces:** "Email signature copy is plain text and HTML-safe." Plain-text-only is a valid choice (skip HTML entirely — copy a single text line + URL). The Designer's UX spec uses plain text: `Ask Ditto about what I'm working on: {url}`.

### W-10. `packages/web/components/network/instagram-story-card.tsx` — 9:16 PNG/story card

**Existing seam:** `next/og` `ImageResponse` already adopted in Brief 260 for 1200×630 (`packages/web/app/people/[handle]/opengraph-image.tsx:14`, `packages/web/app/api/v1/network/people/[id]/card-png/route.ts:56`). Both routes use `NetworkCardOgFrame` from `packages/web/components/network/card-silhouette.tsx:269` which is the canonical iconic-card silhouette (Soul Move #7 per Brief 254).

**What's missing for Brief 277:** 1080×1920 portrait variant. Per scouting (Topic 1), `ImageResponse` accepts arbitrary `{ width, height }`; the same component tree reflows the layout via Yoga/Flexbox. Known constraints:
- Flexbox only (no CSS grid, no `calc()`, no 3D transforms, no `z-index`)
- Fonts: TTF/OTF/WOFF only as ArrayBuffer (no WOFF2)
- 500KB bundle cap including JSX/fonts/images
- Edge runtime supported but Cloudflare Workers needs manual `yoga.wasm` init
- No RTL, no advanced OpenType (ligatures/kerning)
- `aspect-ratio` CSS property unsupported (vercel/satori issue #264) — explicit pixel dimensions required on every `<img>`

**Current silhouette compatibility (verified):** `card-silhouette.tsx` already uses flex-only layout, absolute positioning, inline styles, system-font fallback (`fontFamily: "Geist, Arial, sans-serif"`), explicit pixel dimensions on the orb and wisp gradients. The `imageMode` flag (line 57) toggles a larger 720-wide card frame for OG. A new `storyMode` flag (or third sizing branch) for 9:16 would follow the same pattern.

**Two layout shapes (neutral):**

Shape A: **Extend `NetworkCardOgFrame`** with a `storyMode` flag that wraps the silhouette in a 1080×1920 portrait frame with extra vertical padding + larger "Ask Ditto what I'm best introduced for" headline. One component, three sizes (`imageMode: false` in-product, `imageMode: true` 1200×630 OG, new `storyMode: true` 1080×1920 IG story).

Shape B: **New `instagram-story-frame.tsx`** alongside `NetworkCardOgFrame`, both consuming the inner silhouette. Reduces conditional sprawl in a single component but duplicates frame-wrapper code.

**Image-loading note (Vercel/Satori issue #264):** the existing `card-silhouette.tsx` already complies with the explicit-pixel-dimensions rule for the phoenix-gradient divs (no images currently). If the IG story card adds an `<img>` (e.g. portraitUrl), explicit `width` and `height` attrs are required.

**Caveat for AC-7 ("Instagram flow provides image/card-first output and copy, not a broken link-first assumption"):** the IG story is consumed by users posting *manually* to their story (no native autopost — brief Non-Goal). The artifact is the PNG file. The copy is a one-line caption shown alongside the PNG download action. No story-publish API call.

### W-11. Outcome-share consent + scrub

**Existing seam:** `src/engine/network-privacy-scrubber.ts` (Brief 282). Function: `scrubForSurface<T>(payload, { surface, viewerContext }) → { payload, scrubDecision }` (line 299). Surfaces (line 11): `public-profile | share | search-result | proposal-email | intro-email | watch-digest | claim-invite | discovery-admin-preview`. ViewerTypes: `owner | approved-viewer | requester | visitor | admin | system`.

**No `outcome-share` surface in `NETWORK_PRIVACY_SURFACES` yet.** Brief 277 introduces it. Two extension shapes:

Shape A: **Add `"outcome-share"` to the `NETWORK_PRIVACY_SURFACES` tuple.** The scrubber's surface-validation (line 303) gates by the tuple; the scrub behavior itself is the same field-walk + visibility-honoring algorithm. Side-effect: other call-sites that switch on `NetworkPrivacySurface` need an `outcome-share` branch.

Shape B: **Use `"share"` surface with stronger viewer context.** Pass `viewerContext: { viewerType: "visitor", allowOnRequest: false }` plus a wrapping consent-gate at the route level. The scrubber doesn't know about "this is an outcome-share specifically"; the route enforces the additional consent-required check.

The scrubber already correctly nulls `antiPersonaMd` for non-owners (line 273) and withholds `private`/`hidden`/`off`/`on-request` claims (line 142). Whichever shape is chosen, outcome-share output must additionally exclude other-party identifiers — the brief states "no other party named without consent." The scrubber currently has no concept of "other party in an intro" — only the calling user's KB facts. **Original-to-Ditto:** the outcome-share route would compose the scrubbed self-card with intro metadata (other-party-name suppressed) — that composition logic is brief-new.

**Scrubber decision telemetry:** `ScrubDecision` (line 41) returns `withheldTotal`, `withheldByReason`, `approvedOnRequest`, `redactedStringOccurrences`. The Designer's UX spec uses these counts to render the consent-flow checklist (Fix-1 in the UX spec: `ChecklistBlock` rendering scrub-check rows). The contract is already in place.

---

## Cross-Cutting Patterns (Original to Ditto, plus inherited)

### CC-1. `stepRunId` triangle (Insights 180 + 211 + 232)

**Already in place.** Every Brief 277 guarded tool (per-channel variant gen, outcome-share gen, badge gen, signature gen if guarded) inherits:
- Insight-180: tool requires `stepRunId`, refuses without it outside `DITTO_TEST_MODE`
- Insight-211: engine code never `fetch()`-es itself
- Insight-232: HTTP route mints wrapper `stepRunId` via lane-appropriate helper (e.g., `createNetworkLaneStepRun({ route: "network-share", ... })` already exists), rejects caller-supplied `stepRunId`

**Reference test (already shipped):** `packages/web/app/api/v1/network/people/[id]/share/route.test.ts` covers caller-bypass rejection — Brief 277 routes (`share-attribution`, outcome-share, badge/signature if guarded) inherit the same test contract.

### CC-2. Audit + outbox (Insight-234)

**Already in place.** `writeNetworkAuditEvent` (in `src/engine/network-audit.ts`) wraps every guarded-tool side effect in a signed-chain audit entry. The current share route writes `eventClass: "share_generated"`. Brief 277 adds at minimum:
- `share_studio_variant_generated` (per channel + voice)
- `share_attribution_recorded` (visitor → channel → handle)
- `outcome_share_consent_recorded`
- `outcome_share_variant_generated`
- `website_badge_snippet_generated`
- `email_signature_snippet_generated`

The audit shape (`subjectType`, `subjectId`, `actorType`, `actorId`, `reasonCode`, `metadata`) is uniform; the value is enumerating the `eventClass` strings consistently.

### CC-3. Multi-instance rate-limit substrate

**Existing seam:** `checkRateLimit` in `src/engine/network-abuse-controls.ts` (Brief 278/282). Already in production. The `packages/web/app/api/v1/network/people/[id]/card-png/route.ts:18-30` in-memory map is **NOT** the canonical pattern — it predates Brief 278 and is single-instance. Brief 277 attribution writes (potentially high-volume from visitors) MUST use the canonical multi-instance limiter, not a new in-memory map. The current limiter supports `actor: { kind: "user"|"ip"|... }` plus `limitName`; visitors get `kind: "ip"` with a hashed-IP id.

### CC-4. Edge-runtime constraint for cookies

**Already in place.** `packages/web/middleware.ts` uses Edge runtime + Web Crypto API for HMAC. Brief 277 attribution-cookie code that runs in middleware or Edge routes MUST be Edge-compatible. Of the three cookie shapes (W-5 above): in-house HMAC (Shape A) and `jose` (Shape C) are confirmed Edge-compatible; `iron-session` (Shape B) is conditional per its README.

### CC-5. Domain topology (verified, no drift)

- `ditto.partners` — Network Service / public profile front door (Public deployment mode per `packages/web/middleware.ts:115` `PUBLIC_MODE_PREFIXES = ["/welcome", "/network", "/admin", "/people"]`)
- `{handle}.ditto.you` — per-user workspace face (Workspace deployment mode)
- Cookies do NOT cross from `.ditto.partners` to `.ditto.you` apex
- Brief 277 referral handoff at sign-up uses signed-query-param re-emission (Designer UX spec §Domain Topology fact)

This is consistent with `packages/web/app/people/[handle]/page.tsx:59` (`"https://ditto.partners"` baseline) and `packages/web/middleware.ts` deployment-mode split.

---

## External Building-Block Evaluations

The following four candidates would be **new top-level dependencies** for Brief 277. Neutral descriptions only; landscape.md additions follow.

### EB-1. `iron-session` (vvo/iron-session)

- **Source:** github.com/vvo/iron-session
- **Description:** Stateless encrypted (AES-GCM + HMAC) sealed cookies for Node.js, Express, and Next.js. Session object serialised, encrypted, stored entirely in the cookie. App Router API: `getIronSession(cookies(), { password, cookieName })`.
- **Edge runtime:** Conditional — documented for Node.js / Express / Next.js APIs; Edge support not explicitly confirmed in README.
- **License / maturity:** MIT, active.
- **Classification (per CLAUDE.md doctrine):** `depend` candidate IF Edge-compat verified; else `pattern`-only (lift the seal-format into in-house HMAC code).
- **Note vs in-repo baseline:** Provides AES-GCM **encryption** in addition to HMAC signing, which the in-repo middleware HMAC pattern does NOT provide (it signs but does not encrypt). For visitor attribution payloads `{channel, sourceHandle, visitorSid}`, encryption may or may not be necessary — the Architect rules.

### EB-2. `jose` (panva/jose)

- **Source:** github.com/panva/jose, npmjs.com/package/jose
- **Description:** Full JWA/JWS/JWE/JWT/JWK implementation using only Web Crypto + Fetch APIs. Zero deps. Tree-shakeable ESM. HS256 for symmetric HMAC tokens. API: `await new SignJWT(payload).setProtectedHeader({alg:"HS256"}).setExpirationTime("30d").sign(secret)` / `jwtVerify(token, secret)`.
- **Edge runtime:** Yes — explicit design goal; used in Next.js middleware ecosystem; v6.0.4 fixed earlier `process.getBuiltinModule` regression.
- **License / maturity:** MIT, active, widely adopted in Next.js middleware ecosystem.
- **Classification:** `depend` candidate.
- **Note vs in-repo baseline:** Provides a token format (JWT) the broader ecosystem understands; in-house HMAC uses an ad-hoc `value|signature` format. Either works for visitor-attribution and signed-query-param handoff; JWT introduces JOSE-format complexity (claims, algs, header) in exchange for portability.

### EB-3. `sanitize-html` (apostrophecms/sanitize-html)

- **Source:** npmjs.com/package/sanitize-html, github.com/apostrophecms/sanitize-html
- **Description:** Allow-list-based HTML sanitization. Configure `allowedTags`, `allowedAttributes`, `allowedSchemes`. Permits exactly the cross-client safe email-signature subset.
- **License / maturity:** MIT, active, ~4.5M weekly npm downloads.
- **Classification:** `depend` candidate for email-signature HTML generation (if HTML signature path is implemented; the brief's AC-12 allows plain-text too).
- **Note:** Brief 277 §AC-12 says "Email signature copy is plain text and HTML-safe." Plain-text-only side-steps this dependency entirely. If HTML signature is added, `sanitize-html` is one option; `lettersanitizer` (mat-sz) is another (DOM-based, similar functional scope).

### EB-4. `langchain-ai/social-media-agent` (LangChain) — pattern source, not depend

- **Source:** github.com/langchain-ai/social-media-agent
- **Description:** TypeScript LangGraph-based multi-channel social-post generator. Per-channel system prompt registry with shared structure constants (`POST_STRUCTURE_INSTRUCTIONS`, `POST_CONTENT_RULES`, `BUSINESS_CONTEXT`, `TWEET_EXAMPLES`). Channel switching = swap context + examples constants.
- **License / maturity:** MIT, LangChain-maintained.
- **Classification:** `pattern` (study and implement; not a library to import — LangGraph + LangChain runtime are heavyweight for what Brief 277 needs, and Ditto already has its own LLM completion substrate via `src/engine/llm.ts`).
- **Note:** This is the strongest open-source reference for **per-channel system prompt branching** specifically. The Brief 277 extension of `generate_share_variants` can adopt the four-constants pattern without adopting LangChain itself.

### EB-5. `next/og` (next/og — already adopted, no change)

- **Source:** nextjs.org/docs/app/api-reference/functions/image-response, github.com/vercel/satori
- **Description:** Already in landscape (line 76, Brief 260). Brief 277 USE expansion: 1080×1920 portrait dimensions accepted by `{ width, height }`; same Yoga-Flexbox layout engine; same CSS subset constraints (no grid, no `calc`, no `aspect-ratio`); same font loading rules (TTF/OTF/WOFF only as ArrayBuffer).
- **Classification:** `depend` (already adopted).
- **No landscape change required.**

### EB-6. Production-SaaS embed-badge patterns (pattern-only, no code)

- **Sources:** buymeacoffee.com/brand, help.calendly.com/hc/en-us/articles/360019861794, substack.com (embed docs).
- **Description:** Three production-SaaS shapes documented in Topic-4 scouting. Pattern-only — no library imported. Code-level safe-snippet template above (W-8).

---

## Gaps — "No existing solution" (Original to Ditto)

1. **Member-Signal-anchored share psychology.** Recognition-led share copy ("Ditto saw something specific and valuable about me, I want to share that"). External AI-post tools generate post-text in voice variants but don't anchor to an *approved Member Signal claim*. Brief 272's approved-claim primitive is uniquely Ditto — the variant gen pulls from it (no external code pattern).
2. **Per-channel × per-voice × scrub-aware composition.** The Brief 277 variant matrix is `channel × voice` (3 voices × 6 channels = 18 cells) with budget-redaction + KB-visibility filtering enforced in code, not in prompt instruction alone. No surveyed external tool enforces this kind of structured redaction in-tool.
3. **Visitor-intent inference for public-profile CTAs.** The four-intent shape (curious / similar-expertise / helper-seeker / intro-seeker) with the 5-rule fallback (Designer spec Fix-6) has no external analogue — most attribution tools record source channel only, not visitor *intent* derived from session behavior.
4. **Outcome-share with consent + other-party scrub.** No external pattern combines "this introduction produced a useful outcome" with "don't reveal the other party / deal value / private brief text." This composition is Brief 277-original.
5. **Referral-context preservation across domain apex.** `.ditto.partners → {handle}.ditto.you` handoff via signed-query-param re-emission is Brief 277-original — required because cookies don't cross apex.
6. **Signal-version coherence (explicitly out-of-scope per Designer Fix-7).** Share URLs always resolve to *current* signal. No version pinning — this is a deliberate non-goal, not a gap. Mentioned here so the Architect doesn't accidentally design it in.

---

## Open Questions for the Architect

The brief leaves the following code-level questions unresolved (the UX spec covers user-facing questions separately):

**Q1 (variant-gen shape).** Choose between W-1 Shape A (channel param on existing tool) vs Shape B (sibling tool per channel) vs Shape C (deterministic per-channel formatter on canonical triplet). Trade-off involves LLM cost, observability granularity, and prompt complexity.

**Q2 (attribution storage).** Choose between (a) reusing `network_audit_events` table with `eventClass: "share_attribution"` vs (b) new dedicated `network_share_attribution` table. Trade-off involves query patterns (admin dashboard joins differ) and audit-chain coherence.

**Q3 (cookie library).** Choose between in-house HMAC (W-5 Shape A, in-repo baseline), `iron-session` (Shape B, encrypted but Edge-compat conditional), `jose` (Shape C, JWT format, Edge-confirmed). Trade-off involves payload encryption need vs format portability vs dependency footprint.

**Q4 (cross-apex handoff format).** Signed-query-param token shape: JWT (`?ditto_ref=eyJ...`) vs compact HMAC (`?ref=channel|handle|sid|hexsig`) vs encrypted seal. Architect choice is tied to Q3.

**Q5 (outcome-share surface tuple).** Choose between scrubber Shape A (add `"outcome-share"` to `NETWORK_PRIVACY_SURFACES`) vs Shape B (reuse `"share"` surface + route-level consent-gate). Trade-off involves surface-switch coverage in all scrubber call-sites vs route-level enforcement clarity.

**Q6 (IG story rendering).** Choose between W-10 Shape A (extend `NetworkCardOgFrame` with `storyMode`) vs Shape B (new `instagram-story-frame.tsx` sibling). Trade-off involves component-conditional sprawl vs duplication of frame-wrapper code.

**Q7 (variant-route fan-out).** Choose between W-4 Shape A (per-channel POST per Studio open) vs Shape B (single POST returns full channel matrix). Trade-off involves rate-limit accounting (per-channel vs per-session) and LLM cost vs UX latency on Studio open.

**Coupling note (Q1 ↔ Q7):** Q1 Shape C (deterministic per-channel formatter on the canonical triplet) and Q7 Shape A (per-channel POST per Studio open) are **mutually exclusive** — Shape C produces all channel variants from a single LLM call on the canonical triplet, which forces Q7 Shape B (single POST returns the full matrix). The Architect should rule Q1 first; that ruling constrains Q7 to one option in two of the three cases (Q1=A/B compatible with either Q7 shape; Q1=C compatible only with Q7=B).

**Q8 (badge embed shape).** Choose between W-8 Shape A (`<a>+<img>`), B (`<script>` widget), or C (`<iframe>`). Trade-off involves host-page CSP friction (A: none, B: script-src allowance, C: iframe-src allowance) vs runtime flexibility (A: locked layout, B: runtime config, C: server-controlled).

**Q9 (rate-limit name for attribution).** Choose `limitName: "share-attribution"` (visitor-side) vs reuse `limitName: "invite-send"` (existing share-route limit) vs new dedicated limit. Trade-off involves admin-dashboard surface coverage and abuse-control configurability.

---

## Provenance Table

| What | Source | Level |
|------|--------|-------|
| `generate_share_variants` tool + budget regex + URL suffix | `src/engine/generate-share-variants.ts` (in-repo, Brief 260) | adopt (extend) |
| `scrubForSurface` + privacy surface tuple | `src/engine/network-privacy-scrubber.ts` (in-repo, Brief 282) | adopt (extend with `outcome-share`) |
| `card-silhouette.tsx` + `NetworkCardOgFrame` | `packages/web/components/network/card-silhouette.tsx` (in-repo, Brief 260) | adopt (extend with `storyMode`) |
| Share route wrapper-run + bypass rejection | `packages/web/app/api/v1/network/people/[id]/share/route.ts` (in-repo, Brief 260) | adopt (extend with `channel`) |
| `share-modal.tsx` 3-voice picker | `packages/web/components/network/share-modal.tsx` (in-repo, Brief 260) | adopt or extend |
| HMAC-signed cookie pattern | `packages/web/middleware.ts:79-95` (in-repo, Brief 143) | adopt (reuse for attribution) |
| `checkRateLimit` substrate | `src/engine/network-abuse-controls.ts` (in-repo, Brief 278/282) | adopt (reuse for visitor IP limits) |
| `writeNetworkAuditEvent` substrate | `src/engine/network-audit.ts` (in-repo, Brief 282) | adopt (reuse for new event classes) |
| `next/og` `ImageResponse` multi-dimension | nextjs.org/docs/app/api-reference/functions/image-response (already adopted) | depend (extend USE to 1080×1920) |
| `SuggestionBlock` + `ActionDef.payload` | `packages/core/src/content-blocks.ts:17, 394` | adopt (compose for visitor CTAs) |
| `ChecklistBlock` for scrub-check rows | `packages/core/src/content-blocks.ts:667` (in-repo, Brief 282) | adopt (consent-flow rendering) |
| Per-channel system prompt registry pattern | github.com/langchain-ai/social-media-agent | pattern (study, not import) |
| Single-prompt with channel instruction pattern | github.com/0xmetaschool/Social-Media-Post-Generator | pattern (study, not import) |
| `iron-session` encrypted cookie | github.com/vvo/iron-session | depend candidate (Q3) |
| `jose` JWT/JWS Edge-runtime library | github.com/panva/jose | depend candidate (Q3) |
| `sanitize-html` allow-list HTML sanitizer | npmjs.com/package/sanitize-html | depend candidate (W-9) |
| `lettersanitizer` DOM-based sanitizer | github.com/mat-sz/lettersanitizer | depend candidate (W-9) |
| Pure `<a>+<img>` badge pattern | buymeacoffee.com/brand | pattern |
| Inline `<script>` widget badge pattern | help.calendly.com/hc/en-us/articles/360019861794 | pattern |
| `<iframe>` embed badge pattern | substack.com embed docs | pattern |
| Email-signature cross-client safe subset | emailsignaturerescue.com, dev-wp.co.uk, barboraruzickova.com | pattern |
| Recognition-led share psychology | Original to Ditto | original |
| Per-channel × per-voice × scrub-aware composition | Original to Ditto (built on existing pieces) | original |
| Visitor-intent inference + 4-shape CTA | Original to Ditto | original |
| Outcome-share with consent + other-party scrub | Original to Ditto | original |
| Cross-apex signed-query-param referral handoff | Original to Ditto (verified domain split forces it) | original |

---

## Reference Doc Status

**Reference docs updated:**
- `docs/landscape.md` — updated this session: added 4 evaluations under §"Share Loop, Attribution Cookies & Per-Channel Variant Generation (2026-05-19)" (lines 1119-1162). New external evaluations: `iron-session`, `jose`, `sanitize-html`, `langchain-ai/social-media-agent`. Per Insight-043, the Researcher owns landscape accuracy; per CLAUDE.md, "every external dependency the Architect might reference in a brief must have a landscape entry before the brief is written."

**Reference docs checked (no drift found):**
- `docs/architecture.md` — L1-L6 spec unchanged. Share Studio is a Layer-6 surface composed from existing primitives + a new product opinion (Studio component). Outcome-share is a Layer-2 guarded tool inheriting Insights 180/232. Attribution is a Layer-3 audited event inheriting Insight-234.
- `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — active, applies as-is.
- `docs/insights/232-audited-http-route-wrapper-step-run-for-guarded-tools.md` — active, applies as-is.
- `docs/insights/234-cross-deployment-inbox-delivery-needs-durable-pull-ack.md` — active but **does NOT apply to Brief 277's share/attribution paths**. No Brief 277 artifact crosses the Network → workspace boundary: share-variant generation, attribution cookie write, outcome-share consent, and visitor-intent inference all live entirely on `ditto.partners`. The referral-context handoff at sign-up (UX spec Surface 4) is a query-string emission consumed by the workspace deployment on first load, not a durable inbox delivery. Insight-234 therefore does not require a `network_workspace_deliveries`-style outbox for Brief 277. Attribution writes ARE durable in the `ditto.partners` audit chain — but that is single-deployment durability, not the cross-deployment scenario Insight-234 addresses.
- `docs/insights/238-curate-is-the-seventh-human-job.md` — active, pending human ratification. The Designer UX spec handles both adoption and decline paths.
- `docs/dictionary.md` — Share Studio, recognition-led share, outcome-led share, channel-variant matrix, visitor-intent shape are new terms; the Documenter adds them if approved.
- `docs/personas.md` — no drift. Rob/Lisa/Jordan/Nadia + 4 visitor-intent shapes (Designer-introduced) hold.
- `docs/human-layer.md` — no drift on the six jobs. Curate-as-7th remains an Insight-238 proposal (Designer spec carries adoption-and-decline contingency).
- `docs/research/277-share-loop-public-profile-conversion-ux.md` — companion (Designer, CLEAN-PASS). Not superseded by this report.

**Prior research checked, none superseded:**
- `docs/research/259-public-profile-as-chat-ux.md` — visitor surface foundation; Brief 277 extends, doesn't supersede.
- `docs/research/278-trust-privacy-admin.md` — audit + scrubber substrate; Brief 277 inherits without modification.

---

## Smoke Verification (sanity-check for the Architect)

Before the Architect synthesises:

```bash
# 1. Existing seam tests still pass (Brief 260 + 282 substrates we extend)
pnpm vitest run src/engine/generate-share-variants.test.ts
pnpm vitest run src/engine/network-privacy-scrubber.test.ts
pnpm vitest run packages/web/app/api/v1/network/people/\[id\]/share/route.test.ts

# 2. Verify the surface tuple location for scrubber extension (Q5)
grep -n "NETWORK_PRIVACY_SURFACES" src/engine/network-privacy-scrubber.ts
# EXPECT: line 11 (tuple definition)

# 3. Verify card-silhouette is the single canonical iconic-card module (Soul Move #7)
grep -rn "card-silhouette" packages/web/app packages/web/components
# EXPECT: all imports resolve to packages/web/components/network/card-silhouette.tsx

# 4. Confirm in-house HMAC pattern is current (W-5 Shape A baseline)
grep -n "crypto.subtle.sign" packages/web/middleware.ts
# EXPECT: line 92

# 5. Confirm no existing iron-session/jose dependency (W-5 Shapes B/C are net-new)
grep -E '"(iron-session|jose|sanitize-html)"' packages/web/package.json package.json
# EXPECT: no match

# 6. (Optional, de-risks Q6) Render card-silhouette at IG-story 1080×1920 via next/og
#    before committing W-10 Shape A vs B. Spike a one-off route that returns
#    `new ImageResponse(<NetworkCardOgFrame ... />, { width: 1080, height: 1920 })`
#    and visually inspect the output. Satori is Flexbox-only and has known
#    portrait-aspect quirks (Vercel/Satori#264). 15 minutes here saves a
#    re-architect of card-silhouette.tsx if portrait reflow doesn't behave.
```

---

## Next Step

If approved by the human:
1. Add four new `docs/landscape.md` evaluations: `iron-session`, `jose`, `sanitize-html`, `langchain-ai/social-media-agent`.
2. Invoke `/dev-architect` to synthesise this report + the Designer UX spec into a Brief 277 implementation design, ruling Q1-Q9.
3. Update `docs/state.md` Brief-277 Researcher checkpoint.

Per dev-researcher contract, this report is NEUTRAL — no recommendations. The Architect rules.
