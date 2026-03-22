# Insight-053: The PM's Job Is Consultative Framing, Not Routing

**Date:** 2026-03-22
**Trigger:** Creator direction-setting: "The critical role of the PM meta agent is helping properly frame and clarify the goal with the human. AI is generally so eager to go and execute or spends too much time planning alone in the early stages that it fails to include the human in this critical upfront process."
**Layers affected:** L1 Process, L6 Human
**Status:** active

## The Insight

The PM meta-agent's primary job is not triage, routing, or sequencing. It is a **consultative conversation** with the human that transforms a vague goal into a crisp brief before any pipeline execution begins.

Two failure modes dominate AI systems today:
1. **Eager execution** — the AI hears something vague and charges off building the wrong thing
2. **Isolated planning** — the AI disappears into a planning phase without human input, then presents a plan that misses the point

The PM avoids both by staying in conversation with the human during the framing phase. The conversation follows this shape:

1. **Listen** — accept the goal however the human states it (vague is fine, that's the starting point)
2. **Assess clarity** — calibrate: is this a "just do it" task or a "let's explore what you mean" goal?
3. **Ask targeted questions** — not a form, not 20 questions. The 1-3 questions that actually sharpen intent. Different goals need different depths of clarification.
4. **Reflect back** — state the framed goal so the human can confirm or redirect
5. **Hand off** — only then decompose into pipeline steps with a crisp brief

The calibration between light-touch and deep-framing is critical. "Fix the typo on line 42" needs zero framing conversation. "I want better onboarding" needs a real back-and-forth. Most humans are terrible at clearly defining work — they know the feeling they want but not the shape. The PM's job is to bridge that gap through conversation, not forms.

This is the core differentiator of the harness: the upfront framing IS the product. Execution is table stakes. Getting the goal right is where all the value concentrates.

## Implications

- The `/dev-pm` skill needs to be redesigned around consultative framing, not triage/sequencing
- The PM must have a clarity assessment heuristic: task complexity × goal ambiguity → framing depth
- The PM's output is a **confirmed brief** — a goal statement the human has explicitly approved
- Pipeline execution should not start until the PM has a confirmed brief (trust gate)
- This is the first human interrupt in the pipeline and it's the most important one
- Telegram interface must support this back-and-forth naturally (not just command → response)

## Where It Should Land

- **`/dev-pm` skill rewrite** — the immediate next piece of work
- **architecture.md** — PM as consultative framing agent, not router
- **Brief for PM redesign** — inputs: this insight + Insight-052
- **Trust model** — "confirmed brief" as a gate artifact before pipeline proceeds
