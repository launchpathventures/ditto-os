# Brief: Universal Work Loop Activation (Parent)

**Date:** 2026-04-01
**Status:** draft
**Depends on:** Insights 132–136 (PM triage 2026-04-01)
**Unlocks:** Full end-to-end user experience — "type a goal, walk away"

## Goal

- **Roadmap phase:** Phase 12: Conversation Surface Evolution + Phase 13: Workspace Activation
- **Capabilities:** Block emission, interactive blocks, composition intent activation, orchestrator auto-wiring

## Context

PM triage session (2026-04-01) started with "conversation blocks are clunky" and pressure-tested through five insights (132–136) to a deeper set of findings:

1. **The universal work loop is confirmed** — all 24 ADRs support one loop (raise → clarify → plan → do → review → iterate → complete/reuse). Dev pipeline is not special (ADR-008, ADR-010, ADR-015).
2. **Self responds with text, not blocks** — 22 ContentBlock types exist but Self never emits them in regular conversation (Insights 130–131). 95% raw text.
3. **Composition intents are empty containers** — sidebar items show nothing actionable (Insight-134). No way to create projects, start work, or understand what to do.
4. **Forms and conversation must interleave** — not "no CRUD" but editable blocks inside conversation (Insight-135, Paperclip.ai pattern).
5. **Every intent is an entry point** — four modalities per intent: browse, create, template, converse (Insight-136).
6. **Orchestrator can't chain runs** — heartbeat loops within one run but goals don't auto-decompose → auto-route → auto-execute (Insight-132/133).

This parent brief designs the complete activation. Six sub-briefs are the build units.

## Objective

After all sub-briefs ship, the test case works end-to-end: user types "Reconcile my accounts — get invoices from Gmail and add them to Xero" from any entry point (Today, Routines, Work) → Self proposes editable ProcessProposalBlock → user edits inline → connects services → conversation for judgment parts → process created → heartbeat executes → orchestrator chains steps through trust gates.

## Non-Goals

- Self-driven composition (Phase 11+ per ADR-024 — this uses deterministic composition)
- Mobile-specific rendering
- Template marketplace / pre-built process templates
- Process discovery / APQC templates
- Sidebar label redesign (needs Designer research first — Insight-136)
- Cross-goal coordination (multiple goals competing for resources)
- Block persistence / versioning (future brief)

## Sub-Briefs and Build Order

### Phase A — Foundation (parallel, no dependencies between them)

| Brief | Name | Focus | ACs |
|-------|------|-------|-----|
| **069** | Rich Block Emission | Self tools emit ContentBlocks, not just text | 15 |
| **063** | Block Renderer Polish | Tier 2 blocks match P30 visual spec | 11 |
| **074** | Orchestrator Auto-Wiring | Goal → decompose → route → execute → chain | 15 |

### Phase B — Extension (after 069 completes)

| Brief | Name | Focus | ACs |
|-------|------|-------|-----|
| **070** | Activity Progressive Disclosure | Three-level activity traces for non-technical users | 12 |
| **072** | Interactive ContentBlocks | Editable blocks, form-conversation interleave | 14 |

### Phase C — Activation (after 072 completes)

| Brief | Name | Focus | ACs |
|-------|------|-------|-----|
| **073** | Composition Intent Activation | Empty/active states for all 6 intents, Self context | 14 |

### Dependency Graph

```
063 (renderer polish) ──────────────────────────────────┐
069 (block emission) ──→ 070 (progressive disclosure)   │
                    └──→ 072 (interactive blocks) ──→ 073 (intent activation)
074 (orchestrator)  ────────────────────────────────────┘
```

## Test Case Validation

**Primary test case:** "Reconcile my accounts — get invoices from Gmail and add them to Xero"

| Step | What happens | Which brief |
|------|-------------|-------------|
| User clicks "Routines" | Sees empty state: "No routines yet. Create a routine." | 073 |
| Clicks "Create a routine" | Conversation starts with Self in Routines context | 073 |
| Types "reconcile my accounts — invoices from Gmail to Xero" | Self recognizes recurring process need | 069 (Self emits blocks) |
| Self responds with editable ProcessProposalBlock | Shows steps, trigger, connections needed | 072 (editable block) |
| User edits: changes trigger to "weekly" | Inline field edit, no server round-trip | 072 |
| User clicks "Connect Gmail" → OAuth flow | ConnectionSetupBlock handles auth | 072 |
| Self asks "What counts as a match?" | Conversation for judgment | existing Self |
| User clicks "Create" | Process created, routine visible in Routines | 072 + 073 |
| Routine runs on schedule | Heartbeat executes process steps | existing heartbeat |
| First run pauses at review gate | Trust gate (supervised tier) | existing trust |
| User approves in Inbox | ReviewCardBlock with approve/reject | 069 + 073 |

**Secondary test case:** "Implement briefs 069, 070, and 063"

| Step | What happens | Which brief |
|------|-------------|-------------|
| User types goal in Today | Self recognizes as multi-task goal | 069 |
| Orchestrator decomposes into 3 tasks with dependencies | Auto-decomposition, dependency mapping | 074 |
| Tasks auto-route to dev-pipeline process | Router semantic matching | 074 |
| Task 1 (069) executes through dev-pipeline | fullHeartbeat loops through roles | existing |
| Task 1 pauses at Builder review gate | Trust gate (supervised) | existing |
| User approves → Task 2 (063) starts automatically | goalHeartbeatLoop detects unblocked task | 074 |
| All tasks complete → goal marked done | Orchestrator tracks completion | 074 |

## Architectural Updates Required

| Document | Update |
|----------|--------|
| ADR-021 (Surface Protocol) | Add "interactive" capability flag; expand handleSurfaceAction for form-submit |
| human-layer.md | Composition intent states (empty/active/rich); four modalities per intent |
| cognitive/self.md | Intent context awareness; block emission guidance |
| architecture.md | Universal work loop section; orchestrator auto-wiring |

## Acceptance Criteria (Parent-Level)

Verified when ALL sub-briefs pass:

1. [ ] Self emits appropriate ContentBlocks for all 13+ tools (069)
2. [ ] Tier 2 blocks match P30 visual spec (063)
3. [ ] Activity traces show three-level progressive disclosure (070)
4. [ ] ProcessProposalBlock is editable inline in conversation (072)
5. [ ] handleSurfaceAction routes block actions to engine (072)
6. [ ] All 6 composition intents have empty and active states (073)
7. [ ] Self receives intent context parameter and adjusts behavior (073)
8. [ ] orchestratorHeartbeat auto-triggers after goal decomposition (074)
9. [ ] Decomposed tasks auto-route to appropriate processes (074)
10. [ ] Primary test case works end-to-end from at least 2 different entry points
11. [ ] Secondary test case (multi-brief goal) executes with trust-gated autonomy

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review checks: Does the parent design cohere with ADR-010 (work evolution), ADR-015 (meta-processes), ADR-021 (surface protocol), ADR-024 (composable workspace)? Are sub-brief dependencies correct? Is the build order achievable?
3. Present parent design + review findings to human for approval

## Smoke Test

Parent brief smoke test runs after ALL sub-briefs are complete:

```bash
# Start the web app
pnpm --filter web dev

# Test case 1: Navigate to Routines → see empty state → create routine
# Test case 2: Type multi-task goal in Today → observe orchestrator decomposition
# Test case 3: Verify blocks render in conversation (not just text)
# Test case 4: Verify editable ProcessProposalBlock allows inline editing
```

## After Completion

1. Update `docs/state.md` — Universal Work Loop Activation complete
2. Update `docs/roadmap.md` — Phase 12 + 13 milestones
3. Phase retrospective: how well did the sub-brief chain work? What to improve in the brief-as-build-unit pattern?
4. Absorb Insights 132–136 into `docs/architecture.md` (mature enough after validation)
5. Designer research queued: sidebar labeling (Insight-136)
