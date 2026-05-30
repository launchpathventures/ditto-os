# Brief 277 — Share Loop and Public Profile Conversion (UX Spec)

**Date:** 2026-05-19
**Status:** designer draft (pre-architect)
**Designer role:** representing the end user — the Ditto member who shares, and the visitor who arrives from a share link
**Feeds:** Dev Architect (will synthesise with engineering constraints into the brief's implementation plan)
**Reviews against:** `docs/human-layer.md`, `docs/architecture.md`, `docs/review-checklist.md`, `docs/personas.md`, `docs/insights/`

## What this spec covers

Brief 277 turns the approved Member Signal into a recognition-driven, multi-channel share loop, and converts visitors who arrive at `/people/[handle]` into the most appropriate next flow (own signal / request / intro / watch). This spec defines:

1. How sharing should *feel* for the member (Define / Delegate / Review / Decide / Curate).
2. How discovery should *feel* for the visitor (Orient / Decide / Capture / Define).
3. The process decomposition (Share Studio is itself a process with channel-specific sub-steps).
4. UI surface composition using existing `ContentBlock` primitives and `card-silhouette.tsx`.
5. Per-channel copy patterns and interaction states.
6. The outcome-led share consent flow (this is the privacy-critical surface).
7. Visitor CTA intent inference and referral context preservation.

## Persona lens

Brief 277 sits in the Network space. The two protagonist roles are:

### A. Member-sharer (the four personas applied)

| Persona | Likely channel | What they care about | Stress test |
|---------|---------------|----------------------|-------------|
| **Rob** (trades, mobile-first) | Email signature, Website badge for trade-directory profile, copy URL into WhatsApp | "Will people I already know see this without me feeling cringe?" | Can he share in 90 seconds from a phone between jobs? Email sig + URL copy must be first-class, not buried. |
| **Lisa** (ecomm, visual) | Instagram story, LinkedIn | "Does the card look beautiful and on-brand for my feed?" | Is the 9:16 story card visually strong on its own? Does the OG image feel as polished as her product photography? |
| **Jordan** (IT generalist, efficient) | LinkedIn, X | "Can I post once, get the right wording per channel, and move on?" | Do multi-channel variants generate fast enough that Jordan doesn't lose patience? Is the "copy + post offsite" 2-click? |
| **Nadia** (team manager) | Less personal sharing; cares about *team* signal sharing (deferred — not in 277) | "Would my report be embarrassed if I posted this for them?" | Out of scope but flag — team-member-sharing-permission is a future surface; do not pre-build. |

### B. Visitor (the inbound persona)

The visitor is a non-member who follows a share link. Three intent shapes recur:

| Visitor shape | Signal | Right next path |
|---------------|--------|-----------------|
| **Curious peer** ("interesting, what does this person do?") | Lands on profile, reads card, no specific ask | Soft Orient — pills + signal + soft "build your own signal" pill |
| **Similar-expertise practitioner** | Asks pills about the member's craft; KB chat reveals overlap | "Want Ditto to build a signal for you too?" — Brief 272 onboarding handoff |
| **Helper-seeker** | Asks "can {name} help with X?" or "do you know someone who does Y?" | "Create a request and Ditto can keep watch" — Brief 273 entry |
| **Intro-seeker** | Asks "how do I get introduced?" or clicks pill | Brief 276 consent path — intro request authorization |

The visitor is never assumed to know what Ditto is. Every CTA must teach by demonstration ("ask about me" *is* the demo), not pitch.

## Six human jobs — mapping

### Share Studio (member-sharer)

| Job | What it looks like in the Share Studio |
|-----|------|
| **DEFINE** | Member chooses voice (quiet / loud / ask) and edits the draft. Member's edit is the canonical source of their public claim — Alex/Mira's draft is a starting point, not a final answer. (Per [Insight-024 edits-are-feedback].) |
| **DELEGATE** | Channel-specific draft generation is delegated to Alex/Mira via `generate_share_variants`. The member doesn't write each variant from scratch. |
| **REVIEW** | Live OG/PNG preview shows what others will see *before* they post. Outcome-led variants surface a scrub preview ("here's what they'll see — the other party is not named"). |
| **DECIDE** | Three nested decisions: which channel, which voice, post-now vs copy-only. Decisions are reversible — copy doesn't fire any side-effect; only "Post to LinkedIn" leaves Ditto. |
| **CURATE** *(Insight-238 — proposed 7th job, pending human ratification)* | The member curates what is *not* shared. Outcome shares default to maximum redaction. The privacy preview is the curate surface — member can confirm scrub passed, or reject and skip. **Contingency:** if Insight-238 is declined by the human, reframe this surface as **ORIENT** (scrub-check preview communicates state) + **DECIDE** (checkbox gate is the explicit choice). The functional design does not change — only the job label. |
| **CAPTURE** | Implicit: every edit, every "skip this channel", every variant pick captures preference signal for future drafts. Explicit: post-intro outcome reporting (opt-in checkbox) becomes the seed for outcome-led variants. |
| **ORIENT** | Not central here — the member is already oriented to their own signal. (ORIENT is the visitor's primary job.) |

### Visitor conversion (`/people/[handle]`)

| Job | What it looks like for the visitor |
|-----|------|
| **ORIENT** | Card silhouette + signal text + 4 quick-start pills (already in place from Brief 259). New: a referral-aware top-line if `?ref=` present — "{member} shared this on LinkedIn." |
| **CAPTURE** | Visitor asks the rep (Alex/Mira) a question. The system *captures intent shape* from the question via keyword/embedding match against the four intent shapes above. |
| **DECIDE** | Intent-aware CTA strip appears in the right rail / below chat. CTAs are pills, not modals — visitor can ignore. Default state shows all four CTAs as soft pills. Inferred state highlights one with a one-line "why this fits you." |
| **DEFINE** | If visitor picks "Build your own signal", they enter Brief 272 onboarding with referral context preserved — the first prompt acknowledges the source ("You came from {member}'s signal — want us to thank them?"). |
| **DELEGATE** | If visitor picks "Create a request" or "Request intro", they hand off to Alex/Mira to either run a request flow (Brief 273) or send a consent-gated intro request (Brief 276). |
| **REVIEW** | Visitor can preview the rep's full chat transcript before any intro is dispatched (Brief 248/259 `AuthorizationRequestBlock` preview pattern). |
| **CURATE** *(pending Insight-238 ratification — fallback: DECIDE)* | Visitor curates what reaches the member — they edit the forwarded note before it dispatches. Same edit-is-feedback principle. |

## Process architecture (the Share Studio is itself a process)

The Share Studio is not a screen; it is a small managed process. A non-technical observer (process owner) should be able to read it like this:

Brief 277 actually defines **two separate processes**. They share the share-link as the seam between them but they have different actors, different triggers, and different durations. Decomposing them as one process conflates the member's authoring loop with the visitor's discovery loop. Split:

```
process: share_studio
actor: member
trigger: member_signal_approved OR explicit_share_cta
inputs:
  - approved_member_signal
  - selected_channels (default: all)
  - selected_voice (default: loud, per Brief 260)
  - outcome_seed (optional — present only on outcome-led path)
steps:
  1. validate_signal_approved (gate)
  2. validate_outcome_consent (gate, only if outcome_seed present)
  3. generate_variants_per_channel (parallel, guarded — stepRunId required)
  4. render_previews (LinkedIn long, X short, IG story, email sig, website badge, PNG, URL)
  5. await_member_edit (member may remix any variant)
  6. on member_copy_or_post:
       - record_attribution (channel, signal_handle, voice, edit_distance)
outputs:
  - share_variant per channel
  - share-event attribution rows (no private text)
quality criteria:
  - every variant cites only approved-public signal facets
  - outcome variants pass scrubber (Brief 282) before render
  - no autopost, no auto-DM ever
end: when member copies/posts or dismisses
```

```
process: visitor_conversion
actor: visitor (anonymous)
trigger: HTTP GET /people/[handle] with ?ref= present
inputs:
  - profile_handle
  - referral_context (channel, source-profile-handle, ts)
  - visitor_chat_history (within the session)
steps:
  1. capture_referral_context (signed cookie; per Surface 4)
  2. serve_default_cta_strip (all four soft pills)
  3. on visitor_chat_question:
       - infer_intent (keyword/embedding match against the four intent shapes)
       - update_highlighted_cta (or keep all-soft if no clear signal)
  4. on visitor_cta_click:
       - route to (intro [→ Brief 276] / signal [→ Brief 272] / request [→ Brief 273] / watch [→ Brief 275])
       - preserve referral_context in entry URL
outputs:
  - conversion event (referral_context + chosen_path) — only on click, never on hover/dwell
  - hand-off to downstream brief with referral preserved
quality criteria:
  - CTAs always dismissible — no modal takeover on cold visitor
  - intent inference never blocks visitor from any CTA
  - cookie shape carries no visitor identity or chat content
end: when visitor clicks a CTA, leaves, or stays in chat with no action
```

This decomposition is what the architect should encode. The user-readable surface for `share_studio` is the Share Studio modal; the user-readable surface for `visitor_conversion` is the public profile page plus its CTA strip. The two processes meet at the `?ref=` query string — that string is the *interface contract* between them. This split also enables future channel additions (WhatsApp, Bluesky, Substack note) on the share side without touching the visitor side, and vice versa.

## UI surfaces

### Surface 1 — Share Studio (expanded modal)

Extends `packages/web/components/network/share-modal.tsx`. Two-mode contract:

- **Compact mode** (current behaviour, preserved): single-channel inline modal, default voice loud, three-button footer.
- **Studio mode** (new): full-modal takeover with channel tab strip + multi-channel preview switcher.

**Studio mode layout:**

```
┌────────────────────────────────────────────────────────────┐
│ Share your signal                              [X] close   │
│ Voice: ( ) quiet  (•) loud  ( ) ask                        │
│                                                             │
│ ┌──── Channel tabs ────────────────────────────────────┐   │
│ │ LinkedIn │ X │ Instagram │ Email sig │ Badge │ PNG │ │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌── Live preview ──────────┐ ┌── Variant + remix ────┐    │
│ │                          │ │                       │    │
│ │  card-silhouette in      │ │ Generated copy:       │    │
│ │  channel-appropriate     │ │ [scrollable readonly] │    │
│ │  dimensions:             │ │                       │    │
│ │  - LinkedIn → 1200×630   │ │ Remix:                │    │
│ │  - X → 1200×630          │ │ [editable textarea]   │    │
│ │  - IG → 1080×1920 (9:16) │ │                       │    │
│ │  - Email → text preview  │ │ Character count:      │    │
│ │  - Badge → HTML preview  │ │ X — 247/280           │    │
│ │  - PNG → 1200×630        │ │                       │    │
│ │                          │ │                       │    │
│ └──────────────────────────┘ └───────────────────────┘    │
│                                                             │
│ Footer (channel-specific):                                  │
│  LinkedIn → [ Copy text ] [ Post to LinkedIn ]              │
│  X        → [ Copy text ] [ Post to X ]                     │
│  IG       → [ Copy caption ] [ Download story card ]        │
│  Email    → [ Copy plain text ] [ Copy HTML ]               │
│  Badge    → [ Copy snippet ]                                │
│  PNG      → [ Download PNG ]                                │
│  URL      → [ Copy URL ]                                    │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Surface 2 — Outcome-led share consent flow

This is the **highest-risk** surface in Brief 277. Privacy mistakes here become public.

Trigger surface: post-intro outcome reporting capture (Brief 277 also has to define this — see Open Q1) reaches a usefulness threshold OR the member explicitly clicks "Share this outcome."

```
┌────────────────────────────────────────────────────────────┐
│ Share what Ditto helped find?                              │
│                                                             │
│ Here's what others would see:                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │  [scrubbed draft preview]                            │   │
│ │                                                       │   │
│ │  "Ditto found a thoughtful connection that changed   │   │
│ │   the brief. Fewer intros, better fit."              │   │
│ │                                                       │   │
│ │  (no names, no deal details, no private context)     │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                             │
│ Scrub check:                                                │
│   ✓ No other-party name                                    │
│   ✓ No deal/contract details                               │
│   ✓ No private request text                                │
│   ✓ No outcome value/amount                                │
│                                                             │
│ ☐ I've reviewed this and confirm it contains nothing       │
│   personal to the other side.                               │
│                                                             │
│ [ Skip ]                          [ Continue to Studio ]   │
└────────────────────────────────────────────────────────────┘
```

**Critical:** the checkbox is the consent gate. Continue is disabled until checked. Skip dismisses with no side effect. If the scrub check fails *any* line (returned `false` from the Brief 282 scrubber), the modal blocks with: "We couldn't safely scrub this. Please reword manually or skip this share." — no Continue option offered.

### Surface 3 — Visitor CTA strip on `/people/[handle]`

Insertion point: the `aside` column on desktop, below the chat panel on mobile. Lowest layout disruption to the existing profile-as-chat surface.

```
┌── Right rail (desktop) ────────┐
│                                 │
│  card-silhouette                │
│  (existing)                     │
│                                 │
│  ────────────────────           │
│                                 │
│  What next?                     │
│                                 │
│  [Ask Ditto about me     ]      │ ← always visible
│  [Request an intro       ]      │ ← always visible
│  [Build your own signal  ]      │ ← always visible
│  [Create a request       ]      │ ← always visible
│                                 │
│  (one highlighted with a        │
│   contextual one-liner once     │
│   intent inferred)              │
└────────────────────────────────┘
```

**Intent inference rules** (lightweight — keep server-side, no LLM round-trip):

| Signal | Inferred intent | Highlighted CTA | One-line whisper |
|--------|-----------------|-----------------|------------------|
| `?ref=` present and visitor has not engaged | Curious | none highlighted — all four soft | "{member} shared this on {channel}." |
| Visitor asks "do you do X" where X overlaps member's signal keywords | Similar-expertise | Build your own signal | "You seem to be in a similar space — Ditto can build a signal for you too." |
| Visitor asks "can {member} help" or "do you know someone who" | Helper-seeker | Create a request | "Sounds like you have something specific in mind — Ditto can keep watch." |
| Visitor asks "how do I reach" / clicks "I'd like an intro" pill | Intro-seeker | Request an intro | "Here's how the consent-gated intro works." |

The highlight is a soft visual emphasis (border + tinted bg), not a modal takeover. Per the brief constraint: *"Visitor came from share link and does nothing → soft CTA only, no modal takeover."*

**Multi-intent fallback (the hybrid case):** A real visitor may ask "do you do X and could you intro me to someone who does Y?" — overlapping similar-expertise + helper-seeker, or even three shapes. The inference rule should:

1. Score each of the four intent shapes independently (each from 0 to 1) per visitor turn.
2. **Single winner:** if exactly one shape exceeds threshold (`0.6` default — architect to tune) AND its margin over the runner-up is `≥0.2`, highlight that single CTA.
3. **Two-way tie:** if two shapes are within `0.2` of each other and both above threshold, highlight both at equal weight. Whisper line: "Sounds like you have a couple of things in mind — pick whichever feels right." No third highlighted.
4. **Three-way or noisy:** revert to default state (all four soft, no highlight, no whisper). This is the safe fallback — never highlight three of four, which is visually no different from highlighting none.
5. **Decay:** highlights persist for one visitor turn after the inferring question; if the next turn doesn't reinforce the same intent, decay back to default. Prevents stale highlights from a one-off mention.

The visitor can always click any CTA regardless of inference state. Inference is a hint, never a gate.

### Surface 4 — Referral context preservation

URL contract:

```
https://{handle}.ditto.you/people/[handle]?ref={channel}&ph={profile-handle}&utm_source={source}&utm_medium=share
```

Where `?ref` is set by share variant generation per channel:
- LinkedIn post → `?ref=linkedin`
- X post → `?ref=x`
- IG story (link sticker) → `?ref=instagram`
- Email signature → `?ref=email`
- Website badge → `?ref=badge`
- Plain URL copy → `?ref=copy`

Persistence:
1. Visitor lands → server reads `?ref` and `ph`, sets a signed first-party cookie scoped to `.ditto.partners` (verified: `packages/web/app/people/[handle]/page.tsx:59` confirms public profile lives on `https://ditto.partners`).
2. If visitor proceeds into Brief 272/273/276 flow, the referral context is read from cookie and passed as a query param in the entry URL. **Cross-domain note:** Brief 272 onboarding may land the visitor on a workspace subdomain (`ditto.you`) after sign-up. The cookie does not cross from `.ditto.partners` to `.ditto.you`. The handoff therefore happens **via signed query param in the redirect URL**, not via shared cookie. Pattern: `https://{handle}.ditto.you/network/onboarding?ref={signed_payload}` where `signed_payload` is the HMAC-signed `{channel, ph, ts}` re-emitted server-side at sign-up time.
3. At the first onboarding step, a single-line micro-acknowledgement: "You came from {member}'s signal — want us to thank them?" — checkbox, defaults off, dismissible.

**Privacy:** the cookie value is signed (HMAC), short-lived (24h), contains only `{channel, ph, ts}` — no visitor identity, no chat content, no IP fingerprint beyond what the request already carries.

**Domain topology fact (verified):**
- Network front door / public profiles: `ditto.partners` (this is where the cookie lives).
- Per-user workspace face: `{handle}.ditto.you` (separate apex; cookies do NOT cross).
- Implication: the `share_studio` and `visitor_conversion` processes both run on `ditto.partners`; only post-conversion onboarding crosses into `ditto.you`. The signed-query-param handoff is the bridge.

## Channel copy patterns

The brief gives example copy. The pattern beneath the examples:

| Channel | Format constraint | Tone | Asset focus |
|---------|------------------|------|-------------|
| **LinkedIn** | Long-form (up to ~3000 chars practical); link expanded with OG card | Professional, specific, third-person about the signal | OG 1200×630 |
| **X** | ≤280 chars; link auto-cards | Punchy, single-claim | OG 1200×630 |
| **Instagram story** | Caption is invisible; image is the message; 1 link sticker max | Visual, single sentence overlay | 9:16 story card 1080×1920 |
| **Email signature** | Plain text; HTML variant; one short line | Quiet, professional, ambient | None (text only) — see Email HTML safety note below |
| **Website badge** | HTML snippet copy; escaped on render | Static, ambient, low-key | Small SVG/PNG badge |
| **PNG** | Standalone card, no context | Self-contained | 1200×630 |
| **Public URL** | Just the URL | None | None |

**Email HTML safety (must-hold contract):** The "Copy HTML" action returns a server-generated, server-escaped HTML fragment. Member-customisable text (e.g. a one-line tagline) is interpolated into the fragment *server-side with strict HTML-escape* — never as raw HTML, never via client-side string concatenation. The fragment contains: one `<a>` element with `href` to the canonical `/people/{handle}?ref=email` URL, escaped link text, no inline event handlers, no `<script>`, no `<style>`, no `<iframe>`. The clipboard receives exactly what the server rendered. This satisfies AC 12 (HTML-safe) and closes the XSS surface that exists in any "copy customisable HTML to clipboard" feature.

**Voice + channel matrix** (which voices make sense per channel):

| | quiet | loud | ask |
|---|---|---|---|
| LinkedIn | ✓ | ✓ (default) | ✓ |
| X | ✓ | ✓ (default) | ✓ |
| Instagram | — | ✓ (default) | ✓ |
| Email sig | ✓ (default) | — | — |
| Website badge | ✓ (default) | — | — |
| PNG | n/a — no copy on card | n/a | n/a |
| URL | n/a — no copy | n/a | n/a |

Channel-specific defaults override the modal-level voice setting. The member can still pick any voice that's not dashed-out.

## Interaction states (per surface)

### Share Studio

| State | Visual | Behaviour |
|-------|--------|-----------|
| `empty` | "Approve your signal first" panel | Disabled until signal in `approved` state |
| `loading-variants` | Right panel skeleton; preview shows last good variant or "Generating draft…" | All channel tabs visible; selected tab shows spinner |
| `success` | Variants populated; remix editable; Copy enabled | Switching tabs is instant if cached, re-loads if not |
| `error-channel` | Single channel tab shows error icon; "Couldn't generate — retry" inline | Other channels usable; affected channel non-blocking |
| `error-all` | "Couldn't generate copy. Try again." with single retry button | Original signal still visible |
| `outcome-scrub-failed` | Modal blocks with red banner; no Continue button | Member can edit or skip |
| `copied` | "Copied" 1500ms flash on the action button (per existing Brief 260 pattern) | Returns to "Copy" idle |

### Visitor CTA strip

| State | Visual | Behaviour |
|-------|--------|-----------|
| `empty` (page just loaded) | Four soft pills, equal weight | All clickable |
| `inferred-intent` | One pill highlighted (border + tinted bg); whisper line below | Highlighted pill still toggleable; other CTAs still clickable |
| `loading-route` | Clicked pill shows spinner; others dim | Cancellable by clicking elsewhere |
| `success-routed` | Page transitions to next flow with referral context | n/a |
| `error-route` | "Couldn't route — here's the direct link" with anchor | Direct link is the same URL the CTA would've followed |

### Outcome-share consent

| State | Visual | Behaviour |
|-------|--------|-----------|
| `presenting-scrub` | Scrubbed copy shown; 4 scrub checks rendered green | Continue disabled until checkbox checked |
| `presenting-scrub-fail` | Red banner; checks show ✗ where failed | No Continue option |
| `consenting` | Checkbox checked → Continue enabled | Member can re-uncheck |
| `continuing` | Spinner on Continue → opens Share Studio with outcome variant pre-loaded | n/a |
| `skipped` | Modal dismissed; no event written | n/a |

## ContentBlock primitive composition

Existing primitives that map cleanly:

| Surface need | Primitive |
|--------------|-----------|
| Share Studio modal as a chat-emitted action | `ActionBlock` with `ctaType: "open_share_studio"` — opens the Studio modal in-place |
| Outcome-share consent | `AuthorizationRequestBlock` with `preview: ContentBlock[]` carrying the scrubbed draft as a `TextBlock` for review |
| Visitor CTA strip | `SuggestionBlock` (line 394) — `{ content, reasoning?, actions?: ActionDef[] }`. Each visitor CTA is a `SuggestionBlock` whose `actions[0]` is the click target; intent metadata rides on `actions[0].payload` (`ActionDef.payload?: Record<string, unknown>` — line 21). Suggested shape: `payload: { intentShape: "curious" | "similar-expertise" | "helper-seeker" | "intro-seeker", referralContext?: { channel, sourceHandle } }`. **Do not extend `SuggestionBlock`** with a new top-level `intent` field — `payload` is the documented escape hatch for caller-defined metadata. |
| Live preview card in Share Studio | `NetworkProfileCardBlock` extended with `channelMode: "linkedin"|"x"|"instagram"|"email"|"badge"|"png"|"url"` (extends the existing block, doesn't create a new one) |
| Channel tab strip | Plain UI inside Share Studio; not a ContentBlock — Studio is a modal surface, not a chat-rendered block |
| Outcome scrub check rows | `ChecklistBlock` (line 667, `packages/core/src/content-blocks.ts`) — each scrub check renders as an item: `{ label: "No other-party name", status: "done"|"warning", detail?: "..." }`. `done` = scrubber passed; `warning` = scrubber flagged. The `detail` field carries the reason for any warning. |

New primitive *if needed* (architect's call):
- `OutcomeConsentBlock` — if the scrub-check pattern recurs in places beyond outcome-share (e.g. Brief 278's admin observability previews), promote it to its own type. **Recommendation: do NOT create yet.** Use `AuthorizationRequestBlock` + `ChecklistBlock` composed; revisit if the pattern duplicates in Brief 278.

**Why `ChecklistBlock`, not `ReviewCardBlock`:** `ReviewCardBlock` (line 46) has a fixed schema for process-output review surfaces — fields `processRunId`, `stepName`, `outputText`, `confidence`, `actions`, `knowledgeUsed`. There is no `checks` field. `ChecklistBlock` is purpose-built for status-line lists with `done`/`pending`/`warning` and an optional detail — semantically and structurally correct for scrub-check rendering.

Reference: `packages/core/src/content-blocks.ts`.

## Provenance

| What | Source | Level |
|------|--------|-------|
| Three-voice variants, OG/PNG, single-channel modal | Brief 260 | adopt |
| Card silhouette as shared visual primitive | Brief 254 (Soul Move #7) + `card-silhouette.tsx` | adopt |
| `NetworkProfileCardBlock` extension for channel modes | Brief 256 NetworkProfileCardBlock | adopt |
| `AuthorizationRequestBlock` with `preview: ContentBlock[]` for outcome consent | Brief 248/259 transcript-carrying pattern | adopt |
| Visitor profile-as-chat surface; quick-start pills | Brief 259 (complete) | adopt |
| Privacy scrub for outcome variants | Brief 282 (pending human approval) | **dependency — must complete before outcome variants ship** |
| Six human jobs framework | `docs/human-layer.md` | adopt |
| Curate as 7th job | Insight-238 | adopt |
| Edits-are-feedback (remix is signal) | Insight-024 | adopt |
| Plan-approve-execute (consent gate) | Insight-182 | adopt |
| Recipient experience design | Insight-147 | adopt |
| Two-sided acquisition (member share + visitor convert as one loop) | Insight-155 | adopt |
| Value before identity (visitor demos before signup) | Insight-154 | adopt |
| Broadcast vs direct (sharing is always member-led — never auto) | Insight-167 | adopt |
| Connection-first (visitor CTA hierarchy: intro > signal > request) | Insight-166 | adopt |
| Identity choice as trust conversation (referral acknowledgement is optional, never gated) | Insight-187 | adopt |
| Multi-channel share studio decomposition | Original to Ditto | original — referenced Typefully/Buffer for tab-per-channel pattern, but Ditto's per-channel voice-matrix + consent gates are novel |
| Intent-aware visitor CTA inference | Original to Ditto | original — referenced ManyChat's permission-select UI for the soft-pill pattern, but the intent-shape mapping is Ditto-specific |
| Outcome-led share with explicit scrub preview | Original to Ditto | original — no precedent found in surveyed products; this is the privacy-first answer to "social proof" sharing |

## Reference docs status

- `docs/personas.md` — **no drift.** Brief 277 doesn't change the four personas; it tests them against a new surface (Network share + visitor conversion). Sharing-Persona is still implicit; Architect may want to capture "Member-sharer" and "Visitor" as Network-layer personas in a future doc update.
- `docs/human-layer.md` — **no drift in the six canonical jobs** (Orient, Review, Define, Delegate, Capture, Decide are applied correctly throughout). Insight-238's Curate-as-7th-job is referenced for the outcome-share surface and visitor-edit surface but is **provisional / pending human ratification** — `human-layer.md` itself still lists six jobs. If ratification is declined, this spec's two Curate surfaces fall back to Orient + Decide (member outcome-consent) and Decide (visitor edit) without any functional change. If ratification is granted, absorb Insight-238 into `human-layer.md`.
- `docs/architecture.md` — **no drift** for this brief's surfaces. Process-as-primitive is honoured (Share Studio is decomposed as a process).
- `docs/insights/` — Insight-238 (Curate) explicitly applied here for the first time on a *member-facing* surface (it originated as a Privacy Center insight); worth back-annotating Insight-238 with this second realisation when Documenter runs.

## Open questions for the Architect

1. **Outcome capture mechanism.** Brief 277 references "useful connection or reported outcome" but no current brief defines the capture mechanism. The Architect must either fold a minimal outcome-feedback capture into 277 or surface a new brief. **Recommendation:** define a minimal "Useful?" thumbs-up surface attached to intro accept/decline (Brief 276) — already a natural moment.
2. **Brief 282 scrubber readiness.** Outcome-share consent surface depends on `scrub_share_variant` returning structured pass/fail per check. Confirm Brief 282 will expose this contract before Brief 277 builder phase starts.
3. **CTA placement on `/people/[handle]`.** Recommended: `aside` column on desktop, below chat on mobile. Confirm with Architect whether the existing `aside` is the right anchor or if a new layout region is warranted.
4. **Referral context storage shape.** Signed first-party cookie OR durable attribution table with session-binding? Both work; the choice depends on whether anonymous-visitor attribution (no chat engagement) should be persisted across sessions. **Recommendation:** cookie (24h, signed) for in-session preservation + durable row only on conversion action.
5. **Instagram 9:16 card.** `card-silhouette.tsx` currently has UI mode + 1200×630 OG mode; no 9:16 variant. Add as a new mode (`storyMode`) to the existing component, or extract into a sibling component? **Recommendation:** new mode on existing component to keep the "one iconic card silhouette" doctrine (Soul Move #7).
6. **Variant generation: one call or per-channel?** One call returning `{linkedin, x, instagram, email, badge}` is cheaper (single context) but slower (must complete all before any visible); per-channel is faster perceived but more expensive. **Recommendation:** generate the active channel first (perceived speed), background-generate the others in parallel.
7. **Domain topology for referral cookie — RESOLVED.** Verified by greping `packages/web/app/people/[handle]/page.tsx:59`: public profile lives on `ditto.partners`. Cookie is scoped to `.ditto.partners`. Cross-domain handoff into the workspace face (`{handle}.ditto.you`) uses signed-query-param re-emission at sign-up time. No further architect work needed on the domain choice; architect should still confirm the signed-payload TTL and rotation policy.
8. **Website badge embed sandboxing.** The brief constrains `cannot execute arbitrary user text as HTML`. **Recommendation:** badge is a static link with text content; no `<script>`, no user-supplied attributes; member-customisable text is rendered server-side with strict escape.

## Acceptance criteria coverage

Mapped to Brief 277's 17 ACs:

| AC | This spec addresses via |
|----|------------------------|
| 1 — Share Studio after Member Signal approval | Surface 1, trigger condition |
| 2 — Multi-channel support | Surface 1 channel tabs |
| 3 — Approved public claims only | Process step 1 validate gate; provenance dependency on Brief 272 approved-signal contract |
| 4 — Channel-specific copy | Channel copy patterns table |
| 5 — User can edit | Remix textarea pattern adopted from Brief 260 |
| 6 — No autopost | Footer action contract: Copy is offline; Post is offsite intent, never auto |
| 7 — Instagram asset-first | Channel copy patterns: caption + 9:16 PNG, link sticker only |
| 8 — Intent-aware visitor CTAs | Surface 3 + intent inference rules |
| 9 — Attribution privacy | Surface 4 cookie shape (channel/ph/ts only) |
| 9a — Outcome consent + scrub | Surface 2 in full |
| 10 — Brief 260 OG/PNG continues | Compact mode preserved on existing modal |
| 11 — Badge HTML escape | Channel pattern + Open Q8 |
| 12 — Email plain text | Channel copy patterns; "Copy plain text" + "Copy HTML" two actions |
| 13 — Visitor can ask before signup | Existing Brief 259 behaviour preserved; no auth gate |
| 14 — Build-own-signal preserves referral | Surface 4 → Brief 272 entry |
| 15 — Create-request preserves referral | Surface 4 → Brief 273 entry |
| 16 — Tests cover stated cases | (architect-facing; not designer scope) |
| 17 — Playwright covers Share Studio + visitor CTAs | (architect-facing; not designer scope) |

## Signal-version coherence for outstanding shares

A LinkedIn post made today links to `ditto.partners/people/{handle}?ref=linkedin`. Six months later the member's signal has changed — the visitor arriving from the old post sees a different signal from the one that was originally shared. Three questions arise:

1. **Should the visitor see the same signal that was shared?** No. The signal *is* the member's current public claim — that is the point of the Network Service. Showing a stale snapshot would create a fake "frozen at share time" claim that the member never re-approved.
2. **Should the visitor be told the signal has changed since this share was posted?** No — that surfaces internal versioning to the visitor, which is doctrinally wrong (visitor doesn't need to know Ditto's mental model).
3. **Should the member be notified when an old share is still circulating but their signal has materially changed?** Out of scope for Brief 277. **Recommendation:** capture as a future-brief seed in `docs/insights/` — title "Share-link signal-version coherence" — and defer until there's a real user incident or member request. The simplest acceptable v1 behaviour is: share links always resolve to current signal; no warning, no archive lookup, no version pinning.

**Explicit out-of-scope decision for the Architect:** the Share Studio does NOT pin a signal version to a share URL. Share URLs are always pointers to the current `/people/{handle}` state. This is the simplest correct default and matches every social platform's behaviour (a tweeted blog-link resolves to whatever the blog has now, not what it had on the tweet date).

## What this spec does NOT decide

- Server route shapes (architect's call)
- Database tables for attribution (architect's call)
- LLM prompt for `generate_share_variants` channel-specific branching (architect + builder)
- Specific copy-text for the four CTA pills (designer can iterate post-architect)
- Whether to add native Bluesky / Threads / WhatsApp share — out of scope for v1

## Process owner's experience

A non-technical process owner watching Share Studio runs should see, in order:

1. "Member {handle} approved signal at {ts}."
2. "Share Studio opened — generating variants for LinkedIn, X, Instagram, Email, Badge."
3. "Member edited LinkedIn variant (edit distance: 23 chars)."
4. "Member copied LinkedIn variant."
5. "Member posted to LinkedIn (intent — left Ditto)."
6. "Visitor arrived at /people/{handle}?ref=linkedin."
7. "Visitor asked: 'do you do agentic ops?' — intent inferred: similar-expertise."
8. "Visitor highlighted CTA: Build your own signal."
9. "Visitor clicked. Routed to Brief 272 onboarding with referral context."

This narrative *is* the surface the process owner monitors. The Share Studio is not opaque magic; every step is named and visible. (Per `docs/architecture.md`'s process-as-primitive doctrine.)
