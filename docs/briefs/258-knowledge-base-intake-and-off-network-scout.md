# Brief: 258 — Knowledge Base Intake and Off-Network Scout

**Date:** 2026-05-12
**Status:** approved for build via `/dev-builder`
**Depends on:** Brief 263; client-lane base through Brief 266
**Unlocks:** Brief 259 public profile-as-chat, Brief 260 share copy, Brief 261 introduction flow

## Goal

Give experts a source-traceable, editable knowledge shelf with per-fact visibility, and replace the client-lane off-network scout stub with source-grounded scout results that do not leak private filters, budget, or unsupported claims.

## Scope

- Network-tier Postgres schema adds exactly four tables: `network_user_kb_documents`, `network_user_kb_facts`, `network_user_anti_persona`, `network_user_voice_intake`.
- Persist documents, reviewed transcripts, facts, and private filters as DB rows plus markdown under a configurable network KB root.
- Add guarded built-in tools: `extract_kb_facts`, `record_voice_intake`, `scout_off_network`.
- Add KB upload, visibility/edit/private-filter, voice transcript, and scout API routes.
- Add expert KB shelf UI and client scout UI/result states.
- Reuse `src/engine/web-search.ts`; no new search provider or STT vendor.

## Non-Goals

- No public `/people/[handle]` visitor chat.
- No share modal/social copy/OG export.
- No actual intro, outreach, email, or third-party writes.
- No vector DB/RAG subsystem.
- No LinkedIn ZIP ingestion.

## Key Constraints

- Network schema changes live in `packages/core/src/db/network/schema.ts` and `drizzle/network/`.
- Update network schema table-count header.
- Follow migration journal rules from Insight-190.
- `networkUsers.wantsVisibility` stays coarse profile listing exposure only; fact-level `visibility` owns `public | on-request | off`.
- Default fact visibility is `on-request`.
- Off facts and private filters must not enter public/share/visitor prompts.
- Client budget must not appear in scout queries, candidate rationale, snippets, shareable surfaces, or logs.
- Scouted candidates require a public source URL; no URL means discard.
- Upload handling must bound size, validate type/extension, sanitize names, reject traversal, and avoid logging raw content.
- Side-effecting functions require `stepRunId` except under `DITTO_TEST_MODE=true`; HTTP routes must create/use an audited network-lane wrapper before calling them.

## Provenance

- **Markdown-backed KB storage:** Original to Ditto, following the project’s filesystem-legible documentation pattern so facts, transcripts, and private filters remain grep-able alongside DB rows.
- **Source-grounded scout:** Adapts the existing Ditto `webSearch` capability from Brief 093 / Perplexity Sonar rather than adding a new search provider.
- **Per-fact visibility:** Original to Ditto, derived from parent Brief 254’s Surface E rule that public representation must be fact-scoped rather than governed by the coarse `networkUsers.wantsVisibility` listing flag.
- **Voice transcript fallback:** Patterned from the research notes in `docs/research/network-kb-intake-and-scout-ux.md`: speech capture is optional, reviewed/pasted transcript is the durable source of truth.
- **Candidate source card rendering:** Patterned from the Refero Homerun candidates reference cited in `docs/research/network-kb-intake-and-scout-ux.md`; adapted to Ditto’s `SuggestedCandidate` content block and review-only scout flow.

## Acceptance Criteria

1. Network schema adds exactly four Brief 258 tables with migrations/journal entries, user/status/updated indexes, and no workspace-tier FK.
2. Documents, transcripts, facts, and private filters persist as rows plus markdown under configurable root; path traversal is tested.
3. `extract_kb_facts` requires `stepRunId`, loads source doc, extracts source-traced facts, defaults visibility to `on-request`, writes rows + markdown.
4. Fact edit/archive/manual-add/visibility APIs update rows/mirrors, leave `networkUsers.wantsVisibility` unchanged, and append feedback/audit events with actor/session, target id, before/after, timestamp.
5. `record_voice_intake` requires `stepRunId`, persists reviewed transcript markdown, links facts to voice source, and supports pasted transcript fallback.
6. Context assembly filters facts by audience; private/off content never reaches public/share/visitor contexts.
7. Tool resolver registers `extract_kb_facts`, `record_voice_intake`, `scout_off_network`; prompt directives use exact names.
8. Upload routes accept bounded text/markdown/PDF/CSV/JSON and return structured 503 when network DB is unavailable.
9. Expert UI adds KB shelf after profile/handle exists with upload, voice, manual fact, private filter, edit/archive, and visibility controls.
10. Private anti-persona rules are stored separately and covered by scrubber tests.
11. `scout_off_network` requires `stepRunId`, builds queries without budget/private filters, uses existing `webSearch`, discards candidates without URLs, and fails closed when unconfigured.
12. `/api/v1/network/scout` validates card, enforces session/Turnstile/rate limit, creates audited wrapper step run, rejects bypass stepRunId, caches briefly, and never returns budget/private filter fields.
13. Parent scout stub becomes real loading/success/empty/error/cached flow with `ReviewCardBlock` plus candidates.
14. Scouted candidates render with source label/link/snippet and non-impersonating CTA; on-network candidates keep handle/intro behavior.
15. “More like” passes seed candidate to scout route or honestly says seed is only a hint.
16. No 258 path sends email, emits intro, writes to third party, or claims outreach happened.
17. Targeted tests cover schema helpers, markdown storage, audit capture, upload validation, guards, prompt/tool parity, scout route wrapper, fail-closed scout parsing, privacy scrubbers, UI states, and root type-check.

## Required Checkpoint

Builder must checkpoint after AC 1-10 before scout work. If KB/voice/privacy tests do not pass cleanly, split scout work.

## Smoke Test

```bash
pnpm --filter @ditto/core type-check
pnpm run type-check
pnpm exec rg "^export const \\w+ = pgTable" packages/core/src/db/network/schema.ts | wc -l
pnpm exec rg "network_user_kb_documents|network_user_kb_facts|network_user_anti_persona|network_user_voice_intake" drizzle/network/0002_*.sql
pnpm vitest run \
  src/engine/network-kb-storage.test.ts \
  src/engine/network-kb-extract.test.ts \
  src/engine/network-voice-intake.test.ts \
  src/engine/network-kb-context.test.ts \
  src/engine/network-scout.test.ts \
  src/engine/tool-resolver.test.ts \
  packages/web/app/api/v1/network/kb/upload/route.test.ts \
  packages/web/app/api/v1/network/kb/visibility/route.test.ts \
  packages/web/app/api/v1/network/kb/voice/route.test.ts \
  packages/web/app/api/v1/network/scout/route.test.ts \
  packages/web/app/network/chat/client-card-actions.test.tsx \
  packages/web/app/network/chat/suggested-candidates-panel.test.tsx
```
