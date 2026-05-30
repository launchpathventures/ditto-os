# Brief 280: Workspace Conversational Front Door - Self-First IA

**Date:** 2026-05-16
**Status:** design-ready
**Depends on:** Brief 123 (Workspace Lite chat landing surface), Brief 030 / ADR-016 (Conversational Self), ADR-021 (Surface Protocol), ADR-024 (ContentBlocks as canvas protocol), Brief 040 (Self extensions), Brief 057 (workspace always shown), Insight-180, Insight-183, Insight-211, Insight-232
**Unlocks:** Brief 281 (Workspace Artifact Recall and Archive), later integration-action briefs

## Goal

- **Roadmap phase:** Workspace UX
- **Capability:** Make the authenticated workspace home a single Mira/Self conversation at `/chat`. Processes, reviews, work items, briefings, and progress render as inline artifacts in that conversation using the existing `ContentBlock` protocol. Legacy full-page destinations remain available as drill-downs.

## Context

The launchpath workspace has been live since 2026-05-12. The owner diagnosis on 2026-05-16:

> The issue I have is the processes we create are obscure and not relatable. I can't chat easily with my agent, it doesn't feel like I am currently able to talk to my workspace. Everything is chunked up into siloed chats with processes / tasks etc.

The current code confirms the problem and the opportunity:

- `/chat` is the closest thing to the desired surface, but `packages/web/app/chat/components/chat-conversation.tsx` currently posts to `/api/v1/network/chat/stream` with `context: "front-door"`.
- The network route only accepts network contexts. It is not the authenticated workspace Self surface.
- Workspace tools such as `generate_process` are blocked in front-door context by `src/engine/action-boundaries.ts`, but allowed in workspace context.
- The actual Self streaming seam is `packages/web/app/api/chat/route.ts`, which calls `selfConverseStream()`.
- `src/engine/self-stream.ts` already maps several Self tool results to existing blocks: `ProcessProposalBlock`, `RecordBlock`, `MetricBlock`, `ProgressBlock`, `WorkItemFormBlock`, `ChecklistBlock`, `KnowledgeSynthesisBlock`, and knowledge citation blocks.
- `packages/web/app/entry-point.tsx` currently sends configured workspace users to the three-panel `WorkspacePage` after Day Zero, so the default UX still feels like a filing cabinet rather than a conversation.

This brief is the foundation pass. It fixes the front-door IA and stream boundary first. Broader project/archive/memory card polish belongs in a follow-on brief once `/chat` is genuinely the workspace Self surface.

## Objective

After this brief lands, an authenticated post-Day-Zero workspace user opening the deployment lands in `/chat`. Asking Mira to "set up a process to triage my inbox daily" routes through the workspace Self loop, produces an inline `ProcessProposalBlock`, lets the user save the process, then renders the saved process and run state inline using existing `ContentBlock` types. The user can run, review, and drill into the process without being forced out of the conversation.

## Non-Goals

- No new `ContentBlock` variants in this brief. Use the existing protocol and renderers unless the Builder proves a specific existing block cannot carry the required data and pauses for architecture review.
- No harness primitive or `@ditto/core` behavior changes. Product-layer Self stream/run lookup changes are allowed only where needed to close the workspace chat seam.
- No new public/network front-door behavior. `/network/*`, `/people/[handle]`, public marketing pages, and Network superconnector flows stay out of scope.
- No deletion of drill destinations. `/process/[id]`, `/projects/[slug]`, `/memories/[id]`, `/review`, `/setup`, and `/admin` remain reachable where they already exist.
- No full project, memory archive, or universal card IA. Knowledge can render through existing knowledge citation blocks; project and memory archive polish is follow-on scope.
- No new external integrations. Composio, AgentMail, Slack/Telegram, watchdog, and proactivity remain later briefs.
- No new authentication scheme. Preserve workspace auth and the Brief 123 public/magic-link behavior where it still applies.

## Inputs

1. `docs/architecture.md` - Layer 6 human-layer contract, Conversational Self role, trust tiers.
2. `docs/human-layer.md` - human jobs and primitives; use as the UX lens.
3. `docs/dictionary.md` - canonical vocabulary and route naming.
4. `docs/review-checklist.md` - architecture review checklist.
5. `docs/personas.md` - especially Rob/Lisa/Jordan/Nadia checks for whether the workspace feels conversational and legible.
6. `packages/web/app/page.tsx` - workspace/public entry routing.
7. `packages/web/app/entry-point.tsx` - Day Zero and current `WorkspacePage` default.
8. `packages/web/app/chat/page.tsx` - current chat surface and `ChatNav`.
9. `packages/web/app/chat/components/chat-conversation.tsx` - current stream target and block rendering.
10. `packages/web/app/api/chat/route.ts` - workspace Self stream target via `selfConverseStream()`.
11. `packages/web/app/api/v1/chat/session/route.ts` - current chat session bootstrap; reconcile with workspace auth.
12. `packages/web/app/api/v1/workspace/session/route.ts` - workspace session cookie behavior.
13. `packages/web/components/blocks/block-registry.tsx` - existing `ContentBlock` rendering.
14. `packages/core/src/content-blocks.ts` and `src/engine/content-blocks.ts` - canonical protocol and thin re-export.
15. `src/engine/self.ts` - Self guidance branches; update per Insight-183.
16. `src/engine/self-stream.ts` - tool-result-to-block mappings.
17. `src/engine/self-delegation.ts` and `src/engine/self-tools/generate-process.ts` - Self tool behavior, especially generated-process save/run.
18. `src/engine/action-boundaries.ts` - workspace vs front-door tool permissions.
19. `packages/web/app/process/[id]/page.tsx`, `packages/web/app/projects/[slug]/page.tsx`, `packages/web/app/memories/[id]/page.tsx` - preserved drill destinations.

## Constraints

- Workspace `/chat` MUST NOT call `/api/v1/network/chat/stream` or send `context: "front-door"`.
- Workspace `/chat` MUST use `/api/chat` / `selfConverseStream()` or an equivalent authenticated Self stream.
- If chat session bootstrap needs workspace identity, read the workspace session cookie directly or through a shared helper. Do not self-HTTP from the app to another local route.
- Keep Day Zero intact. Do not server-redirect configured workspace users away from Day Zero before it has been seen/completed.
- After Day Zero, `/` should make `/chat` the default authenticated workspace home, not `WorkspacePage`.
- Reuse existing blocks first: `ProcessProposalBlock`, `RecordBlock`, `MetricBlock`, `ProgressBlock`, `AuthorizationRequestBlock`, review/status blocks, `WorkItemFormBlock`, `ChecklistBlock`, `KnowledgeSynthesisBlock`, knowledge citation blocks, alerts, and suggestions.
- Process surfaces must be human-readable before they are engine-readable. Inline process summaries show purpose, trigger, next action, trust tier, and current status; raw YAML, slugs, executor names, and internal ids stay behind drill-down/detail affordances.
- Trust tier display uses canonical tiers from `trustTierValues`: `supervised`, `spot_checked`, `autonomous`, `critical`. UI labels may be `Supervised`, `Spot-checked`, `Autonomous`, `Critical`.
- Self guidance branch parity is required per Insight-183. Update new-user and established-user workspace guidance away from "right panel" / "Chat is the entry point, not the destination" language. Keep inbound branches UI-free.
- Side-effecting inline actions go through existing Self tools and trust gates. If an HTTP route is unavoidable, it must mint the wrapper step run server-side and reject caller-supplied `stepRunId`, including falsy values, per Insight-180 and Insight-232.
- Close the generated-process run seam explicitly. `generate_process(save=true)` currently persists a DB process definition; `start_pipeline` currently loads YAML process definitions. The Builder must either make saved generated processes resolver-compatible or extend the product-layer run path to load DB-backed definitions. Do not change harness primitives to do this.
- Preserve reduced-motion behavior for inline progress and block expansion.
- Preserve conversation continuity: reloads should not force the user to re-orient if Brief 123 already persisted the relevant state.
- Keep `docs/state.md` concise. This brief must not produce another large state-file dump.

## Provenance

| What | Source | Level | Why |
| --- | --- | --- | --- |
| Workspace chat as foundation | Brief 123 `/chat` surface | adopt | The product already has a focused conversation surface; make it the actual workspace home. |
| All surfaces call Self | ADR-016 | adopt | Surface adapters must route through Conversational Self rather than invent separate agent chats. |
| ContentBlocks as output protocol | ADR-021, ADR-024, `packages/core/src/content-blocks.ts` | adopt | Inline artifacts should use the canonical Self output protocol, not a parallel renderer system. |
| Existing Self tool blocks | `src/engine/self-stream.ts` | adopt | The mappings already cover process proposals, records, metrics, progress, work item forms, briefings, and citations. |
| Workspace boundary | `src/engine/action-boundaries.ts` | adopt | The current front-door context correctly blocks workspace tools; `/chat` must use a workspace context. |
| Wrapper step-run guard | Insight-180, Insight-232 | adopt | Inline side effects must remain audited and trust-gated. |
| Human jobs lens | `docs/human-layer.md` | adopt | The IA should be organized around orient/define/delegate/review/capture, not primitive folders. |
| Single conversation with tool/runtime loop behind it | Hermes Agent architecture, ChatGPT, Claude, Cursor | pattern | Hermes keeps prompt assembly, tool dispatch, memory, and session state behind one conversation loop. Ditto should adopt the same surface discipline while preserving its own harness primitives. |

## Work Products

| File | Action |
| --- | --- |
| `packages/web/app/page.tsx` | Preserve public landing behavior. In configured workspace mode, keep Day Zero flow intact and make post-Day-Zero workspace home `/chat` rather than the three-panel workspace. |
| `packages/web/app/entry-point.tsx` | Preserve setup/Day-Zero checks. After Day Zero, route to `/chat` instead of rendering `WorkspacePage`. |
| `packages/web/app/chat/page.tsx` | Treat authenticated workspace chat as Mira/Self home. Preserve `StatusStrip`, unauthenticated behavior, and existing visual shell where applicable. |
| `packages/web/app/api/v1/chat/session/route.ts` | Reconcile session bootstrap with workspace auth. Workspace mode should read `ditto_workspace_session` or a shared workspace auth helper, not require only `ditto_chat_session`. Preserve public/magic-link behavior where still used. |
| `packages/web/app/chat/components/chat-conversation.tsx` | Switch workspace sends to `/api/chat` / Self stream. Render `data-content-block` chunks through the existing block registry. Remove workspace dependence on `/api/v1/network/chat/stream` and `context: "front-door"`. |
| `packages/web/components/blocks/block-registry.tsx` and existing block renderers | Improve existing block rendering only if required for the inline flow. Do not add new block variants by default. |
| `src/engine/self.ts` | Update workspace guidance for new and established users so Self defaults to inline blocks in chat and does not tell the user to use the right panel or navigate primitive tabs. Apply Insight-183 branch parity. |
| `src/engine/self-stream.ts` | Adjust mappings only where needed. `generate_process(save=true)` should emit an inline saved-process summary using existing blocks; `start_pipeline` progress copy should be generic, not "dev pipeline" only. |
| `src/engine/self-delegation.ts` or a product-layer process resolver | Close the DB-generated-process run seam so a saved generated process can be run from chat through the existing Self/trust path. |
| `src/engine/action-boundaries.ts` tests | Add or update focused tests proving workspace chat can use workspace tools while front-door remains restricted. |
| `packages/web/e2e/workspace-chat-front-door.spec.ts` | Add a durable local Playwright smoke for `/` -> `/chat`, workspace Self streaming, process proposal, save, run, and reduced-motion. Prefer mocked Self stream/tool responses for determinism; live Railway smoke is supplemental, not the only verification. |
| `docs/state.md` | Update only after human approval, with a concise checkpoint. |
| `docs/roadmap.md` | Update only after human approval, adding this workspace UX phase/status. |

## User Experience

- **Primary job:** talk to the workspace agent.
- **Secondary jobs:** define a process, run it, review gated actions, capture a work item, and ask for a briefing without leaving chat.
- **Default surface:** one conversation at `/chat`, with inline artifacts.
- **Drill-downs:** full pages remain for detail, inspection, setup, and admin. They are not the home surface.
- **States:** streaming response, tool progress, saved artifact, trust-gated pause, error with retry, and empty/no-match response.
- **Persona check:** Rob should understand that he can just ask Mira; Lisa should see trust/audit status before action; Jordan should be able to inspect drill-down details; Nadia should see no new hidden side-effect path.

## Acceptance Criteria

1. [ ] In configured workspace mode, authenticated post-Day-Zero users land on `/chat` from `/`; the three-panel `WorkspacePage` is no longer the default home.
2. [ ] Day Zero remains reachable and is not bypassed by an early redirect.
3. [ ] Authenticated workspace `/chat` uses workspace session identity; it does not require only `ditto_chat_session`. Unauthenticated workspace users still follow the existing login path, and public/magic-link chat behavior is preserved where applicable.
4. [ ] Workspace `/chat` sends messages to `/api/chat` / `selfConverseStream()` or an equivalent authenticated Self stream. It does not call `/api/v1/network/chat/stream` and does not send `context: "front-door"`.
5. [ ] Boundary tests prove the workspace chat context can use `generate_process`, `get_process_detail`, `get_briefing`, `create_work_item`, and `start_pipeline`, while front-door context remains restricted.
6. [ ] Asking "set up a process to triage my inbox daily" triggers `generate_process(save=false)` and renders an inline `ProcessProposalBlock` in the conversation with no full-page redirect.
7. [ ] Saving the proposed process renders an inline, human-readable saved-process summary using existing blocks such as `RecordBlock`, `MetricBlock`, `ProgressBlock`, alerts, and suggestions. The summary shows purpose, trigger, next action, status, and trust tier without leading with raw YAML, slugs, executor names, or internal ids. No new block variant is introduced.
8. [ ] Trust tier labels on inline process surfaces use canonical tiers: `Supervised`, `Spot-checked`, `Autonomous`, and `Critical`.
9. [ ] "Run now" for a saved generated process works from chat through the Self/trust path and emits inline progress. The DB-backed generated-process run seam is closed without changing harness primitives.
10. [ ] If a run or action requires review, the pause renders inline using the existing authorization/review block patterns, and approve/edit/reject actions preserve existing audit and feedback behavior.
11. [ ] "What's on today?" or an equivalent briefing request renders the existing briefing-related blocks inline; no separate briefing destination is required.
12. [ ] Capturing or creating a work item from chat renders existing work-item/status/record blocks inline; no new work-item card type is introduced.
13. [ ] Drill links for preserved destinations use real route shapes, including `/process/[id]`, `/projects/[slug]`, `/memories/[id]`, `/review`, `/setup`, and `/admin` where those routes exist.
14. [ ] `packages/core/src/content-blocks.ts` and `src/engine/content-blocks.ts` remain unchanged unless a justified existing-block gap is documented and reviewed. If unchanged, the engine re-export stays pass-through.
15. [ ] Self guidance is updated for all relevant branches per Insight-183: new workspace users, established workspace users, and inbound contexts remain consistent with the chat-home IA.
16. [ ] Inline progress, expansion, and any new transitions honor `prefers-reduced-motion: reduce`.
17. [ ] Verification passes: root type-check, web type-check, focused engine/web tests for the changed seams, and a deterministic local Playwright smoke for workspace chat home.

## Review Process

1. Fresh-context review should use `docs/architecture.md`, `docs/review-checklist.md`, and this brief.
2. Reviewer must check that `/chat` is now a workspace Self surface, not a Network front-door stream.
3. Reviewer must check no new `ContentBlock` variants or core behavior changes were introduced without explicit documented justification.
4. Reviewer must check trust tiers use canonical values and that inline side effects stay behind Self/trust gates.
5. Reviewer must check Insight-180 / Insight-232 if any HTTP route was added or changed for a side-effecting inline action.
6. Reviewer must check Day Zero, Brief 123 auth behavior, `StatusStrip`, and preserved drill routes did not regress.
7. Reviewer must check the DB-generated-process run seam is actually handled, not left as an inline button that fails after save.
8. Reviewer must check `docs/state.md` and `docs/roadmap.md` are updated only after human approval and remain concise.

## Smoke Test

Run locally with deterministic mocked Self/tool responses first. Use live Railway smoke only as supplemental validation.

```bash
pnpm run type-check
pnpm --filter @ditto/web type-check
pnpm vitest run src/engine/action-boundaries.test.ts src/engine/self-stream.test.ts
pnpm exec playwright test packages/web/e2e/workspace-chat-front-door.spec.ts
```

Manual flow:

1. Open `/` in configured workspace mode as an authenticated user who has completed Day Zero.
2. Confirm the browser lands on `/chat`.
3. Confirm `StatusStrip` and conversation history render.
4. Send: `set up a process to triage my inbox daily`.
5. Confirm the stream comes from workspace Self and an inline `ProcessProposalBlock` appears.
6. Save the process.
7. Confirm the saved process summary appears inline with canonical trust tier labeling.
8. Click `Run now`.
9. Confirm the run starts or reaches an inline trust-gated review pause without a full-page redirect.
10. Ask: `what's on today?`
11. Confirm briefing blocks render inline.
12. Click a process or project drill link and confirm the real destination renders; use browser back and confirm `/chat` still has the prior conversation context.
13. Toggle reduced motion and confirm progress/expansion does not use infinite or distracting motion.

## After Completion

Only after human approval:

1. Update `docs/state.md` with a concise checkpoint.
2. Update `docs/roadmap.md` with the Workspace UX status.
3. Add any durable insight to `docs/insights/` if the build reveals a reusable architecture lesson.
4. Confirm follow-on scope for Brief 281 (Workspace Artifact Recall and Archive) before moving to later integration-action briefs.
