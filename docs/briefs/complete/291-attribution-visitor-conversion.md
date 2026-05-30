# Brief 291: Attribution + Visitor Conversion

**Date:** 2026-05-19
**Status:** COMPLETE (2026-05-19). Fresh-context review initially returned FAIL for attribution-cookie authenticity, cross-apex workspace reachability/target binding, and disabled CTA states; all functional blockers fixed. Documenter closeout moved the brief to `docs/briefs/complete/`, documented the review-fix pass, and cleaned migration sequencing so Brief 291 owns `drizzle/network/0016_share_attribution.sql` only. Gate green: `pnpm run type-check` 0, targeted vitest 122/122. Playwright visitor-conversion e2e not run because `/people` server render requires a live Network DB in the local Playwright server.
**Depends on:** Sub-brief 290 (Studio emits `?ref=` share URLs); parent Brief 277; Brief 259 (public profile-as-chat — complete); Brief 272 / Brief 273 / Brief 276 (downstream conversion routes)
**Unlocks:** Brief 286 (admin conversion dashboard reads `network_share_attribution`)

## Goal

- **Roadmap phase:** Phase 14 — Network Agent.
- **Capabilities:** Visitor-facing conversion — when someone arrives at `/people/[handle]` from a shared link, infer their intent from chat behavior, surface the right next-step CTA (ask Mira / request intro / build your own signal / create a request), record privacy-safe attribution, and preserve the referral context across the `.ditto.partners → {handle}.ditto.you` apex boundary.

## Context

Sub-brief 290 ships the member-side Share Studio; its share URLs carry `?ref={channel}`. This sub-brief carries the inbound half: the public profile at `/people/[handle]` (shipped by Brief 259 as profile-as-chat) gets an intent-aware CTA strip, a privacy-safe attribution write, and a signed cross-apex handoff so a visitor who decides to build their own signal lands in onboarding with the referral preserved — even though `.ditto.partners` cookies do not cross to `{handle}.ditto.you`.

The parent brief (277) carries the Q2 (attribution storage), Q3 (cookie library), Q4 (cross-apex handoff), Q9 (rate-limit name) rulings, the visitor-conversion path table, the four-shape inference rules, and the side-effect matrix. Read the parent first.

## Objective

A visitor arriving with `?ref=linkedin` gets a privacy-safe cookie `{channel, ph, ts}` (no identity, no chat content). As they chat with the representative, a pure inference function scores four intent shapes per turn; when one shape clears the score+margin threshold, the matching CTA in the existing profile `aside` highlights with a contextual whisper line. Inference is a hint, never a gate — every CTA is always clickable. On any CTA click, a durable `network_share_attribution` row is written (not on landing) plus a parallel audit-chain row. If the visitor chooses "build your own signal" or "create a request", they cross to the workspace deployment carrying a signed `?ditto_ref=` token that the workspace verifies on first onboarding-step load.

## Non-Goals

- No Share Studio, channel variants, or member-side authoring — owned by Sub-brief 290.
- No outcome-led share, consent flow, or `outcome-share` scrub surface — owned by Sub-brief 292.
- No visitor identity capture, no IP fingerprint beyond what the request already exposes, no chat-content persistence in the cookie or attribution row.
- No new chat UI — the CTA strip inserts into Brief 259's existing `profile-chat-client.tsx` `aside` (Designer OQ-3); no new layout region.
- No A/B testing harness for CTA copy.
- No referral incentive, no dark-pattern referral wall (parent constraint).
- No change to Brief 259's representative contract, voice mode, or quick-start pills behavior.
- No admin dashboard — Brief 286 consumes `network_share_attribution`; this sub-brief only writes it.

## Inputs

1. `docs/briefs/277-share-loop-public-profile-conversion.md` — **parent brief; required reading.** Q2, Q3, Q4, Q9 rulings; visitor-conversion path table; four-shape inference rules; side-effect matrix rows 2 (`share-attribution`).
2. `docs/briefs/290-share-studio-channel-variants.md` — sibling; share URLs carry `?ref={channel}` (the inbound contract).
3. `docs/briefs/complete/259-public-profile-as-chat-and-representative-rule.md` — visitor surface foundation (do not regress).
4. `docs/briefs/272-member-signal-onboarding-research-provenance.md` — "build your own signal" downstream route.
5. `docs/briefs/276-email-chat-consent-introductions.md` — "request an intro" downstream consent route.
6. `docs/research/277-share-loop-public-profile-conversion.md` — Researcher §W-4 (cookie helper), §W-5 (attribution table + route), §W-6 (intent inference), §W-7 (cross-apex handoff), §CC-4 (Edge cookies), §CC-5 (domain topology).
7. `docs/research/277-share-loop-public-profile-conversion-ux.md` — Designer §Surface 3 (visitor CTA strip + four-shape inference + 5-rule fallback), §Interaction States (visitor CTA), §Surface 4 (cross-apex handoff UX).
8. `packages/web/middleware.ts:79-95` — HMAC sign/verify pattern (the helper source for Q3).
9. `packages/web/app/people/[handle]/profile-chat-client.tsx` — Brief 259 visitor chat client; CTA strip inserts into its existing `aside` (line ~5 imports `AuthorizationRequestBlock`; `ChatApiResponse` at lines 30–37 is the response shape the inference scores ride on).
10. `packages/web/app/people/[handle]/quick-start-pills.tsx` — existing visitor entry pills (sibling surface; do not regress).
11. `packages/web/app/api/v1/network/chat/route.ts` (or the existing visitor-chat route) — where per-turn inference is computed in-process (Insight-211).
12. `packages/core/src/db/network/schema.ts` — `networkAuditEvents` at line 1426; new `networkShareAttribution` table added near it.
13. `drizzle/network/meta/_journal.json` — migration journal (Insight-190 sequencing applies).
14. `src/engine/network-step-run.ts` — `createNetworkLaneStepRun` (attribution route mints a wrapper for audit-chain coherence).
15. `src/engine/network-audit.ts` — `writeNetworkAuditEvent` (new `share_attribution_recorded` event class).
16. `src/engine/network-abuse-controls.ts` — `checkRateLimit` (new `share-attribution` limit, per-IP per-handle, Q9).
17. `packages/core/src/content-blocks.ts` — `SuggestionBlock` (line 394), `ActionDef` (line 17), `ActionDef.payload` (caller metadata escape hatch — carries intent context, no schema change).
18. `docs/insights/180-steprun-guard-for-side-effecting-functions.md`, `docs/insights/232-audited-http-route-wrapper-step-run-for-guarded-tools.md`, `docs/insights/239-validate-input-shape-before-minting-step-runs.md`, `docs/insights/211-no-self-http-from-engine-context.md`, `docs/insights/190-migration-journal-concurrency.md`.

## Constraints

- **Inherits every constraint from parent Brief 277.** Do not restate; read the parent's Constraints section.
- **Attribution cookie carries only `{channel, ph, ts}`.** No visitor identity, no chat content, no IP, no fingerprint. `ph` is the profile handle (already in the URL); `channel` is the `?ref=` value; `ts` is issuance epoch. 24h TTL. HMAC-signed via the new `packages/web/lib/signed-cookie.ts` helper (Q3).
- **`packages/web/lib/signed-cookie.ts` is the only new crypto surface.** It lifts the existing `middleware.ts:79-95` HMAC sign/verify into a reusable helper. No new npm dependency (Q3 ruling). Secret resolves from `SESSION_SECRET || NETWORK_AUTH_SECRET` (same as middleware). This file lives in `packages/web/`, NOT `packages/core/` — it is a Ditto-product web concern, not an engine primitive.
- **Durable attribution row written ONLY on visitor CTA click, never on landing** (Designer OQ-4). Landing sets the cookie; clicking a CTA writes the `network_share_attribution` row + the `share_attribution_recorded` audit row.
- **`action` allow-list validated BEFORE `createNetworkLaneStepRun`** (Insight-239). The attribution route's `action` field is validated against `["land", "convert"]` before any wrapper-run row is minted. Unknown `action` → HTTP 400.
- **Caller-supplied `stepRunId` rejected, including falsy values** (Insight-180, matching the existing share-route pattern at `share/route.ts:38`). New attribution route must carry the same `hasOwnProperty(body, "stepRunId")` rejection.
- **Attribution route mints a wrapper-run for audit-chain coherence and rate-limit pass-through** (Insight-232). It calls no guarded engine tool, but it must still create `createNetworkLaneStepRun({ route: "network-share-attribution", action: validated, ... })` so the audit row is chain-anchored.
- **Per-IP per-handle rate limit** via `checkRateLimit({ limitName: "share-attribution", actor: { kind: "ip", id: hashedIp } })` (Q9). No in-memory map. The hashed-IP function: reuse an existing helper in `network-abuse-controls.ts` if present; otherwise salt-and-SHA the visitor IP into an opaque 16-char id (parent §Open for Sub-Brief Builders).
- **The `share-attribution` rate-limit name is registered by Sub-brief 290, not here.** `networkRateLimitNameValues` is a closed `as const` union (parent Q9). Sub-brief 290 ships first and registers all three Brief 277 names (`share-studio-variant`, `share-attribution`, `outcome-share-consent`) in both `networkRateLimitNameValues` and `DEFAULT_POLICIES` (`share-attribution` policy: `{ max: 120, windowMs: 3_600_000 }`). This sub-brief depends on that registration (declared in **Depends on**) and must NOT edit the enum — re-editing would force a needless merge collision on the closed union.
- **Intent inference is a pure in-process function** (Insight-211). It lives in `src/engine/visitor-intent-inference.ts`, is invoked in-process by the existing visitor-chat route (NOT via self-`fetch`), and returns intent scores in the chat API response. The inference never writes anything and never calls an LLM tool requiring a `stepRunId`.
- **Inference is a hint, never a gate** (parent constraint, Designer §Surface 3). The CTA strip always renders all four CTAs as clickable; inference only adds a highlight + whisper line. The 5-rule fallback (score ≥0.6 + margin ≥0.2 = single; two-way tie within 0.2 + both ≥0.6 = dual; 3-way/noisy = all-soft default; decay one turn) is normative — implement exactly as ruled in parent.
- **Cross-apex handoff is a signed query-param, not a cookie or durable cross-deployment delivery.** Server emits `?ditto_ref={channel}|{ph}|{ts}|{hexsig}` on the outbound link to `{handle}.ditto.you` onboarding. The workspace deployment verifies it on first onboarding-step load using the same secret. Insight-234 does NOT apply (parent constraint — no durable cross-deployment artifact; this is a one-shot URL emission consumed at first load).
- **Migration sequencing follows Insight-190.** Check `drizzle/network/meta/_journal.json` for the next `idx`; run `drizzle-kit generate`; verify the SQL file + snapshot exist for the new entry; resequence `idx` on merge conflict.
- **No change to Brief 259 representative contract.** The CTA strip is additive to `profile-chat-client.tsx`'s existing `aside`; the chat reply path, voice mode, and quick-start pills are untouched.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| HMAC-signed cookie helper | `packages/web/middleware.ts:79-95` (Brief 143) | adopt (lift to shared helper) | Already Edge-proven (Web Crypto `crypto.subtle.sign`); no new dependency; payload non-sensitive (Q3). |
| Compact signed cross-apex token | Same helper, query-param shape | original (forced by domain topology) | `.ditto.partners` ≠ `.ditto.you` cookie isolation requires a signed query handoff (Q4). |
| Dedicated attribution table + parallel audit row | Q2 ruling (parent) | original | Admin dashboard (Brief 286) needs an indexable `(profileHandle, channel, ts)` query path decoupled from the signed audit chain. |
| `SuggestionBlock` + `ActionDef.payload` for intent metadata | `packages/core/src/content-blocks.ts:394,17` | adopt | Documented caller-metadata escape hatch; no schema extension for intent context. |
| Four-shape visitor-intent inference + 5-rule fallback | Original to Ditto | original | No surveyed attribution tool infers visitor *intent* from session behavior. |
| Wrapper-step-run lane helper | `src/engine/network-step-run.ts` (Insight-232) | adopt | Attribution route mints wrapper for audit-chain coherence. |
| Audit substrate | `src/engine/network-audit.ts` (Brief 282) | adopt + extend | New `share_attribution_recorded` event class. |
| Multi-instance rate limit | `src/engine/network-abuse-controls.ts` | adopt | Canonical limiter; new `share-attribution` per-IP per-handle limit (Q9). |
| Public profile-as-chat surface | Brief 259 `profile-chat-client.tsx` (complete) | adopt | CTA strip inserts into its existing `aside`; surface is the foundation. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/lib/signed-cookie.ts` | **Create.** `signValue(payload: string): Promise<string>` and `verifyValue(signed: string): Promise<string \| null>` lifting `middleware.ts:79-95` HMAC. Plus `signRefToken({channel, ph, ts})` / `verifyRefToken(token)` for the `{channel}|{ph}|{ts}|{hexsig}` shape used by both the cookie and the cross-apex query param. Secret from `SESSION_SECRET \|\| NETWORK_AUTH_SECRET`. Edge-compatible (Web Crypto only). |
| `packages/web/lib/signed-cookie.test.ts` | **Create.** Round-trip sign/verify; tamper detection (mutated payload fails verify); wrong-secret fails; expired `ts` (>24h) fails; malformed token returns `null` not throw. |
| `packages/web/app/people/[handle]/page.tsx` | **Modify.** On request with `?ref={channel}`, set the signed attribution cookie `{channel, ph, ts}` (24h, `HttpOnly`, `SameSite=Lax`, domain `.ditto.partners`). No durable write on landing (Designer OQ-4). |
| `src/engine/visitor-intent-inference.ts` | **Create.** Pure function `inferVisitorIntent(turns: VisitorChatTurn[], memberSignalKeywords: string[]): IntentInference`. Scores four shapes (curious / similar-expertise / helper-seeker / intro-seeker) 0–1 per latest turn; applies the 5-rule fallback (single / dual / all-soft / decay). Returns `{ highlighted: IntentShape[] \| null, whisper: string \| null, scores: Record<IntentShape, number> }`. No I/O, no LLM, no `stepRunId`. |
| `src/engine/visitor-intent-inference.test.ts` | **Create.** Table-driven: each shape's signal phrases score it highest; score+margin single-winner; two-way tie → dual highlight; three-way → all-soft; decay resets after one non-reinforcing turn; `?ref=` present but no chat engagement → curious (no highlight). |
| existing visitor-chat route (e.g. `packages/web/app/api/v1/network/chat/route.ts`) | **Modify.** After producing the representative reply, call `inferVisitorIntent` in-process (Insight-211) over the running transcript + the member's signal keywords; include the `IntentInference` in the chat API response (extends `ChatApiResponse`). No new HTTP roundtrip. No wrapper-run needed (no guarded tool, no side effect — inference is pure). |
| `packages/web/app/people/[handle]/visitor-cta-strip.tsx` | **Create.** Renders the four CTAs (Ask Mira / Request an intro / Build your own signal / Create a request) as a `SuggestionBlock`-shaped strip in the existing `aside`. Reads `IntentInference` from chat state; highlights the matched CTA(s) + renders the whisper line. Each CTA carries `ActionDef.payload` intent context. All four always clickable. On click → POST to the attribution route, then route to the downstream brief surface with the signed `?ditto_ref=` appended for cross-apex destinations. |
| `packages/web/app/people/[handle]/profile-chat-client.tsx` | **Modify.** Insert `<VisitorCtaStrip>` into the existing `aside` (Designer OQ-3 — no new layout region). Thread `IntentInference` from `ChatApiResponse` into strip state. Mobile: strip renders below chat (Designer OQ-3). No change to chat reply path / voice mode / quick-start pills. |
| `packages/web/app/api/v1/network/share-attribution/route.ts` | **Create.** `POST` accepting `{ action, channel, ph, ctaTarget }`. Reject body with `stepRunId` key (Insight-180). Validate `action ∈ ["land","convert"]` and `channel ∈ VALID_CHANNELS` BEFORE `createNetworkLaneStepRun` (Insight-239). Rate-limit `{ limitName: "share-attribution", actor: { kind: "ip", id: hashedIp } }` (Q9). Mint `createNetworkLaneStepRun({ route: "network-share-attribution", action })`. On `action: "convert"`: insert `network_share_attribution` row + `writeNetworkAuditEvent({ eventClass: "share_attribution_recorded", ... })`. Return 200 with the signed `?ditto_ref=` token for the client to append on cross-apex navigations. |
| `packages/web/app/api/v1/network/share-attribution/route.test.ts` | **Create.** `convert` writes one attribution row + one audit row; `land` writes neither (cookie-only); unknown `action` → 400 before mint (assert no wrapper-run audit record appended); unknown `channel` → 400 before mint; `stepRunId` body key (incl. `""`/`null`) → 400; rate-limit → 429; row shape carries no visitor identity / chat content. |
| `packages/core/src/db/network/schema.ts` | **Modify.** Add `networkShareAttribution` pgTable near `networkAuditEvents` (line ~1426): `id`, `profileHandle`, `channel`, `action`, `visitorSidHash` (nullable, opaque), `ts`, indexed on `(profileHandle, channel, ts)`. No visitor identity columns. |
| `drizzle/network/` migration | **Create.** `drizzle-kit generate` for the new table; verify SQL + snapshot present for the new journal `idx` (Insight-190). |
| `e2e/network/visitor-conversion.spec.ts` | **Create.** Playwright: open `/people/{handle}?ref=linkedin` → cookie set, no durable row → ask a similar-expertise question → "Build your own signal" CTA highlights with expected whisper → click it → attribution `convert` row written → lands on `{handle}.ditto.you` onboarding URL carrying a verifiable `?ditto_ref=` token. |

## User Experience

- **Jobs affected:** Orient (whisper line explains why a CTA is suggested), Decide (visitor picks a path), Delegate (visitor hands their intent to the matched flow). No Curate here — that is Sub-brief 292.
- **Primitives involved:** `SuggestionBlock` (CTA strip), `ActionDef` + `ActionDef.payload` (per-CTA intent metadata), existing profile-chat surface (Brief 259).
- **Process-owner perspective:** A non-technical observer reading a `visitor_conversion` run sees: visitor arrived with `?ref=linkedin` → cookie set (no durable write) → visitor asked a question that overlapped the member's signal → similar-expertise scored 0.72, margin 0.31 → "Build your own signal" highlighted with whisper "You seem to be in a similar space — Ditto can build a signal for you too." → visitor clicked → attribution `convert` row written → handed to onboarding with referral preserved.
- **Interaction states:** Designer §Interaction States (visitor CTA) — empty (no inference yet, all-soft) / inferred-single (one highlight + whisper) / inferred-dual (two highlights + dual whisper) / loading-route (CTA clicked, navigating) / success-routed / error-route (attribution POST failed — CTA still navigates; attribution is best-effort, never blocks the visitor).
- **Designer input:** `docs/research/277-share-loop-public-profile-conversion-ux.md` (CLEAN-PASS 2026-05-19) §Surface 3, §Surface 4, §Interaction States.

## Acceptance Criteria

1. [x] `packages/web/lib/signed-cookie.ts` exists, lifts the `middleware.ts:79-95` HMAC pattern, adds no npm dependency, resolves the secret from `SESSION_SECRET || NETWORK_AUTH_SECRET`, and is Edge-compatible (Web Crypto only); round-trip + tamper + wrong-secret + expiry + malformed tests pass.
2. [x] Landing at `/people/[handle]?ref={channel}` sets a signed `HttpOnly` `SameSite=Lax` cookie carrying exactly `{channel, ph, ts}` (24h TTL) and writes NO durable row (Designer OQ-4); test asserts cookie payload contains no visitor identity or chat content.
3. [x] `inferVisitorIntent` is a pure function (no I/O, no LLM, no `stepRunId`); it scores four shapes per turn and applies the 5-rule fallback exactly (single ≥0.6 & margin ≥0.2; dual within 0.2 & both ≥0.6; 3-way/noisy → all-soft; decay one turn) — verified by table-driven tests for each rule.
4. [x] Per-turn inference is computed in-process by the existing visitor-chat route (no engine self-`fetch`, Insight-211) and returned in the chat API response; no wrapper-run is minted for the pure inference.
5. [x] The CTA strip renders all four CTAs as always-clickable in the existing `profile-chat-client.tsx` `aside` (desktop) / below chat (mobile); a highlighted CTA shows the parent-spec whisper line for its shape; inference is a hint and never disables or hides any CTA.
6. [x] `POST /api/v1/network/share-attribution` validates `action ∈ ["land","convert"]` and `channel ∈ VALID_CHANNELS` BEFORE `createNetworkLaneStepRun` (Insight-239 — test asserts no wrapper-run audit record is appended on a rejected `action`/`channel`); rejects any body containing a `stepRunId` key including falsy values (Insight-180).
7. [x] On CTA click the route writes exactly one `network_share_attribution` row AND one `share_attribution_recorded` audit row for `action: "convert"`, and neither for `action: "land"`; the row contains no visitor identity and no chat content.
8. [x] The attribution route is per-IP-per-handle rate-limited via `checkRateLimit({ limitName: "share-attribution", actor: { kind: "ip", id: hashedIp } })` (Q9) using the canonical substrate (no in-memory map); over-limit returns HTTP 429.
9. [x] Cross-apex handoff: clicking "Build your own signal" or "Create a request" navigates to the `{handle}.ditto.you` destination with a signed `?ditto_ref={channel}|{ph}|{ts}|{hexsig}` token that verifies with the shared secret and is rejected if tampered or older than 24h; an attribution-POST failure never blocks the navigation (best-effort).
10. [x] `network_share_attribution` table is added via a Drizzle migration with a correctly sequenced journal `idx`, SQL file, and snapshot (Insight-190); table is indexed on `(profileHandle, channel, ts)` and has no visitor-identity columns.
11. [x] Brief 259's public profile (representative contract, chat reply path, voice mode, quick-start pills) is unchanged — existing Brief 259 tests pass without modification; the CTA strip is purely additive.

## Review Process

1. Spawn review agent (fresh context) with this sub-brief + parent Brief 277 + Sub-brief 290 + `docs/architecture.md` + `docs/review-checklist.md` + both `docs/research/277-*` reports.
2. Review agent checks:
   - Cookie/handoff payload carries no identity or chat content; `signed-cookie.ts` adds no dependency and is Edge-safe; secret source matches middleware.
   - Insight-239 pre-mint validation present for both `action` and `channel`; Insight-180 falsy-`stepRunId` rejection present; Insight-211 honored (inference is in-process pure, no self-fetch); Insight-190 migration sequencing followed.
   - Inference 5-rule fallback matches the parent ruling exactly; inference is hint-not-gate (all CTAs always clickable).
   - Cross-apex handoff is a signed query-param, not a durable cross-deployment artifact; Insight-234 correctly excluded.
   - No leakage into Sub-brief 290 (Studio/variants) or 292 (outcome/consent) scope; Brief 259 surface not regressed.
   - All Work Product file paths valid; no invented files; ACs boolean and cover parent ACs 8, 9, 13, 14, 15.
3. Present sub-brief + review findings to human for approval.

## Smoke Test

```bash
pnpm run type-check
pnpm vitest run packages/web/lib/signed-cookie.test.ts
pnpm vitest run src/engine/visitor-intent-inference.test.ts
pnpm vitest run packages/web/app/api/v1/network/share-attribution/route.test.ts
pnpm exec playwright test e2e/network/visitor-conversion.spec.ts
```

Manual smoke (web):
1. Open `/people/{handle}?ref=linkedin` in a clean browser session.
2. Confirm the signed cookie is set (DevTools → Application → Cookies); confirm NO `network_share_attribution` row exists yet.
3. Ask the representative a question overlapping the member's expertise.
4. Confirm "Build your own signal" highlights with the expected whisper line; confirm all four CTAs remain clickable.
5. Click "Build your own signal".
6. Confirm exactly one `network_share_attribution` (`action=convert`) row + one `share_attribution_recorded` audit row.
7. Confirm the browser lands on `{handle}.ditto.you` onboarding with a `?ditto_ref=` token; tamper one character → workspace rejects it; restore → accepted.
8. Repeat rapidly from the same IP → confirm 429 after the `share-attribution` limit.

## After Completion

1. Update `docs/state.md` rolling log + `docs/roadmap.md` row 277 with Sub-brief 291 completion.
2. Add a `docs/landscape.md` entry: in-house signed-cookie helper as a `pattern`-level in-repo asset (parent Q3 ruling — Architect owns landscape accuracy per Insight-043; if not yet present, the Documenter adds it).
3. Notify Brief 286 owner that `network_share_attribution` is now queryable for the conversion dashboard.
4. If intent inference accuracy needs tuning post-launch, that is a separate brief — do not in-scope inference-quality iteration here.
