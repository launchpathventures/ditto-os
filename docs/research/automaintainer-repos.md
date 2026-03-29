# Research: Automaintainer Repos — AI Loops for Autonomous Repository Maintenance

**Date:** 2026-03-28
**Question:** What are the best open-source repos that use AI loops to build and maintain projects based on feedback/issues — and how could Ditto integrate with or learn from them?
**Status:** Active
**Consumed by:** Pending — Dev Architect evaluation

---

## Context

The user wants to find repos that act as "automaintainers" — AI agents that continuously maintain codebases by processing issues, generating fixes, opening PRs, and incorporating feedback in a loop. This is relevant to Ditto because Ditto orchestrates processes and could serve as the harness for such maintenance loops, or could adopt patterns from them.

---

## Options Found

### Option 1: GitHub Agentic Workflows (`gh-aw`)

**Repo:** [github/gh-aw](https://github.com/github/gh-aw) — 4,178 stars | Go | MIT License | Active March 2026
**Sample workflows:** [githubnext/agentics](https://github.com/githubnext/agentics)
**Docs:** [github.github.com/gh-aw](https://github.github.com/gh-aw/)

**What it does:** Lets you define autonomous repository maintenance tasks in plain Markdown files (placed in `.github/workflows/`). A CLI (`gh aw compile`) converts these into hardened GitHub Actions workflows that run coding agents (Copilot CLI, Claude Code, OpenAI Codex) in containerized environments on a schedule or on events.

**How the loop works:**
- Trigger: cron schedule, issue creation, PR event, or manual dispatch
- Agent reads repo context, understands the task described in natural language
- Agent performs work (triage, fix, document, test) using its coding capabilities
- Output is a safe-output (issue comment, label, PR) — never auto-merged
- Human reviews and approves; agent can iterate on PR review comments

**Key patterns:**
- Markdown-as-workflow definition (YAML frontmatter + natural language body)
- Defense-in-depth security: sandboxed execution, network isolation, tool allow-listing, SHA-pinned dependencies, compile-time validation
- Read-only by default; writes only through sanitized safe-outputs
- Agent-agnostic: supports multiple coding agent backends (Copilot, Claude Code, Codex)
- MCP Gateway for isolated tool server containers
- Continuous AI categories: triage, docs, test improvement, CI hygiene, reporting, code simplification

**Sample workflows (from githubnext/agentics):**
- **Issue Triage** — auto-label and route issues
- **Repo Assist** — all-purpose backlog burner: triages, investigates, replies, fixes bugs, proposes improvements, maintains summaries
- **CI Doctor** — monitors CI and investigates failures
- **PR Fix** — auto-fixes failing CI on PRs
- **Daily Documentation Updater** — keeps docs aligned with code
- **Dependabot PR Bundler** — groups dependency PRs
- **AI Moderator** — detects spam and AI-generated content

**Pros:**
- First-party GitHub integration — runs natively in Actions
- Battle-tested security architecture (GitHub + Microsoft Research + Azure)
- Agent-agnostic (not locked to one LLM provider)
- Declarative Markdown format is simple and versioned
- Open source (MIT), actively developed, 4.1k stars
- Real-world validation (Home Assistant uses it for 1000s of issues)

**Cons:**
- Tied to GitHub Actions as execution substrate
- Technical preview — API surface may change
- No built-in trust tiers or governance model
- No process memory or learning across runs
- Cost: Actions compute + LLM tokens (~$20-50/month for typical repo)

---

### Option 2: SWE-agent (Princeton/Stanford)

**Repo:** [SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent) — 18,868 stars | Python | NeurIPS 2024
**Mini version:** [SWE-agent/mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) — 3,555 stars (100 lines, >74% SWE-bench)

**What it does:** Takes a GitHub issue and tries to automatically fix it using an LM of choice. State-of-the-art on SWE-bench among open-source projects. Also used for cybersecurity and competitive coding challenges.

**How the loop works:**
- Input: a GitHub issue URL
- Agent clones the repo, explores the codebase, identifies the problem
- Agent edits files to produce a fix
- Output: a patch/diff (can be submitted as PR)
- No built-in continuous loop — each run is a single issue→fix cycle

**Key patterns:**
- Agent-Computer Interface (ACI) — custom shell environment for LLM interaction with codebases
- Model-agnostic (GPT-4o, Claude Sonnet, open-weight models)
- Configurable via YAML agent definitions
- Benchmarked rigorously on SWE-bench

**Pros:**
- Highest benchmark scores among open-source (SWE-bench SOTA)
- Academic backing (Princeton/Stanford), peer-reviewed (NeurIPS 2024)
- Model-agnostic
- Well-documented, active community
- Mini version proves the concept in 100 lines

**Cons:**
- Single-shot issue→fix, not a continuous maintenance loop
- No built-in scheduling, monitoring, or feedback incorporation
- Python only
- No governance, trust, or review patterns built in
- Requires external orchestration to create a maintenance loop

---

### Option 3: OpenGitClaw (OmegaCore Labs)

**Repo:** [OmegaCore-Labs/open-gitclaw](https://github.com/OmegaCore-Labs/open-gitclaw) — 2 stars | Python | Created 2026-03-20

**What it does:** Autonomous GitHub repo maintenance agent using function-level dependency graphs and isolated Docker sandboxes for validation.

**How the loop works:**
- Webhook events trigger the agent via a persistent Redis bus
- LLM-based planner coordinates tasks
- Function-level dependency graph (not just diffs) provides deep codebase context
- Docker sandbox validates changes before committing
- Predictive ML scoring prioritizes high-risk changes
- Daily self-maintenance: incremental indexing, security scans, TTL-based memory cleanup
- Auto-rollback capability (graph-aware)

**Key patterns:**
- Function-level dependency graphs for safer automated changes
- Predictive ML risk scoring for change prioritization
- Isolated Docker sandbox validation
- Redis-based event bus for webhook handling
- Enterprise observability (Prometheus, tracing)
- Daily self-maintenance routines

**Pros:**
- Specifically designed for continuous autonomous repo maintenance
- Function-level understanding (deeper than diff-based approaches)
- Risk-aware change prioritization
- Self-maintenance routines (indexing, security, cleanup)
- Auto-rollback capability

**Cons:**
- Extremely new (created March 20, 2026 — 8 days old)
- Only 2 stars — unproven, no community validation
- Infrastructure-heavy (Redis, Docker, Prometheus)
- Python only
- No trust tiers or human governance model
- Could be vaporware or a blog post + skeleton repo

---

### Option 4: OpenClaw (with GitHub skills)

**Repo:** [openclaw/openclaw](https://github.com/openclaw/openclaw) — 339,346 stars | TypeScript | Active March 2026

**What it does:** General-purpose autonomous AI assistant. Not specifically a repo maintainer, but has a skills ecosystem (5,400+ skills) that includes GitHub automation skills for issue triage, PR review, and repo maintenance.

**How the loop works:**
- OpenClaw runs as a persistent agent (local or cloud)
- GitHub skills connect it to repositories via webhooks
- Can monitor issues, review PRs, suggest fixes
- Extensible — can write its own new skills
- Known issue: endless looping when reacting to its own comments (requires self-event filtering)

**Key patterns:**
- Skills-as-capabilities (self-extending skill system)
- Multi-platform (any OS, any messaging interface)
- Local-first with optional cloud
- Extensible via community skills registry

**Pros:**
- Massive community (339k stars, 66k forks)
- TypeScript — same ecosystem as Ditto
- Self-extending (writes its own skills)
- Skills marketplace/registry (5,400+ skills)
- Can be self-hosted with local models (Ollama)

**Cons:**
- General-purpose assistant, not repo-maintenance-specific
- Security concerns flagged (Cisco found data exfiltration in third-party skills)
- Prone to prompt injection
- The GitHub maintenance capability is via community skills, not core functionality
- Very broad scope — not focused on the automaintainer problem

---

### Option 5: GitHub Copilot Coding Agent (+ Jira integration)

**Not open source** — GitHub proprietary, available via Copilot paid plans

**What it does:** Assign a GitHub issue or Jira ticket to Copilot. It analyzes the description, implements changes autonomously in a secure GitHub Actions environment, and opens a draft PR.

**How the loop works:**
- Assign issue/ticket to @copilot
- Agent reads title, description, labels, comments for context
- Agent works in sandboxed Actions environment
- Opens draft PR, requests human review
- Responds to PR review comments to iterate
- Can access Confluence via MCP for design docs/specs
- Automatically links PRs to Jira issues, updates ticket status

**Key patterns:**
- Issue-to-PR pipeline with human review gate
- Jira integration (cross-tool workflow)
- Model selection per task
- Feedback loop via PR comments
- Status sync between PM tool and repo

**Pros:**
- Deeply integrated with GitHub (first-party)
- Jira integration closes the planning→code→review loop
- Iterates on PR review feedback
- 15M+ Copilot users — massive adoption
- Starts work 50% faster (March 2026 optimization)

**Cons:**
- Proprietary — not open source
- Requires paid Copilot plan
- No customizable governance or trust tiers
- Single-agent, not multi-agent or process-aware
- No process memory or cross-run learning

---

### Option 6: Sweep AI

**Repo:** [sweepai/sweep](https://github.com/sweepai/sweep) — 7,690 stars | Python

**What it does:** Originally an AI junior developer that takes GitHub issues and creates PRs. Has since pivoted to a JetBrains coding assistant plugin.

**How the loop works (original):**
- Monitors GitHub issues
- Parses issue descriptions to understand the task
- Plans and implements changes across files
- Opens PR with the fix
- Iterates on review feedback

**Key patterns:**
- Issue→PR pipeline
- Multi-file change planning
- Review feedback iteration

**Pros:**
- Early mover in the issue→PR space
- Open source
- Good documentation of the approach

**Cons:**
- Pivoted away from GitHub automation to JetBrains plugin
- Original repo appears less actively maintained for the automaintainer use case
- Python only

---

## Gaps & Observations

### No Single "Best Automaintainer" Exists

There is no single repo that fully implements the vision of an AI-powered automaintainer with:
1. Continuous issue monitoring and triage
2. Autonomous fix generation with quality validation
3. Trust-gated review and approval
4. Feedback incorporation and learning across runs
5. Process-aware execution (not just ad-hoc fixes)

The closest is **GitHub Agentic Workflows** for the orchestration layer, combined with **SWE-agent** for the actual issue-fixing intelligence.

### What's Missing (Original to Ditto)

1. **Trust tiers on maintenance actions** — no existing solution gates maintenance actions through earned trust levels. All use binary human-review or no-review.
2. **Process memory across maintenance runs** — no solution learns from previous fixes to improve future ones within a structured process model.
3. **Governance and maker-checker** — no solution implements adversarial review patterns where one agent validates another's fix.
4. **Feedback-to-learning loop** — human corrections on maintenance PRs don't systematically improve future maintenance behavior.
5. **Process-as-primitive for maintenance** — maintenance is treated as ad-hoc agent tasks, not as defined, trust-earning processes.

### Ditto Relevance

The automaintainer pattern maps directly to Ditto's architecture:
- **Ditto processes** could define maintenance workflows (issue triage, dependency update, test improvement)
- **Trust tiers** would gate whether fixes are auto-merged, spot-checked, or fully supervised
- **Harness pipeline** would run metacognitive checks on generated fixes
- **Feedback recorder** would capture human corrections and improve future runs
- **Goal ancestry** would connect individual fixes to broader maintenance goals

The question for the Architect: should Ditto **integrate with** an existing automaintainer (e.g., gh-aw as execution substrate) or **become** the automaintainer harness that wraps tools like SWE-agent?

---

## Landscape Impact

No existing evaluations in `docs/landscape.md` need updating based on this research. The repos found are in a different category (repo maintenance automation) than the existing landscape entries (agent orchestration frameworks). If the Architect decides to adopt patterns from gh-aw or SWE-agent, new landscape entries should be added.

---

## Summary Table

| Option | Stars | Language | Loop Type | Trust/Gov | Learning | Ditto Fit |
|--------|-------|----------|-----------|-----------|----------|-----------|
| **gh-aw** | 4.1k | Go | Continuous (cron/event) | Read-only default, human review | None | HIGH — orchestration pattern |
| **SWE-agent** | 18.9k | Python | Single-shot | None | None | MEDIUM — fix intelligence |
| **OpenGitClaw** | 2 | Python | Continuous (webhook) | Docker sandbox | Daily indexing | LOW — unproven |
| **OpenClaw** | 339k | TypeScript | Via skills | None (security concerns) | Self-extending skills | LOW — too broad |
| **Copilot Agent** | N/A | Proprietary | Issue-assigned | Human review | PR comment iteration | MEDIUM — pattern reference |
| **Sweep** | 7.7k | Python | Issue-triggered | Human review | None | LOW — pivoted away |

Reference docs checked: `docs/landscape.md` — no drift found. No prior research on this topic exists.
