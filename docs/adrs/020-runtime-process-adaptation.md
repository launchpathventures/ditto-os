# ADR-020: Runtime Process Adaptation

**Date:** 2026-03-25
**Status:** proposed

## Context

Ditto's architecture states: "Processes are durable: defined once, refined through use, executed consistently" (architecture.md). Process definitions are YAML files loaded at sync time into the DB. The heartbeat reads a process definition and executes its steps sequentially. This model works well for repeatable processes with known steps.

However, interactive processes — onboarding, strategy sessions, knowledge capture, process definition itself — need the Self to adapt the step sequence mid-flight based on what it learns. When Rob says "I run a plumbing company," the onboarding should add trades-specific steps and remove irrelevant ones. When Libby describes a content business, different steps emerge. A static YAML cannot anticipate every business type.

Insight-091 identified that the Self should be able to modify process definitions at runtime. The question is: how do we enable runtime adaptation without breaking process durability?

### Forces

1. **Durability matters.** The canonical process template must remain stable. "AI does not reinvent its approach each time" — the template is the institutional knowledge.
2. **Adaptation matters.** Interactive processes need the Self to exercise judgment about what steps to execute, in what order, based on context.
3. **Governance matters.** Adaptations must go through the same trust/feedback pipeline as everything else. An adaptation that breaks a process should be caught, not silently deployed.
4. **Concurrency matters.** The heartbeat may be mid-execution when the Self adapts the definition. Running steps must not be corrupted.

### Prior art

No surveyed product adapts process definitions at runtime from conversation. The closest patterns:
- **LangGraph** conditional edges: static definition, runtime routing. Ditto already has this (`route_to`).
- **Temporal dynamic workflows**: can add activities to a running workflow, but through code, not AI.
- **Human workflow systems** (Camunda, Airflow): definitions are immutable once a run starts. Adaptation requires a new version deployed to future runs.

None of these allow an AI agent to modify a running process's structure based on conversational context. This is original to Ditto.

## Decision

### 1. Template durability preserved — run-scoped overrides for adaptation

The canonical process definition (`processes.definition` column) is **never modified at runtime**. It changes only through the normal sync cycle (human edits YAML → `ditto sync`).

Each process run can have a `definitionOverride` — an adapted copy of the definition that supersedes the template for that specific run:

```
processRuns table:
  + definitionOverride: JSON | null
```

- If `definitionOverride` is null, the heartbeat uses the canonical `processes.definition`
- If `definitionOverride` is set, the heartbeat uses it instead
- The override is a complete definition (not a diff/patch) for simplicity and auditability

### 2. `adapt_process` Self tool

A new Self tool that writes to `processRuns.definitionOverride`:

```typescript
adapt_process({
  runId: string,          // which run to adapt
  changes: {
    addStep?: StepDefinition & { after?: string },  // insert after step ID
    removeStep?: string,                              // step ID to remove
    modifyStep?: { id: string, changes: Partial<StepDefinition> },
    reorderSteps?: string[],                          // new step ID order
  },
  reasoning: string       // why this adaptation (logged)
})
```

The tool:
1. Reads the current effective definition (override if exists, else canonical)
2. Applies the requested changes
3. **Validates** the result against the same schema `process-loader.ts` uses — rejects invalid adaptations
4. **Guards** against corrupting running steps:
   - Cannot remove a step that is `running` or `waiting_review`
   - Cannot reorder a step with `approved` status ahead of the current execution position
5. Writes the validated result to `processRuns.definitionOverride`
6. Logs the adaptation as an activity: process_id, run_id, changes (before/after), reasoning

### 3. Heartbeat reads override at each step boundary

The heartbeat already re-reads process state from the DB at each step boundary. It will now check `processRuns.definitionOverride` first:

```
effective_definition = run.definitionOverride ?? process.definition
```

This means adaptations made by the Self between steps take effect on the next heartbeat iteration. No additional re-read mechanism needed.

### 4. Scope and trust governance

In the initial implementation (Brief 044), `adapt_process` is scoped to system processes:
- The tool checks `system: true` on the target process record in code
- Rejects adaptation of user-defined processes
- Future extension: user process adaptation with appropriate trust governance

**Trust tier for `adapt_process`:** The Self's adaptation decisions inherit the trust tier of the process being adapted. For onboarding (`supervised`), each adaptation is logged and the adapted definition is visible in the knowledge synthesis card (the user sees the process taking shape). This is implicit review — the user confirms the knowledge synthesis and process proposal, which are the *outputs* of adaptation. Explicit adaptation review (showing the user "I added a step") is not required at MVP — the user reviews the result, not the mechanism.

### 5. Concurrent adaptation guard

If the Self calls `adapt_process` twice in rapid succession on the same run, the second call could overwrite the first. To prevent this, the override column includes a version counter:

```
processRuns table:
  + definitionOverride: JSON | null
  + definitionOverrideVersion: integer (default 0)
```

`adapt_process` uses optimistic locking: read the current version, apply changes, write with `WHERE version = expected_version`. If the write affects 0 rows, re-read and retry. This is the standard optimistic concurrency pattern.

### 6. Template improvement cycle

Runtime adaptations do NOT flow back to the canonical template automatically. The improvement cycle is:
1. The Self adapts onboarding for 20 users, each getting a slightly different run
2. Patterns emerge (trades businesses always need supplier steps, content businesses always need brand voice)
3. A human (or the improvement-scanner meta-process, Phase 8) updates the canonical YAML template to incorporate proven adaptations
4. Future runs start from the improved template

This preserves the "refined through use" principle while keeping the template under human/governance control.

## Provenance

Original — no existing framework implements runtime AI-driven process adaptation with template durability preservation. The template-vs-instance pattern is analogous to:
- **Class vs instance** in OOP (the class definition doesn't change when you modify instance state)
- **Infrastructure as Code** (Terraform state vs plan — the plan is durable, the state reflects reality)
- **Database migrations** (schema is durable, data varies per environment)

## Consequences

### What becomes easier
- Interactive processes (onboarding, strategy, knowledge capture) can adapt to each user
- The Self can exercise judgment about process structure, not just step execution
- System processes can evolve per-run without affecting the template

### What becomes harder
- Process runs with overrides are harder to compare (each run may have a different definition)
- Debugging: "why did this run have 7 steps when the template has 5?" requires reading the override
- Testing: need to test both canonical and adapted execution paths

### What new constraints this introduces
- `adapt_process` must validate every adaptation against the process-loader schema
- Running/waiting steps are immutable from the adapter's perspective
- System processes only (initially) — user process adaptation is a future decision
- The override is a complete definition, not a patch — storage cost scales with adaptation frequency

### Follow-up decisions needed
- When (if ever) to allow `adapt_process` on user-defined processes
- How the improvement-scanner (Phase 8) consumes adaptation patterns to improve templates — needs a concrete discovery mechanism (e.g., `adaptation_summary` query) to surface patterns to humans or the Self
- Whether `definitionOverride` should support incremental patches instead of full copies (optimisation, not needed for MVP)
- Feedback capture for adaptations: how does "this adaptation helped/hurt" flow back to the learning layer? Activity logging captures *what*, but quality signal on *whether it was good* needs L5 integration.
- Override retention/cleanup policy: when (if ever) are completed run overrides archived or purged?
- Architecture.md section on heartbeat execution needs updating once this ships
