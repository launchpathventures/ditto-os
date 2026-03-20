# Insight-026: Collaborate Is a Mode, Not a Job

**Date:** 2026-03-19
**Trigger:** Designer discussion about whether "Collaborate" should be a seventh human job
**Layers affected:** L6 Human
**Status:** active

## The Insight

The six human jobs are all asymmetric — the human acts on agent output in one direction (consumes, judges, specifies, assigns, inputs, chooses). Collaboration is bidirectional — back-and-forth iteration between human and agent.

But collaboration is not a seventh job. It's a **mode** that gets applied when performing the existing jobs:

- Collaborate while **Defining** — the Conversation Thread (Primitive 8) is a collaborative Define
- Collaborate while **Reviewing** — inline editing with agent learning is collaborative Review
- Collaborate while **Deciding** — "Discuss" on an Improvement Card opens a collaborative Decide

The architecture already captures this through the Explore/Operate split:
- **Explore mode** = collaborative. Back-and-forth, iterative, conversational.
- **Operate mode** = solo-decision. Status, actions, decisions.

Collaboration is the **how** of Explore mode, not a separate **what**. This is consistent with Insight-013 (jobs vs skills) — jobs are what the human does, skills and modes are how they do it.

## Implications

- The six human jobs framework does not need a seventh job. The framework is complete at the job level.
- The Explore/Operate split already encodes the collaborative dimension. Explore is where collaboration happens; Operate is where solo decisions happen.
- This reinforces Insight-011 (Mobile Is Operate Mode): mobile doesn't need collaborative surfaces because collaboration = Explore = desktop. The mobile surface is solo-decision mode.
- Future features that feel "collaborative" (mid-execution guidance, iterative refinement, co-creation) should be designed as Explore-mode extensions of existing jobs, not as a new job category.

## Where It Should Land

Human-layer doc — could add a note in the Design Philosophy section acknowledging that the six jobs are the "what" axis, with modes (Explore/Operate) and skills (Insight-013) as the "how" axes. This makes the framework more robust against future "shouldn't X be a job?" questions.
