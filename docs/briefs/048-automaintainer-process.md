# Brief 048: Automaintainer Meta-Process

**Date:** 2026-03-28
**Status:** draft
**Depends on:** Brief 036 (Process I/O), Brief 025 (Agent Tool Use), Brief 021 (Goal-Directed Orchestrator)
**Unlocks:** Autonomous repo maintenance via Ditto's engine; flagship demo of process-as-primitive

## Goal

- **Roadmap phase:** Phase 11+ (System Agents & Process Intelligence)
- **Capabilities:** Automated repository maintenance through the full dev cycle, using Ditto's existing engine rules (trust, harness, review, feedback, learning)

## Context

Research at `docs/research/automaintainer-repos.md` surveyed 6 external automaintainer options and found that **none** implements trust-gated, process-aware, learning-enabled repo maintenance. Every existing tool (gh-aw, SWE-agent, Copilot Agent) is either single-shot (issue → fix, no loop) or lacks governance (no trust tiers, no maker-checker, no feedback loop).

The user's insight (Insight-106): **the automaintainer is not a new product — it is a process definition.** Ditto already has the full dev pipeline (`processes/dev-pipeline.yaml`), bug investigation (`processes/bug-investigation.yaml`), feature implementation (`processes/feature-implementation.yaml`), code review (`processes/code-review.yaml`), and self-improvement (`processes/self-improvement.yaml`). All run through the harness with trust tiers, metacognitive checks, maker-checker review, and feedback recording.

The missing piece is **I/O wiring**: GitHub issues in, PRs out, PR review feedback back in. The engine already does the hard part.

## Objective

One or more GitHub repositories connected to Ditto, each designated as a target for automated maintenance. Issues are raised and PRs reviewed through Ditto's existing UI (ContentBlocks, review queue, conversation) — GitHub is the backbone storage and execution target, Ditto is the interface. Each repo gets its own automaintainer process instance with independent trust tiers. Issues flow through the full dev cycle (triage → research → design → build → review → document), producing PRs with fixes, incorporating review feedback — all governed by the same engine rules as manually-triggered work. Ditto can maintain its own repo (self-maintaining), third-party repos, or any combination.

## Non-Goals

- Building a new agent framework or coding engine (the existing dev pipeline IS the engine)
- Auto-merging PRs (always human-gated, even at autonomous tier — PRs are created as drafts)
- Replacing the existing dev pipeline (the automaintainer USES it, not replaces it)
- CI/CD integration (monitoring CI failures is a future extension, not this brief)
- Real-time webhook server (polling-based trigger, matching existing Brief 036 infrastructure)
- Building a separate GitHub UI (Ditto's existing ContentBlocks and review queue ARE the UI)

## Inputs

1. `docs/research/automaintainer-repos.md` — landscape of existing tools, gaps identified
2. `processes/dev-pipeline.yaml` — the 7-role dev pipeline this wraps
3. `processes/bug-investigation.yaml` — bug diagnosis flow this routes to
4. `processes/feature-implementation.yaml` — implementation flow this routes to
5. `processes/code-review.yaml` — multi-agent review pipeline
6. `processes/self-improvement.yaml` — scan → propose → approve improvement loop
7. `src/engine/process-io.ts` — existing polling trigger + output delivery infrastructure
8. `integrations/github.yaml` — existing GitHub CLI tools (4 tools)
9. `docs/architecture.md` — six-layer spec, meta-process architecture, system agent model
10. `docs/adrs/008-system-agents-and-process-templates.md` — system agent categories

## Constraints

- MUST use the existing harness pipeline (memory-assembly → step-execution → metacognitive-check → review-pattern → routing → trust-gate → feedback-recorder) — no harness bypass
- MUST use the existing trust tier system — starts supervised, earns trust through the standard upgrade path
- MUST use the existing dev role contracts (`.claude/commands/dev-*.md`) — the same roles that build Ditto maintain target repos
- MUST use the existing process I/O infrastructure (Brief 036) for triggers and output delivery — no new trigger mechanism
- MUST NOT auto-merge PRs — even at autonomous trust tier, PRs are created as drafts for human review
- MUST NOT require new engine subsystems — only extensions to existing process-io polling, output delivery, and integration tools. The automaintainer is composed from existing infrastructure, not a parallel system
- New GitHub tools (PR creation, comment posting) follow the existing integration registry pattern (`integrations/github.yaml`)
- Security: GitHub token scoped to minimum required permissions (issues:read, pull_requests:write, contents:write for the target repo only)

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Polling trigger → work item | Brief 036 (`process-io.ts`) | depend | Already built, production-tested |
| Output delivery → GitHub PR | Brief 036 (`deliverOutput`) | depend | Already built, extends with new delivery target |
| GitHub CLI tools | Brief 025 (`integrations/github.yaml`) | depend | Already built, 4 tools exist |
| Dev pipeline process | `processes/dev-pipeline.yaml` | depend | Already built, 7 roles, conditional routing |
| Bug investigation process | `processes/bug-investigation.yaml` | depend | Already built, diagnosis → fix flow |
| Issue → classify → route pattern | ADR-008 (intake-classifier + router) | depend | Already built, system agents operational |
| Continuous AI categories | GitHub Agentic Workflows (gh-aw) | pattern | Categories (triage, docs, test, CI) inform which issues map to which processes |
| Issue → PR pipeline | SWE-agent / Copilot Agent | pattern | The I/O pattern (issue in, PR out) — Ditto adds governance |
| Trust-gated maintenance | Original to Ditto | original | No existing tool gates maintenance through earned trust |
| Feedback-to-learning loop | Original to Ditto | original | No existing tool feeds PR corrections back into process memory |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `processes/automaintainer.yaml` | **Create:** The automaintainer meta-process definition — connects GitHub I/O to existing dev processes via orchestrator |
| `integrations/github.yaml` | **Modify:** Add 4 new tools: `create_pr`, `comment_on_issue`, `comment_on_pr`, `get_pr_reviews` |
| `src/engine/process-io.ts` | **Modify:** Add GitHub issue polling source type — maps polled issues to work items with goal ancestry |
| `src/engine/process-io.ts` | **Modify:** Add GitHub PR output delivery type — creates draft PR from step outputs |
| `src/engine/integration-handlers/cli.ts` | **Modify (if needed):** Ensure `gh pr create` command template works with multiline body |
| `tests/automaintainer.test.ts` | **Create:** Tests for the automaintainer process definition, GitHub polling, PR delivery |

## Architecture: How the Loop Works

### Reviewer P1 Resolution: Intake/Router Are Process Steps, Not System Pipeline

The existing `process-io.ts` polling creates work items pre-routed to the polling process (by design — the trigger declares which process it belongs to). The automaintainer process IS the polling target. Classification and routing happen as **steps within `automaintainer.yaml`**, using the intake-classifier and router as invoked agents — not the system-level intake pipeline. This keeps the "no new engine subsystems" constraint intact.

### Reviewer P1 Resolution: Sub-Process Invocation via Orchestrator

The automaintainer uses the existing orchestrator pattern (Brief 021): when the classify/route step produces a typed work item (e.g., "bug in repo X"), the orchestrator decomposes it into a child work item and calls `startProcessRun()` on the matched process. This is already how goal-directed orchestration works — the orchestrator heartbeat iterates spawned tasks. No new primitive needed.

```
┌──────────────────────────────────────────────────────────────────────┐
│  AUTOMAINTAINER PROCESS INSTANCE (per repo)                           │
│                                                                        │
│  ┌────────────────────────────────────┐                               │
│  │ INPUT: Two sources                  │                               │
│  │  1. GitHub polling (new issues)     │                               │
│  │  2. Ditto conversation/capture      │                               │
│  │     ("fix the auth bug in repo X")  │                               │
│  └──────────────┬─────────────────────┘                               │
│                 ▼                                                       │
│  ┌──────────────────────────┐                                         │
│  │ Step 1: CLASSIFY         │  (intake-classifier as process step)    │
│  │ Bug / Feature / Docs /   │                                         │
│  │ Improvement              │                                         │
│  └────────────┬─────────────┘                                         │
│               ▼                                                        │
│  ┌──────────────────────────┐                                         │
│  │ Step 2: ROUTE + SPAWN    │  (router + orchestrator as steps)       │
│  │ → startProcessRun() on   │                                         │
│  │   matched process         │                                         │
│  └────────────┬─────────────┘                                         │
│               │                                                        │
│    ┌──────────┼──────────┬────────────┐                               │
│    ▼          ▼          ▼            ▼                                │
│  ┌──────┐ ┌────────┐ ┌────────┐ ┌──────────┐                        │
│  │ Bug  │ │ Dev    │ │Feature │ │ Self-    │  ← EXISTING processes   │
│  │ Inv. │ │Pipeline│ │ Impl.  │ │ Improve  │  ← full harness on each│
│  └──┬───┘ └───┬────┘ └───┬────┘ └────┬─────┘                        │
│     └──────────┴──────────┴───────────┘                               │
│                      ▼                                                 │
│  ┌──────────────────────────────────┐                                 │
│  │ Step 3: DELIVER                   │                                 │
│  │ → Draft PR on GitHub             │                                 │
│  │ → PR rendered in Ditto review    │                                 │
│  │   queue as ReviewItem block      │                                 │
│  └──────────────┬───────────────────┘                                 │
│                 ▼                                                       │
│  ┌──────────────────────────────────┐                                 │
│  │ Step 4: REVIEW (trust-gated)     │                                 │
│  │ Human reviews in Ditto UI:       │                                 │
│  │  • Approve → gh pr merge         │                                 │
│  │  • Edit → feedback → re-execute  │                                 │
│  │  • Reject → close PR, learn      │                                 │
│  │ OR reviews on GitHub directly    │                                 │
│  │  (status polled back to Ditto)   │                                 │
│  └──────────────┬───────────────────┘                                 │
│                 ▼                                                       │
│  ┌──────────────────────────────────┐                                 │
│  │ Step 5: FEEDBACK                  │                                 │
│  │ → Trust score updated            │                                 │
│  │ → Correction patterns → memory   │                                 │
│  │ → GitHub issue closed/commented  │                                 │
│  └──────────────────────────────────┘                                 │
└──────────────────────────────────────────────────────────────────────┘

  × N repos = N process instances, independent trust, independent memory
```

### Flow in Detail

1. **Trigger (two sources):**
   - **GitHub polling:** `process-io.ts` polls `github.search_issues` for the target repo (every N minutes, configurable). New issues create work items with `triggeredBy: "trigger"` and `goalAncestry` linking to the automaintainer goal.
   - **Ditto conversation:** User tells the Self "fix the login bug in ditto-os" → Self invokes `create_work_item` tool with the repo context → work item enters the automaintainer process.

2. **Classify (step within automaintainer.yaml):** The intake-classifier runs as a process step (not the system-level pipeline — addresses reviewer Flag 1). Uses the same classification logic but invoked as an `ai-agent` step:
   - Bug report → type: `task`, category: `bug`
   - Feature request → type: `goal`, category: `feature`
   - Documentation gap → type: `task`, category: `docs`
   - Improvement suggestion → type: `insight`, category: `improvement`

3. **Route + Spawn (step within automaintainer.yaml):** The router runs as a process step. On match, calls `startProcessRun()` (existing Brief 021 orchestrator API) to spawn the matched process as a child run:
   - `bug` → `bug-investigation` (reproduce → diagnose → propose fix → human review → implement)
   - `feature` → `dev-pipeline` (PM triage → research → design → build → review → document)
   - `docs` → `feature-implementation` (skip planning, just implement the doc change)
   - `improvement` → `self-improvement` (scan → evaluate → propose → human decides)

4. **Execute:** The spawned process runs through the **full harness pipeline** — identical to manually-triggered work:
   - Memory assembly: loads agent-scoped + process-scoped memory (past corrections, codebase patterns for THIS repo)
   - Step execution: each dev role runs via Claude API adapter with role contracts
   - Metacognitive check: post-execution self-review on supervised/critical steps
   - Review pattern: maker-checker (reviewer checks builder's work)
   - Trust gate: supervised → every output reviewed; spot-checked → ~20% sampled; autonomous → exception-only
   - Feedback recorder: captures human corrections for learning

5. **Output:** When the process produces code changes, the output delivery step creates a **draft PR** on GitHub via `gh pr create --draft`. The PR body includes:
   - Link to the originating issue
   - Summary of the diagnosis/approach (from the process run)
   - Trust tier and confidence level
   - What the harness reviewed (metacognitive check result, reviewer verdict)

6. **Feedback Loop:** When the human reviews the PR on GitHub:
   - **Approve + merge:** Recorded as successful run. Trust score improves.
   - **Request changes:** PR review comments are polled back, injected as feedback into the process run, builder re-executes with correction context (existing retry_on_failure mechanism).
   - **Close without merge:** Recorded as rejection. Trust score decreases. Correction pattern captured in process-scoped memory.

### Trust Progression

The automaintainer process starts at `supervised` tier — human reviews every PR. As it demonstrates consistent quality:

| Stage | Trust Tier | Human Involvement | Earns After |
|-------|-----------|-------------------|-------------|
| **Learning** | supervised | Reviews every PR in Ditto review queue | — |
| **Reliable** | spot-checked | Reviews ~20% of PRs, all low-confidence flagged | Per ADR-007 conjunctive upgrade criteria |
| **Trusted** | autonomous | Exception-only — low-confidence or flagged PRs | Per ADR-007 conjunctive upgrade criteria |

Trust progression follows **ADR-007 exactly** — sliding window (20 runs), conjunctive upgrades, disjunctive downgrades, grace period. No custom thresholds. Per-repo trust means repo A can be at `spot-checked` while repo B is still `supervised`.

Even at `autonomous`, PRs are **always created as drafts** and require human merge action. Trust governs how many PRs need detailed review, not whether they auto-merge. The human approves/rejects in Ditto's review queue (existing approve/edit/reject actions from Brief 027) or on GitHub directly (status polled back).

## User Experience

- **Jobs affected:** Operate (monitoring), Review (PR/issue review), Delegate (designating repos), Capture (raising issues through Ditto), Define (configuring per-repo maintenance scope)
- **Primitives involved:** Review Queue (PRs pending review via existing ReviewItem ContentBlock), Process Graph (automaintainer instances as nodes, one per repo), Daily Brief (maintenance activity across all repos), Work Feed (issue → PR lifecycle rendered as ContentBlocks)
- **Process-owner perspective:** "I designate my repos in Ditto. I raise issues through Ditto's conversation ('fix the login bug in repo X') or they come in from GitHub. Ditto triages, runs the full dev cycle, and surfaces PRs for my review — right here in my review queue, using the same approve/edit/reject flow I use for everything else. I can also review on GitHub directly. Over time, I review fewer because Ditto has earned my trust."

### GitHub as Backbone, Ditto as Interface

GitHub is the backbone: repos, issues, branches, PRs, code. But **Ditto is the primary interface** for the maintenance workflow:

| Action | In Ditto | On GitHub |
|--------|----------|-----------|
| **Raise an issue** | Conversation with Self ("fix the auth bug in ditto-os") → Self creates GitHub issue via `create_issue` tool | Also possible directly on GitHub — polled into Ditto |
| **View issue status** | Work Feed shows issue → process run → step progress as ContentBlocks | GitHub issue gets status comments from Ditto |
| **Review a PR** | Review Queue renders PR diff, harness annotations, confidence level via existing ReviewItem block. Approve/Edit/Reject actions. | Also possible on GitHub — PR review status polled back |
| **Approve/merge** | Approve in Ditto triggers `gh pr merge` (if trust tier allows) | Also possible on GitHub — merge status polled back |
| **See maintenance health** | Daily Brief summarizes activity across all maintained repos | N/A — Ditto-only view |
| **Designate a repo** | Settings or conversation ("maintain launchpathventures/ditto-os") → connects integration, starts polling | N/A — Ditto-only action |

### Multi-Repo Model

Each designated repo gets its own automaintainer process **instance** — same process YAML, parameterized by `repo`. This means:
- Independent trust tiers per repo (ditto-os may be at `spot-checked` while a new repo starts `supervised`)
- Independent process-scoped memory per repo (correction patterns learned for one repo don't bleed into another)
- Independent polling cycles per repo
- A single Ditto workspace can maintain N repos simultaneously
- The Daily Brief aggregates maintenance activity across all repos

### Self-Maintaining (Ditto maintains Ditto)

Ditto maintaining its own repo is the canonical use case — the harness maintains itself. This is the ultimate dogfooding: issues raised against ditto-os flow through the same dev pipeline that built ditto-os. Trust is earned the same way. The same roles (PM, researcher, architect, builder, reviewer, documenter) that a human invokes via `/dev-*` commands are invoked automatically by the automaintainer.

- **Interaction states:** Setup (designate repo, configure scope), Active (issues being processed), Review (PRs in review queue), Idle (no new issues), Multi-repo dashboard (health across all repos)
- **Designer input:** Not invoked — lightweight UX section only. The primary UX uses existing ContentBlocks (Brief 045) and review actions (Brief 027). No new UI primitives needed — issues and PRs render through the existing block registry.

## Acceptance Criteria

1. [ ] `processes/automaintainer.yaml` exists with `repo` input parameter and passes process-loader validation (`pnpm cli sync`)
2. [ ] Automaintainer can be instantiated per-repo — multiple instances with independent trust tiers and process-scoped memory
3. [ ] GitHub integration has `create_pr` tool that creates a draft PR via `gh pr create --draft`
4. [ ] GitHub integration has `comment_on_issue` tool that posts a comment on an issue
5. [ ] GitHub integration has `comment_on_pr` tool that posts a comment on a PR
6. [ ] GitHub integration has `get_pr_reviews` tool that fetches PR review comments
7. [ ] `process-io.ts` polling can use `github.search_issues` to create work items from new GitHub issues for a specific repo
8. [ ] `process-io.ts` output delivery can create a draft PR from process run outputs
9. [ ] Classify step (within automaintainer.yaml) correctly categorizes issues as bug/feature/docs/improvement
10. [ ] Route step spawns the correct sub-process via `startProcessRun()` (bug → bug-investigation, feature → dev-pipeline)
11. [ ] All spawned process runs go through the full harness pipeline (metacognitive check, review pattern, trust gate, feedback recorder)
12. [ ] Trust tier starts at `supervised` per ADR-007 — human reviews every PR in Ditto review queue
13. [ ] PRs render in Ditto's review queue as ReviewItem ContentBlocks with approve/edit/reject actions
14. [ ] Issues can be raised through Ditto conversation (Self → `create_work_item` → automaintainer) as well as GitHub polling
15. [ ] PR review feedback (from Ditto or GitHub) is recorded — approvals improve trust, rejections capture correction patterns
16. [ ] Tests cover: process definition validation, per-repo instantiation, GitHub tool execution, polling → work item creation, PR delivery, review queue rendering

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Process definition follows Layer 1 spec (triggers, inputs, steps, outputs, quality criteria, feedback, trust)
   - All harness pipeline handlers are engaged (no bypass)
   - Trust tier configuration matches ADR-007
   - GitHub tools follow integration registry pattern (ADR-005)
   - Security: token scope, credential handling via vault (Brief 035)
   - No new engine subsystems introduced (composition from existing)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# 1. Sync the automaintainer process
pnpm cli sync

# 2. Verify process loaded
pnpm cli status
# Expect: automaintainer process listed as active

# 3. Create a test issue on GitHub
gh issue create --repo owner/target-repo --title "Test: fix typo in README" --body "Line 42 has a typo"

# 4. Start polling trigger
pnpm cli trigger start --process automaintainer --repo owner/target-repo

# 5. Wait for polling cycle, then check status
pnpm cli status
# Expect: work item created from the issue, routed to appropriate process

# 6. Run heartbeat to execute
pnpm cli heartbeat

# 7. Check that process ran through harness
pnpm cli status --json
# Expect: step runs show memory-assembly, step-execution, metacognitive-check, trust-gate

# 8. Check that draft PR was created
gh pr list --repo owner/target-repo --state open
# Expect: draft PR linked to the issue

# 9. Review and approve the PR (human step)
pnpm cli review
pnpm cli approve
# Expect: trust score updated, feedback recorded
```

## After Completion

1. Update `docs/state.md` with automaintainer process status
2. Update `docs/roadmap.md` — automaintainer capability delivered
3. Add entry to `docs/landscape.md` for gh-aw and SWE-agent (reference points)
4. Phase retrospective: does the existing engine genuinely handle this without new subsystems?
5. Consider: ADR for automaintainer-specific security constraints (GitHub token scope, target repo isolation)
