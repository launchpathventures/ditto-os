# ADR-027: Cognitive Orchestration — Thin Processes, Smart Self

**Status:** accepted
**Date:** 2026-04-11
**Deciders:** Human (product owner)
**Context:** Insight 172, Brief 127 review (2 FAILs on quality gate + spec compliance)

## Context

We built cognitive modes (connecting, selling, ghost, chief-of-staff) that encode HOW Alex thinks — judgment frameworks, silence conditions, refusal patterns. We also wrote process templates as fixed step sequences: gather → research → draft → quality gate → send → report. The modes give Alex a brain; the templates give him a script.

The architecture says: "The process is not a workflow — it is a governance declaration" and "process declares structure, agent brings judgment, harness evaluates outcomes." But in practice, processes over-declare structure (fixed step ordering) and under-leverage agent judgment (agents execute one narrow task per step).

## Decision

**Amend the process-agent contract:**

| Before | After |
|--------|-------|
| Process declares what happens and in what order | Process declares capabilities, constraints, and gates |
| Agent decides how within a single step | Agent decides what, when, and how across the step's capability set |
| Quality gate runs once per step (post-execution handler) | Quality gate runs per outbound action (staged tool pattern) |
| Fixed step sequences in YAML | Fewer, broader steps with richer tool access |

### Core Mechanisms

**1. Staged Outbound Tools.** Tool calls that produce outbound actions (emails, messages) don't dispatch immediately during step execution. They queue drafts. After step execution, the quality gate handler processes the queue, approving or rejecting each draft. Only approved drafts dispatch. This preserves per-action quality gating even within a single broad step.

**2. Thin Process Templates.** Process templates declare: (a) what tools the agent can use, (b) what gates are non-negotiable, (c) what trust tier applies, (d) what success looks like. The step sequence is shorter (2-3 steps instead of 6-8), and each step is broader — the agent exercises cognitive mode judgment within the step.

**3. Self as Cognitive Orchestrator.** The Self decides which process to spawn and can adapt it mid-flight via `adapt_process` (ADR-020). The Self's cognitive mode (connecting, selling, etc.) guides orchestration strategy. New requests trigger the Self to compose appropriate work, not fire fixed templates.

### What Changes

- Process templates become thinner (fewer steps, each broader)
- Outbound tool execution becomes staged (draft → gate → dispatch)
- The Self gains an `orchestrate_work` tool for adaptive process management
- Cognitive modes gain "orchestration" guidance sections

### What Does NOT Change

- The harness pipeline (11 handlers, same order)
- Trust tier enforcement (per-process, per-step)
- Opt-out enforcement (permanent, non-bypassable)
- Feedback recording (every decision captured)
- The heartbeat step-by-step execution model
- ProcessDefinition type (`steps: StepEntry[]` remains)

## Consequences

**Positive:**
- Alex behaves like an advisor, not a pipeline
- Quality gate is STRONGER (per-action, not per-step)
- Templates are easier to maintain (less coupling between steps)
- New work types don't need new templates (Self adapts existing ones)

**Negative:**
- Feedback granularity decreases (one approval per broad step vs. per narrow step)
- Staged tools add latency (draft queue → gate → dispatch vs. immediate send)
- More cognitive load on the LLM per step (broader scope = more context needed)
- Risk of agent confusion in broad steps (too many tools, unclear what to do first)

**Mitigated by:**
- Cognitive modes provide judgment frameworks that guide broad-step execution
- Quality gate is now per-action (stronger than before)
- Agent confusion mitigated by mode-specific orchestration guidance
- Feedback loss mitigated by sub-action tracking in staged tool queue

## Alternatives Considered

1. **Keep prescriptive templates.** Rejected — produces mechanical advisor behaviour that doesn't learn or adapt.
2. **Eliminate processes entirely, Self does everything.** Rejected — processes are the governance unit (trust, quality, feedback). Can't have gates without process boundaries.
3. **Dynamic step generation at runtime.** Rejected — heartbeat assumes static step array. Would require major refactor with unclear benefit over thin templates + adapt_process.
