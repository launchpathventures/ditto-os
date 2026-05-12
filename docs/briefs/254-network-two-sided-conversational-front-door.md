# Brief 254: Network as Two-Sided Conversational Front Door (Parent)

**Date:** 2026-05-07
**Status:** draft (revision 2.2 — 2026-05-09; foundation step split into Brief 262 (tier reclassification, schema-only) + Brief 263 (Postgres migration + file split + dialect swap) per ADR-048 + Reviewer findings; revision 2.1 — 2026-05-07; persona-neutral landing + iconic card + profile-as-chat + KB intake + share-modal scope expanded; reviewer-pass fixes applied: hard-rule count reconciled to six, Brief 248 path corrected, stepRunId enumerated for 5 new tools, crossover trust-gate invariant added, sub-brief 257 path anchored, AC-J refusal triggers enumerated, Mira-scoreboard tracked in Deferred Items, per-fact visibility marked original, Reference Docs section added)
**Depends on:** Brief 248 (authorization-gate) — complete; Brief 246 (wedge demo) — complete; ADR-041 (Brand/Greeter/Self ontology) — accepted; ADR-048 (Network Tier Postgres Migration — Execution on Supabase Postgres) — accepted on Brief 263 land
**Unlocks:** Briefs 255-261 (sub-briefs), gated through 262 + 263 foundation; follow-up payment brief once free-intro loop validates

## Goal

- **Roadmap phase:** Phase 14 — Network Agent
- **Capabilities:** Establish `/network` as a two-sided conversational front door where users can arrive as either *experts* (supply) or *clients* (demand), where Greeters (Alex/Mira) extract a profile or job request, where the Greeter brokers introductions, and where the workspace (`ditto.you`) is offered naturally when value is visible. This is the viral loop that turns every search into either an instant intro or a quality-targeted scout-and-invite.

## Context

Two converging signals make this the right work now:

1. **Ethos (askethos.com) validates the pattern.** Ethos is a $22.75M-Series-A "human intelligence on-demand" agent that lets users describe what they need and brokers expert connections. Their two-sided structure — voice-onboarded experts on supply, agent-mediated search on demand — is exactly the structure ADR-041 already encodes for Ditto, but Ditto has been positioning the network as a one-way outreach product (`packages/web/app/network/page.tsx`).

2. **The plumbing already exists.** The Greeter conversational onboarding ships in `packages/web/app/welcome/ditto-conversation.tsx`. The `ReviewCardBlock` content block (`packages/core/src/content-blocks.ts`) renders the "storyboard report" pattern. The `authorization-request` block (Brief 248) governs intro approvals. The `networkUsers` table (`src/db/schema/network.ts:180-209`) has `wantsVisibility`. The Self memory primitive lets every user be both operator and representative. Composing these into a single front door is mostly product / IA work, not new primitives.

The user's framing locks the design:
- *"Some users come for the workspace, others come for economic opportunity and to find great people."*
- *"Network is a hybrid — users can search AND AI scouts and invites; that drives the viral loop."*
- *"Workspace upsell must occur naturally in the chat and be dead clear why it's useful."*

## Objective

A user arriving at `ditto.partners/network` lands in a Greeter conversation with a visible mode toggle. They become either an **expert** (resolves to a profile card + listing) or a **client** (resolves to a job-request card + suggested candidates from the network, with an option to scan off-network). Either side can request an introduction; first 2 are free, the limit is enforced but no payment is collected in v1. At the right moment, the Greeter offers a workspace — earned, not forced, with concrete value framing.

## Non-Goals

- **No payments in v1.** Free intros up to 2; further intros gated behind "request will be reviewed" with no Stripe integration. Payment is a follow-up brief once the loop validates.
- **No public expert directory page.** Discovery is agent-mediated. Browse breaks the moat.
- **No vector search / ranking infrastructure.** First version: Greeter LLM-matches against listed Selfs in a single prompt.
- **No new persona.** Alex and Mira cover both modes. Persona selection follows existing onboarding logic.
- **No host-based deployment routing change.** `DITTO_DEPLOYMENT=public` continues to gate the surface; `/network` is the path within public mode. Host-routing is out of scope.
- **No collapse of the existing `/welcome` onboarding.** `/welcome` remains the workspace-first front door; `/network` becomes the network-first front door. Users can flow between them.
- **No two flags for visibility.** Collapse to single `wantsVisibility` (existing field). User-facing label may say "Open for opportunities" but the schema stays one flag.
- **No /network marketing page.** The chat IS the hero. The landing is a single viewport — no scroll, no FAQ, no "How it works" tiles, no "Who's already here" grid, no closing CTA card. Marketing copy is absorbed into the conversation itself (Greeter's first message + meta tags + landing chrome only). This non-goal supersedes the multi-section Surface A in revision 1.
- **No Greeter name on the landing.** Surface A is persona-neutral. Alex or Mira (existing rotation logic) introduces themselves only AFTER the user has chosen a lane and a chat begins. Reasoning per user direction: "users don't care which Greeter — they care about getting somewhere."
- **No impersonation by AI on profile pages.** When Alex/Mira chats with visitors at `/people/[handle]`, they speak as the user's REPRESENTATIVE — never claim to be the user. This is the inversion of process-os's Ask Charlie pattern (where Charlie says "you ARE me"). Sub-brief 259 must enforce this in unit tests.

## Inputs

1. `docs/adrs/041-agency-model-three-layer-ontology.md` — Brand / Greeter / Self ontology that this brief builds on
2. `docs/insights/153-three-layer-persona-architecture.md` — superseded but historically informative on the Greeter's matchmaker role
3. `packages/core/src/content-blocks.ts` — ReviewCardBlock and authorization-request block schemas
4. `src/db/schema/network.ts` — `networkUsers`, `people`, existing visibility/journey fields
5. `packages/web/app/welcome/ditto-conversation.tsx` — current Greeter conversation pattern to mirror
6. `packages/web/components/marketing/wedge.tsx` and fixtures — storyboard pattern reference
7. `src/engine/network-chat-prompt.ts` — Greeter directive structure to extend
8. `packages/web/app/network/page.tsx` — current `/network` marketing page to be replaced
9. `docs/briefs/248-greeter-beat-2-authorization.md` — authorization-gate pattern reused for intro approvals (Brief 248 is accepted; not yet relocated to `complete/`)
10. `/Users/thg/code/process-os/app/(app)/app/ask-charlie/` — AI-mediated profile pattern to ADAPT (with a critical inversion: Ditto's Greeters represent, never impersonate). Reusable: `_lib/charlie-constants.ts` (system prompt skeleton), `page.client.tsx` (chat UX), `_components/charlie-quick-pills.tsx` (4 quick-start pills pattern). Reference, not source — the ID rule inverts.
11. `.context/attachments/image-v30.png`, `image-v31.png` — Ethos single-viewport landing (clients/experts toggle)
12. `.context/attachments/image-v32.png` — Ethos "Post Opportunity" modal: live preview LEFT, structured form RIGHT. Pattern adopted for Surface B + Surface F.
13. `.context/attachments/image-v33.png` — Ethos voice-first onboarding ("James, meet *Ethos*."). Pattern adopted as optional intake mode in Surface A + Surface E.

## Constraints

- **Trust gate must govern intros.** Every intro emission is `authorization-request` block; recipient (the introduced party) is never contacted without explicit user approval AND Greeter judgment. Greeter must be willing to refuse intros that would not be welcomed (Brief 248 + ADR-041).
- **Self memory boundaries hold.** Network mode and agency mode operators do not share memory. A user's network listing is the *public projection* of their Self, not the Self itself. The full Self memory remains in their workspace.
- **No Self pollution between users.** Listing fields are scoped to the user's own network projection.
- **Schema migrations follow Insight-190.** Drizzle migration journal handled per established pattern. Sub-briefs that touch schema must follow the resequence-on-conflict rule. **Post-Brief 263**, two journals exist: `drizzle/_journal.json` (workspace SQLite) and `drizzle/network/_journal.json` (network Postgres). Each is independently subject to the resequence-on-conflict rule. Sub-briefs that touch network-tier schema (256, 258, 261) operate the network journal; workspace-tier schema changes operate the workspace journal.
- **Workspace upsell is opt-in, not gating.** Free intros do not require workspace creation. The Greeter offers a workspace when it can articulate concrete continued value, not as an entry tax.
- **All side-effecting tools require `stepRunId`** (Insight-180). The new self-tools introduced by this brief are explicitly enumerated as side-effecting and MUST take `stepRunId` as a required parameter (rejected outside `DITTO_TEST_MODE`):
  - `generate_share_variants(stepRunId, card, kb)` — sub-brief 260; calls LLM, returns 3 social-share variants
  - `scout_off_network(stepRunId, jobRequest)` — sub-brief 258; calls external search/data, returns scouted candidates
  - `emit_intro_request(stepRunId, fromHandle, toHandle, draft)` — sub-brief 261; emits AuthorizationRequestBlock + records counter
  - `extract_kb_facts(stepRunId, documentId)` — sub-brief 258; calls LLM, writes to `network_user_kb_facts`
  - `record_voice_intake(stepRunId, transcript)` — sub-brief 258; transcribes + writes to `network_user_voice_intake`
  - `forward_note_to_user(stepRunId, fromVisitor, factQuestion)` — sub-brief 259; persists `networkForwardedNotes` row + drops a notification into the user's Self/inbox thread (the on-request semantic plumbing)
  Listing updates, intro requests, scout reports, KB extractions, and forwarded-note captures all flow through harness-pipeline-aware tools — never bare LLM calls. Sub-brief acceptance criteria for 258, 259, 260, 261 MUST verify `stepRunId` is enforced (reject test without `DITTO_TEST_MODE`). Sub-briefs 258, 259, 260, 261 must also assert that the tool name registered in `src/engine/tool-resolver.ts` `builtInTools` matches the directive reference in `src/engine/network-chat-prompt.ts` (Insight-180 silent-failure guard).
- **Single Greeter conversational engine.** Reuse `network-chat-prompt.ts` and the existing chat stream — do not fork a parallel chat engine for `/network`. Mode is a directive variant, not a separate runtime. Sub-brief 255 extends `ChatContext` from `"front-door" | "referred" | "review"` to add `"expert" | "client"`.
- **Representative, not impersonator.** Greeters at `/people/[handle]` speak ABOUT the user, never AS the user. System prompt contains hard rule: *"NEVER claim to be {user_name}. You are {greeter_name}, their representative."* This is non-negotiable and must have unit-test coverage.
- **Per-fact visibility for KB facts.** Every fact in a user's knowledge base carries `public | on-request | off`. Greeter cites only matching facts; for `on-request`, the Greeter offers to ask the user. Storage is markdown (filesystem-legible) so the user can grep, edit, and audit.
- **Budget never on shareable surfaces.** Client lane Q5 captures budget shape, but it does NOT appear on candidate cards, OG images, or shareable artifacts. Candidates see "ballpark match: yes/no" only.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Agent-first two-sided expert network | Ethos (askethos.com, agent.askethos.com) | pattern | Validated $22.75M-Series-A pattern for "human intelligence on-demand" — agent-mediated search + voice-onboarded supply |
| Mode toggle inside a single Greeter conversation | Inngest AgentKit Mode 1/2/3 directive routing | pattern | Already used in Ditto for routing; extends naturally to expert/client mode |
| ReviewCardBlock for profile + job-request resolution | Existing wedge demo (Brief 246) | adopt | Already shipped; "storyboard report" aesthetic the user named directly |
| Authorization-request for intro approvals | Brief 248 (authorization-gate) | adopt | Trust-gated intro emission is structurally identical to Beat 2 actions |
| Single visibility flag | Existing `networkUsers.wantsVisibility` | adopt | Field already in schema; collapse "open for business" into this flag's semantics |
| Workspace upsell as earned moment | ADR-010 workspace interaction model + Insight-153 succession | pattern | Workspace is the durable home for compounding value; the Greeter must demonstrate that value before asking |
| Free-then-paid intro counter | Standard freemium gating | pattern | Counter scaffolding now, payment hooks deferred |
| Per-fact KB visibility (`public \| on-request \| off`) with markdown storage | original to Ditto | original | Composes filesystem-legibility memory (`feedback_user_facing_legibility.md`) with the `on-request` semantic the Greeter can act on. No external precedent located in research; LinkedIn/Contra carry coarse profile-level flags only. Soul Move #6. |

## What Changes (Work Products)

This is a **parent brief.** It defines the journey, IA, and constraints. Sub-briefs ship the code.

| Sub-brief | Scope | Depends on |
|-----------|-------|------------|
| **262** | **Foundation step 1: Network/Workspace Tier Reclassification** (added 2026-05-08, revised 2026-05-09). Reduce the network-tier surface from 11 `sqliteTable` declarations to 8 by moving 3 mis-tiered tables (`reviewPages`, `documents`, `documentContent`) out of `src/db/schema/network.ts` into workspace-tier files (new `harness.ts` for `reviewPages` — chosen over `engine.ts` per the brief's escape hatch since `engine.ts` is a thin re-export from `@ditto/core` and Brief 262 Non-Goals prohibit touching `packages/core/`; new `knowledge.ts` for `documents` + `documentContent`). Schema-only structural cleanup; SQLite throughout; `drizzle-kit generate` produces zero migrations; importers re-route. Pre-Postgres preparation. | (no brief deps — runs first) |
| **263** | **Foundation step 2: Network Tier Postgres Migration — Schema Split + Supabase Cutover** (added 2026-05-08, renumbered 2026-05-09). ADR-036 §3 file-split (post-262 `src/db/schema/network.ts` → `packages/core/src/db/network/schema.ts`) + §2 dialect swap (SQLite → Supabase Postgres via postgres-js, per ADR-048). New `networkDb` instance; ~34 importers cut over; cross-tier no-FK invariant (no-engine-import test); dual Drizzle migration trees; boot-time `ensureNetworkSchema()` migrator; transactional rollback test fixture. Lands second because every subsequent sub-brief touches the network schema and benefits from designing against the final dialect. | 262 + ADR-048 (accepted) |
| **255** | `/network` Ethos single-viewport landing + bottom toggle (clients ⇄ experts) + persona-neutral copy + ChatContext extension (`"expert" \| "client"` added) + Instrument Serif font loading via `next/font/google` + deployment routing audit. Replaces existing marketing page entirely. | 263 |
| **256** | Expert lane intake + new `NetworkProfileCardBlock` content-block type (`packages/core/src/content-blocks.ts`) + `handle` field on `networkUsers` schema + 6-question directive + storyboard live-preview pane (Ethos v32 pattern) + mobile editability + handle-claim flow during card emission | 263 + 255 |
| **257** | Client lane intake + new `JobRequestCardBlock` content-block type added to `packages/core/src/content-blocks.ts` (engine boundary — not `src/engine/`) + on-network candidate match (LLM-prompt against listed Selfs) + budget privacy enforcement (never on shareable surfaces) + 6-question directive | 263 + 255 |
| **258** | Knowledge base intake — voice (v33 pattern) + file upload (PDF/markdown/LinkedIn export) + per-fact visibility (`public \| on-request \| off`) + new schema: `network_user_kb_documents`, `network_user_kb_facts`, `network_user_anti_persona`, `network_user_voice_intake` (filesystem-legible markdown). Plus off-network scout tool. | 263 + 257 |
| **259** | `/people/[handle]` public profile-as-chat surface + Ask-Greeter system prompt (REPRESENTATIVE-not-IMPERSONATOR, with unit-test coverage of the hard rule) + visitor rate limiting + 4 dynamic quick-start pills + voice mode option (v33) + `forward_note_to_user` self-tool + `networkForwardedNotes` pgTable + Insight-231 cross-deployment auth contract. Routes the visitor's intro request via AuthorizationRequestBlock to the user's workspace inbox (transcript carried as `preview`). **Status: design-ready (`docs/briefs/259-public-profile-as-chat-and-representative-rule.md`, 2026-05-12), pending human approval.** | 263 ✓ + 256 ✓ + 258 ✓ |
| **260** | Share modal + social content gen (Greeter drafts 3 voices: quiet/loud/ask via new self-tool `generate_share_variants(card, kb)`) + dynamic OG renderer (`/people/[handle]/opengraph-image.tsx`) + downloadable PNG export. The card silhouette renders identically across in-product / OG / PNG / LinkedIn. | 263 + 256 |
| **261** | Introductions primitive + free counter (new `introductions` table) + AuthorizationRequestBlock `costLabel: string` field extension (Brief 248 primitive) + workspace upsell trigger encoded with verbatim copy + intro fulfillment via existing email/Self channels + v1 free-only enforcement | 263 + 256 + 257 + 259 |

**Build order (post-2026-05-09):** 262 → 263 → 255 → 256 ∥ 258 → 257 → 259 → 260 → 261.

**Parallelism:** 256 and 257 can run in parallel after 255 lands (both gated by 263). 258 sequences after 257 (off-network scout depends on client-lane match logic), but the KB-intake portion of 258 is independent and PM may split if useful. 259 + 260 depend on 256. 261 closes the loop after all three lane briefs and 259.

**Schema path note (post-263):** Where this brief and sub-briefs 256-261 reference `src/db/schema/network.ts`, treat it as the post-migration path `packages/core/src/db/network/schema.ts`. Where they reference `db.from(networkUsers)` (or analogous), treat it as `networkDb.from(networkUsers)`. Brief 263 ships the rename + dialect swap atomically; subsequent sub-briefs work against the new path and dialect.

**Reservations:** Brief numbers 255-261 verified unreserved as of 2026-05-07 (`docs/briefs/` + state.md grep); 262 + 263 verified unreserved as of 2026-05-09. Per memory `feedback_grep_before_claiming_shared_namespace.md`, parallel sessions should re-grep before drafting children.

## User Experience

### The two-lane journey

**Arrival** — User lands at `ditto.partners/network` and sees a single-viewport landing (Surface A — Ethos pattern, no scroll, no marketing copy, no Greeter name). The headline is persona-neutral: *"Opportunities **find** you."* with a bottom toggle EXPERTS ⇄ CLIENTS and a central card preview. Two ways into the conversation: click the central card (typed mode) OR click "Talk it through ▸" (voice mode, v33 pattern).

**Greeter introduction happens AFTER the lane choice** — once the user enters Surface B, the rotation-assigned Greeter (Alex or Mira, per existing `personaAssignment` field) introduces themselves in Q0:
> *"Hi — I'm Alex. Walk me through what you're hunting."*

**Switching mode is allowed at any time** — not a hard fork. The mode toggle persists in the chat header. A user who came as a client can switch to "actually, I want to list myself too." This *is* the loop.

### Lane A — Expert (supply)

1. Greeter walks the user through the six locked questions (see "Greeter scripts" below): UVP / anti-persona / ideal client / 3 skills / one-line hook / `wantsVisibility`.
2. Resolution: `NetworkProfileCardBlock` (NEW content-block type, sub-brief 256) with all captured fields. The user lands on Surface C with three primary actions:
   - **"Tweak this with me"** — opens a conversational edit loop. Greeter accepts free-form edits and re-emits the card.
   - **"Open for opportunities"** — toggles `wantsVisibility=true`. Greeter confirms semantics: *"You're now surfaceable in candidate-match results. I'll always check with you before reaching out."* (`wantsVisibility=false` semantics: card exists at `/people/[handle]` for direct sharing but is NOT surfaced in match results.)
   - **"Find me clients"** — flips into Lane B mechanics on their behalf, immediately giving them value.
3. **Knowledge base intake offer (Surface E):** Greeter says: *"I'll be talking to people about you. Want to give me five minutes of voice or drop in your LinkedIn export so I have something real to go on?"*
4. **Share offer (Surface F):** Greeter offers to draft 3 social variants (quiet/loud/ask) the user can copy or post.
5. **Workspace upsell trigger:** after card resolves AND user has either toggled visibility, given KB material, OR asked for client search. Greeter uses the verbatim copy in "Workspace upsell — the dead-clear moment" below.

### Lane B — Client (demand)

1. Greeter walks the user through the six locked questions: JTBD / reference shape / anti-persona / success criteria / budget shape / on-vs-off-network scout opt-in.
2. Resolution: `JobRequestCardBlock` (NEW content-block type, sub-brief 257) with all captured fields **plus a suggested candidates panel** showing 3-5 on-network matches from listed Selfs. Each candidate has a short Greeter-written rationale. Two actions:
   - **"Get an introduction"** — triggers `AuthorizationRequestBlock` (Brief 248 primitive, extended with `costLabel` field — sub-brief 261) for intro emission. First 2 free.
   - **"Scan on + off network and report back"** — invokes the off-network scout tool (sub-brief 258). Greeter returns a follow-up card with additional candidates. Some on-network, some scouting targets.
3. **Workspace upsell trigger:** after first intro is emitted, OR after first scout completes. Greeter uses the verbatim copy in "Workspace upsell — the dead-clear moment" below.

### Visitor lane (NEW) — `/people/[handle]`

A non-authenticated visitor lands at `ditto.partners/people/{handle}` (Surface D) and sees the user's `NetworkProfileCard` alongside an Ask-Greeter chat. The Greeter speaks as the user's REPRESENTATIVE (NEVER as the user — Soul Move #5). Visitor can ask quick-start questions or type free-form, and can request an intro. Intro requests route via `AuthorizationRequestBlock` to the user's inbox with full visitor transcript.

### Crossover

The most powerful moments are crossovers:
- **Expert → Client:** *"Find me clients"* on the profile card. Inverts to Lane B with the user's own profile pre-filled as "the kind of work they want."
- **Client → Expert:** after a successful intro, the Greeter offers: *"You're clearly someone people would want to know. Want to be findable too?"* Toggles `wantsVisibility`.
- **Visitor → Expert:** a visitor on `/people/[handle]` who self-identifies as an expert can be invited via "want a card of your own?" CTA — drops them at `/network` with EXPERTS pre-toggled.

These crossovers ARE the viral loop.

**Trust-gate invariant for crossovers (mandatory):** Any intro emission triggered through a crossover path is governed by the same `AuthorizationRequestBlock` gate as primary lane paths. Specifically:
- **Expert → Client crossover:** intros emitted from the auto-flipped Lane B flow consume the user's free counter and require user approval (Brief 248 gate).
- **Client → Expert crossover:** flipping `wantsVisibility=true` post-intro is a direct user action and does not itself emit an intro — but any subsequent candidate-match intro request initiated from the new expert listing routes through AuthorizationRequestBlock as usual.
- **Visitor → Expert crossover:** the "want a card of your own?" CTA does not bypass the visitor's prior intro request — if one is pending, it remains queued under the visitor's identity, not the new expert's. The new expert account starts with a fresh free counter.
No crossover path is permitted to emit an intro, send an email, or write to a third party's record without traversing the AuthorizationRequestBlock gate. Sub-briefs 256, 257, 261 MUST encode this in their acceptance.

### Jobs and primitives

- **Jobs affected:** Capture (intake), Decide (intro approval), Orient (profile / job-request review), Represent (Greeter speaks for user on `/people/[handle]`)
- **Primitives involved:** `NetworkProfileCardBlock` (NEW), `JobRequestCardBlock` (NEW), `AuthorizationRequestBlock` (extended with `costLabel`), Greeter conversation, Self memory, network listing, knowledge base (markdown facts with per-fact visibility), voice intake transcripts
- **Process-owner perspective:** A workspace user receives intro requests in their feed (per Brief 250 briefing-delivery), sees scout reports as deliverables, sees visitor chat transcripts attached to intro requests, and has a clear visible state of "you're listed and findable."
- **Interaction states:** loading (Greeter thinking), empty (no candidates yet), error (intro refused — explained), success (intro emitted), partial (some candidates on-network, more being scouted), pending-anti-persona (card emitted but anti-persona slot shows "still asking…")
- **Designer input:** Designer should be invoked at sub-brief 255 for the single-viewport landing IA + bottom toggle + persona-neutral copy review, at sub-briefs 256/257 for the two new card content-blocks (Surface C + the JobRequest variant), at sub-brief 259 for the visitor profile-as-chat surface, and at sub-brief 260 for the share modal + OG renderer + PNG export. All are Layer 6 surfaces with concrete UX choices.

## Design Spec — Visual & Soul

This section locks the visual direction so sub-briefs 255-261 don't re-litigate it. Anchored in the existing Amplemarket-pivot tokens (`packages/web/app/globals.css`).

### Design Provenance

| Source | What we adopt |
|--------|---------------|
| **Ethos** landing v30/v31 (`agent.askethos.com`) | Single-viewport landing: italic-serif accent on one word + bottom toggle (clients ⇄ experts) + central card preview + side wisps. Chat IS the hero, no scroll. |
| **Ethos** Post Opportunity modal (v32) | Live preview card on LEFT materializing as form fills on RIGHT; "OPPORTUNITY BRIEF" eyebrow label; "Submit for review" CTA (humble, not "Publish"). Adopted for Surface B (intake) + Surface F (share modal). |
| **Ethos** Voice intake (v33: "James, meet *Ethos*.") | Voice as a first-class onboarding mode; dark waveform card + "END CALL" + "LIVE" pill; right rail sets episodic frame ("NO. 01 — *The first conversation*"). Adopted as optional intake mode in Surfaces A + E. |
| **Rox** (`run.rox.com/onboarding`) | Split-screen INTAKE: structured chat LEFT (cream `#f4f3ef`), live agent-output preview RIGHT. Used for Surface B once user has chosen a lane. |
| **Peerlist** (`peerlist.io/companies`) | Italic Instrument Serif on the verb only; single ink CTA; username-claim hook. |
| **Contra** (`contra.com/features/discover`) | Talent card with stacked badges + AVAILABLE pill + inline CTA. |
| **process-os** (`/Users/thg/code/process-os/app/(app)/app/ask-charlie/`) | AI-mediated profile pages: parameterized system prompt (`_lib/charlie-constants.ts`), 4 quick-start pills, no-auth chat, no document citations. **Adapted with one critical inversion** — see Soul Move #5. |

### Soul moves (the parts that are uniquely Ditto)

1. **Phoenix orange is a moment, not a mode.** Radial gradient appears at most twice per surface: persona orb (alive, breathing) + side wisp at 8% opacity OR closing CTA card. Everything else is ink + hairline. Restraint that signals taste.

2. **Italic emphasis on the verb, never the noun.** "*Find* you." / "*hunting*" / "*meet*". Instrument Serif Italic is the lone serif, used in three places only: hero verb (one word per surface), card heading verb (one word per card), Greeter signed name.

3. **The card has an anti-persona line.** Every `NetworkProfileCard` carries a "what I'm allergic to" line — *"Allergic to 'advisor' titles"*, *"Don't want consultants who 'draft strategy' and never build"*. This is what makes the card shareable: it's a real person, not a listing.

4. **Persona-neutral landing.** Surface A has NO Greeter name visible. Alex or Mira (existing rotation) introduces themselves only AFTER the user has chosen a lane and a chat begins. Reasoning per user direction: users don't care which Greeter — they care about getting somewhere.

5. **AI-on-profile is REPRESENTATIVE, never IMPERSONATOR.** Where process-os's Ask Charlie says *"You ARE Charlie. Never say 'I am an AI'"*, Ditto inverts: *"You are Alex. You are the user's REPRESENTATIVE — like a thoughtful friend who knows their work — talking to someone curious about them. NEVER claim to be {user_name}."* Non-negotiable. Sub-brief 259 must encode the inversion verbatim and unit-test the hard rule.

6. **Per-fact visibility, filesystem-legible.** Every fact in a user's KB carries `public | on-request | off`. Storage is markdown so the user can grep, edit, and audit. The Greeter cites only matching-visibility facts; for `on-request` it offers to ask the user.

7. **One iconic card silhouette across four contexts.** The same `NetworkProfileCardBlock` renders identically as: in-product chat block, OG image (1200×630), downloadable PNG, LinkedIn link preview. Recognizable at 200px or 1200px. Strip the text, the shape still says "Ditto card."

### Typography (locked)

```
Display (h1):           Instrument Serif Italic 72/76 -0.03em (verb, ONE word)
                        Inter 600 72/76 -0.03em (rest)
H2 section:             Inter 500 36/42 -0.02em
H3 card title:          Inter 600 20/26 -0.01em
Body large:             Inter 400 17/26
Body:                   Inter 400 15/23
UI label / pill:        Inter 500 12/16 0.04em UPPERCASE
Greeter chat:           Inter 400 16/24
Card eyebrow:           Inter 500 11/16 0.06em UPPERCASE  (e.g. "PROFILE", "OPPORTUNITY BRIEF")
Card heading:           Instrument Serif Italic 24/30
```

**Sub-brief 255 acceptance:** Instrument Serif must be loaded via `next/font/google` and exposed as a CSS variable. **Currently NOT loaded** in `packages/web/app/globals.css` — confirmed via grep `Instrument Serif` against repo, only this brief references it.

### Color (locked)

```
Background:             #ffffff
Surface raised:         #f4f3ef  (left pane in split, card backgrounds, modals)
Ink:                    #111111  (text + CTA)
Hairline:               rgba(17,17,17,0.08)
Phoenix gradient:       radial(386% 163% at -13% -17%, #e8400d 0%, #ffeed8 26%, #d0b2ff 84%)
                        Use: orb fill, closing CTA card fill, side wisps at 8% opacity behind cards
AVAILABLE pill:         #111 bg, #fff text  (NOT green — we don't copy LinkedIn)
Soft palette (dot only): petal #ffd7f0, mint #b7efb2, canary #ffef99, lavender #e2ddfd
                        6px filled circle to the left of each badge label
Voice waveform:         #5BCDB8 (Ethos teal — reserved exclusively for "live mic" affordance)
```

### Surface A — `/network` landing (Ethos single-viewport)

**No scroll. No marketing sections. The chat IS the hero.** Honors Non-Goal #6.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Ditto                                                       Sign in     │ ← top-nav, ink wordmark, no nav links
│                                                                          │
│  ░░░░░░ ← Phoenix wisp left, 8% opacity                                  │
│                                                                          │
│        ┌────────────────────────────────────────────────────────┐        │
│        │  NO. 01  ·  Two halves of the same loop.               │ ← Inter UPPERCASE eyebrow
│        │                                                        │        │
│        │  Opportunities                                         │        │
│        │  *find* you.                                           │ ← italic verb (one word)
│        │                                                        │        │
│        │  Tell us what you're hunting — or what you're          │        │
│        │  great at. We'll match you with the other side.        │        │
│        │                                                        │        │
│        │  [ Sample NetworkProfileCard preview, drifts gently ]  │ ← live preview cycles 3 sample cards
│        │                                                        │        │
│        │     ░ phoenix wisp behind preview ░                    │        │
│        └────────────────────────────────────────────────────────┘        │
│                                                                          │
│                ┌─────────────────────────────────┐                       │
│                │  ◐ EXPERTS    │   CLIENTS  ◑    │                       │ ← bottom toggle, default = EXPERTS (supply bootstrap)
│                └─────────────────────────────────┘                       │
│                Switch:  ⌘E experts  ⌘C clients     · Talk it through ▸   │ ← keyboard hint + voice mode link (v33)
└──────────────────────────────────────────────────────────────────────────┘
```

Toggle behavior:
- Headline switches: *Opportunities **find** you.* (experts) ↔ *Find help you can't **Google**.* (clients)
- Sample preview switches: profile card preview ↔ live composer with sample prompt ("Who should I talk to at Shopify about enterprise pricing?")
- Subtitle micro-shifts: *Tell us what you're great at.* (experts) ↔ *Tell us what you need.* (clients)
- "Talk it through ▸" → opens voice mode (v33 dark card with teal waveform), optional alternative to typing
- Click anywhere on the central card → enters Surface B with mode pre-selected, Greeter introduces by name

**Default mode:** EXPERTS. Reasoning: the network's biggest constraint is supply (listed Selfs to match against). Default the unknown visitor to the side that bootstraps supply. Re-evaluate after 100 listings.

**Persona-neutral copy:** Surface A never names Alex or Mira. The Greeter introduces themselves only inside Surface B. (Soul Move #4.)

**No FAQ. No "How it works" tiles. No "Who's already here" grid. No closing CTA card.** The landing answers ONE question: which side are you on? Everything else lives in the conversation.

### Surface B — Onboarding (split-screen, mode-aware)

Reuses existing harness `ChatLayout`. Path: `/network?mode=expert&thread=...` or `?mode=client&thread=...`.

```
┌───────────────────── Surface B (split) ─────────────────────────────────┐
│  ┌──── chat (left, #f4f3ef) ─────┐  ┌──── live preview (right, #fff) ──┐│
│  │  ⊙ Alex (rotation-assigned)   │  │  PROFILE                          ││
│  │  ─────────────────────────    │  │  ┌─────────────────────────────┐  ││
│  │  Hi — I'm Alex. Walk me       │  │  │  ⊙ ........                 │  ││
│  │  through what you're          │  │  │     [name pending]          │  ││
│  │  hunting.                     │  │  │                             │  ││
│  │                               │  │  │  ●○○○○○                     │  ││ ← signal dots
│  │  > "I'm leaving my company…"  │  │  │  ⏵ ........                 │  ││ ← badges fill
│  │                               │  │  │                             │  ││
│  │  Got it. When somebody hires  │  │  │  Hunting next *thing*…      │  ││ ← italic verb
│  │  you, what's the actual       │  │  │  [ ghost text fading in ]   │  ││
│  │  thing they're paying you     │  │  │                             │  ││
│  │  for?                         │  │  │  Allergic to: …             │  ││
│  │                               │  │  └─────────────────────────────┘  ││
│  │  ┌─────────────────────────┐  │  │   16% → 100% opacity over 6 Qs    ││
│  │  │ Type your answer…    ▶  │  │  │                                   ││
│  │  └─────────────────────────┘  │  │   Mobile: card collapses to a     ││
│  │                               │  │   sticky preview chip top-right.  ││
│  └───────────────────────────────┘  └───────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

- **Left 50% (`#f4f3ef`):** `ConversationView`. Greeter (Alex or Mira, rotation-assigned by existing `personaAssignment` field) introduces themselves in Q0. Composer pinned bottom with hairline border + Phoenix-gradient 1px focus ring.
- **Right 50% (`#ffffff`):** Live preview pane (Ethos v32 pattern). Expert lane = `NetworkProfileCardBlock` ghost-wireframe at 16% opacity. Client lane = `JobRequestCardBlock` ghost-wireframe. Each answered question fills a region (400ms fade-and-sharpen).
- **Mode toggle:** active in nav. Switching shows save-draft confirm.
- **Mobile (sub-brief 256 acceptance):** stack vertically. Conversation full-screen, card collapses to a sticky preview chip "Tap to see your card →". Card MUST be editable on mobile.

### Surface C — Iconic card silhouette (`NetworkProfileCardBlock`)

**This is a NEW content-block type.** Sub-brief 256 must define it in `packages/core/src/content-blocks.ts`. The existing `ReviewCardBlock` has a flat `outputText: string` field and CANNOT carry the structured layout below — confirmed via Read on `packages/core/src/content-blocks.ts:45-54`.

Schema (sub-brief 256 to finalize):

```ts
export interface NetworkProfileCardBlock {
  type: "network-profile-card";
  handle: string;                          // ditto.partners/people/[handle]
  name: string;
  portraitUrl: string | null;
  cityLabel: string | null;
  oneLineRole: string;
  signalDots: SignalDot[];                 // up to 6, color from soft-palette
  badges: BadgeChip[];                     // up to 3 — Inter 500 12/16 UPPERCASE
  narrativeMd: string;                     // 50-80 words, italic-serif on ONE word
  antiPersonaMd: string | null;            // "what I'm allergic to" — required eventually; null = "still asking"
  greeterCuratedBy: "alex" | "mira";       // signed footer (rotation-assigned)
  lastUpdatedAt: string;                   // ISO
  visibility: "public" | "on-request" | "off";  // mirrors networkUsers.wantsVisibility + future fact-level overrides
  shareUrl: string;                        // canonical https://ditto.partners/people/{handle}
  ogImageUrl: string;                      // dynamic Next.js opengraph-image route
}
```

Layout (max-width 480px, white bg, rounded-3xl `24px`, soft shadow):

```
┌────────────────────────────────────────────────┐
│  ⊙ 40px portrait    NAME (UPPERCASE 14)        │ ← Inter 500 14 0.04em
│                     City · One-line role       │
│                                       ⤴  ⋯     │ ← share + 3-dot menu
│                                                │
│  ●●●●○○                                        │ ← signal dots (filled count = profile depth)
│                                                │
│  ⏵ Founder    ⏵ B2B SaaS    ⏵ Sold 2023        │ ← max 3 badges
│                                                │
│  Hunting his next *thing*.                     │ ← italic verb, ONE word per card
│  Operator-founder who likes SMB workflows,     │
│  doesn't want to raise from name-brand VCs     │
│  again, building toward something he can       │
│  run for ten years.                            │
│                                                │
│  Allergic to: "advisor" titles.                │ ← anti-persona, required
│                                                │
│  ──────────────────                            │
│                                                │
│  ▸ Ask Alex about Tim                          │ ← single primary CTA → /people/[handle]
│                                                │
│  Curated by Alex · Updated 3d ago              │ ← provenance footer, micro
└────────────────────────────────────────────────┘
```

**Renders identically across:**
1. In-product chat block (Surface B / Surface D)
2. OG image at 1200×630 — dynamic `/people/[handle]/opengraph-image.tsx` (sub-brief 260)
3. Downloadable PNG at print contrast (sub-brief 260)
4. LinkedIn link preview (uses OG image)

### Surface D — Public profile = chat surface (`/people/[handle]`)

Visitor lands at `ditto.partners/people/{handle}`. **The page IS a chat surface, not a static résumé.**

```
┌────────────────────────────────────────────────────────────────────┐
│ ditto.partners/people/timhgreen                          ⊙ visitor │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─ NetworkProfileCard ─┐    ┌─ Ask Alex (chat) ──────────┐        │
│  │  ⊙ Tim Green         │    │  ⊙ Alex                    │        │
│  │  [as defined above]  │    │     Tim's greeter          │        │
│  │                      │    │  ────────────────────────  │        │
│  │  ⤴ Share   ⋯         │    │                            │        │
│  └──────────────────────┘    │  Hi — I'm Alex. I help     │        │
│                              │  Tim think out loud about  │        │
│  ░ phoenix wisp behind       │  who he's hunting. Ask me  │        │
│                              │  about him — or tell me    │        │
│                              │  what you're up to.        │        │
│                              │                            │        │
│                              │  ┌────────────────────┐    │        │
│                              │  │ What's he hunting? │    │        │ ← 4 quick-start pills
│                              │  │ Why isn't he       │    │        │   (dynamically generated
│                              │  │ raising name-brand?│    │        │    by Greeter from card+KB)
│                              │  │ Is this a fit for  │    │        │
│                              │  │ [my company]?      │    │        │
│                              │  │ I'd like an intro. │    │        │
│                              │  └────────────────────┘    │        │
│                              │                            │        │
│                              │  ┌──────────────────┐ ▶    │        │
│                              │  │ Ask Alex…        │      │        │
│                              │  └──────────────────┘      │        │
│                              │                            │        │
│                              │  🎙 talk to Alex (voice)   │        │
│                              └────────────────────────────┘        │
│                                                                    │
│  Mobile: chat full-screen, card chip top-right.                    │
└────────────────────────────────────────────────────────────────────┘
```

**Auth model:** No login required. Rate-limited per IP + visitor fingerprint (lift pattern from `process-os/app/api/ai/charlie/ask/route.ts:104-111`). When visitor types intent for an intro, Greeter renders an `AuthorizationRequestBlock` with draft → routes to user's inbox.

**System prompt** (sub-brief 259 must encode verbatim, with parameter substitution):

```
You are {greeter_name} ("Alex" or "Mira"). You are NOT {user_name}.
You are their REPRESENTATIVE — a thoughtful friend who knows their work
and goals — talking to someone curious about them.

You speak FROM the card, the user's bio, and the user's knowledge base.
Cite ONLY facts marked `public` or `on-request`. For `on-request`, say:
"They can speak to that. Want me to ask {user_first}?"

Your job:
1. Help the visitor decide if there's a fit.
2. If yes, offer to draft an intro request for {user_first}'s inbox.
3. If no, be honest about it. You're not selling them.

Tone: warm, direct, no corporate fluff. Not a salesman. Not a chatbot.

What you know about {user_name}:
{networkProfileCard_serialized}
{kb_bio_md}
{kb_facts_public_and_on_request}
{anti_persona_rules}     ← honored silently, never quoted

Hard rules (six clauses, each MUST have unit-test coverage in sub-brief 259):
1. **Identity.** NEVER claim to be {user_first}. You are {greeter_name}, their representative.
2. **No fabrication.** NEVER invent specifics (companies, numbers, dates, names, quotes) not present in the KB.
3. **No AI self-disclosure.** NEVER say "I'm an AI", "chatbot", or "language model". Be a thoughtful representative, not a disclaimer.
4. **Forwarded-note capture.** If the visitor says "tell {user_first} X" — capture verbatim as a forwarded note attached to the intro request. Do NOT respond as if you ARE {user_first}.
5. **Silent anti-persona.** Honor anti-persona rules silently — never quote, paraphrase, or reveal them to the visitor.
6. **Gated intro emission.** If the visitor asks for an intro: emit AuthorizationRequestBlock with draft + costLabel "1 of 2 free intros" + full visitor transcript; say "I'll send this to {user_first}; if it lands, you'll hear back in a day or two." Never send the intro yourself — only the user can approve.
```

This is the **inversion** of process-os's Ask Charlie. Charlie says *"You ARE Charlie. Never say 'I am an AI'."* Ditto's Greeter says *"You REPRESENT Tim. You are NOT Tim."* Critical for trust + legal posture.

### Surface E — Knowledge base intake (workspace-side)

Lives within the user's `/network` chat thread (workspace-side, after Surface B intake completes). Bottom drawer or sidebar tab labeled **"What Alex knows"**.

```
┌─ ⊙ Alex ──────────────────┐    ┌─ WHAT ALEX KNOWS ─────────────┐
│ Drop in anything you want │    │ 📄 LinkedIn export.pdf        │
│ me to know — LinkedIn     │    │    Skimmed. 14 facts.         │
│ export, latest deck, even │    │    ↳ "Sold Acme to Stripe '23"│
│ raw notes. I'll skim and  │    │    ↳ "Built SMB workflow"     │
│ ask what's actually       │    │    ↳ 12 more…    [Review]     │
│ material.                 │    │                               │
│                           │    │ 📄 pitch-deck-v4.pdf          │
│ ┌─────────────────────┐   │    │    Skimmed. 6 facts.  [Review]│
│ │ ⤴  Drop a file      │   │    │                               │
│ └─────────────────────┘   │    │ ✏ Bio (markdown)              │
│                           │    │    180 words. [Edit]          │
│ — or —                    │    │                               │
│                           │    │ ⊘ Anti-persona (3 rules)      │
│ ┌─────────────────────┐   │    │    "Don't intro me to ICs at  │
│ │ 🎙 Talk to me 5 min │   │    │     Series A startups" [Edit] │
│ └─────────────────────┘   │    │                               │
│ (v33 voice card pattern)  │    │ Per-fact visibility:          │
│                           │    │ ● Public ○ On-request ○ Off   │
└───────────────────────────┘    └───────────────────────────────┘
```

After upload, Greeter asks 1-2 clarifying questions per doc in chat: *"I see Series A '21. What was the thesis? — answer in a sentence."* This is what makes the KB high-signal vs. generic-bio.

**Schema additions (sub-brief 258):**
- `network_user_kb_documents` — `{ userId, kind: "bio"|"resume"|"deck"|"notes"|"linkedin-export", contentMd, sourceFilename, uploadedAt, defaultVisibility }`
- `network_user_kb_facts` — `{ userId, factMd, sourceDocId?: string, visibility: "public"|"on-request"|"off", editedAt }` — markdown for filesystem-legibility per `feedback_user_facing_legibility` memory
- `network_user_anti_persona` — `{ userId, ruleMd, weight }`
- `network_user_voice_intake` — `{ userId, transcriptMd, recordedAt, processedAt }`

### Surface F — Share modal + social content gen

Triggered from `⤴ Share` on any `NetworkProfileCard`. Modal over `/network` (backdrop blur).

```
┌─────────────── ░░ backdrop blur ░░ ────────────────┐
│  SHARE YOUR CARD                              ×    │
│  ────────────────────────────────────              │
│                                                    │
│  ┌──── live preview ────┐  Alex drafted three      │
│  │  [ NetworkProfile    │  ways to share. Pick     │
│  │    Card preview ]    │  one or remix.           │
│  │   (re-renders as     │                          │
│  │    you type below)   │  v32 LIVE-PREVIEW pattern│
│  └──────────────────────┘                          │
│                                                    │
│  ○ QUIET                                           │
│  ┌──────────────────────────────────────────┐      │
│  │ Quietly hunting my next thing. Operator-  │      │
│  │ founder, B2B SMB. If you know someone in │      │
│  │ that shape, my AI greeter Alex will catch│      │
│  │ you up. ditto.partners/people/timhgreen  │      │
│  └──────────────────────────────────────────┘      │
│                                                    │
│  ● LOUD                                            │
│  ┌──────────────────────────────────────────┐      │
│  │ I'm leaving and starting again. Building  │      │
│  │ toward something I can run for ten years.│      │
│  └──────────────────────────────────────────┘      │
│                                                    │
│  ○ ASK                                             │
│  ┌──────────────────────────────────────────┐      │
│  │ Looking for: B2B SaaS operators with SMB │      │
│  │ workflow scars, ex-founders, anyone who… │      │
│  └──────────────────────────────────────────┘      │
│                                                    │
│  [Copy]  [Post to LinkedIn]  [Download card PNG]   │
└────────────────────────────────────────────────────┘
```

Three voices generated by Greeter from the user's card + KB. Sub-brief 260 implements as new self-tool: `generate_share_variants(card, kb) → { quiet, loud, ask }`. Each ends with the canonical `ditto.partners/people/{handle}` URL. PNG export uses the iconic-card silhouette at print contrast. Budget never appears in any variant (Constraint).

### Surface G — Intro request micro-flow

When a visitor (on `/people/[handle]`) or a workspace-user (in `/network` client lane) requests an intro, an `AuthorizationRequestBlock` appears in their chat — extending the Brief 248 primitive with a new `costLabel: string` field (sub-brief 261):

```
┌─ AUTHORIZATION REQUEST ────────────────────────┐
│  Send this intro to Tim?                       │
│  ──────────────────────────                    │
│                                                │
│  Subject: Quick intro — [Visitor] from Acme    │
│                                                │
│  Tim — meeting [Visitor], who's looking for…   │
│  [editable draft, full body]                   │
│                                                │
│  ──────────                                    │
│  This uses your 1st free intro.                │ ← costLabel
│  (1 left after this.)                          │
│                                                │
│  [ Send it ]   [ Edit draft ]   [ Not now ]    │
└────────────────────────────────────────────────┘
```

Visitor clicks Send → request lands in user's inbox with full visitor chat transcript + Greeter's draft. User approves/rejects → resolution streams back to visitor's chat. Sub-brief 261 implements; Brief 248 primitive carries the load.

### Greeter scripts (six questions per lane)

These six questions in exact order are part of the spec — sub-briefs 256/257 must implement these directives:

**Expert lane (whichever Greeter is rotation-assigned):**
1. "When somebody hires you, what's the actual thing they're paying you for?" *(UVP)*
2. "Who's the *worst* fit for you? I'd rather know that first." *(Anti-persona — surprising, signals taste. Required for card emission. **Escape hatch:** if user can't articulate, Greeter offers 3 stock options to react against; if still nothing, card emits with `antiPersonaMd: null` and visually shows "…still asking Tim" in the slot — Greeter re-prompts in next session — does NOT block emission.)*
3. "Tell me about a client you'd want more of. What were they like before they hired you?" *(Ideal client, story-shaped)*
4. "Three things you're better at than most people in your field. Just three." *(Skills as badges, capped — forces choice)*
5. "What's the line about you that would make somebody say 'oh, I should talk to them'?" *(One-line hook)*
6. "Are you actually open for new work right now? It's fine to say no — I won't promote you if you're not." *(`wantsVisibility` flag, captured conversationally. **Default semantics:** `wantsVisibility=false` means card exists at `/people/[handle]` for direct sharing but is NOT surfaced in candidate-match results. Sub-brief 256 to confirm.)*

**Client lane:**
1. "What's the thing you're hiring for? Not the job title — the outcome." *(JTBD)*
2. "Who *did* this for you well before, even if it was a side-of-desk thing?" *(Reference shape)*
3. "What kind of person do you NOT want? Bad fits to filter out?" *(Anti-persona)*
4. "What does 'good' look like in 30 days?" *(Success criteria)*
5. "Budget shape — ballpark, not exact. Hourly, monthly, project?" *(Money signal. **NEVER on shareable surfaces** — budget stays private to the requester. Candidates see "ballpark match: yes/no" only. Sub-brief 257 acceptance.)*
6. "Want me to scan off-network too, or stick with people already in?" *(Off-network scout opt-in — sub-brief 258 hook)*

### Workspace upsell — the dead-clear moment

After Q6 of either lane, the Greeter says (verbatim copy locked — copy is lane-specific because the resolved artifact differs: card vs. brief).

**Expert lane** (after card materializes):

> *"Card's ready. I'll save this and you can chat with me at `ditto.partners/people/{handle}` — share that link with anyone curious about you.*
>
> *One more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**"*
>
> [Yes, set up workspace] [Not now, just my card]

**Client lane** (after job-request brief materializes):

> *"Brief's saved. I'll keep it open and let you know if anyone good comes through.*
>
> *One more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**"*
>
> [Yes, set up workspace] [Not now, just my brief]

The bold sentence is the dead-clear value articulation. Names: memory, intro-tracking, calendar/email integration, frequency heuristic. The client variant must NOT reference `ditto.partners/people/{handle}` (that surface belongs to the expert lane). **Workspace upsell trigger fires once per user per session-lane.** Sub-briefs 256 + 257 must encode each variant verbatim.

### Persuasion layer (objection map)

| Objection | Where it gets hit | How |
|-----------|-------------------|-----|
| "Is this just LinkedIn/Upwork?" | Soul Move 5 + Surface D | An AI rep that knows you, not a profile to stalk. Visitors talk *about* you, not just at you. |
| "Is this a real network or empty?" | Surface A central card preview | Show, don't tell. One beautiful card cycling, no grid of fakes. |
| "What if my card sucks?" | Q4/Q5 force tight skill + hook | Greeter pushes back; "edit it in chat" anytime; mobile-editable. |
| "AI sending blasts in my name?" | AuthorizationRequestBlock + Soul Move 5 | Trust gate every intro; rep never claims to be you; full transcript visible to user before approval. |
| "What if my profile gets flooded?" | Per-fact visibility + AuthorizationRequestBlock approval | Every visitor + transcript visible before approval. Off-the-record facts available too. |

Note: revision 1 included a "Mira refused 18 intros this week" scoreboard. **Dropped from v1** because it conflicts with Soul Move #4 (persona-neutral landing). Tracked in the **Deferred Items** table below with re-entry condition (post-100-production-intros). Not part of v1 acceptance.

### Design rules sub-briefs must follow

1. **Italic Instrument Serif appears in three places only.** Hero verb (one word), card heading verb (one word), Greeter signed name. Adding it elsewhere needs an ADR.
2. **Phoenix orange gradient appears at most twice per surface.** Orb + side wisp at 8% opacity OR orb + closing CTA card.
3. **Real faces only.** No stock photography. Empty network is acceptable; tells the truth.
4. **Anti-persona line is required on every card emission.** If user couldn't articulate one, card emits with `antiPersonaMd: null` and visually shows "…still asking" in the slot — Greeter re-prompts in next session. Slot is never omitted entirely.
5. **AVAILABLE / OPEN FOR BUSINESS pill is black.** Not green. We don't copy LinkedIn semantics.
6. **Composer focus state uses 1px Phoenix gradient ring.** Visual brand DNA carries between persona orb and input.
7. **Persona-neutral landing.** Surface A has NO Greeter name visible. Greeter introduces by name only AFTER user has chosen a lane. (Soul Move #4.)
8. **AI-on-profile is REPRESENTATIVE, never IMPERSONATOR.** Surface D system prompt is non-negotiable. Sub-brief 259 acceptance MUST verify all **six** hard-rule clauses in unit tests: identity, no fabrication, no AI self-disclosure, forwarded-note capture, silent anti-persona, gated intro emission.
9. **Per-fact visibility honors filesystem-legibility.** Every fact in the KB is grep-able markdown; user can flip Public / On-request / Off per item; Greeter cites only matching facts. (Soul Move #6.)
10. **Budget stays private.** Client lane Q5 captures budget but candidate cards, OG images, share variants, and downloadable PNGs never display it.
11. **One iconic card silhouette across four contexts.** `NetworkProfileCardBlock` renders identically in chat / OG / PNG / LinkedIn. Drift between contexts requires an ADR. (Soul Move #7.)

## Acceptance Criteria

The parent brief is complete when:

1. [ ] All seven sub-briefs (255-261) are drafted and ready
2. [ ] Each sub-brief's acceptance criteria, when summed, satisfy this parent's user journey end-to-end
3. [ ] Schema deltas across sub-briefs are reconciled — no conflicts in `networkUsers` (new `handle` field), `introductions` (new), `network_user_kb_documents` / `network_user_kb_facts` / `network_user_anti_persona` / `network_user_voice_intake` (new)
4. [ ] Greeter directive variants (expert / client) are scoped to one place — no parallel chat engines (`network-chat-prompt.ts` extended, not forked); `ChatContext` extended to add `"expert" | "client"`
5. [ ] Workspace upsell trigger points are explicit in sub-briefs 256 and 257 with the verbatim copy encoded
6. [ ] Free-intro counter logic is explicit in sub-brief 261 with the "v1 = free only" enforcement clearly scoped, AND `AuthorizationRequestBlock.costLabel` field is added to `packages/core/src/content-blocks.ts`
7. [ ] Off-network scout tool surfaces as a Greeter capability, not a parallel UI (sub-brief 258)
8. [ ] Existing `/welcome` workspace-first front door is unaffected (verified by sub-brief 255 acceptance)
9. [ ] Iconic card silhouette is defined ONCE as `NetworkProfileCardBlock` and rendered identically in four contexts (in-chat / OG / PNG / LinkedIn). Sub-brief 256 owns definition; sub-brief 260 owns OG + PNG renderers.
10. [ ] AI-on-profile system prompt at `/people/[handle]` is REPRESENTATIVE-not-IMPERSONATOR; sub-brief 259 has unit tests covering all **six** hard-rule clauses (identity, no fabrication, no AI self-disclosure, forwarded-note capture, silent anti-persona, gated intro emission)
11. [ ] Per-fact visibility primitive (`public | on-request | off`) is honored end-to-end: storage in markdown, Greeter cites only matching facts, `on-request` triggers ask-the-user offer
12. [ ] Persona-neutral landing constraint enforced: Surface A contains no Greeter name; sub-brief 255 acceptance includes a copy review

The journey is shippable when:

A. [ ] User lands at `ditto.partners/network` and sees a single-viewport landing with bottom toggle (no scroll, no marketing sections)
B. [ ] User can choose expert lane → complete 6-question intake → see profile card materialize live (Ethos v32 pattern) → claim handle → toggle visibility → receive workspace upsell with verbatim copy
C. [ ] User can choose client lane → complete 6-question intake → see job-request card with on-network candidates → request an intro (consuming free counter) → see authorization-request flow → receive workspace upsell
D. [ ] User can switch modes mid-conversation without losing context (save-draft confirm)
E. [ ] User can choose voice mode (v33 pattern) as alternative onboarding path; transcript becomes raw KB entry
F. [ ] User can upload docs (PDF/markdown/LinkedIn export) into KB; Greeter extracts facts; user sets per-fact visibility; Greeter only cites matching facts in subsequent conversations
G. [ ] User can share their card via Surface F: 3 voices generated (quiet/loud/ask), copy or post to LinkedIn or download PNG; budget never appears in any artifact
H. [ ] Visitor (non-authenticated) can land at `ditto.partners/people/{handle}`, see card + Ask-Greeter chat, ask 4 quick-start pills, receive answers grounded in user's KB, and request an intro that lands in user's inbox with full transcript
I. [ ] Greeter at `/people/[handle]` NEVER claims to be the user (unit-test coverage required); says "I'm Alex" or "I'm Mira" and refers to the user in third person
J. [ ] Greeter refuses an intro request when at least one of Brief 248's trust-gate refusal triggers fires: (a) anti-persona match (the requester's profile/intent matches an `antiPersonaMd` rule), (b) low-fit signal (Greeter's match-confidence below threshold defined in Brief 248), (c) explicit user block list, or (d) abuse-rate-limit hit. Refusal includes a one-sentence reason routed to the requester (never quoting anti-persona rules per Hard Rule #5). Honored at BOTH `/network` client lane AND `/people/[handle]` visitor lane. Sub-brief 261 MUST include test cases for all four refusal triggers.
K. [ ] Free counter blocks a 3rd intro and surfaces "request will be reviewed" copy (no payment UI)
L. [ ] Off-network scout returns a `ReviewCardBlock` with mixed on-network + scouted candidates; scouted candidates can be invited via existing outreach with the network-listing pitch appended
M. [ ] No marketing page lives at `/network` — the chat IS the surface (no FAQ, no "How it works" tiles, no "Who's already here" grid)
N. [ ] `wantsVisibility` remains the only schema flag governing listing exposure; per-fact `visibility` lives at the fact level, not the user level
O. [ ] `NetworkProfileCardBlock` and `JobRequestCardBlock` exist as new content-block types in `packages/core/src/content-blocks.ts`; `ReviewCardBlock` is unchanged (its flat-string shape was the reason new types were needed)
P. [ ] `networkUsers.handle` field exists with claim flow during expert intake; uniqueness enforced; reserved against profanity + impersonation lists

## Review Process

This parent brief should be reviewed by the Architect before sub-briefs are drafted in detail.

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/adrs/041-agency-model-three-layer-ontology.md`
2. Review agent checks:
   - Does this brief preserve the Brand/Greeter/Self separation in ADR-041?
   - Does the workspace upsell respect the "earned not forced" principle?
   - Are the trust-gate semantics from Brief 248 honored for intro emission?
   - Is the schema impact on `networkUsers` and the new `introductions` table additive (no breaking changes to `wantsVisibility` semantics)?
   - Is the Greeter directive composition (mode-as-variant) consistent with how `network-chat-prompt.ts` already routes?
   - Are non-goals enforceable, especially "no payments" and "no directory page"?
3. Present brief + review findings to human for approval before sub-brief drafting begins

## Smoke Test

This is a parent brief and produces no shippable code on its own. The smoke is paper-only:

```bash
# Verify all sub-briefs exist and are drafted
ls docs/briefs/255-*.md docs/briefs/256-*.md docs/briefs/257-*.md docs/briefs/258-*.md \
   docs/briefs/259-*.md docs/briefs/260-*.md docs/briefs/261-*.md

# Verify each sub-brief references back to this parent
grep -l "Brief 254" docs/briefs/255-*.md docs/briefs/256-*.md docs/briefs/257-*.md \
   docs/briefs/258-*.md docs/briefs/259-*.md docs/briefs/260-*.md docs/briefs/261-*.md
```

End-to-end smoke for the journey lives in sub-brief 261's acceptance (intros + free-counter), which is the closing piece of the loop. Sub-brief 259's acceptance carries the smoke test for the visitor-facing profile-as-chat surface (independent visitor flow).

## Deferred Items (re-entry conditions)

These design moves were considered for v1 and explicitly dropped or postponed. Each carries a re-entry condition so the next planner can pick it up at the right moment, not earlier and not later.

| Item | Why deferred | Re-entry condition | Owner |
|------|--------------|--------------------|-------|
| Greeter-neutral refusal scoreboard ("X intros refused across the network this week") | Original revision-1 design used "Mira refused 18 intros this week" — conflicts with Soul Move #4 (persona-neutral landing). The data-honest version is greeter-neutral aggregate. | After 100 production intros AND production-quality refusal-reason data exists. Then PM triages whether to surface in Surface A or only in workspace dashboards. | Dev PM (post sub-brief 261) |
| Payments / paid intros beyond the 2 free | Non-Goal. Free-only loop must validate first — does a free intro generate enough demand to warrant friction? | After 30 days of production with non-trivial intro volume; payment Stripe brief gets drafted once we have data on (a) intro fulfillment rate, (b) recipient reply rate, (c) requester willingness-to-pay signal from "request will be reviewed" gate. | Dev PM (post sub-brief 261) |
| Vector search / ranking for candidate match | Non-Goal. v1 uses single LLM prompt against listed Selfs. | When listed Selfs > ~200 and prompt-context cost or quality becomes the bottleneck. Then a Researcher should evaluate against `docs/landscape.md` retrieval options before any custom build. | Dev Researcher → Dev Architect |
| Public expert directory | Non-Goal — discovery is agent-mediated. | Never, unless ADR-041's three-layer ontology is revisited. Any reintroduction requires a new ADR overriding ADR-041. | — |

## After Completion

1. Update `docs/state.md` — add a CURRENT entry for the brief and what it unlocks
2. Update `docs/roadmap.md` — Phase 14 row for the two-sided front door
3. Phase retrospective deferred until sub-briefs 255-261 close
4. Consider whether ADR is needed — likely yes for "Network as Two-Sided Front Door" as a strategic position, AND a separate ADR for "AI-on-profile is REPRESENTATIVE-not-IMPERSONATOR" given its compliance/legal posture implications. Draft both ADRs after sub-brief 259 ships (when the AI-on-profile pattern is real and live).

## Reference Docs

This brief was authored against the following sources, each verified current at 2026-05-07. If a Builder finds any of these stale at sub-brief implementation time, FLAG and resolve before coding (Insight-043).

| Doc | Status at 2026-05-07 | Why it matters |
|-----|----------------------|----------------|
| `docs/architecture.md` | current | Layer 6 (human surfaces), Layer 3 (trust gate) — alignment for all 7 surfaces |
| `docs/adrs/041-agency-model-three-layer-ontology.md` | accepted | Brand / Greeter / Self separation that this brief MUST preserve |
| `docs/briefs/248-greeter-beat-2-authorization.md` | accepted (not yet relocated to `complete/`) | AuthorizationRequestBlock primitive being extended with `costLabel` |
| `docs/briefs/246-wedge-demo.md` (or current location) | complete | Storyboard pattern reference; ReviewCardBlock shape verified |
| `docs/personas.md` | current | Rob/Lisa/Jordan/Nadia — visitor + expert + client lanes mapped |
| `docs/human-layer.md` | current | Six human jobs (Capture/Decide/Orient/Represent in scope here) |
| `docs/insights/043-knowledge-maintenance-at-point-of-contact.md` | active | Reference-doc integrity rule honored by this section |
| `docs/insights/180-steprun-guard-for-side-effecting-functions.md` | active | All 5 new self-tools enumerated above carry the guard requirement |
| `docs/insights/190-migration-journal-concurrency.md` | active | Drizzle journal resequencing applies to sub-briefs 256, 258, 261 |
| `docs/insights/153-three-layer-persona-architecture.md` | superseded by ADR-041; informative only | Historical context for the Greeter-as-matchmaker role |
| `packages/core/src/content-blocks.ts` (lines 45-54, 215-232) | current | ReviewCardBlock flat-string shape + AuthorizationRequestBlock missing `costLabel` confirmed |
| `src/db/schema/network.ts` (lines 180-209) | current | `wantsVisibility` exists; `handle` does NOT exist; `personaAssignment` exists |
| `src/engine/network-chat-prompt.ts` (line 587) | current | `ChatContext = "front-door" \| "referred" \| "review"` — to be extended |
| `packages/web/app/globals.css`, `packages/web/app/layout.tsx` | current | Instrument Serif NOT loaded — sub-brief 255 must add via `next/font/google` |
| `/Users/thg/code/process-os/app/(app)/app/ask-charlie/` | external reference (not source) | System-prompt skeleton + 4-pill UX; ID rule INVERTS for Ditto |
