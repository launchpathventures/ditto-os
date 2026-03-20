# Research: QA / Tester Role in the Dev Pipeline

**Date:** 2026-03-20
**Researcher:** Dev Researcher
**Question:** Should Agent OS have a dedicated QA / Tester command skill in its development pipeline flow?
**Status:** Complete

---

## Context

The Agent OS dev process currently has seven roles: PM, Designer, Researcher, Architect, Builder, Reviewer, Documenter. The architecture spec references a QA agent role in the product's coding team (Layer 2), but the dev process that builds Agent OS itself has no explicit QA/tester skill.

This research investigates: what do existing projects do? Is QA a distinct concern from review? What patterns exist?

---

## 1. Current State in Agent OS

### Dev Process (how Agent OS gets built)

Testing is currently distributed across two roles:

| Role | Testing responsibility |
|------|----------------------|
| **Dev Builder** | MUST run `pnpm run type-check` before handoff. Self-reviews against acceptance criteria. |
| **Dev Reviewer** | Review checklist point 11 (Execution Verification): "Has the changed code been run end-to-end, not just type-checked?" Checks acceptance criteria pass/fail. |

There is no role that:
- Writes new tests for the code being built
- Runs behavioral/integration tests beyond type-check
- Performs exploratory testing (trying to break things)
- Verifies the smoke test section of the brief

### Product Architecture (what Agent OS will orchestrate)

The architecture spec defines QA as a distinct agent role in the coding team:

```
Agent Roles (Coding Team):
| QA | gstack /qa | Process 1 (step 4), Process 4 (step 1) |
```

- **Feature Implementation** process: Step 4 is `test` (Script executor) — runs `pnpm type-check` and `pnpm test`, with `on_failure: return-to-implement` retry loop
- **Code Review** process: `bug-hunter` agent in parallel group is prompted to "think like a QA engineer trying to break things" — adversarial review pattern
- **Bug Investigation** process: Step 1 is reproduction testing

The product distinguishes between review (checking architecture/patterns/style by reading code) and QA (running tests, verifying behavior).

---

## 2. External Patterns

### Option A: QA and Review as Explicitly Separate Roles (gstack)

**Source:** github.com/garrytan/gstack — 21k stars, TypeScript, 13 specialized agent roles

gstack separates these as distinct skills with different methodologies:

**`/review` (Code Review)**
- Static analysis of git diff against base branch
- Operates as a "staff engineer"
- Checks: SQL safety, race conditions, trust boundary violations, dead code, test gaps
- Two-pass: Pass 1 critical (SQL, races), Pass 2 informational (magic numbers, dead code)
- Has "Fix-First" protocol: auto-fixes mechanical issues, asks about judgment calls
- **Never opens a browser. Never runs the app.**

**`/qa` (QA Testing)**
- Behavioral testing via persistent Chromium browser
- Operates as a "QA engineer"
- Three tiers: Quick (smoke, 30s), Standard, Exhaustive
- Workflow: analyzes diff → identifies affected routes → opens browser → navigates → clicks through flows → fills forms → takes screenshots → checks console errors
- When bugs found: fixes in source, commits atomically, re-verifies
- Produces health score (0-100) across 8 weighted categories

**`/qa-only`**
- Report-only variant: finds and documents bugs with screenshots but never fixes
- Explicitly forbidden from reading source code — tests as a user, not developer

**Key distinction:** `/review` reads code and never runs the app. `/qa` runs the app and (in qa-only mode) never reads code. Complementary — review catches structural issues, QA catches behavioral issues.

### Option B: QA as a Separate Agent Category with Retry Loop (agency-agents)

**Source:** github.com/msitarzewski/agency-agents

Separates QA and code review into different directory structures:

**`engineering/code-reviewer`** — Focuses on correctness, security, maintainability. Reviews PRs. "Reviews code like a mentor, not a gatekeeper."

**`testing/` directory** — 7 dedicated testing agents:
- **EvidenceQA** — Screenshot-obsessed. Takes Playwright screenshots, compares against spec. "Default to finding 3-5 issues" on first implementations. PASS/FAIL with visual proof.
- **Reality Checker** — Final production readiness certification. Cross-references QA findings against implementation. Defaults to "NEEDS WORK." Last line of defense.
- **Test Results Analyzer** — Evaluates test output, generates coverage reports.
- **API Tester**, **Accessibility Auditor**, **Performance Benchmarker**, **Workflow Optimizer**

**Quality gate / retry loop:** Orchestrator implements dev-QA cycle per task. Developer agent works → EvidenceQA validates with screenshots → PASS/FAIL. On FAIL, retry (max 3) loops back to dev with QA feedback. Tasks cannot advance without explicit PASS from QA.

### Option C: QA Embedded in Review (Qodo, multi-agent review tools)

**Source:** Qodo, CodeRabbit, Greptile

Multi-agent review systems that include testing concerns as dimensions of the review verdict, not a separate step:

- Separate internal agents for: dependency impact, test coverage assessment, security checking, policy enforcement
- All operate at merge-time as dimensions of a single "review" step
- Testing validation supports the review verdict rather than being standalone QA

### Option D: QA as Integrated Verify-Fix Loop (Aider, Codex)

**Source:** aider.chat, OpenAI Codex

Testing is baked into the edit cycle rather than being a distinct phase:

- **Aider**: Auto-runs linters and test suites after every code change. Feeds errors back to LLM for auto-remediation. No separate QA role — testing is part of the build loop.
- **Codex**: Runs in sandbox, executes tests to self-verify during coding. PR is the quality gate. Has been observed taking "QA tester persona" (e.g., playing a game it built to verify).

### Option E: QA as User-Definable Agent Role (CrewAI, AutoGen, LangGraph)

**Source:** CrewAI, AutoGen, LangGraph

Multi-agent frameworks provide infrastructure for QA roles but don't prescribe them:

- **CrewAI**: Supports QA_specialist agent alongside reviewer. However, practitioners report unreliability — QA agent sent work back for retries but second attempts rarely fixed issues. One developer replaced QA agent with programmatic checks wrapped around the Crew using CrewAI Flow.
- **AutoGen**: GroupChat examples include 4 roles: admin, coder, reviewer, runner. The "runner" executes code as lightweight QA. Not mandatory.
- **LangGraph**: Graph nodes can represent any step including QA. No prescribed QA role.

**Notable finding:** None of these frameworks prescribe QA as built-in. It's a user design decision.

### Option F: No Distinct QA Step (Claude Code, Cursor, Windsurf)

**Source:** Native tool behavior

- **Claude Code**: No built-in QA role or step. Skills are user extensions.
- **Cursor**: Agent can be directed to write/run tests but no structured QA workflow.
- **Windsurf**: Similar — agent capabilities for tests but no QA pipeline.

---

## 3. Patterns Observed Across Options

Projects that separate QA from review (Options A, B) draw a line between two concerns:

| Concern | Method | Example |
|---------|--------|---------|
| **Static review** | Read code, check against architecture/patterns/style | gstack `/review`, agency-agents `code-reviewer` |
| **Behavioral verification** | Run the application, execute tests, verify behavior | gstack `/qa`, agency-agents `testing/` agents |

Projects that merge them (Options C, D, F) treat testing as a dimension of the build or review loop rather than a separate step. Both approaches have working implementations. The split is a design choice, not a universal principle.

### The Bottleneck Observation

Qodo's blog on single vs multi-agent code review (qodo.ai/blog/single-agent-vs-multi-agent-code-review) reports that AI-assisted development has increased PR volume, making review/QA capacity a growing concern relative to code generation speed.

---

## 4. Current Coverage in Agent OS Dev Process

Factual mapping of which QA activities are currently assigned to a role:

| QA Activity | Assigned? | Owner & mechanism |
|-------------|-----------|-------------------|
| Type-checking | Yes | Builder runs `pnpm type-check` |
| Running existing tests | Partially | Builder's contract requires automated checks but only names type-check explicitly |
| Writing new tests | Not assigned | No role's contract includes test authoring |
| Behavioral/integration testing | Not assigned | No role runs the application |
| Exploratory testing | Not assigned | Review checklist point 11 asks "has it been run?" but no role owns execution |
| Smoke test execution | Ambiguous | Brief template has smoke test section; review checklist asks if it was run; ownership unclear between Builder and Reviewer |
| Test coverage assessment | Not assigned | No role checks test coverage |
| Visual/screenshot verification | Not applicable | CLI-only project, no web UI |
| Regression detection | Conditional | Test suite catches known regressions if tests exist for the affected area |

### How the Current Roles Handle Testing

The **Builder** runs `pnpm type-check` and self-reviews against acceptance criteria. The Builder's contract does not require running `pnpm test`, writing new tests, or performing adversarial behavioral testing.

The **Reviewer** checks the review checklist including point 11 (Execution Verification): "Has the changed code been run end-to-end?" The Reviewer checks whether the Builder ran it but does not run it independently.

Both roles touch testing concerns. Neither role's primary contract is testing.

---

## 5. Product Architecture vs Dev Process Comparison

The Agent OS product architecture defines these quality roles for the coding team:

| Product role | Product responsibility | Dev process role |
|-------------|----------------------|-----------------|
| Reviewer (convention checker, lead reviewer) | Read code, check patterns | Dev Reviewer |
| QA agent | Run tests, reproduce bugs | No dedicated equivalent |
| Bug hunter | Adversarial "think like QA" | Partially Dev Reviewer (checklist) |

The product architecture separates QA from review as distinct agent roles. The dev process currently combines testing-related concerns across Builder and Reviewer. Whether this gap matters depends on how much behavioral verification the current project needs — a question for the Architect.

---

## 6. Considerations for the Architect

The following observations are surfaced for the Architect to evaluate, not as recommendations:

**If a QA role were added**, the patterns suggest it would cover: running smoke tests, running the full test suite, writing tests for new code, and adversarial behavioral testing. gstack and agency-agents both place QA between builder output and architectural review. gstack's three QA tiers (Quick/Standard/Exhaustive) parallel Agent OS's trust tiers.

**If QA remains distributed**, the Builder's contract would need to be strengthened (explicitly require `pnpm test`, own smoke test execution) and the Reviewer's checklist point 11 would need to specify who verifies behavioral correctness.

**Project-specific factors the Architect should weigh:**
- Agent OS is currently CLI-only — browser-based QA (gstack's primary method) doesn't yet apply
- The CrewAI practitioner finding that LLM-based QA was unreliable suggests script-based testing may be more effective than an LLM "QA agent"
- The project is solo-founder with conscious role-switching — each additional role adds cognitive overhead
- The product's own architecture already defines QA as distinct from review, creating a potential dogfooding question

---

## 7. Counter-Arguments (Why NOT to add a QA role)

For completeness, reasons the dev process might not need a separate QA skill:

1. **Current project scale**: Agent OS is a solo-founder project. The Builder can run tests. Adding another role adds cognitive overhead for role-switching.
2. **The Aider pattern works**: Integrating test-running into the Builder's loop (run tests, fix, repeat) may be simpler than a separate QA step.
3. **CrewAI's lesson**: LLM-based QA agents were found unreliable in practice. Programmatic checks (scripts, test suites) may be more reliable than an LLM "trying to break things."
4. **Builder already self-reviews**: The Builder contract includes self-review against acceptance criteria. Adding QA may be redundant if the Builder is disciplined.
5. **No web UI yet**: Browser-based QA (gstack's primary QA method) doesn't apply to a CLI-only project. The highest-value QA pattern isn't available yet.
6. **Quality check layering already exists**: Automated checks → Structured review → Human judgment. Adding QA would be a 4th layer.

---

## 8. Summary of Options

| Option | Pattern | Separate QA role? | Source |
|--------|---------|-------------------|--------|
| A | QA and Review as explicitly separate skills | Yes — distinct skills, different methods | gstack |
| B | QA as separate agent category with retry loop | Yes — 7 dedicated testing agents | agency-agents |
| C | QA embedded in review as a dimension | No — multi-agent review includes testing | Qodo, CodeRabbit |
| D | QA as integrated verify-fix loop in builder | No — testing baked into edit cycle | Aider, Codex |
| E | QA as user-definable optional role | Optional — framework provides, user decides | CrewAI, AutoGen, LangGraph |
| F | No distinct QA step | No — general agent directed as needed | Claude Code, Cursor, Windsurf |

---

## Provenance

| Pattern | Source | Reference |
|---------|--------|-----------|
| QA as separate skill from review | gstack (github.com/garrytan/gstack) | `SKILL.md` files for `/qa` and `/review` skills |
| QA with screenshot evidence and retry loop | agency-agents (github.com/msitarzewski/agency-agents) | `testing/testing-evidence-collector.md`, `specialized/agents-orchestrator.md` |
| QA embedded in multi-agent review | Qodo | qodo.ai/blog/single-agent-vs-multi-agent-code-review |
| Pipeline vs agentic code review | CodeRabbit | coderabbit.ai/blog/pipeline-ai-vs-agentic-ai-for-code-reviews |
| Verify-fix loop integrated into builder | Aider (github.com/paul-gauthier/aider) | Auto-lint/test-after-edit feature documented at aider.chat |
| Self-verify during coding | OpenAI Codex | openai.com/index/introducing-codex |
| QA agent unreliability | CrewAI practitioner (Ondrej Popelka) | "CrewAI: Practical Lessons Learned" — ondrej-popelka.medium.com/crewai-practical-lessons-learned-b696baa67242 |
| QA as separate agent in coding team | Agent OS architecture.md | Agent Roles table (line ~831), Process 1 step 4 |
| Quality gate with dev↔QA retry | agency-agents | `specialized/agents-orchestrator.md` |
| Browser-based behavioral testing | gstack | `/qa` skill — Chromium via Playwright |
| AutoGen GroupChat with runner role | AutoGen (github.com/microsoft/autogen) | docs/notebooks/agentchat_groupchat |
