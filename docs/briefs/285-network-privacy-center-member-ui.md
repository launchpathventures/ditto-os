# Brief 285: Privacy Center (Member-Facing)

**Date:** 2026-05-18
**Status:** implemented + per-brief fresh-context reviewed PASS 2026-05-19; closeout set (285, 286, 287) ready for fresh-context closeout review; pending human approval to close parent Brief 270
**Depends on:** Sub-brief **284** (export/delete routes, identity verifier, 410 behavior); Briefs **272-275** (Member Signal, claims, sources, Active Request, Background Watch data + lifecycle)
**Unlocks:** Sub-brief 287; the closeout checkpoint

> Closeout sub-brief 1 of 3 under parent **Brief 278**. One UI surface: the member Privacy Center. Builds in parallel with sub-brief 286 after 284. The full UX reference is `docs/research/278-trust-privacy-admin-ux.md` §3 — this brief is the build wrapper around it; do not re-derive the UX.

## Goal

- **Roadmap phase:** Phase 14 - Network Agent
- **Capabilities:** The member-facing Privacy Center: view/edit/hide/delete/export/pause for signal, sources, claims, public profile, requests, watches, intros, and the block list; plus the pre-consent Discovery Profile self-service surface.

## Context

Parent Brief 278 closeout requires real member data controls. The Designer fully specified the experience (`-ux.md` §3, eight sections, Brilliant Flow 4393 destructive journey, the Original-to-Ditto §3.7 Discovery Profile case). The parent resolved the build forks: D-Q2 (composition, no new ContentBlock), D-Q3 (standalone `/network/privacy` route — the pre-consent subject has no `/chat` session), D-Q6 (`StatusCardBlock`→`ActionBlock` export, not `ArtifactBlock`). This brief implements that spec against the sub-brief 284 routes.

## Objective

A member (or pre-consent Discovery Profile subject) can see every source and claim with provenance and visibility, edit/hide/delete claims, pause public profile without deleting private signal, pause/resume/close watches, export their data, delete their public projection (→ HTTP 410), see intro history, and manage their own block list — on a standalone route, composed from existing ContentBlocks.

## Non-Goals

- No new ContentBlock (D-Q2 — composition only).
- No engine/route changes — this brief consumes sub-brief 284's routes and Briefs 272-275's data/lifecycle APIs; if a needed control's backend is missing, that is a defect in the depended-on brief, not new scope here.
- No admin surface (sub-brief 286).
- No inline-in-`/chat` rendering (D-Q3 — standalone route; chat links *to* it).
- No change to the retention numbers or 410 behavior (set by 284 / human ratification — this brief only *displays* them in copy).

## Inputs

1. `docs/research/278-trust-privacy-admin-ux.md` — **§3 in full** (3.1 mental model, 3.2 eight sections, 3.3 primitive composition, 3.4 interaction states, 3.5 export/delete journey, 3.6 identity UX, 3.7 Discovery Profile Original-to-Ditto). This is the build reference.
2. `docs/briefs/278-trust-privacy-admin-observability.md` — parent; D-Q2, D-Q3, D-Q6; §User Experience; §Proposed Retention Defaults (the ratified numbers the delete/export copy must state).
3. `docs/briefs/284-network-privacy-export-delete-retention-admin-scaffold.md` — the export/delete routes, identity verifier, 410 behavior this UI calls.
4. Briefs 272-275 — Member Signal/claim/source/request/watch read+mutate APIs the controls bind to; `docs/briefs/261-introductions-free-counter-workspace-upsell.md` Hard Rule #5 (owner sees own block list + that a filter fired with reason code; never the anti-persona text rendered).
5. `docs/briefs/complete/258-knowledge-base-intake-and-off-network-scout.md` — the KB-shelf row precedent (fact · source · visibility · edit/archive) the Claims section adopts.
6. `packages/core/src/content-blocks.ts` — the blocks composed (and `NetworkProfileCardBlock.antiPersonaMd` must be `null` on this owner-preview render path).
7. `docs/human-layer.md` lines 40-48 — conversation-first IA (drill-down link from chat).

## Constraints

- Composition only — no new ContentBlock (D-Q2). Blocks: `StatusCardBlock`, `MetricBlock`, `InteractiveTableBlock`, `RecordBlock`, `KnowledgeCitationBlock`, `ActionBlock`, `InputRequestBlock` (select/textarea), `NetworkProfileCardBlock` (public-scrubbed, `antiPersonaMd: null`), `JobRequestCardBlock`.
- Standalone route `packages/web/app/network/privacy/page.tsx` (D-Q3); reachable from chat as a drill-down; must render for a session-less Discovery Profile subject arriving via an invite link (identity via sub-brief 284's verifier — email-challenge / claim-token-when-279).
- Pause ≠ delete is a consistent visual language everywhere (Designer §3.1/§3.5): pause = secondary, reversible, no confirm; delete = destructive styling, confirm + identity re-verify + irreversible-success modal.
- **Hard Rule #5 (origin: Brief 259 system prompt; carried forward as a binding rule by Brief 261).** The member sees their own block/anti-persona list (owner-visible) and, in intro history, the structured `refusalReason` code when a filter fired on their behalf — the anti-persona rule **text** is never rendered even here; the requester-facing generic styling does not leak requester identity beyond what was ever surfaced.
- The export UI is `StatusCardBlock` (job state) → `ActionBlock` (identity-gated download), never `ArtifactBlock` (D-Q6/R-Q6). The delete UI states the **ratified** retention window and the **HTTP 410** post-delete URL behavior in plain copy (Designer §3.5 step 5; numbers from parent §Proposed Retention Defaults).
- Discovery Profile self-service (§3.7) is **Original to Ditto**: four equally-weighted exits (Claim & correct / Decline / Suppress / Delete), provenance-first framing, no dark patterns, sealed refusal logic never shown. Mark this sub-surface Original to Ditto in the build.
- Every section specifies all five interaction states (Designer §3.4).
- No side-effecting logic added in the component — all mutations go through existing guarded routes (282-284 substrate + 272-275 APIs); the UI never mints a `stepRunId`.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Eight-section Privacy Center | `-ux.md` §3.2/§3.3 | adopt | The Designer spec is the interaction contract; this brief implements it. |
| Claims row (fact·source·visibility·edit/archive) | Brief 258 KB-shelf | adopt | Proven precedent; consistency across the two member data surfaces. |
| Destructive export/delete journey | Brilliant Flow 4393 (`-ux.md` §3.5) | pattern | Gold-standard consequences-before-action + re-verify + irreversible modal. |
| Provenance progressive disclosure | Insight-087; `KnowledgeCitationBlock` | adopt | Clean row → "From {source} · {age}" → full source drill. |
| Sealed-data line ("N things are private") | Insight-201; sub-brief 282 `scrubDecision` | adopt | The withheld count is itself shown — sealed-data pattern. |
| Discovery Profile self-service | Original to Ditto (`-ux.md` §3.7) | original | No precedent assumes a non-user subject of a profile. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `packages/web/app/network/privacy/page.tsx` | Create: the standalone route (D-Q3); resolves identity via sub-brief 284's verifier; renders the Privacy Center; handles the session-less Discovery Profile subject entry. |
| `packages/web/components/network/privacy-center.tsx` | Create: the eight-section surface composed per `-ux.md` §3.3; the §3.7 Discovery-Profile sub-surface (four equal exits); all five interaction states per §3.4. |
| `packages/web/components/network/privacy-center.test.tsx` | Create: leakage assertions (no private/hidden/un-approved-on-request claim rendered; `antiPersonaMd` never rendered), pause≠delete affordance distinction, export = StatusCard→Action (no ArtifactBlock), delete copy states ratified retention window + 410, Discovery-Profile four-equal-exits + no dark pattern, all five states per section. |
| chat drill-down link | Modify: add the "Privacy & your data" drill-down entry point from the member chat surface to `/network/privacy` (conversation-first IA, `human-layer.md` 40-48). |

## User Experience

- **Jobs affected:** **Curate** (proposed 7th job, Insight-238 — the Privacy Center is its first full realisation: "is what Ditto knows about me correct and mine?"), **Orient** (what's public vs private — section 1 mirror header first, by anxiety not data model), **Decide** (remove source / change visibility / delete / pause).
- **Primitives involved:** composition only (see Constraints). Mirror header = `StatusCardBlock` (N public · N on-request · N private/hidden) + `MetricBlock`; Sources = `InteractiveTableBlock` + per-row `KnowledgeCitationBlock` + `ActionBlock` ("Remove from future reasoning" — durable, copy says so); Claims = grouped `RecordBlock` + `InputRequestBlock` select (Public/On-request/Private/Hidden) + `ActionBlock` (edit/hide/delete); Public profile = `NetworkProfileCardBlock` (scrubbed, `antiPersonaMd: null`) + reversible Pause + destructive Delete; Requests/Watches = `JobRequestCardBlock`/`RecordBlock` + pause/resume/close `ActionBlock`; Intros = read-only `InteractiveTableBlock` (owner sees `refusalReason` code, never the rule text); Blocked & filtered = `InteractiveTableBlock` + add/remove with inline pattern validation (Brief 261: only `*`, ≤254 chars, no regex metacharacters) + sealed line; Your data = Export (`StatusCardBlock`→`ActionBlock`) + Delete (multi-step §3.5).
- **Process-owner perspective:** "a single mirror of everything this connector knows about me — each item shows where it came from and who can see it, and I can change or revoke any of it." The pre-consent Discovery Profile subject (§3.7) gets the honest, bounded, provenance-first framing with four equal exits — the highest-trust-stakes screen in the product.
- **Interaction states:** all five per section, Designer §3.4 (the high-risk export/delete and the §3.7 entry detailed there); fail-closed reassurance copy on error ("Couldn't delete — nothing was changed").
- **Designer input:** `docs/research/278-trust-privacy-admin-ux.md` §3 in full (the build reference).

## Acceptance Criteria

1. [ ] (Parent AC #13) The member can view every source attached to their Member Signal, each with drillable provenance (`KnowledgeCitationBlock`, Insight-087 progressive disclosure).
2. [ ] (Parent AC #14) The member can remove a source from future reasoning; the control copy makes the durable "stop using this for inference" semantic explicit (it is a durable toggle, not a delete).
3. [ ] (Parent AC #15) The member can edit, hide, and delete claims and change per-claim visibility (Public/On-request/Private/Hidden), each with a one-line plain-language consequence under the current selection.
4. [ ] (Parent AC #16) The member can pause public profile visibility without deleting private signal; pause is visually/semantically distinct from delete (reversible, no confirm) everywhere on the surface.
5. [ ] (Parent AC #17) The member can pause, resume, and close Background Watches from the surface.
6. [ ] (Parent AC #18) The member can export signal/request/watch/intro/share data; the UI renders job state as `StatusCardBlock` and the download as an identity-gated `ActionBlock` — no `ArtifactBlock`.
7. [ ] (Parent AC #19) The member can delete the public profile projection; the flow is consequences-before-action → identity re-verify → final confirm → explicit irreversible-success modal that states the ratified recovery window and that the direct profile URL returns HTTP 410 (verified end-to-end against the sub-brief 284 route).
8. [ ] No private, hidden, or un-approved on-request claim is rendered anywhere on the surface; `NetworkProfileCardBlock.antiPersonaMd` is never populated on this render path; the owner's block list is shown to the owner but its anti-persona text is never rendered (Hard Rule #5) — test-asserted.
9. [ ] The route renders for a session-less Discovery Profile subject (identity via the sub-brief 284 verifier) and presents the §3.7 four equally-weighted exits with provenance-first framing and no dark patterns; sealed refusal logic is never shown. Marked Original to Ditto.
10. [ ] Every section implements all five interaction states (loading/empty/error/partial/success) per Designer §3.4; root `pnpm run type-check` and `pnpm --filter @ditto/web test -- privacy` pass.

## Builder Completion Notes — 2026-05-19

- Created `/network/privacy` as a standalone route plus `PrivacyCenter` composition from existing block renderers only (`StatusCardBlock`, `MetricBlock`, `InteractiveTableBlock`, `RecordBlock`, `KnowledgeCitationBlock`, `ActionBlock`, `NetworkProfileCardBlock`).
- Added the chat drill-down link to `/network/privacy`; session ids are forwarded when available.
- Added the session-less Discovery Profile surface with four equal exits and provenance-first copy; no sealed refusal logic is rendered.
- Added leakage tests for hidden/private/unapproved-on-request claims, `antiPersonaMd`, export `StatusCardBlock`→`ActionBlock`, delete retention/HTTP 410 copy, Discovery Profile equal exits, and all five section states.
- Review-fix patches: `/network/privacy` now fails closed until a Network lane session resolves and `verifyNetworkIdentity` confirms the requested member subject; Discovery Profile entry requires a verified claim token before the four-exit surface renders; the chat link passes lane context and no-subject links resolve to the verified session's public-profile subject. Session-less final export/delete starts with the 284 `initiate-challenge` action instead of fabricating a subject-derived session id, and session export/delete preserves expert/client lane context.
- Source removal, watch lifecycle, block-list add/remove, profile visibility pause/resume, claim edit/hide/delete, and Discovery Profile suppress/delete/decline/claim now go through guarded routes. Side-effecting routes reject caller-supplied `stepRunId` where they write, mint a server wrapper run, and write audit/provenance; profile visibility audit is transactional with before/after metadata.
- Verification: focused Brief-285 route/component vitest **61/61** (7 files), claim-invite + handle regression vitest **17/17**, `pnpm --filter @ditto/web test -- privacy` passed, broad `pnpm test -- privacy` passed (**3324/3324**, 14 skipped), `pnpm run type-check` passed, `git diff --check` passed, and Playwright smoke verified fail-closed Discovery Profile no-token/invalid-token entry with no console errors.

## Designer Refinement Notes — 2026-05-19

- Elevated the Privacy Center from a linear settings stack into a provenance-first privacy ledger: compact trust header, sticky owner rail, section index/nav, calmer state treatment, and tighter hierarchy for the eight required sections.
- Refined the Discovery Profile surface into a higher-trust invitation panel with explicit Original-to-Ditto framing, equal-weight exits, stronger provenance-first treatment, and restrained Ditto orange accents.
- Improved mobile responsiveness by compressing the rail navigation into a horizontal section strip, reducing repeated empty-state copy, and keeping destructive/reversible controls visually distinct.
- No backend or privacy-boundary semantics changed in this pass. Verification: focused route/component vitest **10/10**, five-file Brief-285 privacy regression vitest **39/39**, `pnpm run type-check` pass, `git diff --check` pass, and Playwright desktop/mobile screenshots captured in `.context/privacy-center-refined-*.png`.

## Builder Design-Implementation Notes — 2026-05-19

- Implemented the remaining design-recommendation polish in the Privacy Center component: section status badges are calmer, section tone no longer reads as a rainbow taxonomy, and the sticky rail now carries per-section state so the ledger navigation communicates operational status.
- Preserved the existing data/control semantics: no route changes, no new ContentBlock, no privacy-boundary changes, and no new side-effecting logic.
- Verification: focused route/component vitest **10/10**, five-file Brief-285 privacy regression vitest **39/39**, `pnpm run type-check`, `git diff --check`, Playwright desktop/mobile screenshots at `.context/privacy-center-builder-*.png`, and console smoke with 0 warnings/errors.

## Review Closeout Notes — 2026-05-19

- `/dev-reviewer` verdict for the builder design-recommendation polish: **PASS with flags**.
- Findings recorded: **P1** handoff risk because the Brief 285 implementation files are still untracked in git, so a PR/commit based on tracked diff alone could omit them; **P3** missing test assertions for the new rail-state affordance (`Sources: Empty`, `Your data: Success`, etc.).
- Reviewer found no privacy-boundary, route, or side-effect regression in the polish patch. Verification rerun: `pnpm vitest run packages/web/components/network/privacy-center.test.tsx` **6/6** and `pnpm run type-check` pass.
- No new ADR, insight, or landscape update needed; these are handoff/test-coverage follow-ups rather than architecture changes.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + parent Brief 278 + this sub-brief + the Designer spec + 282-284 diffs.
2. Review agent checks: leakage (no private/hidden/anti-persona render), composition-not-new-block, pause≠delete language, export block choice (no ArtifactBlock), delete copy states ratified numbers + 410, §3.7 four-equal-exits + no dark pattern, all five states.
3. Present work + review findings to the human (part of the closeout checkpoint, reviewed with 286, 287 before parent 270 closes).

## Smoke Test

```bash
pnpm --filter @ditto/web test -- privacy
pnpm run type-check
pnpm --filter @ditto/web dev

# Manual:
# 1. Member with public/on-request/private/hidden claims opens /network/privacy → only public + viewer-approved on-request render; "N things are private" sealed line shows; antiPersonaMd never visible.
# 2. Change a claim Public→Private → chip updates inline; consequence line updates.
# 3. Remove a source from future reasoning → copy makes the durable semantic explicit; row reflects it.
# 4. Pause public profile (no confirm, reversible) vs Delete projection (confirm + re-verify + irreversible modal stating recovery window + 410).
# 5. Export → StatusCardBlock job state → identity-gated ActionBlock download; no ArtifactBlock anywhere.
# 6. Open the route as a session-less Discovery Profile subject via an invite link → four equal exits, provenance-first, no dark pattern, no refusal logic shown.
```

## After Completion

1. Update `docs/state.md` (sub-brief 285 complete).
2. Update `docs/roadmap.md` row 278.
3. Phase retro notes feed the closeout-checkpoint retro.
4. Documenter records the human's Insight-238 (Curate) ruling in `docs/human-layer.md` and the "Network audiences" persona note in `docs/personas.md` — only after the human rules (parent §After Completion #3).
