# Insight-205: Battle-Ready Project Onboarding

**Date:** 2026-04-25
**Trigger:** User steer during Brief 212 architect session — "when we connect to a new project repo, we should run an in-depth analysis on the project and retro-fit or augment a harness and skill and tool system into the project to make sure the project is battle ready"
**Layers affected:** L1 Process (project model + onboarding process), L2 Agent (the analyser+retrofitter is itself an agent role), L3 Harness (retrofit installs harness primitives into target repo), L6 Human (onboarding interaction surface)
**Status:** active

## The Insight

When Ditto connects to a project repo (the user's broader pipeline spec introduces this concept — `runner=claude-code-routine|local-mac-mini|github-action`, `harness_type=catalyst|native|none`), the moment of connection should trigger a **battle-readiness onboarding**: an in-depth analysis of the repo followed by a retrofit pass that augments the project with the harness, skill set, and tool system needed for Ditto-driven work to actually succeed there.

The implicit failure mode this addresses: today, you point Ditto at a repo and Ditto starts driving Claude Code on it — but the repo may have no test harness, no CI, no review checklist, no role contracts, no tool allowlist, no onboarding context for an agent. Ditto's harness is sophisticated, but it's external; it stops at the repo boundary. Inside the repo it's a green-field every time. Each new project re-litigates the basics: "what's the build command? what tests exist? what's the review pattern? what skills exist? what tools are available? what has the user already taught past projects that this project should inherit?"

The insight: **the harness does not stop at Ditto's boundary; it extends into every repo Ditto manages.** Connecting a repo is not a metadata operation — it is a process. That process inspects, decides, and writes (with user approval) the substrate the project needs to be Ditto-driveable: a `.ditto/` directory, role-contract files, a skill index, a tool allowlist, possibly a CI augmentation, possibly missing test scaffolding, definitely the project's place in Ditto's broader pattern library.

The retrofit is itself a Ditto process — same trust-tier semantics, same review surface, same audit trail. The user doesn't *configure* a project; the user *approves* the analysis and the retrofit, then Ditto remembers what it learned (memories scoped to project) and applies it to future work.

## Implications

1. **"Connect a project" is a multi-step process, not a form submission.** The shape: user pastes a repo URL → Ditto clones (or uses Brief 212's bridge to clone on the user's machine) → analyser pass produces a structured report (build system, test framework, CI status, existing harness/skills/tools, persona-fit assessment) → user reviews + approves → retrofitter pass applies the augmentation under the user's `runner` of choice → project is registered as `active` in the projects table.

2. **Existing Ditto roles map cleanly.** `/dev-researcher` does the in-depth analysis ("what is this project? what's the gold standard nearby? what skills/tools exist?"). `/dev-architect` produces the retrofit plan. `/dev-builder` (via Brief 212's bridge for local-mac-mini runners, or via `claude-code-routine` for cloud runners, or `github-action` for hands-off projects) executes the retrofit. `/dev-reviewer` audits. `/dev-documenter` records what was learned. The onboarding is itself a Research → Design → Build → Review pipeline executed on a *project*, not on a Ditto feature.

3. **The retrofit emits durable artefacts in the target repo, not in Ditto's database.** A `.ditto/` directory in the repo holds the project-scoped harness state (role contracts, skill index, tool allowlist, project-specific guidance). This honours Insight-201 (user-facing legibility — the harness state is grep-able in the repo where the work happens) AND Insight-202 (Ditto-as-X before external-X — Ditto provides the in-repo harness substrate without requiring the project to install Ditto code).

4. **Project memories are scoped per-project.** The user's broader pipeline spec already adds `processes.projectId`. The memory scope `process` extends to the `project` level — corrections taught on project A do not bleed to project B unless the user explicitly cross-promotes. This honours ADR-003's scope-filtering discipline.

5. **The retrofit's depth is trust-tier-bound.** Supervised onboarding: Ditto proposes everything, user approves every file added. Spot-checked: deterministic sample of additions reviewed. Autonomous: Ditto retrofits silently, user audits the diff after. Critical: retrofit is rejected — the project's harness must be hand-authored.

6. **This is a primary user-acquisition surface, not just a setup step.** The in-depth analysis IS the user's first signal of value. Today connecting a project is dead — a row in a table. Battle-readiness analysis turns connection into *the moment the user sees what Ditto can see about their work*. It is, structurally, the same shape as the user's "did you actually send that?" moment in legibility (Insight-201): a transparent first contact that earns trust.

7. **Retrofits compose.** Once the project has a `.ditto/` substrate, every subsequent Ditto-driven session reads from it; the same analysis + retrofit machinery can re-run on a schedule (or on-demand) to *update* the substrate as the project evolves. The harness is not installed once and forgotten — it is maintained.

## Where It Should Land

**Near-term (capture):** This insight, as a stake in the ground.

**Medium-term (architectural):**
- An ADR for the projects-onboarding shape — likely paired with the broader `projects` schema brief the user has been describing in their pipeline spec. The ADR captures: "connecting a project is a process; the retrofit emits `.ditto/` artefacts in the target repo; the analyser+retrofitter use existing Ditto role pipeline."
- A parent brief — call it something like "Project Onboarding & Battle-Readiness" — that decomposes into:
  - Sub-brief: `projects` schema + connection-as-process plumbing
  - Sub-brief: in-depth analyser (uses `/dev-researcher` shape; outputs a structured report)
  - Sub-brief: retrofitter (uses `/dev-architect` + `/dev-builder` shape; emits `.ditto/` artefacts via Brief 212's bridge for local-mac-mini runners)
  - Sub-brief: project memory scope + cross-project promotion UX

**Long-term (architecture):** Document in `architecture.md` §L1 that connecting a project is itself a process; the harness extends into every repo it manages.

**Dependencies:**
- **Brief 212 (Workspace Local Bridge)** — needed to run the analyser+retrofitter on the user's machine for `runner=local-mac-mini` projects without requiring the cloud to clone the repo. For `runner=claude-code-routine`, the cloud already has remote-execution affordances. For `runner=github-action`, the retrofit ships as a workflow.
- **Brief 200 (Workspace Git Server)** — adjacent; if Ditto's own workspace is a project, the retrofitter can dogfood on its own clone.
- The user's broader pipeline spec — defines the `projects` table this insight depends on.

**Status until absorbed:** active. Will be absorbed into the parent onboarding brief once that brief is written and approved.

**Substrate update (2026-04-26):** `projects` substrate built per Brief 215 — onboarding brief (Brief 224 parent) can now layer on top without schema rewrites. The `analysing` initial status, `harnessType: 'none'` default, and nullable `defaultRunnerKind/fallbackRunnerKind` fields exist precisely for the BEFORE-flow onboarding case described above. The `validateStatusTransition` invariant in `packages/core/src/projects/invariants.ts` enforces "transition to `active` requires defaultRunnerKind picked + an enabled `project_runners` row" — this is the structural contract Brief 224's analyser+retrofitter ends with.
