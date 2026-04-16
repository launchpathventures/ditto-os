# Meta Process Robustness Roadmap

**Created:** 2026-04-14
**Purpose:** Make every meta process as tight as the frontdoor. Each meta process must flow seamlessly end-to-end — no dead ends, no silent failures, no confused users.

**Benchmark:** The front door (Briefs 120-131) is the gold standard. Conversation → consent → chain fires → execution begins → SSE streams progress → email arrives → reply routes back. Every handoff is wired. Every edge case is closed. That's the bar.

---

## How to Read This

Each meta process is a section. Within each:
- **What exists** — code and briefs already built
- **What's broken or missing** — specific gaps found in the journey analysis
- **What "tight" looks like** — the target experience
- **Work items** — ordered tasks to close the gaps
- **Dependencies** — what must be done first

Priority: P0 = users hit this every session, P1 = users hit this weekly, P2 = users hit this monthly, P3 = compound effect / power users.

---

## MP-1: Goal Framing → Process Creation → First Run (P0) ✓ COMPLETE

**The meta process:** User says "I need X" → Self guides conversation → process proposed → user approves → process runs → first output appears for review.

**What exists:**
- `generate_process` tool (save=false preview, save=true commit)
- ProcessProposalBlock with interactive approval in UI
- `surface-actions.ts` handles proposal approval → calls `generate_process(save=true)`
- 22 templates in `processes/templates/`
- `matchTaskToProcess()` keyword routing (confidence >= 0.6)
- `executeOrchestrator()` goal decomposition with `goalHeartbeatLoop`

**What's broken:**
1. ~~**Process created → nothing runs.**~~ **Fixed (Brief 145, MP-1.2).** Both creation paths now lead to activation offer.
2. ~~**No template matching during conversational creation.**~~ **Fixed (Brief 145, MP-1.1).** `generate_process` now calls `findProcessModel()` first.
3. **Goal decomposition feedback gap.** `create_work_item` → `executeOrchestrator` fires via `setImmediate()`. Tool returns immediately with classification JSON. User sees no progress, no "breaking this down...", no ProgressBlock.
4. **Tier 3 auto-build is invisible.** When orchestrator generates a process via `triggerBuild()`, user never learns a new process was created for them.
5. ~~**`activate_cycle` doesn't execute.**~~ **Fixed (Brief 145, MP-1.3).** Now calls `fullHeartbeat()` via `setImmediate()` immediately after `startProcessRun()`.

**What "tight" looks like:**
- User approves proposal → Self asks "Ready to run this with your first request?" or auto-triggers if pending work matches
- Process generation checks template library first, proposes template with adaptations
- Goal decomposition streams progress: "Breaking this into 3 steps... Starting step 1..."
- Cycle activation calls `fullHeartbeat()` immediately (same as `start_pipeline`)
- Auto-built processes surface for user awareness: "I created a process for [sub-goal] — here's what it does"

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-1.1 | ~~Template matching in `generate_process`~~ — **done (Brief 145).** `findProcessModel()` called before building from scratch. >= 0.6 uses template structure, 0.3-0.6 mentions inspiration, < 0.3 from scratch. | enhancement | — |
| MP-1.2 | ~~Post-creation activation~~ — **done (Brief 145).** Both paths: form returns `conversationContext: { activationReady }`, conversational path has delegation guidance for `activationHint`. | enhancement | — |
| MP-1.3 | ~~`activate_cycle` fullHeartbeat fix~~ — **done (Brief 145).** `setImmediate(() => fullHeartbeat())` added, matching `start_pipeline` pattern. | bug fix | — |
| MP-1.4 | ~~Goal decomposition progress~~ — **done (Brief 155).** 5 new HarnessEvent types for orchestrator progress. SSE sanitization + `useOrchestratorProgress` hook with ProgressBlock/AlertBlock conversion. | enhancement | — |
| MP-1.5 | ~~Tier 3 build notification~~ — **done (Brief 155).** `build-process-created` event emitted after successful `triggerBuild()`. Surfaces via SSE as AlertBlock. | enhancement | MP-1.4 |
| MP-1.6 | ~~End-to-end test~~ — **done (Brief 156).** 6 tests validate full chain: generate→save→activate→run→review→trust. Fixed `handleGenerateProcess` missing `outputs: []`. | test | MP-1.1, MP-1.2 |

---

## MP-2: Onboarding → First Process → "Aha" Moment (P0) ✓ COMPLETE

**The meta process:** User clicks magic link from frontdoor email → lands in workspace → Alex greets them with context → guides to first process → first real output → user sees the value.

**What exists:**
- `processes/onboarding.yaml` (5 steps: gather-basics, identify-first-pain, reflect-understanding, propose-first-process, first-real-work)
- Magic link auth (Brief 123 — `magicLinks` table, `/chat` page, httpOnly cookie)
- `adapt_process` tool for runtime process adaptation
- KnowledgeSynthesisBlock and ProcessProposalBlock content blocks
- Progressive reveal: conversation-only until first process created
- Self speaks first for new users (`cognitive/self.md` onboarding guidelines)

**What's broken:**
1. **Frontdoor-to-workspace memory bridge.** Frontdoor builds user model and memories via the conversation. When user transitions to workspace via magic link, does `assembleSelfContext()` load those frontdoor memories? Self-scoped memories are workspace-scoped — frontdoor memories may be network-scoped. User may have to re-explain themselves.
2. **Magic link landing experience.** User clicks link, lands on `/chat`. Is Alex's greeting informed by the frontdoor conversation? Or is it a cold "Welcome to Ditto"?
3. **Onboarding → MP-1 handoff.** Onboarding step "propose-first-process" produces a ProcessProposalBlock. When user approves, does it connect to MP-1's creation flow? Or is it a separate path?
4. **Time-to-value.** Between "user approves first process" and "first output appears for review" — how long? What does the user see? Silence = churn.

**What "tight" looks like:**
- Magic link landing → Alex says "Hey [name], glad you're here. Based on our conversation, I know you're looking for [X]. Let's set that up."
- Frontdoor memories (user model, business context, ICP) carry over to workspace Self context
- First process proposal is template-matched (not blank), pre-filled with frontdoor context
- First output appears within minutes, with ProgressBlock showing real-time execution
- Progressive reveal triggers naturally — sidebar appears when first process is approved

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-2.1 | ~~Audit memory bridge~~ **done** (Brief 148 — identified 3 gaps: ephemeral learned context, magic link transfers only email, Self doesn't load person-scoped memories) | research | — |
| MP-2.2 | ~~Frontdoor context injection~~ **done** (Brief 148 — `persistLearnedContext()` in `memory-bridge.ts`, `loadSelfMemories()` extended, magic link calls persist before generating) | enhancement | MP-2.1 |
| MP-2.3 | ~~Onboarding-to-creation handoff~~ **done** (Brief 157 — `onboarding.yaml` steps wired to `generate_process` with template matching + frontdoor context, Self guidance updated) | integration | MP-1.1 |
| MP-2.4 | ~~First-run streaming~~ **done** (Brief 157 — `chat-conversation.tsx` SSE subscription via `useHarnessEvents`, `ProgressBlockComponent` inline, progressive reveal) | enhancement | MP-1.4 |
| MP-2.5 | ~~End-to-end onboarding test~~ **done** (Brief 157 — 5 Playwright tests with SSE route interception, `ChatPage` page object) | test | MP-2.2, MP-2.3, MP-2.4 |

---

## MP-3: Daily Briefing → Orient → Review Cycle (P1) ✓ COMPLETE

**The meta process:** User opens Ditto → Self detects session gap → briefing assembles → review items surface inline → user approves/edits/rejects → next steps kick off → user monitors pipelines throughout day.

**What exists:**
- `get_briefing` tool with 5 dimensions (focus, attention, upcoming, risk, suggestions)
- `briefing-assembler.ts` queries active runs, pending reviews, recent completions
- Session gap detection triggers proactive briefing
- ReviewCardBlock with approve/edit/reject actions
- ProgressBlock populated from `activeRuns`
- SSE events for pipeline progress (`step-complete`, `gate-pause`, `run-complete`)
- `useHarnessEvents` + `use-pipeline-review.ts` hooks in web UI

**What's broken:**
1. ~~**Autonomous digest missing.**~~ **Fixed (Brief 158, MP-3.1).** `assembleAutonomousDigest()` queries `harnessDecisions` for auto-advanced steps since last session, groups by process, builds rich summaries from step IDs and `_activityLabel` outputs. "WHILE YOU WERE AWAY" section in briefing.
2. ~~**Briefing staleness.**~~ **Fixed (Brief 158, MP-3.5).** `generatedAt` timestamp in `BriefingData`, included in `get_briefing` output and metadata. No caching layer — each call assembles fresh.
3. ~~**Review → resume latency.**~~ **Verified (Brief 158, MP-3.4).** Data-layer chain tested: waiting_review → running → next pause → briefing updates. SSE event contract verified against use-pipeline-review.ts.
4. ~~**Empty briefing.**~~ **Fixed (Brief 158, MP-3.3).** Deterministic empty state: "Nothing needs your attention. Your processes are running smoothly." No LLM in empty path.
5. ~~**Stuck pipeline visibility.**~~ **Fixed (Brief 158, MP-3.2).** ProgressBlock extended with `"waiting"` status + `waitFor` metadata. `assembleWaitStates()` reads `runMetadata.waitFor` on `waiting_human` runs. "WAITING FOR EXTERNAL EVENTS" section in briefing.

**What "tight" looks like:**
- Morning briefing includes autonomous summary: "While you were away: 8 emails sent (2 responses), 3 quotes generated (all approved automatically)"
- Briefing regenerates on each session gap, never stale
- Review approval → next step starts → SSE event → UI updates without refresh
- Empty state: "Nothing needs your attention. Your processes are running smoothly." (no hallucinated urgency)
- Waiting-for-event states show clearly: "Quoting process paused — waiting for supplier reply (sent 2 days ago)"

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-3.1 | ~~Autonomous digest~~ — **done (Brief 158).** `assembleAutonomousDigest()` + `buildDigestSummary()`. Rich summaries from step IDs + `_activityLabel` outputs. | enhancement | — |
| MP-3.2 | ~~Wait-state visibility~~ — **done (Brief 158).** ProgressBlock `"waiting"` status + `waitFor` metadata. `assembleWaitStates()`. UI renders in `progress-block.tsx`. | enhancement | — |
| MP-3.3 | ~~Briefing empty state~~ — **done (Brief 158).** Deterministic "Nothing needs your attention." No LLM in path. | enhancement | — |
| MP-3.4 | ~~Review-to-resume UI flow~~ — **done (Brief 158).** 4-step data-layer transition test + SSE event contract test. | integration test | — |
| MP-3.5 | ~~Briefing freshness~~ — **done (Brief 158).** `generatedAt: Date` in `BriefingData`, included in output + metadata. | verification | — |

---

## MP-4: Feedback Capture → Pattern Detection → Learning Loop (P1) ✓ COMPLETE

**The meta process:** User edits an output → diff captured structurally → pattern detected after 3+ corrections → "Teach this?" surfaced → user accepts → next run is measurably better.

**What exists:**
- Feedback recorder (harness handler) captures diffs on edit
- Trust diff with WikiTrust severity model classifies edit significance
- Pattern notification after 3+ similar corrections (read-only)
- Process-scoped and self-scoped memories
- SLM training data pipeline (Brief 135 — extraction, readiness scoring, JSONL export)
- `improvement-scanner` system agent (architecture, not yet implemented)

**What's broken:**
1. **Loop not closed.** State.md says "Pattern notification — After 3+ corrections of same pattern, read-only notification surfaced. Precursor to Phase 8 'Teach this'." The notification exists but accepting it doesn't update anything. The user says "yes, learn this" and... nothing changes.
2. **No immediate effect.** First correction should have *some* effect on the next run. Currently corrections are stored as feedback records but not injected into the next execution's context. Memory-assembly loads process-scoped memories — but does the feedback-to-memory bridge actually write correction patterns as memories?
3. **Three-tier learning not wired.** Corrections should flow to: (a) process-scoped memory (immediate, next run), (b) quality criteria update (durable, affects all runs), (c) SLM training data (long-term, affects model). Only (c) appears implemented via Brief 135.
4. **No "before/after" evidence.** When the system claims it learned, the user should see evidence: "You used to correct invoice descriptions 60% of the time. After teaching, correction rate dropped to 5%."

**What "tight" looks like:**
- User edits output → diff captured → next run of same process includes correction as process-scoped memory ("User previously corrected X to Y")
- After 3+ corrections: "I notice you always change bathroom labour from 2h to 3h. Should I remember this?" → User says yes → quality criteria updated on process definition → memory written
- Correction rate tracked per pattern — evidence shown: "Labour estimate corrections: 60% → 8% after learning"
- SLM training data accumulates in background for eventual fine-tuning

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-4.1 | ~~Feedback-to-memory bridge~~ — **done (Brief 147).** Edit feedback writes process-scoped memory with correction pattern. Memory-assembly loads for next run. | enhancement | — |
| MP-4.2 | ~~"Teach this?" action loop~~ — **done (Brief 147).** Pattern acceptance writes durable process-scoped memory AND updates process quality criteria. | enhancement | MP-4.1 |
| MP-4.3 | ~~Correction rate tracking — track per-process, per-pattern correction rates over time. Surface in process detail and briefing~~ **done** (Brief 159) | enhancement | MP-4.2 |
| MP-4.4 | ~~Evidence narrative — when suggesting trust upgrade or showing learning effect, include before/after correction rates~~ **done** (Brief 159) | enhancement | MP-4.3 |
| MP-4.5 | ~~End-to-end test: edit output 3x with same pattern → notification appears → accept → next run produces corrected output without human edit~~ **done** (Brief 159) | test | MP-4.1, MP-4.2 |

---

## MP-5: Trust Earning → Tier Upgrade → Autonomy Expansion (P1) ✓ COMPLETE

**The meta process:** Process runs accumulate → approval rates tracked → system suggests upgrade → user sees evidence → accepts → fewer reviews required → eventually autonomous with digest.

**What exists:**
- Trust earning (sliding window 20 runs, conjunctive upgrades, disjunctive downgrades)
- `adjust_trust` tool (confirmed=false for proposal, confirmed=true after user approval)
- Trust control in UI (natural language slider)
- Evidence narrative
- `suggest_next` can recommend trust upgrades
- Degradation auto-downgrade

**What's broken:**
1. **Upgrade moment is buried.** Trust upgrade suggestion comes via `suggest_next` in briefing. But this is a *milestone* — the user's AI teammate just leveled up. It deserves more than a suggestion line.
2. **Downgrade communication.** Auto-downgrade happens silently in the trust computation. User discovers it when reviews start appearing again. No explanation of *why*.
3. **Autonomous digest not wired.** At autonomous tier, outputs auto-advance. But there's no mechanism to summarise what auto-advanced — ties to MP-3.1.
4. **Spot-check experience unclear.** At spot-checked, user reviews ~20% of outputs. The 80% they don't see — where are they? How does the user know those were fine?

**What "tight" looks like:**
- Trust upgrade surfaces as a celebratory moment: "Your quoting process has been 95% accurate over 25 runs. I'd like to check in less often — maybe 1 in 5 instead of every time. Here's the evidence: [narrative]. What do you think?"
- Downgrade is explained warmly: "I'm going to check in more on invoices — the last few had some issues I want to make sure we catch. [specific pattern]"
- Auto-advanced outputs appear in a collapsible "Handled automatically" section in the briefing
- Spot-checked outputs that weren't sampled appear in a "Reviewed by me, looked good" summary

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-5.1 | ~~Trust upgrade celebration~~ — **done (Brief 160).** `TrustMilestoneBlock` in `@ditto/core`, `generateUpgradeCelebration()` builds evidence narrative with accept/reject actions. Surfaced in briefing as TRUST MILESTONES section. | enhancement | — |
| MP-5.2 | ~~Downgrade explanation~~ — **done (Brief 160).** `generateDowngradeExplanation()` with warm tone + specific trigger patterns. `executeTierChange()` stores milestone in activity metadata. Surfaced in next briefing. | enhancement | — |
| MP-5.3 | ~~Auto-advanced summary~~ — **done (Brief 158+160).** `autonomousDigest` in BriefingData (Brief 158). Briefing WHILE YOU WERE AWAY section with rich step-level summaries. | enhancement | MP-3.1 |
| MP-5.4 | ~~Spot-check transparency~~ — **done (Brief 160).** `SpotCheckStats` per process: auto-advanced vs sampled counts, auto-passed-checks. Surfaced in briefing as SPOT-CHECK TRANSPARENCY section. | enhancement | — |

---

## MP-6: Inbound Email → Classification → Routing → Response (P0) ✓ COMPLETE

**The meta process:** Someone replies to Alex's email → inbound received → classified (positive/question/opt-out/OOO) → routed to correct process → response generated → quality gate → sent.

**What exists:**
- `inbound-email.ts` with reply handling
- `fireEvent("positive-reply")` triggers connecting-introduction process
- Cancellation signal detection (`isCancellationSignal()`)
- Email threading via `email_thread` metadata
- Opt-out management template
- Outbound quality gate (non-bypassable handler)

**What's broken:**
1. **Ambiguous reply routing.** "Maybe next month" — is that positive? Neutral? Currently classification is binary (positive-reply event or cancellation signal). Middle-ground replies may misroute.
2. **Reply speed.** Classification → routing → process execution → quality gate → send is a multi-step pipeline. For direct questions ("What's your pricing?"), latency matters.
3. **Thread context continuity.** Does the response maintain conversational context from the original outreach? Or does each reply start fresh?
4. **Opt-out reliability.** Must be immediate, permanent, and never fail. Is the opt-out path tested independently from the happy path?
5. **OOO handling.** Out-of-office replies should not trigger positive-reply events or count as engagement.

**What "tight" looks like:**
- Reply classification has 5 categories: positive, question, neutral/deferred, opt-out, auto-reply (OOO). Each routes differently
- Positive → connecting-introduction chain (existing)
- Question → Self handles conversationally with thread context
- Neutral/deferred → log interaction, adjust follow-up timing
- Opt-out → immediate removal, confirmation email, never contact again
- Auto-reply → ignore, don't count as engagement
- Direct questions get response within 5 minutes
- Thread context carries through — Alex references the original outreach naturally

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-6.1 | ~~Reply classification expansion~~ — **done (Brief 146).** 6 categories: opt_out, positive, question, deferred, auto_reply, general. Ambiguous replies route appropriately. | enhancement | — |
| MP-6.2 | ~~Thread context injection~~ — **done (Brief 161).** `loadThreadContext()` loads original outreach + prior replies with token budget (4000 char default, configurable via `THREAD_CONTEXT_MAX_CHARS`). `SelfConverseOptions.threadContext` injects `<email_thread_context>` block into Self system prompt. | enhancement | — |
| MP-6.3 | ~~OOO detection~~ — **done (Brief 146).** `isAutoReply()` detects out-of-office patterns, `auto_reply` classification skips recording entirely. | enhancement | — |
| MP-6.4 | ~~Opt-out reliability test~~ — **done (Brief 146).** Opt-out keyword detection, immediate removal, confirmation. Tested in inbound-email.test.ts. | test | — |
| MP-6.5 | ~~Question fast-path~~ — **done (Brief 161).** Question-classified contact replies route to Self with thread context, response sent via `sendAndRecord` (outbound quality gate). `"question_received"` notification informs user. Self failure non-fatal. | enhancement | MP-6.1, MP-6.2 |

---

## MP-7: Exception Handling → Escalation → Resolution (P1) ✓ COMPLETE

**The meta process:** Process step fails or produces low-confidence output → retry logic → still failing → escalate to user with context → user provides guidance → process resumes → guidance captured as memory.

**What exists:**
- Confidence gate (low confidence always pauses regardless of trust tier)
- Retry with feedback injection (`retry_on_failure`)
- Orchestrator escalation (Types 1/3/4)
- `detect_risks` tool (aging items, data staleness, correction patterns, **stale escalations, dependency blockages**)
- Human step suspend/resume mechanism
- **Escalation message templates** per failure type (confidence_low, external_error, timeout, dependency_blocked, max_retries, unknown)
- **Guidance-to-memory bridge** — escalation resolution guidance captured as process-scoped memory, tagged with failure pattern
- **Stale escalation detection** — `detect_risks` surfaces escalations older than 24h (configurable)
- **Cross-process dependency visibility** — `dependency_blockage` risk type + `ProgressBlock.blockedBy` field

**Completed:** Brief 162 (2026-04-15)

**Work items:**

| # | Item | Type | Depends on | Status |
|---|------|------|-----------|--------|
| MP-7.1 | Escalation message quality — human-readable templates per failure type | enhancement | — | **done** (Brief 162) |
| MP-7.2 | Guidance-to-memory bridge — guidance captured as process-scoped memory tagged with failure pattern | enhancement | MP-4.1 | **done** (Brief 162) |
| MP-7.3 | Stale escalation detection — `detect_risks` surfaces escalations older than 24h with age and context | enhancement | — | **done** (Brief 162) |
| MP-7.4 | Cross-process dependency visibility — dependency chain in ProgressBlock and briefing | enhancement | — | **done** (Brief 162) |

---

## MP-8: Cycle Management → Continuous Operation → Compound Effect (P2) ✓ COMPLETE

**The meta process:** User activates a cycle → Alex operates continuously → user sees aggregate results across days/weeks → cycle health tracked → multi-cycle coordination prevents conflicts.

**What exists:**
- 4 cycle types (sales-marketing, network-connecting, relationship-nurture, gtm-pipeline)
- Cycle tools (activate, pause, resume, status, briefing)
- Heartbeat auto-restart for continuous cycles
- Sub-process executor in heartbeat
- `cycle_briefing` standardised format
- `cycle_status` pipeline view

**What's broken:**
1. ~~**Activation doesn't execute**~~ **Fixed (Brief 145, MP-1.3).** `activate_cycle` now calls `fullHeartbeat()` via `setImmediate()`.
2. **Aggregate visibility.** `cycle_status` shows current run status but not aggregate metrics across cycle iterations. "47 outreach emails this month, 12 responses, 3 meetings" — this data exists in step runs but isn't aggregated for the briefing.
3. **Multi-cycle coordination.** Three cycles running = three processes potentially contacting the same people. No deduplication of contacts across cycles. Alex could email Sarah from connecting AND selling cycles.
4. **Cycle health signals.** When response rates drop across a cycle, no proactive insight. The cycle just keeps running the same way.

**What "tight" looks like:**
- Cycle activation → immediate execution (fix from MP-1.3)
- Cycle briefing shows aggregate KPIs: emails sent, response rate, meetings booked, trend arrows
- Contact deduplication across cycles: person contacted by one cycle is excluded from others for N days
- Cycle health alerts: "Response rates dropped 15% this week on your sales cycle — want to adjust the approach?"

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-8.1 | ~~Fix activation execution~~ — **done (Brief 145, MP-1.3).** `setImmediate(() => fullHeartbeat())` added. | bug fix | MP-1.3 (same fix) |
| MP-8.2 | ~~Cycle aggregate metrics~~ ✅ Brief 163 — `computeCycleMetrics()` in `cycle_briefing`: volume, response rate, conversion + trend indicators | enhancement | — |
| MP-8.3 | ~~Cross-cycle contact deduplication~~ ✅ Brief 163 — `sendAndRecord` cross-cycle dedup (configurable cooldown, activity-logged) | enhancement | — |
| MP-8.4 | ~~Cycle health signals~~ ✅ Brief 163 — `detectHealthSignals()`: declining response rate, zero responses, stalled cycles | enhancement | MP-8.2 |

---

## MP-9: Process Definition → Editing → Evolution (P2) ✓ COMPLETE

**The meta process:** User wants to change a running process → conversational edit → process updated → existing runs unaffected → new runs use updated definition.

**What exists:**
- `adapt_process` tool (runtime overrides per run, not permanent)
- `generate_process` (creates new, doesn't edit existing)
- Process definitions stored as JSON in DB
- `definitionOverride` on processRuns for per-run adaptation

**What's broken:**
1. **No permanent edit path.** `adapt_process` is run-scoped (Brief 044, system processes only). There's no way to say "change this process permanently" through conversation.
2. **No version history.** Process definitions have a `version` field but no version history. If a permanent edit breaks things, no rollback.
3. **Editing while running.** If a process is mid-run, does an edit affect the current run? Architecture says no (new runs only), but is this enforced?

**What "tight" looks like:**
- User says "skip the follow-up step in my quoting process" → Self confirms scope (this run only or all future runs?) → applies change
- Permanent edits create a new version with the old version preserved
- Edit summary shown to user: "Updated quoting process v2 → v3: removed follow-up step"
- Running processes are unaffected; new runs use the updated definition

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-9.1 | ✅ Permanent process edit tool — `edit_process` tool updates existing process definition, increments version, stores snapshot | enhancement | — |
| MP-9.2 | ✅ Version history — `processVersions` table stores previous definitions on edit, `process_history` lists versions, `rollback_process` restores any prior version | enhancement | MP-9.1 |
| MP-9.3 | ✅ Edit scope confirmation — Self asks "just this run, or all future runs?" in all 3 guidance branches (inbound, compact, full), routes to `adapt_process` or `edit_process` | enhancement | MP-9.1 |

---

## MP-10: Proactive Suggestions → Discovery → Expansion (P3) ✓ COMPLETE

**The meta process:** System observes user patterns → identifies gaps → suggests new processes → user accepts → system expands.

**What exists:**
- `suggest_next` tool with industry patterns + user model + process maturity
- Suggestion dismiss/accept loop with 30-day expiry
- Coverage-agent (12th system agent, architecture-defined)
- SuggestionBlock with action buttons in UI
- `detect_risks` for operational signals

**What's broken:**
1. **Suggestion quality.** Does `suggest_next` check existing processes before suggesting? "You should set up invoicing" when it already exists is worse than silence.
2. **Reactive-to-repetitive detection.** Architecture describes the lifecycle where ad-hoc work becomes a process. But `create_work_item` captures one-off tasks — where is the pattern detection that says "you've created 5 similar tasks, want a process?"
3. **Coverage-agent not implemented.** Listed as system agent but may not be operational.

**What "tight" looks like:**
- Suggestions never duplicate existing processes
- After 3+ similar work items, system proposes formalising: "You've created 3 quote requests this month. Want me to set up a quoting process?"
- Coverage-agent runs periodically, identifies gaps by comparing user's processes against industry patterns
- Suggestions are insightful and specific, not generic

**Work items:**

| # | Item | Type | Depends on |
|---|------|------|-----------|
| MP-10.1 | ~~Dedup check in `suggest_next`~~ — **done (Brief 165).** `isDuplicateOfExistingProcess()` fuzzy matches via stem overlap + keyword overlap. Filters suggestions before presenting. | enhancement | — |
| MP-10.2 | ~~Reactive-to-repetitive detector~~ — **done (Brief 165).** `detectWorkItemClusters()` Jaccard similarity on tokens, threshold 3+ items. Surfaces in suggest_next as Pattern suggestions. | enhancement | — |
| MP-10.3 | ~~Coverage-agent activation~~ — **done (Brief 165).** `executeCoverageAgent` system agent (ADR-008), registered in index.ts, `coverage-analysis.yaml` process (weekly schedule, autonomous tier). | enhancement | — |

---

## Execution Order

The meta processes have natural dependencies and priority ordering:

```
                    ┌─────────────────────┐
                    │ MP-1: Goal → Process │  ← P0, foundation for everything
                    │     → First Run      │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
    ┌─────────▼──────┐  ┌─────▼──────┐  ┌──────▼─────────┐
    │ MP-2: Onboarding│  │ MP-6: Email │  │ MP-7: Exception │
    │   → First "Aha" │  │   Routing   │  │   Handling      │
    └─────────┬──────┘  └────────────┘  └──────┬─────────┘
              │                                │
    ┌─────────▼──────────────────────────────────▼──────┐
    │ MP-3: Briefing → Orient → Review                  │
    │ MP-4: Feedback → Learning Loop                    │  ← P1, daily quality
    │ MP-5: Trust Earning → Autonomy                    │
    └─────────┬────────────────────────────────────────┘
              │
    ┌─────────▼──────────────────────────────┐
    │ MP-8: Cycle Management                 │
    │ MP-9: Process Editing / Evolution      │  ← P2, power users
    │ MP-10: Proactive Suggestions           │
    └────────────────────────────────────────┘
```

**Recommended build order:**
1. ~~**MP-1.3** (activate_cycle fullHeartbeat — one-line fix, immediate impact)~~ **done** (Brief 145)
2. ~~**MP-1.1 + MP-1.2** (template matching + post-creation activation)~~ **done** (Brief 145)
3. ~~**MP-6.1 + MP-6.4** (email classification + opt-out reliability)~~ **done** (Brief 146)
4. ~~**MP-2.1 + MP-2.2** (memory bridge audit + context injection)~~ **done** (Brief 148)
5. **MP-4.1** (feedback-to-memory bridge — enables MP-4.2)
6. **MP-3.1** (autonomous digest — enables MP-5.3)
7. ~~**MP-1.4 + MP-1.5** (goal decomposition progress)~~ **done** (Brief 155)
8. ~~**MP-7.1 + MP-7.2 + MP-7.3 + MP-7.4** (exception handling quality)~~ **done** (Brief 162)
9. **Remaining MP-3, MP-5** (daily quality layer)
10. **MP-8, MP-9, MP-10** (power user features)
