# Insight-056: The Conversational Self

**Date:** 2026-03-22
**Trigger:** Creator question: "Who am I talking to when I start a conversation?" Exposed that there is no unified Ditto entity — users interact with raw Claude + slash commands, CLI commands, or Telegram buttons. Nothing composes into a coherent "someone" with persistent identity, accumulated understanding, or cognitive continuity.
**Layers affected:** L1 Process, L2 Agent, L3 Harness, L5 Learning, L6 Human
**Status:** active

## The Insight

When a user starts a conversation with Ditto, they are talking to **nobody**. There is no Ditto entity. Three disconnected interaction surfaces exist (CLI commands, Claude Code slash commands, Telegram bot), none of which compose into a coherent self. Each conversation starts from scratch — read docs, re-orient, execute in isolation.

This is the foundational missing piece. The architecture describes "Conversation Is a Layer, Not a Mode" (architecture.md). The human-layer spec defines a Conversation Thread primitive. Insight-055 maps five meta processes governed by a pervasive cognitive framework. But nothing implements the **entity** that embodies these concepts — the someone the user actually talks to.

The gap is structural, not incremental. It's not a feature to add to the existing system. It's the front door that doesn't exist. Every current interaction pattern assumes the user knows the system's internals (which command to run, which slash command to invoke, what docs to reference). The personas (Rob, Lisa, Jordan, Nadia) would never interact this way.

**The Conversational Self is Ditto as Option A:** a persistent entity that:
1. **Knows what's going on** — loads project/work state, active processes, recent activity, pending reviews on every conversation
2. **Remembers the human** — accumulated context from prior conversations, corrections, preferences. Never "new chat"
3. **Thinks through the cognitive framework** — doesn't just respond, reasons about *how* to approach what the human is saying
4. **Delegates to roles/processes** — routes to PM/Architect/Builder etc. but maintains continuity across handoffs. The human talks to Ditto, not to roles
5. **Comes back coherently** — synthesizes what roles/processes produced, presents it as a unified response, captures feedback
6. **Frames goals consultatively** — the first thing it does is understand what the human actually needs (Insight-053), not route to a pipeline

This is the missing Layer 0 — the conversational self that sits above the six architectural layers and gives them a face. It's where the cognitive framework (Insight-055, meta process #5) materializes for the human. It's where "Memory as UX" (Insight-028) becomes real.

## Relationship to Existing Architecture

- **Cognitive Framework (ADR-014, Insight-055):** The conversational self IS the cognitive framework made tangible. The framework isn't injected into agents — it IS the entity the human talks to. Agents receive cognitive context because the self assembles it.
- **Goal Framing (Insight-053):** The conversational self's primary mode is consultative framing. It doesn't wait for slash commands — it listens, assesses, asks, reflects back, then delegates.
- **Meta Processes (Insight-054, 055):** The self orchestrates the five meta processes. It IS the orchestrator that the architecture describes but nobody built.
- **Memory Assembly:** The existing memory-assembly handler becomes one component of the self's context loading. The self also loads session history, user preferences, active work state, and cognitive framework content.
- **Intake Classifier + Router:** These system agents become internal mechanisms the self uses, not user-facing entry points.

## Why This Must Come Before Phase 10 (Web Dashboard)

Phase 10 assumes a conversational entity exists — it specifies a Conversation Thread primitive, a Daily Brief that "feels like a chief of staff," and a workspace that "feels alive." Building UI without the entity is building a dashboard for nobody. The conversational self must be designed and proven (at least in CLI/Telegram) before the web surface can meaningfully render it.

## Implications

- The conversational self is an architectural concept that needs an ADR — it changes how every interaction surface works
- This is deeply intertwined with Cognitive Architecture A1 (toolkit) and should be designed together
- Designer involvement is critical — this is THE primary user-facing interaction, the thing personas actually experience
- The dev pipeline (our current dogfood) should be the first proof: talking to Ditto-as-self vs. invoking slash commands manually
- Session persistence across conversations is required infrastructure (currently nonexistent)
- The self needs its own memory scope — not agent-scoped (too narrow) or process-scoped (wrong abstraction). It's the persistent identity that spans all processes and conversations

## Where It Should Land

- **ADR** — the conversational self as an architectural concept (significant decision)
- **architecture.md** — Layer 0 or integration of the self into the existing layer model
- **Brief for architect** — design the self: what it loads, how it reasons, how it delegates, how it maintains continuity
- **roadmap.md** — this resequences the roadmap: the self comes before the web dashboard, alongside cognitive architecture
