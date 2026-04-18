# Brief 186: Stagehand `agent` Primitive for Browser Exploration & Process Authoring

**Date:** 2026-04-17
**Status:** ready — **deferred; held pending evidence, do not build yet** (see §Decision Criterion)
**Approved:** 2026-04-17 by human after two review passes. Build remains gated on evidence thresholds in §Decision Criterion.
**Depends on:** Brief 184 (real Playwright runtime + session vault + scrub + SSRF guard), Brief 185 (structural fingerprinting, for any authored process that subsequently runs as a bulk job)
**Unlocks:** LLM-driven exploration of a never-seen-before SaaS, producing a draft process YAML that the human reviews + edits before saving. Accelerates the find-or-build path (Insight-163) for browser-based work.

## Goal

- **Roadmap phase:** Phase 9 adjacent (optional extension)
- **Capabilities delivered:** A self-tool `explore_and_propose_process(url, goal)` that uses Stagehand's `agent` primitive over Playwright to navigate a target SaaS, extract the shape of the workflow, and emit a draft process YAML built from the `browser.*` primitives shipped in Brief 183. Output is always human-reviewed before save.

## Decision Criterion — Whether to Build

This brief is explicitly optional. Build only if **all three** of the following evidence thresholds are met in the 4-6 week observation window after Brief 185 ships:

- **Hand-authoring friction:** average >8 conversation turns between user saying "I want to automate X on site Y" and a saved process YAML, measured across at least 5 distinct authoring sessions involving novel sites. Above the threshold = evidence the LLM can't describe what it can't see.
- **User-reported gap:** ≥2 distinct user messages in the briefing / conversation signal stream containing variants of "I don't know what to click" / "I can't describe the page" / "can you figure out the site yourself." Below 2 = silence-as-feature (Insight-056) says not needed.
- **Cost arithmetic:** estimated LLM cost of one Stagehand exploration run (budget cap `20000` tokens ≈ $0.30-0.50 with Sonnet/Haiku mix) is materially less than one user-hour spent hand-authoring. At 2026 LLM prices this is nearly always true; flag the threshold explicitly because it may invert if LLM prices spike.

If any of the three thresholds is not met after 6 weeks, **archive this brief as "not needed"** per Insight-056, update Brief 182's §Alternatives Considered to record the decision with evidence, and do not revisit without fresh trigger.

## Context

The research report (`docs/research/authenticated-saas-browser-automation.md`) noted Stagehand's `agent` primitive as the natural-language-driven exploration layer — separate from deterministic tool-call execution. Brief 182 reserved this as sub-brief 186 and explicitly marked it deferred: "may not be needed if users are comfortable hand-authoring process YAMLs via conversation with Alex + the existing `generate_process` tool."

Ditto's existing `generate_process` tool already produces process YAMLs from natural-language description (Briefs 023 / 047 / 073). What `generate_process` cannot do is *observe a live SaaS to infer the shape of a workflow*. If the user does not know what selectors or steps exist on the target site, they cannot describe the process well enough for `generate_process` to produce something useful.

Stagehand `agent` closes that specific gap: give it a URL + a natural-language goal, let it explore (READ-only — no writes during authoring), and emit a structured description of the workflow that `generate_process` or a thin wrapper converts to a YAML.

## Objective

A self-tool that takes `(url, goal)` and returns a draft process YAML using the `browser.*` tool vocabulary from Brief 183. The user reviews, edits, saves. No writes to the target site during exploration. Trust: `critical` — exploration authors *code* (process definitions) and every output is human-gated before save.

## Non-Goals

- Not a replacement for `generate_process`. Composes with it: exploration fills in the `tools:` declarations and step sequence; `generate_process` (or a thin variant) handles the wrapping YAML.
- Not a write-capable Stagehand surface. Exploration is READ-only. If the site requires a click to reveal the next screen, the agent clicks to READ, not to CHANGE state. The distinction is fuzzy; hence critical trust + human review on every authored artefact.
- Not a general-purpose browser agent usable during normal process runs. That is the Playwright deterministic path (Briefs 183/184). Stagehand `agent` lives only in the authoring pathway.
- Not self-saving of the authored process. Output is a proposed YAML surfaced to the human; save requires explicit approval.
- Not multi-site exploration. One URL per invocation.

## Inputs

1. `docs/briefs/182-browser-write-capability.md` — parent.
2. `docs/briefs/183-browser-protocol-playwright-handler.md` — declares the `browser.*` vocabulary the authored YAML uses.
3. `docs/briefs/184-browser-session-capture-and-execution.md` — session handling this brief inherits.
4. `docs/research/authenticated-saas-browser-automation.md` §Modality 1 — Stagehand `agent` evaluation.
5. `docs/research/linkedin-ghost-mode-and-browser-automation.md` §Stagehand — original Stagehand adoption context.
6. `src/engine/self-tools/browser-tools.ts` — existing Stagehand READ path (`browse_web`). This brief's self-tool sits alongside, not in place of.
7. `src/engine/self-tools/generate-process.ts` — the YAML emission path this brief composes with.
8. `docs/insights/163-find-or-build-orchestration.md` — the architectural frame for "missing capability = build signal."
9. `docs/adrs/032-browser-integration-protocol.md` — `browser.*` vocabulary is defined here; the authored YAML targets it.
10. `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — applies to any side-effecting function added here (exploration launches browser; needs a guard).

## Constraints

- Stagehand `agent` runs with the existing `@browserbasehq/stagehand` dependency (already in package.json per Brief 134). No new dependency.
- Exploration runs in a **fresh, session-less BrowserContext** (no vault storageState injected). Authoring a process should not require the user's own session; if the target requires login, the output YAML declares a `browser.navigate` step to the login-aware URL and the process uses the vault at run-time. Login pages themselves are in-scope to *describe* (selectors for email/password fields), not to *operate*.
- Alternative if the target is entirely behind auth: the user may opt in to a vault-backed exploration run by passing `--with-session <service>` — in which case the storageState loads into the context. Still READ-only.
- **Explicitly READ-only at the tool boundary, defence-in-depth:** any `agent.act()` call that attempts a write-intent action MUST be intercepted by two independent checks: (1) the existing `WRITE_INTENT_PATTERNS` guard from `browser-tools.ts:52-79` applied to the natural-language instruction string the agent passes to Stagehand; (2) an accessible-name check on the target element at the Stagehand tool-call layer — if the element's a11y name or role matches WRITE verbs (button labels "Submit" / "Send" / "Save" / "Delete" / "Publish" / "Confirm" / "Post" / "Delete", or `[type="submit"]` on inputs), the call is rejected even if the instruction string slipped past pattern matching. Both checks apply; either triggers rejection. Rationale: Stagehand's `agent` is a natural-language planner that can rephrase "submit the form" as "verify the form behaviour" or "check what the save button does" — pattern-only defence is insufficient.
- Token budget hard cap (default `AGENT_TOKEN_BUDGET = 20000`, configurable). Stagehand's `agent` is LLM-expensive; uncapped exploration can burn hundreds of thousands of tokens on a complex site.
- Max steps cap (`AGENT_MAX_STEPS = 30`, configurable). Terminates the agent loop; outputs the partial result with a "exploration terminated after max steps" flag.
- Output MUST validate against the integration registry's `browser.*` vocabulary — any authored step must reference a real primitive declared in `integrations/browser.yaml`. Round-trip validation (re-use Brief 173's `roundTripValidate`) applied to the emitted YAML before surfacing.
- **Composition direction with `generate_process`:** `explore_and_propose_process` **emits a YAML independently** (it does not call `generate_process` internally). The two self-tools share the same output format (`ProcessProposalBlock`) and the same validation pipeline (`yaml-round-trip.ts`), but neither wraps the other. Rationale: `generate_process` takes a text description and emits a YAML; exploration takes a URL + goal and emits a YAML. Different input shapes, same output shape, no coupling. A future consolidation could extract a shared YAML-emit helper; that is refactor, not scope here.
- Trust: always `critical`. The authored YAML is *code*; the human approves it before save. No auto-save path.
- Insight-180 guard on the new self-tool: `exploreAndProposeProcess` takes `stepRunId` (if invoked by an agent) or a conversation-context anchor (if invoked by Self directly). Match the existing `browse_web` pattern for invocation anchoring.
- Output YAML is surfaced as a ProcessProposalBlock (existing block type from Brief 072) — same review surface as `generate_process` output. Human reviews, edits, approves.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| Stagehand `agent` primitive | `@browserbasehq/stagehand` v0.x+ | depend | Already in Ditto's package.json (Brief 134). `agent({ instructions, maxSteps })` is the exploration surface |
| Self-tool pattern | `src/engine/self-tools/browser-tools.ts` (Brief 134) | adopt | `browse_web` is the existing Stagehand-based self-tool; this brief's tool sits alongside it with a different invocation shape |
| YAML emission + validation | `src/engine/self-tools/generate-process.ts` + `yaml-round-trip.ts` (Briefs 047, 173) | depend | Existing shape for "produce a YAML, validate, propose to human" |
| Process proposal surface | `ProcessProposalBlock` (Brief 072) | depend | Same block type used by `generate_process` |
| WRITE-intent guard | `browser-tools.ts:52-79` (Brief 134) | adopt | Verbatim |
| Find-or-build orchestration | Insight-163 | pattern | The conceptual frame — exploration is the "build" path when no matching process exists |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/engine/self-tools/browser-exploration.ts` | Create — `explore_and_propose_process(url, goal, options?)` self-tool. Invokes Stagehand `agent`, captures the exploration transcript, synthesises a draft process YAML using `browser.*` vocabulary, validates round-trip, surfaces as ProcessProposalBlock |
| `src/engine/self-tools/browser-exploration.test.ts` | Create — tests: WRITE-intent intercepted, token budget enforced, max-steps terminates gracefully, output YAML validates against `browser.*` vocabulary, output is surfaced as ProcessProposalBlock not saved automatically |
| `src/engine/self-delegation.ts` | Modify — register `explore_and_propose_process` in `selfTools`; add handler case in `executeDelegation` |
| `src/engine/tool-resolver.ts` | Modify — add `explore_and_propose_process` to built-in tools registry |
| `cognitive/modes/*.md` (as relevant) | Modify — note that exploration is available for Connecting / Chief-of-Staff modes when a novel SaaS is encountered during find-or-build |
| `docs/landscape.md` | Modify — Stagehand entry gains a note: "Used in two distinct surfaces — READ-only `browse_web` self-tool (Brief 134) for conversational research; READ-only `explore_and_propose_process` self-tool (Brief 186) for process authoring. Neither surfaces WRITE operations — those go through the deterministic Playwright handler (Brief 184)." |

## User Experience

- **Jobs affected:** Delegate (user asks for a new automation on a site Ditto doesn't know), Define (user curates the proposed YAML).
- **Primitives involved:** ProcessProposalBlock (existing — used for review/edit/approve of proposed process YAMLs), Conversation (Alex narrates exploration).
- **Process-owner perspective:** User: "I need to reconcile expenses on `newsite.co.nz`." Alex: "I don't know newsite yet. I can explore it to propose a process — this takes ~2 minutes and costs ~$0.30 in LLM tokens. OK?" User: yes. Alex runs exploration, narrates progress: "navigating to newsite... found an expenses page... identifying rows... finding the reconcile button..." ~2 minutes later: ProcessProposalBlock appears with a draft `reconcile-newsite-expense.yaml`. User reviews, edits if needed, approves. Process is saved and ready to run.
- **Interaction states:** exploration-starting, exploration-progressing (SSE events for step-by-step narration), exploration-complete (proposal block), exploration-terminated-max-steps (partial proposal with warning flag), exploration-budget-exhausted (partial proposal with budget flag), exploration-blocked (site returned captcha or required login not declared).
- **Designer input:** Not invoked. Existing ProcessProposalBlock UI is sufficient. May invoke `/dev-designer` for the exploration-progress SSE narration polish only if evidence (once built) says default feels flat.

## Acceptance Criteria

1. [ ] `explore_and_propose_process(url, goal, options?)` self-tool registered in `selfTools` + `tool-resolver`. Callable via Self conversation.
2. [ ] Stagehand `agent` invoked READ-only; any write-intent action intercepted and rejected (same `WRITE_INTENT_PATTERNS` as `browse_web`). Test with an adversarial goal like "log in and delete my account."
3. [ ] Token budget enforced (default `AGENT_TOKEN_BUDGET = 20000`, env-overridable). Exploration terminates gracefully when exceeded, returns partial result with `budgetExhausted: true` flag.
4. [ ] Max-steps cap enforced (default `AGENT_MAX_STEPS = 30`). Exploration terminates with `maxStepsHit: true` flag on partial result.
5. [ ] Exploration runs in a session-less BrowserContext by default. `--with-session <service>` opt-in loads vaulted storageState; otherwise no auth context.
6. [ ] Output YAML uses only `browser.*` primitives declared in `integrations/browser.yaml`. Round-trip validation via `yaml-round-trip.ts` passes on the emitted YAML before surfacing.
7. [ ] Output surfaces as ProcessProposalBlock — same review surface as `generate_process`. No auto-save.
8. [ ] Trust tier for authored artefact is `critical`. Test asserts tier assignment on the proposed process.
9. [ ] Insight-180 invocation guard on `exploreAndProposeProcess` — requires stepRunId or conversation-context anchor. Rejects free-floating invocation.
10. [ ] SSE narration events emitted during exploration so the user sees progress ("navigating...", "identifying rows..."). Test.
11. [ ] `pnpm run type-check` passes; `pnpm test` passes; no regressions on existing self-tool tests.
12. [ ] Landscape doc annotation for Stagehand dual-surface usage present.

## Review Process

1. Spawn review agent with `docs/architecture.md`, `docs/review-checklist.md`, ADR-032, Briefs 182/183/184/185, and this brief.
2. Review agent specifically checks:
   - Is the WRITE-intent interception actually watertight, or can Stagehand's `agent` find a way around the pattern gate (e.g., via `click` that semantically submits)? Adversarial test expected.
   - Is the round-trip validation sufficient to catch an exploration that proposes a non-existent `browser.*` primitive?
   - Does the token budget actually terminate the agent loop cleanly, or does it risk leaving a partial context-state that later fires stale callbacks?
   - Is the ProcessProposalBlock surfacing consistent with `generate_process`'s shape, or does this brief introduce a parallel review pathway?
   - Does the `--with-session` opt-in path respect the same scrub + SSRF guardrails as Brief 184, or does exploration bypass them?
   - Is the decision-criterion (§Decision Criterion) honest — is there a clear "don't build this" path if evidence doesn't materialise?
3. Fresh-context reviewer re-reads: is this brief net-add value, or premature optimisation for a use case that `generate_process` + a patient user already handles?
4. Present work + review findings + decision-criterion evidence (if any) to human.

## Smoke Test

```bash
# Only runs if this brief is activated — otherwise skip.
pnpm run type-check
pnpm cli sync

# Agent exploration against a known public test site (e.g., example.com or a curated fixture)
pnpm cli explore --url=https://example.com --goal="identify the main heading" --budget=5000
# Expect: ProcessProposalBlock appears in Self conversation with a minimal browser.navigate + browser.extract proposal.

# WRITE-intent adversarial
pnpm cli explore --url=https://example.com --goal="delete the form and log in" --budget=5000
# Expect: exploration refuses with WRITE intent rejection; no YAML emitted.

# Budget exhaustion
pnpm cli explore --url=https://example.com --goal="explore every link" --budget=500
# Expect: partial proposal with budgetExhausted flag; no crash.
```

## After Completion

1. Update `docs/state.md` — Brief 186 complete (if built); or Brief 186 archived (if decision-criterion said "not needed").
2. Update `docs/landscape.md` — Stagehand entry annotation.
3. If built: retrospective — did users actually use it, or did `generate_process` suffice? What did exploration cost per invocation? What was the edit rate on proposed YAMLs (proxy for quality)?
4. If archived: update Brief 182's §Alternatives Considered to record that the Stagehand-agent authoring surface was evaluated and not adopted, with the specific evidence that said no.
