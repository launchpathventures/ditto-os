# Insight-240: Integration-Test an Env-Resolved Side-Channel by Alignment, Not by Mock

**Date:** 2026-05-19
**Trigger:** Brief 288 B3 remediation — building `src/engine/intro-flow.integration.test.ts`, the no-mock end-to-end consent test. The intro engine recorders call `writeNetworkAuditEvent` *without* a `rootDir`, so the audit guard resolves the server-minted-step-run allowlist through `process.env.NETWORK_KB_ROOT`, not through an injected parameter. A first instinct (mock the audit writer, or inject a fake step-run id) would have made the test vacuous — it would no longer prove the real audit gate survives a clean store.
**Layers affected:** L3 Harness (audit/step-run substrate), L6 Human (dev process — integration-test strategy), cross-cutting (review loop)

## The Insight

When a side-effecting engine function enforces a guard by reading from an **env-resolved side channel** (an env var, a default-path resolver, a process-global) rather than from an injected parameter, a faithful integration test must **align that side channel**, not mock the function past it.

Concretely, three things must resolve to the *same* place:

1. The code under test's guard lookup (here: `requireAuditStepRunId` → `auditRoot(undefined)` → `process.env.NETWORK_KB_ROOT`).
2. The test's fixture minting (here: `createNetworkLaneStepRun({ route })` called **rootDir-less**, so its JSONL append also resolves through `process.env.NETWORK_KB_ROOT`).
3. The env itself (here: `NETWORK_KB_ROOT` set to a per-test `fs.mkdtemp` dir, restored in `afterAll`).

If the test mints the fixture through a *different* resolution path than the code reads from (e.g. an injected `rootDir`, or a mocked writer), the guard is never actually exercised — the test passes for the wrong reason and a real regression in the guard ships green. The honest integration test makes the append and the lookup share one directory, then drives the real recorders end to end (real `classifyAndPrepare`, no injected compliance) so the gate is proven on a clean store.

## Implications

- **Reviewer corollary:** when re-verifying a remediated test, check that the guard is reached through the *production* resolution path, not a test-only shortcut. "B3 closed" must mean the audit gate ran, not that an audit-shaped assertion passed. This is the non-vacuity check that turned the Brief 288 re-review from "tests added" into "tests prove the invariant."
- **Builder corollary:** before mocking to make an integration test pass, ask "does the function under test resolve this dependency from an injected param or from an env/global?" If env/global, prefer a temp-dir + env-restore harness (`mkdtemp` in `beforeAll`, restore + `rm` in `afterAll`) over a mock. Mocks are correct for *injected* collaborators; env-resolved side channels are configured, not mocked.
- This generalizes beyond the audit substrate to any harness guard with an implicit resolution path (KB roots, credential dirs, step-run allowlists). The coupling is invisible at the call site — it must be discovered by reading the resolver chain, exactly the "verify, don't assume" discipline.

## Where It Should Land

`docs/dev-process.md` — Quality Check Layering / integration-test guidance, as a Builder rule ("env-resolved side channels are aligned via temp-dir + env-restore, not mocked") and a Reviewer non-vacuity check ("confirm a remediated guard is reached through the production resolution path"). Candidate companion to [[180-step-run-invocation-guard]] and the Brief 282 audit-substrate documentation, since the audit/step-run coupling is the canonical instance. Relates to [[237-reviewer-nit-triage-the-honest-fix-can-be-a-documented-non-change]] (both are review-loop honesty disciplines).
