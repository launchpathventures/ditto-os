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

A GitHub repository connected to Ditto automatically processes incoming issues through the full dev cycle (triage → research → design → build → review → document), produces PRs with fixes, and incorporates PR review feedback — all governed by trust tiers, harness pipeline, and feedback loops identical to manually-triggered work.

## Non-Goals

- Building a new agent framework or coding engine (the existing dev pipeline IS the engine)
- Auto-merging PRs (always human-gated, even at autonomous tier — PRs are created as drafts)
- Replacing the existing dev pipeline (the automaintainer USES it, not replaces it)
- CI/CD integration (monitoring CI failures is a future extension, not this brief)
- Multi-repo orchestration (one repo per automaintainer process instance for now)
- Real-time webhook server (polling-based trigger, matching existing Brief 036 infrastructure)

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
- MUST NOT require new engine code for the core loop — the automaintainer is composed from existing process YAML and integration tools
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

```
┌──────────────────────────────────────────────────────────────────┐
│  AUTOMAINTAINER META-PROCESS                                      │
│                                                                    │
│  ┌──────────┐    ┌──────────────┐    ┌───────────┐               │
│  │ GitHub    │───▶│ intake-      │───▶│ router    │               │
│  │ Issue     │    │ classifier   │    │           │               │
│  │ (polling) │    │ (system)     │    │ (system)  │               │
│  └──────────┘    └──────────────┘    └─────┬─────┘               │
│                                            │                      │
│                    ┌───────────────────────┼────────────┐         │
│                    ▼                       ▼            ▼         │
│            ┌──────────────┐    ┌──────────────┐  ┌──────────┐   │
│            │ Bug          │    │ Dev Pipeline  │  │ Self-    │   │
│            │ Investigation│    │ (7 roles)     │  │ Improve  │   │
│            └──────┬───────┘    └──────┬───────┘  └────┬─────┘   │
│                   ▼                   ▼               ▼          │
│            ┌──────────────────────────────────────────────┐      │
│            │ Feature Implementation                       │      │
│            │ (plan → implement → test → review → ship)    │      │
│            └──────────────────┬───────────────────────────┘      │
│                               ▼                                   │
│                    ┌─────────────────────┐                        │
│                    │ Output Delivery     │                        │
│                    │ → Draft PR on GitHub│                        │
│                    └─────────┬───────────┘                        │
│                              ▼                                    │
│                    ┌─────────────────────┐                        │
│                    │ Human Reviews PR    │                        │
│                    │ (trust-tier gated)  │                        │
│                    └─────────┬───────────┘                        │
│                              ▼                                    │
│                    ┌─────────────────────┐                        │
│                    │ Feedback Recorder   │                        │
│                    │ (PR review → memory)│                        │
│                    └─────────────────────┘                        │
└──────────────────────────────────────────────────────────────────┘
```

### Flow in Detail

1. **Trigger:** GitHub issue polling (every N minutes, configurable). `process-io.ts` calls `github.search_issues` for the target repo. New issues create work items with `triggeredBy: "trigger"` and `goalAncestry` linking to the automaintainer goal.

2. **Intake:** The existing `intake-classifier` system agent classifies the issue:
   - Bug report → type: `task`, category: `bug`
   - Feature request → type: `goal`, category: `feature`
   - Documentation gap → type: `task`, category: `docs`
   - Improvement suggestion → type: `insight`, category: `improvement`

3. **Route:** The existing `router` system agent matches to the best process:
   - `bug` → `bug-investigation` (reproduce → diagnose → propose fix → human review → implement)
   - `feature` → `dev-pipeline` (PM triage → research → design → build → review → document)
   - `docs` → `feature-implementation` (skip planning, just implement the doc change)
   - `improvement` → `self-improvement` (scan → evaluate → propose → human decides)

4. **Execute:** The matched process runs through the **full harness pipeline** — same as any manually-triggered process:
   - Memory assembly: loads agent-scoped + process-scoped memory (past corrections, codebase patterns)
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
| **Learning** | supervised | Reviews every PR | — |
| **Reliable** | spot-checked | Reviews ~20% of PRs, all low-confidence | 15 approved PRs with ≤1 review cycle |
| **Trusted** | autonomous | Exception-only — reviews low-confidence or flagged PRs | 30 approved PRs with zero human edits |

Even at `autonomous`, PRs are **always created as drafts** and require human merge action. Trust governs how many PRs need detailed review, not whether they auto-merge.

## User Experience

- **Jobs affected:** Operate (monitoring), Review (PR review), Delegate (configuring which repos to maintain)
- **Primitives involved:** Review Queue (PRs pending review), Process Graph (automaintainer as a node), Daily Brief (maintenance activity summary)
- **Process-owner perspective:** "I connected my repo. Issues come in, Ditto triages them and opens PRs. I review the PRs on GitHub like I would from any developer. Over time, I review fewer because I trust it."
- **Interaction states:** Setup (connect repo, configure), Active (issues being processed), Review (PRs pending), Idle (no new issues)
- **Designer input:** Not invoked — lightweight UX section only. The primary UX is GitHub's existing PR review interface; Ditto's UX is setup + monitoring via the existing dashboard.

## Acceptance Criteria

1. [ ] `processes/automaintainer.yaml` exists and passes process-loader validation (`pnpm cli sync`)
2. [ ] GitHub integration has `create_pr` tool that creates a draft PR via `gh pr create --draft`
3. [ ] GitHub integration has `comment_on_issue` tool that posts a comment on an issue
4. [ ] GitHub integration has `comment_on_pr` tool that posts a comment on a PR
5. [ ] GitHub integration has `get_pr_reviews` tool that fetches PR review comments
6. [ ] `process-io.ts` polling can use `github.search_issues` to create work items from new GitHub issues
7. [ ] `process-io.ts` output delivery can create a draft PR from process run outputs
8. [ ] Automaintainer process routes bug issues to `bug-investigation` process
9. [ ] Automaintainer process routes feature issues to `dev-pipeline` process
10. [ ] All process runs go through the full harness pipeline (metacognitive check, review pattern, trust gate, feedback recorder)
11. [ ] Trust tier starts at `supervised` — human must review every PR
12. [ ] PR review comments (request changes) are polled and fed back as process corrections
13. [ ] PR approvals are recorded as successful runs, improving trust score
14. [ ] PR rejections are recorded as failed runs, decreasing trust score and capturing correction patterns
15. [ ] Tests cover: process definition validation, GitHub tool execution, polling → work item creation, PR delivery, feedback loop

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
