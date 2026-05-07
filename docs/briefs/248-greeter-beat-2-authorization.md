# Brief 248: Greeter Beat 2 — Side-Effect Authorization + Execution

**Date:** 2026-05-03
**Status:** draft
**Depends on:** Brief 247 (parent — approved decomposition); ADR-046 (Loop primitive — sub-brief 248 does NOT touch it but inherits the `stepRunId` discipline); UX spec at `docs/research/first-loop-ux.md` §3.1 (gates builder-start)
**Unlocks:** Sub-brief 249 (Beat 3 needs a successful authorized Do to propose a Loop)

## Goal

Build the Greeter's **Beat 2 capability**: after the Beat 1 recap establishes the visitor's live problem, the Greeter proposes one specific concrete external action, the visitor explicitly authorizes it inline in chat, and the action executes against a real channel (Gmail send for the first slice).

This is the first sub-brief of Brief 247. After it ships, a magic-link visitor on `/chat` can complete an authorized side-effect without leaving the conversation. Loop creation comes in sub-brief 249.

- **Roadmap phase:** Tripoli v3 (post-onboarding First Loop spine).
- **Capabilities:** authorization-gate harness handler (engine); authorization-request ContentBlock (product); 4-state extension to the existing Confirmation AI Element (product); Greeter Beat 2 prompt directive (product); first side-effect tool wired (Gmail authorized send).

## Context

Today the Greeter ends Beat 1 at a recap and either offers a soft commit ("want to keep going?") or hands the visitor into the post-onboarding chat surface. There is **no path through chat to a real-world side-effect**. Insight-222 names this as the load-bearing missing beat — the visitor concludes Ditto is "ChatGPT plus friction" because they can't see one tangible result that other AI couldn't have delivered.

The infrastructure to fix this is mostly in place:

- The streaming chat surface (`packages/web/app/chat/components/chat-conversation.tsx`) already renders typed ContentBlocks inline.
- The `ai-elements/Confirmation` composable component (`packages/web/components/ai-elements/confirmation.tsx`, Brief 061 deep adoption) already handles a 3-state lifecycle (`pending → accepted → rejected`) with a 2-button actions row used by the Brief 058 tool-approval path.
- The Greeter prompt machinery (`src/engine/network-chat-prompt.ts`, 789 lines) has turn-aware directive insertion.
- The harness handler chain in `packages/core/src/harness/handlers/` already has siblings (`trust-gate.ts`, `outbound-quality-gate.ts`, `routing.ts`, `step-execution.ts`) that gate step execution.
- Google Workspace integration plumbing exists (`src/engine/google-workspace-integration.test.ts`, `src/engine/channel.ts`, `src/engine/channel-resolver.ts`); the send capability needs to be wired through a tool the Greeter can call.

What's missing: (a) a primitive that wraps a side-effecting tool call with a per-action explicit-ok gate; (b) a ContentBlock and a Confirmation extension that surface the gate inline; (c) prompt directives that teach the Greeter when to enter Beat 2; (d) one concrete side-effect tool wired as the first slice.

## Objective

After this sub-brief ships, the following walks through end-to-end:

1. Visitor lands on `/chat` (post-magic-link).
2. The Greeter renders a **Beat 1 recap** as a structured "what I heard" message (no new ContentBlock — the recap reuses existing `text-block` + an optional `data-block`; the deliverable here is the prompt directive that produces it).
3. The Greeter proposes one specific concrete action and emits an `authorization-request` ContentBlock inline.
4. The block renders with **Send it / Edit first / Not yet** affordances per UX spec §3.1.
5. **"Send it"** routes through the new `authorization-gate` handler, which invokes the side-effect tool (Gmail send for first slice) carrying `stepRunId`, and the result lands in chat as a confirmation block transition (`pending → executing → succeeded` or `failed`).
6. **"Edit first"** transitions the block to `edit-requested`, hides actions, and the Greeter takes the next turn asking "what should I change?" — edits are conversational, not form-based (Insight-049).
7. **"Not yet"** transitions to `rejected`, the block remains visible for context, no execution.
8. Authorization-gate handler refuses to fire without `stepRunId` (Insight-180).

Loop proposal (Beat 3) is **out of scope** for this sub-brief — sub-brief 249 picks up after a successful Beat 2.

## Non-Goals

- **No Loop creation.** Sub-brief 249's job. Beat 2 ends at the result block; the Greeter does not propose a recurrence here.
- **No multi-channel side-effect tools beyond Gmail.** Calendar invite, list-share, Slack message, Unipile-routed message are explicitly deferred — each is an additive sub-task within or after this sub-brief, not a blocker. Architect will revisit tool inventory at sub-brief 250 review time.
- **No SMS authorization path.** SMS is explicitly deferred per UX spec §2 (no inbound SMS reply-keyword router exists). The trio affordance "Send" copy variant for SMS in the UX spec is forward-looking documentation, not Builder scope here.
- **No Confirmation refactor for non-Beat-2 callsites.** Brief 058 tool-approval callsites of `Confirmation` (currently using the 2-button default actions row) MUST keep working unchanged. The extension is additive — new state values and new slot subcomponents — never breaking the existing API.
- **No new chat surface chrome.** ChatNav, StatusStrip, page-level layout are unchanged. Sub-brief 251 owns the surface trim; this sub-brief lives inside `chat-conversation.tsx`'s existing rendering path.
- **No new prompt persona.** Mira / Alex voice (cognitive/core.md) is preserved exactly. Beat 2 is a new turn directive, not a new persona.
- **No memory schema changes.** Beat 2 outcomes write to memory through the existing chokepoint (Brief 198) — same write path, same categories. If a new memory category is needed (e.g., "external action executed"), Architect to confirm during build; default is to fold under existing `interaction` memory.
- **No `processes` row creation.** Beat 2's tool call is a **one-shot** — no `processes` definition is created. The Loop's per-Loop process row is sub-brief 249 / ADR-046 §3.2.
- **No upgrade prompt.** Beat 2 is silent on workspace / upgrade.
- **No editing of an executed action.** Once `succeeded` lands, the block does not offer "edit and re-send." A retry happens via a new conversational turn.

## Inputs

1. `docs/briefs/247-first-loop.md` — parent brief, especially §What Changes — Sub-brief 248 (the seam-level manifest this sub-brief expands).
2. `docs/research/first-loop-ux.md` §3.1 (Authorization-Request-Block) — full interaction spec including the 9 states (3 existing + 4 new in Confirmation, 1 reused via existing progress-block, 1 reused via existing rejected slot — see §3.1 component-extension table).
3. `docs/insights/222-learn-do-loop-is-the-post-onboarding-spine.md` §"Beat 2 — Do" — the failure modes this sub-brief defends against.
4. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — the guard pattern every new side-effecting function must satisfy.
5. `docs/insights/049-consultative-not-configurative.md` — edits are conversational; no in-place form.
6. `docs/insights/067-conversation-is-alignment-work-surface-is-manifestation.md` — the visitor sees one action with one decision; harness step-decomposition is invisible.
7. `docs/insights/073-user-language-not-system-language.md` — copy never includes "authorize," "execute," "confirm action."
8. `docs/insights/188-gmail-as-intelligence-not-just-send.md` — Gmail integration shape; first side-effect tool is the send path.
9. `docs/insights/061-deep-adoption-vercel-ai-elements.md` (or however the canonical Brief 061 insight is filed; Architect to confirm) — the composable subcomponent + backward-compatible default-export pattern the Confirmation extension must preserve.
10. `packages/core/src/harness/harness.ts` — `HarnessHandler` interface + `HarnessContext` shape the new handler implements.
11. `packages/core/src/harness/handlers/trust-gate.ts` — sibling pattern for placement, naming, and the `setSessionTrustResolver` injection style.
12. `packages/core/src/harness/handlers/outbound-quality-gate.ts` — sibling pattern for a gate that writes to memory/feedback as a side effect of its decision.
13. `packages/core/src/content-blocks.ts` — discriminated union of ContentBlock types. **Note (per UX spec §7 nit):** core has 28 block types but `docs/human-layer.md` documents 26; this sub-brief adds one more (29), and sub-brief 249 adds another (30). The Documenter must reconcile both at absorb time.
14. `packages/web/components/ai-elements/confirmation.tsx` — the existing Confirmation component this sub-brief extends.
15. `packages/web/components/blocks/block-registry.tsx` — where the new block renderer registers.
16. `packages/web/app/chat/components/chat-conversation.tsx` (427 lines) — the streaming surface that renders blocks inline; the new block uses the existing renderer dispatch path.
17. `packages/web/app/api/v1/network/chat/stream/route.ts` — the streaming endpoint that emits ContentBlocks; Beat 2 tool calls extend the existing tool-result rendering, not net-new SSE shape.
18. `src/engine/network-chat-prompt.ts` — the Greeter prompt; this sub-brief adds Beat 1 recap directive + Beat 2 directive.
19. `src/engine/network-chat.ts` (2109 lines) — the Greeter orchestrator; turn-counting + tool-call routing extension.
20. `src/engine/google-workspace-integration.test.ts`, `src/engine/channel.ts`, `src/engine/channel-resolver.ts` — existing Google Workspace plumbing; the Gmail send tool wires through these.
21. `src/engine/tool-resolver.ts` (Insight-180 brief-template note) — every tool the Greeter may call by name must be registered here or via an integration registry. New Gmail-send tool must be added.
22. `docs/insights/190-drizzle-migration-journal-hygiene.md` — N/A this sub-brief (no schema changes), but Architect noted for cross-reference.

## Constraints

- **Side-effecting functions must require `stepRunId` parameter per Insight-180.** This sub-brief introduces:
  - The `authorization-gate` handler (gate itself does not produce external side effects, but invokes side-effecting tools — the gate accepts `stepRunId` from `HarnessContext` and passes it through).
  - The Gmail-send tool (the first concrete side-effecting function — refuses execution without `stepRunId`).
  - Any future tool wired through this gate (calendar invite, list-share, etc. — sub-brief 250 or follow-on briefs).
- **Per-action explicit authorization for the first occurrence.** No silent sends. The `pending` state's affordance trio is the only path to execution. No "auto-send if visitor has been quiet for 30 seconds." No "default to send if visitor's prior session granted standing trust." First-session, first-occurrence side-effects are gated.
- **`expired` state defends against silent execution.** If the visitor walks away from the chat for 30+ minutes mid-`pending`, the block disables its actions (UX spec §3.1 row 10). The next visitor turn triggers a Greeter re-ask, not a delayed execution. This is the structural complement to the `stepRunId` guard.
- **Backward compatibility for Confirmation callsites.** The existing `pending | accepted | rejected` state union and 2-button default actions row must remain unchanged. Brief 058 tool-approval callsites must compile and behave identically. Extension is additive only — new state values added to the union, new slot subcomponents added as named exports, new `variant: "trio"` (or `ConfirmationActionsTrio` named export) for the 3-button row. Default export and `<Confirmation.Actions>` continue to render the 2-button shape.
- **No cross-pollution with the Loop primitive.** This sub-brief MUST NOT add any field, column, table, or function that anticipates Loop creation. The Beat 2 tool result is a one-shot — it returns a side-effect outcome, nothing more. The `ToolCallSpec` shape that ADR-046 §3 says the Loop primitive consumes (`beat2ToolCall: ToolCallSpec`) is structurally derivable from the tool's standard input/output types — no new wrapper needed in this sub-brief. Sub-brief 249 will derive the Loop spec from the executed tool call; this sub-brief does not pre-build that derivation.
- **Voice preservation.** Sub-brief 248's prompt amendments add turn directives without altering Mira/Alex voice. Insight-073 (user language not system language) and Insight-181 (feedback memory bridge) hold. The new directive copy itself MUST avoid "authorize," "execute," "trigger," "confirm action," "this will…," "ok to proceed?" (UX spec §3.1.4 negative copy list).
- **Mode isolation per ADR-041 §3.** The Beat 2 tool call runs in **network-mode** (the visitor is pre-upgrade). The handler MUST NOT invoke any agency-scoped context. (No agency exists yet pre-upgrade — but the constraint is structural.)
- **Engine/product split (CLAUDE.md §Engine Core).** Authorization-gate handler is engine (`packages/core/`). Greeter prompt copy + Gmail-send tool wiring + ContentBlock renderer are product (`src/`, `packages/web/`). The Confirmation component extension is product (`packages/web/components/ai-elements/`). The new ContentBlock TYPE goes in `packages/core/src/content-blocks.ts` (discriminated union lives in core); the RENDERER goes in `packages/web/components/blocks/`.
- **No memory-write primitive expansion.** Beat 2 outcomes write through the existing memory chokepoint (Brief 198). If a new category is needed, fold under existing `interaction` category — Builder may NOT introduce a new write surface in this sub-brief.
- **No multi-loop fan-out or multi-action authorization.** One pending `authorization-request` block per chat turn. If the Greeter has multiple candidate actions, it MUST present one at a time. The "multi-recipient (n>1)" copy variant in UX spec §3.1.4 is one tool call producing many recipients in one block — not many tool calls in many blocks.
- **Feedback capture on every terminal state.** The `rejected`, `edit-requested`, and `expired` transitions are first-class signal — they tell us when the Greeter mis-judged a Beat 2 candidate, asked too soon, or asked something the visitor wouldn't authorize. The handler MUST emit a feedback memory write on each terminal transition through the existing memory chokepoint (Brief 198): category `interaction`, subtype `authorization-outcome`, payload `{ state, actionClass, recipientLabel, idleMsBeforeExpire? }`. Insight-181 (feedback memory bridge) holds. This is what lets the Greeter prompt iterate — without the signal, we cannot tell if Beat 2 is firing too eagerly or not eagerly enough.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| `HarnessHandler` interface + sibling-handler pattern | `packages/core/src/harness/harness.ts`, `trust-gate.ts`, `outbound-quality-gate.ts` | adopt | Existing engine convention; new gate is a sibling. |
| `stepRunId` invocation guard | Insight-180 | depend | Project standard. |
| Composable Confirmation subcomponent + backward-compat default | `packages/web/components/ai-elements/confirmation.tsx` (Brief 061 deep adoption from `vercel/ai-elements`) | adopt | The composable Root + Title + Request + Accepted + Rejected + Actions pattern; extended additively. |
| ContentBlock discriminated union | `packages/core/src/content-blocks.ts` | adopt | Existing 22-type-plus-fallback pattern (per CLAUDE.md §Engine Core); core currently has 28 (per UX spec §7); this brief adds the 29th. |
| SSE-driven streaming surface | `packages/web/app/chat/components/chat-conversation.tsx`, `packages/web/app/api/v1/network/chat/stream/route.ts` | adopt | Block renders inline via existing dispatch; no new SSE event type. |
| Greeter prompt turn-aware directive insertion | `src/engine/network-chat-prompt.ts` | adopt | Beat 1 recap + Beat 2 directives slot into the existing per-turn assembly. |
| Conversational edits (no in-place form) | Insight-049 + Insight-067 | depend | The "Edit first" affordance routes back to the Greeter as a turn, not a modal. |
| Gmail authorized send | Insight-188 + existing `src/engine/google-workspace-integration.test.ts`, `channel.ts`, `channel-resolver.ts` | adopt | Send capability already plumbed; first tool wires through. |
| Plain-language copy discipline | Insight-073 + UX spec §3.1.4 negative copy list | depend | Originals from personas + voice spec. |
| 9-state interaction pattern | UX spec §3.1 component-extension table | adopt | Designer-locked; Builder implements verbatim. |
| Existing `progress-block` for `loading` state | `packages/web/components/blocks/progress-block.tsx` | adopt | Reuse — no new loader. |

## What Changes (Work Products)

**Engine scope: both** — gate primitive in core; tool wiring + prompt + UI in product.

| File | Action |
|------|--------|
| `packages/core/src/harness/handlers/authorization-gate.ts` | Create: new `HarnessHandler` sibling to `trust-gate.ts` and `outbound-quality-gate.ts`. Wraps a side-effecting tool call with a per-action explicit-ok gate. Reads `stepRunId` from `HarnessContext`; refuses to advance without it. Emits an `authorization-request` ContentBlock as the gate's pending output; transitions through `executing → succeeded` or `failed` based on the wrapped tool's outcome. |
| `packages/core/src/harness/handlers/authorization-gate.test.ts` | Create: handler unit tests — `stepRunId` guard (refuses without it), state transitions (`pending → executing → succeeded` happy path; `pending → executing → failed` on tool error; `pending → rejected` on visitor "Not yet"; `pending → edit-requested` on visitor "Edit first"; `pending → expired` after idle timeout). |
| `packages/core/src/content-blocks.ts` | Modify: add `authorization-request` to the ContentBlock discriminated union. Shape: `{ type: "authorization-request", state: AuthorizationRequestState, header: string, preview: ContentBlock[] | null, recipientLabel: string | null, actionClass: AuthorizationActionClass, executionResult: AuthorizationResult | null, expiresAt: string | null }` where `AuthorizationRequestState = "pending" | "executing" | "succeeded" | "failed" | "rejected" | "edit-requested" | "partial" | "expired"` and `AuthorizationActionClass` enumerates the UX spec §3.1.4 action classes (`"email-send"`, `"sms-send"` (forward-looking, not wired), `"calendar-invite"`, `"list-share"`, `"multi-recipient-send"`). The `expiresAt` field is an ISO timestamp set when the block is emitted in `state: "pending"`; the client renderer reads it to drive the local idle timer that triggers the `expired` transition without needing a server poll. NULL for non-pending states. Builder confirms the exact field names against existing block conventions. |
| `src/engine/errors.ts` (or wherever the project's existing custom-error module lives — Builder to confirm by grepping `class .* extends Error`) | Create or modify: export `MissingStepRunIdError extends Error`. The authorization-gate handler, the Gmail-send tool, and any future side-effecting function called by either MUST throw this exact named error type when invoked without `stepRunId`. Project-convention guard for Insight-180 — gives the handler chain and tool surface a single error class to catch and translate to user-facing copy. If the project already has an equivalent named error, Builder reuses it and updates this brief's references. |
| `packages/core/src/harness/handlers/index.ts` (or wherever the handler chain registers — Builder to confirm) | Modify: register the new handler in the handler chain. **Locked chain order:** `routing → trust-gate → authorization-gate → step-execution`. Routing decides which tool, trust-gate enforces the process trust tier, authorization-gate enforces per-action visitor explicit-ok, step-execution invokes. Builder MUST NOT reorder; if a future handler needs to slot between trust-gate and authorization-gate, that needs an ADR amendment. |
| `packages/web/components/ai-elements/confirmation.tsx` | Modify: extend the state union from `"pending" \| "accepted" \| "rejected"` to `"pending" \| "accepted" \| "rejected" \| "executing" \| "succeeded" \| "failed" \| "edit-requested" \| "partial" \| "expired"`. Add new slot subcomponents: `ConfirmationExecuting`, `ConfirmationSucceeded`, `ConfirmationFailed`, `ConfirmationPartial`. Add a new actions variant via either `<ConfirmationActions variant="trio">` or a new named export `ConfirmationActionsTrio` — Builder picks per existing component conventions; preserve the 2-button default. Add new callbacks: `onEdit`, `onRetry`, `onExplain`, `onRetryItem(itemId)`. |
| `packages/web/components/ai-elements/confirmation.test.tsx` (create or extend) | Create/Modify: tests for each new state's render, callback wiring, and backward-compat for the 2-button default actions row. |
| `packages/web/components/blocks/authorization-request-block.tsx` | Create: new ContentBlock renderer. Composes the extended Confirmation (Root + Title + Request + the new state-specific slots + ConfirmationActionsTrio in the pending state). Renders the preview content (TextBlock + optional DataBlock per UX spec §3.1 composition table). Wires the visitor's affordance presses to backend events that advance the gate's state. |
| `packages/web/components/blocks/authorization-request-block.test.tsx` | Create: render tests for each of the 9 states + a "backward-compat smoke" test that mounts an existing Brief 058 Confirmation callsite unchanged and verifies the 2-button default still works. |
| `packages/web/components/blocks/block-registry.tsx` | Modify: register the new `authorization-request-block` renderer for the `"authorization-request"` block type. |
| `src/engine/network-chat-prompt.ts` | Modify: add **two** new directive sections — (a) **Beat 1 recap directive**: when the Greeter has enough information to satisfy *"What [name] needs in the next 24 hours is X,"* the next turn's prose MUST open with a structured "what I heard" recap (plain text, optionally with a DataBlock if the X is list-shaped) before any new question. The directive defines voice and structure, not exact copy. (b) **Beat 2 directive**: after a successful Beat 1 recap turn, if the Greeter can identify one specific concrete external action against the X, the next tool call MUST be the side-effect tool wrapped by the authorization-gate handler. Voice rules: plain-language framing, single recipient or single recipient-list, no preview-without-action verbiage, the action affordance words come from UX spec §3.1.4 (`Send it` / `Edit first` / `Not yet` and class-specific variants). |
| `src/engine/network-chat.ts` | Modify: turn-counting + state-machine logic recognizes Beat 2 transitions (post-Beat-1-recap turn becomes Beat 2 candidate). Tool-call routing for the side-effect class — the Greeter's Beat 2 tool calls route through the new `authorization-gate` handler rather than direct execution. |
| `src/engine/tools/gmail-authorized-send.ts` (or under existing `src/engine/` Greeter-tool location — Builder to confirm during build by grepping existing tool definitions) | Create: the first side-effect tool. Signature: `gmailAuthorizedSend({ stepRunId: string, to: string \| string[], subject: string, body: string, draftId?: string }) => Promise<GmailSendResult>`. Refuses without `stepRunId` (Insight-180). Wraps the existing `google-workspace-integration` send path. Returns either `{ status: "sent", messageId, sentAt, recipients }` or `{ status: "failed", reasonForVisitor: "...", reasonForLog: "..." }` (plain-language reason for UX spec §3.1.3 `failed` state copy). |
| `src/engine/tools/gmail-authorized-send.spike.test.ts` | Create: integration spike test (Insight-180 + brief-template §Smoke Test note for new external API integrations). Makes ONE real Gmail API call against a dev sandbox account to verify auth format, endpoint URL, and response shape. Run BEFORE wiring the tool through the gate: `pnpm vitest run src/engine/tools/gmail-authorized-send.spike.test.ts`. |
| `src/engine/tool-resolver.ts` | Modify: register `gmail-authorized-send` (or whatever exact tool name lands) in the `builtInTools` map. AC verifies every tool name the Greeter prompt may emit has a matching resolver entry per Insight-180. |
| `src/engine/network-chat.test.ts` (or sibling) | Modify: add Beat 1 recap → Beat 2 transition tests, including (i) Greeter emits `authorization-request` block when transition condition met, (ii) "Send it" affordance routes through the gate and produces `succeeded` block on happy path, (iii) "Edit first" routes to a new conversational turn, (iv) "Not yet" closes the gate without execution, (v) `expired` after simulated 30+ min idle. |

## User Experience

- **Jobs affected:** **Capture** (Beat 1 recap surfaces the visitor's words back as confirmation that the Greeter heard them), **Decide** (Beat 2 explicit-ok card), **Review** (the preview pane in the `pending` state is a review surface — visitor scans the recipient + body before approving).
- **Primitives involved:** chat composer + message list (existing), `authorization-request` inline ContentBlock (new), extended Confirmation composable component (existing + 4 new state values + 4 new slot subcomponents + new `trio` actions variant), existing `progress-block` reused for the `loading` shimmer above the block during tool-call execution, existing `text-block` + optional `data-block` reused for Beat 1 recap.
- **Process-owner perspective:** Lisa (UX spec §2 narrative): finished intake yesterday; clicks magic link this morning; lands on `/chat`. Mira's first message is a structured recap of what she heard ("Here's what I'm hearing — pricing is drifting on 4-5 SKUs every week and you only catch it when a customer complains. The competitor-monitoring sweep you described would catch it Monday morning instead of Friday afternoon. Want me to do the first sweep right now?"). Below the message, an `authorization-request` block renders pending — header reads "Want me to send this to ops@lisa.co?" with the drafted email preview in a TextBlock and three buttons: **Send it · Edit first · Not yet**. Lisa taps **Send it**. The block transitions to `executing` (~1.5s shimmer with "Sending…" line), then to `succeeded` ("Sent to ops@lisa.co. 7:43am."). Mira's next conversational turn appears below ("Sent. I'll watch for Sam's reply."). Lisa is one tap from a real result that ChatGPT couldn't have given her — the Beat 2 wedge has landed. **Loop proposal does not happen here** — sub-brief 249 picks up after a successful `succeeded` block.
- **Interaction states:** all 9 states from UX spec §3.1 — `loading` (existing progress-block above), `pending` (default first render with trio), `executing` (post-accept transient), `succeeded` (terminal happy), `failed (post-approval)` (terminal sad — Retry / Tell me more), `rejected (Not yet)` (terminal benign), `edit-requested` (transitions to plain Greeter conversational turn — Insight-049), `partial` (multi-recipient — per-row status + Retry-failed), `expired` (idle 30+ min — actions disable; next visitor turn re-asks).
- **Designer input:** Locked via `docs/research/first-loop-ux.md` §3.1 (authorization-request-block — owns the 9-state interaction matrix, copy variants, mobile/desktop adaptation). Builder implements §3.1 verbatim; copy-trios in §3.1.4 are normative. Negative copy list at §3.1.4 ("never appears in copy") is enforceable in the prompt directive.

## Acceptance Criteria

Each criterion is boolean. Pass/fail.

### Authorization-gate handler (engine)

1. [ ] `packages/core/src/harness/handlers/authorization-gate.ts` exists, exports a `HarnessHandler` named `authorizationGateHandler` with the same shape as `trustGateHandler` and `outboundQualityGateHandler`.
2. [ ] The handler reads `stepRunId` from `HarnessContext`; if absent, throws an error consistent with the project's `MissingStepRunIdError` convention (Insight-180) before invoking the wrapped tool.
3. [ ] The handler emits an `authorization-request` ContentBlock with `state: "pending"` when the wrapped tool call is queued.
4. [ ] The handler transitions the block through `executing → succeeded` on tool happy-path return, populating `executionResult` with the tool's `{ status: "sent", messageId, sentAt, recipients }` shape.
5. [ ] The handler transitions to `failed` on tool error, populating `executionResult` with the tool's `{ status: "failed", reasonForVisitor, reasonForLog }` shape and never surfacing `reasonForLog` to the visitor.
6. [ ] The handler transitions to `rejected` when the visitor's affordance event is `"not-yet"` and never invokes the wrapped tool.
7. [ ] The handler transitions to `edit-requested` when the visitor's affordance event is `"edit-first"`, emits the block with `state: "edit-requested"` (actions row hidden), and yields control back to the Greeter for the next conversational turn.
8. [ ] The handler transitions to `expired` after a configurable idle timeout (default 30 min); on the next visitor turn the Greeter re-asks rather than executing.
9. [ ] Handler unit tests cover all 6 state-machine paths above; tests run under `pnpm test` in the `packages/core/` workspace.

### ContentBlock + Confirmation extension (product)

10. [ ] `packages/core/src/content-blocks.ts` has `authorization-request` added to the discriminated union with the field shape declared in §What Changes (or Builder-confirmed equivalent against existing block conventions). `pnpm run type-check` passes.
11. [ ] `packages/web/components/ai-elements/confirmation.tsx` exposes the extended state union (`"pending" \| "accepted" \| "rejected" \| "executing" \| "succeeded" \| "failed" \| "edit-requested" \| "partial" \| "expired"`) and four new slot subcomponents (`ConfirmationExecuting`, `ConfirmationSucceeded`, `ConfirmationFailed`, `ConfirmationPartial`).
12. [ ] A new actions variant supporting 3 buttons exists (either `<ConfirmationActions variant="trio">` or `ConfirmationActionsTrio` named export); the existing 2-button default actions row continues to render unchanged for callers that don't opt in. Brief 058 tool-approval callsites compile and behave identically — verified by a backward-compat render test in `confirmation.test.tsx`.
13. [ ] `packages/web/components/blocks/authorization-request-block.tsx` exists, renders all 9 states correctly per UX spec §3.1, AND has tests covering each state's render output + the affordance callbacks (`onAccept`, `onReject`, `onEdit`, `onRetry`, `onExplain`, `onRetryItem`). Concretely: trio affordances in `pending`; ✓ "Sending…" + shimmer in `executing`; "Sent to {recipient}. {timestamp}." in `succeeded`; ⚠ + plain-language reason + Retry / Tell me more in `failed`; "Got it — paused this." in `rejected`; in-place draft remains visible with actions hidden in `edit-requested`; per-row status list + Retry-failed in `partial`; greyed actions in `expired`.
14. [ ] `packages/web/components/blocks/block-registry.tsx` registers the new renderer for the `"authorization-request"` block type. The streaming SSE path in `packages/web/app/api/v1/network/chat/stream/route.ts` does not need code changes — the new block type flows through the existing block-rendering dispatch.
15. [ ] The block's `expiresAt` field drives a **client-side** idle timer in the renderer; when `Date.now() >= expiresAt`, the renderer locally transitions to `expired` (greyed actions) without server poll. A unit test fast-forwards client time and asserts the transition fires. Insight-180 corollary: the timer never invokes the wrapped tool — only the server-side gate can do that.
16. [ ] **Feedback memory write on terminal-state transitions.** The handler emits one memory record per terminal transition through `rejected`, `edit-requested`, and `expired` (Insight-181 bridge). Category `interaction`, subtype `authorization-outcome`, payload includes the state, actionClass, recipientLabel, and (for `expired`) the idle duration. Verified by a handler unit test that asserts the memory write call fires with the expected shape.

### Beat 1 recap + Beat 2 prompt directives (product)

17. [ ] `src/engine/network-chat-prompt.ts` has a new **Beat 1 recap directive**: when the Greeter has enough learned-state to satisfy *"What [name] needs in the next 24 hours is X,"* the next turn's prose opens with a structured "what I heard" recap before any new question. Voice and structure rules defined in directive copy; example output shape: 1-2 sentences naming the live problem in the visitor's language, optionally followed by a DataBlock if X is list-shaped, then a single nudge toward Beat 2 ("want me to do the first one now?"). Implementation is via prompt-template extension; no new template file required.
18. [ ] `src/engine/network-chat-prompt.ts` has a new **Beat 2 directive**: after a successful Beat 1 recap turn, if the Greeter can identify one specific concrete external action against X, the next tool call is the side-effect tool wrapped by the authorization-gate handler. Directive enforces single-action / single-recipient or single-recipient-list per turn; copy uses UX spec §3.1.4 trio.
19. [ ] Beat 2 directive copy never includes "authorize," "execute," "trigger," "confirm action," "this will…," "ok to proceed?" (UX spec §3.1.4 negative copy list). Verified by a unit test that introspects the assembled prompt for any of those strings under any tested turn-state and fails if found.
20. [ ] Voice tests for the Greeter prompt continue to pass — Mira/Alex turn-1 self-intro and turn-3 commit-question rules are unchanged. (Re-run existing `network-chat-prompt.test.ts` if present; if not, the existing manual smoke for intake voice is sufficient.)

### Beat 2 turn-state + tool routing (product)

21. [ ] `src/engine/network-chat.ts` recognizes the post-Beat-1-recap turn as a Beat 2 candidate; tool-call routing for the side-effect tool class flows through `authorizationGateHandler` rather than direct execution.
22. [ ] At least one side-effect tool wired: `src/engine/tools/gmail-authorized-send.ts` exists, takes `stepRunId`, refuses execution without it, returns the `{ status: "sent" \| "failed", ... }` shape declared in §What Changes.
23. [ ] `src/engine/tool-resolver.ts` `builtInTools` map contains `gmail-authorized-send` (or the exact final tool name); the Beat 2 prompt directive references the same name. **A test verifies the prompt-referenced tool name resolves** (per Insight-180 brief-template note: tool names in YAML / prompts that don't exist in the resolver are silent failures).
24. [ ] **Integration spike test exists and passes**: `src/engine/tools/gmail-authorized-send.spike.test.ts` makes ONE real Gmail API call against a dev sandbox to verify auth format, endpoint URL, and response shape. Runs via `pnpm vitest run src/engine/tools/gmail-authorized-send.spike.test.ts`. Skipped in CI by default; run manually before wiring the tool through the gate.
25. [ ] End-to-end test in `src/engine/network-chat.test.ts` (or sibling): post-Beat-1-recap turn → Greeter emits `authorization-request` block → "Send it" affordance event → gate routes through tool → `succeeded` block lands → tool round-trip surfaces result in the chat stream (e.g., `executionResult.status === "sent"` and a follow-up Greeter conversational turn appends below the block).

### Cross-cutting

26. [ ] `pnpm run type-check` passes (root + `packages/core/` + `packages/web/`).
27. [ ] `pnpm run build` passes.
28. [ ] `pnpm test` passes (existing + all new tests under sub-brief 248 scope).
29. [ ] Brief 058 tool-approval callsites of `Confirmation` continue to render the 2-button default actions row unchanged. Verified by render snapshot or explicit assertion in `confirmation.test.tsx`.
30. [ ] **Gmail evaluation entry exists in `docs/landscape.md`** for the Gmail send API (auth model, rate limits, sandbox vs. production config, our adoption stance). Per Architect role contract: every external API a brief references must have a landscape entry. If missing at build time, Builder writes it before wiring the spike test or sends Researcher first.

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md` + `docs/insights/222-learn-do-loop-is-the-post-onboarding-spine.md` + `docs/insights/180-steprun-guard-for-side-effecting-functions.md` + `docs/insights/049-consultative-not-configurative.md` + `docs/research/first-loop-ux.md` §3.1 + this brief + ADR-046.
2. Review agent verifies:
   - The authorization-gate handler is in `packages/core/` (not `src/`) and lives alongside `trust-gate.ts` / `outbound-quality-gate.ts` — engine/product split honored (CLAUDE.md §Engine Core).
   - The handler's `stepRunId` guard is enforceable, not optional — function refuses to execute without `stepRunId`, throws consistent with project convention.
   - Confirmation extension is purely additive — Brief 058 callsites unchanged; new state values added to the union; new slot subcomponents added as named exports; new `trio` actions variant doesn't break the 2-button default.
   - Beat 2 prompt directive copy never includes the §3.1.4 negative copy list strings; the negative-copy assertion test is implemented and runs.
   - Mode isolation honored — Beat 2 runs in network-mode; no agency-scoped context is invoked (ADR-041 §3).
   - The Gmail-send tool requires `stepRunId` and refuses without it; the integration spike test exists and is runnable.
   - The tool-resolver registration matches the prompt-referenced tool name (Insight-180 silent-failure guard).
   - **No Loop primitive scaffolding is anticipated in this sub-brief** — no `loopId`, no `nextRunAt`, no schedule field, no Loop-related ContentBlock or copy. Sub-brief 249 owns those.
   - The 9-state interaction matrix matches UX spec §3.1 row-for-row; no states added / removed / renamed.
   - The `expired` state is implemented (30-min idle disables actions; next turn re-asks). This is the structural complement to the `stepRunId` guard against silent execution.
3. Present sub-brief + review findings to human; human approves to start build.

## Smoke Test

```bash
# 1. Type check + build
pnpm run type-check
pnpm run build

# 2. Tests
pnpm test

# 3. Integration spike (one real Gmail API call against dev sandbox)
pnpm vitest run src/engine/tools/gmail-authorized-send.spike.test.ts

# 4. Boot dev server
pnpm run dev

# 5. End-to-end Beat 1 → Beat 2 manual walk:
#    a. Visit /welcome and engage Mira/Alex through intake (use a known-test persona, e.g., the
#       "Lisa pricing-sweep" scenario from UX spec §2 — submit something concrete enough to
#       satisfy Beat 1 recap conditions).
#    b. Submit email; click magic link; land on /chat.
#    c. VERIFY Beat 1 recap: first Greeter message restates the X (the live problem) in 1-2
#       sentences in plain language, optionally with a DataBlock — NOT "I understand you have
#       pricing concerns" generic copy.
#    d. VERIFY Beat 2 emerges: an `authorization-request` block renders below the recap, in
#       state `pending`, with header naming a concrete recipient and the trio "Send it /
#       Edit first / Not yet."
#    e. Tap "Send it"; VERIFY the block transitions `pending → executing → succeeded` (the
#       executing state may be very brief — look for the shimmer); VERIFY the destination
#       inbox actually receives the email; VERIFY a follow-up Greeter conversational turn
#       appears below the block.
#    f. Restart the flow; tap "Edit first"; VERIFY the block transitions to `edit-requested`
#       (actions hidden, draft visible above) and the Greeter takes a new conversational turn
#       asking what to change.
#    g. Restart the flow; tap "Not yet"; VERIFY the block transitions to `rejected` with
#       "Got it — paused this." and the Greeter takes a benign follow-up turn.
#    h. Restart the flow; leave the chat idle for 30+ minutes (or manipulate the test idle
#       timer); VERIFY the block transitions to `expired` (actions greyed); VERIFY the next
#       visitor turn produces a Greeter re-ask, NOT a delayed execution.

# 6. Authorization-gate negative test (no `stepRunId`):
#    - Manually call the Gmail-send tool function without `stepRunId`; VERIFY it throws
#      `MissingStepRunIdError` (or project equivalent) and never invokes the Gmail API.
#    - Manually invoke `authorizationGateHandler` with a HarnessContext missing `stepRunId`;
#      VERIFY it refuses to advance and never invokes the wrapped tool.

# 7. Confirmation backward-compat smoke:
#    - Mount any existing Brief 058 tool-approval flow (search for `<Confirmation` callsites
#      that DON'T pass the new state values); VERIFY the 2-button default actions row renders
#      unchanged and the existing behavior is preserved.

# 8. Negative-copy assertion:
#    - Run the prompt unit test that introspects assembled Beat 2 directive copy for forbidden
#      strings ("authorize," "execute," "trigger," "confirm action," "this will...", "ok to
#      proceed?"). VERIFY the test passes.

# 9. Tool-resolver coherence:
#    - Run the test that asserts every tool name referenced in the Beat 2 prompt directive has
#      a matching entry in `tool-resolver.ts` `builtInTools`. VERIFY it passes (Insight-180).
```

## After Completion

1. Update `docs/state.md` — sub-brief 248 shipped; Beat 2 capability live; Beat 3 (sub-brief 249) is next; ADR-046 still applies but no schema change yet.
2. Update `docs/roadmap.md` — Tripoli v3 row gains "Greeter Beat 2 (authorized side-effect)" sub-capability marked complete; "First Loop" parent capability stays in-progress.
3. Per UX spec §7 nit and the 28-vs-26 ContentBlock count drift — note for the Documenter: this sub-brief takes the count to 29 (29th type added: `authorization-request`); sub-brief 249 will take it to 30 (`loop-confirmation`). Documenter must reconcile `docs/human-layer.md` against `packages/core/src/content-blocks.ts` at sub-brief 251 absorb time (or sooner if convenient).
4. No ADR needed in this sub-brief — ADR-046 (Loop primitive) is the load-bearing structural decision and was written at parent-brief Architect time; the authorization-gate handler is a sibling within the existing harness-handler chain pattern and does not warrant its own ADR.
5. Phase retrospective:
   - Did Beat 2 land for the test persona without surface friction (no form, no upgrade prompt, no chrome change)?
   - Was the Confirmation extension genuinely additive (Brief 058 callsites unchanged)?
   - Did the integration spike catch any Gmail API surprises before the gate wiring?
6. Open follow-up brief: SMS authorization path (deferred per UX spec §2; needs inbound SMS reply-keyword router as prerequisite work).
