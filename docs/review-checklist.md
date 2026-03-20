# Architecture Review Checklist

Use this checklist to review every piece of work against the Agent OS architecture. This is the harness on our own build process.

## How to Use

After producing work for any phase or task, spawn a separate review agent with this checklist and `docs/architecture.md` as context. The review agent produces a PASS/FLAG/FAIL report. Present both the work and the review to the human for decision.

## Checklist

### 1. Layer Alignment
Does this change map to a specific layer in the architecture? Which one(s)?
- Layer 1: Process — definitions, inputs, outputs, quality criteria
- Layer 2: Agent — adapters, roles, heartbeat, budget
- Layer 3: Harness — review patterns, trust tiers, escalation
- Layer 4: Awareness — dependency graph, event propagation
- Layer 5: Learning — feedback, correction patterns, improvements
- Layer 6: Human — CLI/UI, review queues, dashboards
- Cross-cutting: Governance, agent authentication

### 2. Provenance
Is there a source project for this pattern? Is the ADR written?
- Every adopted pattern must cite: project name, file path, what we took
- Every original pattern must be explicitly marked as "original to Agent OS"
- If no provenance exists, FLAG it

### 3. Composition Check
Are we building something that already exists in a proven project?
- Check `docs/landscape.md` for evaluated alternatives
- If a proven solution exists and we're building custom, justify why
- The default is to adopt, not invent

### 4. Spec Compliance
Does this match what `docs/architecture.md` says?
- If it deviates, is the spec wrong or is the code wrong?
- If the spec needs updating, flag it — don't silently diverge

### 5. Trust Model
Does this respect trust tiers?
- Does it default to supervised?
- Does it never auto-approve without explicit trust tier configuration?
- Does it never auto-upgrade trust?

### 6. Feedback Capture
Does this change capture data that the learning layer will need?
- Every human decision (approve/edit/reject) must be recorded
- Every harness decision (advance/pause) must be recorded
- Diffs must be captured for edits

### 7. Simplicity
Is this the minimum needed for the current task?
- No features for hypothetical future requirements
- No abstractions for one-time operations
- Three similar lines is better than a premature abstraction

### 8. Roadmap Freshness
Is the roadmap up to date?
- Does `docs/roadmap.md` reflect what we learned?
- Are deferred items still correctly deferred?
- Have re-entry conditions changed?
- Does `docs/state.md` reflect current reality?

### 9. User Experience (ADR-004)
Does this work honour the Designer's input?
- If a Designer interaction spec exists (`docs/research/*-ux.md`), does the brief/implementation address it?
- Is the brief's User Experience section populated (not blank or "N/A" when the work has user-facing impact)?
- Does the work serve the six human jobs it claims to? (Orient, Review, Define, Delegate, Capture, Decide)
- Are interaction states specified for UI-touching work?

### 10. Security (Insight-017)
Does this design address security concerns?
- Are credentials stored securely and scoped per-process/per-agent?
- Are permission boundaries explicit — what can each agent access?
- Is sensitive data exposure minimised (no secrets in logs, no credentials in agent context)?
- Does trust enforcement integrity hold — can an agent bypass its trust tier?
- Are audit trails sufficient for the security-relevant actions introduced?

### 11. Execution Verification (Insight-019)
Has the changed code been run end-to-end, not just type-checked?
- Has the smoke test from the brief been executed?
- Did the output match expectations (not just "no errors")?
- If the brief has no smoke test section, FLAG it — every brief must have one
