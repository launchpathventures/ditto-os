# Insight-052: The Creator Is the First Outcome Owner

**Date:** 2026-03-22
**Trigger:** PM triage conversation. Human stated: "My dev process is the primary process. I have multiple projects I want to set goals, features, tasks on and have my dev process break it down and produce the desired outcome." This reframes validation from "find a test workflow" to "use the product for what it's built for."
**Layers affected:** L1 Process, L3 Harness, L6 Human
**Status:** active

## The Insight

The creator of Ditto is an outcome owner managing multiple software projects. They want to set a goal ("add auth to project X"), have the dev pipeline decompose it, execute the roles (PM → researcher → architect → builder → reviewer → documenter), and surface review decisions via Telegram — across multiple codebases.

This is not a test scenario. This is the actual use case described in the personas doc: Rob sets goals and reviews outcomes from his phone. The creator is Rob, except the "trades business" is a portfolio of software projects and the "quotes" are features and releases.

The implication is that the right validation target is not a synthetic workflow or a manufactured PR process — it's the dev pipeline running across multiple projects, with the creator as the outcome owner who sets goals and reviews results. The engine already has goal decomposition (Brief 021), the dev pipeline process (Brief 016c), and the Telegram bridge (Brief 027). What's missing is the multi-project dimension: project identity, project-scoped context, and the ability to say "work on project X" and have the engine know which repo, which state, which constraints.

## Implications

- The validation milestone (Insight-050) should target: "creator runs the dev pipeline on a second project via Telegram, from goal to shipped code"
- Multi-project support becomes the critical path — not MCP, not credentials, not cognitive architecture
- Project identity is likely a thin layer: repo path, project-specific CLAUDE.md/state.md, and a way to switch context
- The orchestrator's goal decomposition already handles the "break it down" part — the gap is "break it down *for which project*"
- This validates the emotional journey from personas.md: Week 1 cautious hope (one project), Month 2 expansion (multiple projects), Month 3 compound effect (most dev work flows through the engine)

## Where It Should Land

- **Brief for multi-project dev pipeline** — the next piece of work
- **architecture.md** — project/workspace scoping (may need lightweight ADR)
- **roadmap.md** — validation milestone between Phase 6 and Phase 7
