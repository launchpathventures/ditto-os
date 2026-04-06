# Insight-157: Layer-Aware Model Routing — Quality Matches User Proximity

**Date:** 2026-04-06
**Trigger:** Front door chat using a generic model hint system that routes within a single provider. Realisation that model quality should match how close the output is to the user, not be a flat setting across all tasks.
**Layers affected:** All layers — this is a cross-cutting routing principle
**Status:** active

## The Insight

Model quality should match the user's proximity to the output. Anything the user sees directly (conversation, outreach, briefings) gets the best available model. Anything internal (routing, classification, extraction) gets the cheapest model that can do the job. This maps naturally to the six-layer architecture:

| Layer | User proximity | Model class | Why |
|-------|---------------|-------------|-----|
| **L6 Human** — Front door, Self conversation, briefings | Direct — user reads every word | Best conversational | This IS the product experience. Generic AI voice = user leaves. |
| **L6 Human** — Outreach drafting, introductions | Direct — recipient reads every word | Best writing | Bad outreach burns Alex's reputation. Reputation is the product. |
| **L3 Harness** — Metacognitive check, quality review | Indirect — user sees the decision, not the reasoning | Capable | Needs judgment but not creativity or voice. |
| **L2 Agent** — Research, enrichment, analysis | Indirect — feeds into user-facing outputs | Capable | Accuracy matters, personality doesn't. |
| **L2 Agent** — Intake classification, routing, matching | Internal — user never sees this | Fast | Deterministic-ish decisions. Speed and cost matter. |
| **L5 Learning** — Feedback analysis, memory extraction | Internal — system learning | Fast | Parsing structured data from corrections. No creativity needed. |
| **L1 Process** — Validation, schema checking | Internal — often deterministic | Fast or rules engine | Many of these shouldn't use an LLM at all. |

The principle: **the further from the user's eyes, the cheaper the model.** The front door is not where you optimise for cost — it's where you optimise for first impressions. The router is not where you optimise for quality — it's where you optimise for speed.

## Architecture Implications

1. **Multi-provider simultaneous loading.** `llm.ts` currently activates ONE provider. It needs to load ALL configured providers and route per-call. Ditto holds the keys for Anthropic, OpenAI, and Google. The user never sees provider config.

2. **Purpose parameter on createCompletion.** Instead of `model?: string`, add `purpose: "conversation" | "writing" | "analysis" | "classification" | "extraction"`. The routing layer maps purpose → best available provider+model.

3. **Ditto manages the keys.** Users don't configure LLM providers. Ditto provides the LLM service as part of the product. The provider abstraction is internal infrastructure, not user-facing config. (Supersedes the "no vendor lock-in" feedback — users don't care what model is under the hood, they care that Alex sounds right.)

4. **Process YAML hints evolve.** Current `model_hint: fast|capable|default` is too crude. Should align with purposes: `model_purpose: conversation|writing|analysis|classification|extraction`. The routing layer resolves purpose → provider+model based on what's available and what's learned.

5. **Learned routing per purpose.** The existing `generateModelRecommendations()` already compares approval rates across models. Extend it to track per-purpose quality, not just per-step. Over time, Ditto learns which provider+model is best for each purpose class.

## What This Replaces

- Single `LLM_PROVIDER` / `LLM_MODEL` environment config → multi-provider with purpose routing
- `model_hint: fast|capable|default` → `model_purpose` aligned to architecture layers
- User-facing provider choice → Ditto-managed, invisible to user
- "No vendor lock-in" as a user concern → vendor choice is Ditto's infrastructure decision, not the user's

## Where It Should Land

ADR for multi-provider routing. Brief for `llm.ts` upgrade. Update `model-routing.ts` to route by purpose across providers. Update `.env.example` with multi-key config. Update architecture.md with the layer-model mapping table.
