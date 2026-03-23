# Insight-061: Delegation Has Weight Classes

**Date:** 2026-03-23
**Trigger:** Live testing of the Conversational Self on Telegram. Delegating to the PM via `cli-agent` (claude -p subprocess) took 5+ minutes for a task the Self could have handled in seconds. The user was left waiting with no feedback, unable to even ask for status because the bot was blocked.
**Layers affected:** L2 Agent, L6 Human
**Status:** archived — absorbed by ADR-017 (Delegation Weight Classes) and Brief 031 (Ditto Execution Layer). All 7 roles migrated to `ai-agent`. Moved to archived 2026-03-23.

## The Insight

Not all delegation is equal. The current architecture treats all 7 dev roles the same way — every delegation spawns a `cli-agent` step via `claude -p`, which boots a full Claude Code session (reads CLAUDE.md, loads tools, reads docs, reasons, produces output). This takes 5-10+ minutes.

But there are two fundamentally different kinds of delegation:

**Light delegation (reasoning roles):** PM, Researcher, Designer, Architect. These roles primarily reason about context, produce recommendations, and have conversations. They don't need codebase access (file editing, grep, test execution). The Self already has the cognitive framework, work state, and session history. It could handle these by loading the role contract into its own prompt and calling `createCompletion()` directly. Response time: ~10 seconds.

**Heavy delegation (codebase roles):** Builder, Reviewer. These roles genuinely need full codebase access — they read files, edit code, run tests, search for patterns. `claude -p` is the right tool here because Claude Code provides the file system tools. Response time: 5-10+ minutes (inherent).

The current uniform approach has three costs:
1. **Latency** — 5+ minutes for a PM triage that should take 10 seconds
2. **Responsiveness** — the bot blocks while waiting for the subprocess (fixed with async, but the user still waits for the result)
3. **Cost** — a full Claude Code session is expensive for what could be a single API call

## Why This Matters

The Conversational Self's value proposition is "competent teammate you can talk to." A teammate who takes 5 minutes to answer "what should we work on next?" doesn't feel competent — they feel broken. The Self must be fast for conversational interactions and only slow when doing genuinely heavy work.

This also affects non-dev use cases. The email summary process the user was defining is entirely conversational — there's no codebase to read. If every process delegation goes through `claude -p`, Ditto will feel slow for all the use cases it should be fastest at.

## Design Questions (for Architect)

1. Should the Self handle light roles directly (loading role contracts as context), or should there be a second executor type (`api-agent`) that calls the LLM directly without Claude Code?
2. If light delegation goes through the Self's own LLM call, does it still go through the harness (trust, memory, feedback)? It should — governance shouldn't depend on execution speed.
3. How does this interact with ADR-014's cognitive architecture? Light delegation is the Self applying a cognitive lens (PM thinking, Architect thinking). Heavy delegation is dispatching to a separate agent with different tools.
4. Where does the boundary sit for roles that sometimes need codebase access (e.g., Researcher searching code) and sometimes don't (Researcher reading docs)?
5. Does this change the standalone process YAML model? Or does the process definition declare its weight class?

## Where It Should Land

- ADR or architecture.md update — delegation weight classes as a first-class concept
- Self engine — light delegation path in `selfConverse()` or `self-delegation.ts`
- Process definitions — weight class annotation (or inferred from executor type)
- Roadmap — this is a prerequisite for the Self feeling "alive" to non-dev users
