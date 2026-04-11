# Insight 175 — Trust System as Training Data Flywheel

**Date:** 2026-04-11
**Trigger:** Strategic discussion on SLM fine-tuning as a moat. The realization that Ditto's trust system (approve/edit/reject) already generates labeled training data as a byproduct of normal operation.
**Layers affected:** L2 Agent, L3 Harness, L5 Learning
**Status:** active

## The Insight

Every approve/reject/edit action in Ditto's trust system creates a labeled training example: the system prompt, inputs, and outputs for a step run, paired with a human quality judgment. Over time, each (process, step) pair accumulates a corpus of ground-truth examples — the exact dataset needed to fine-tune a task-specific SLM.

This creates a compounding flywheel:

1. **User runs processes** → step runs accumulate with inputs/outputs
2. **Trust system collects labels** → approve/edit/reject creates ground truth
3. **Volume + consistency signals readiness** → when a step has enough approved examples at high approval rate, it's a fine-tuning candidate
4. **Fine-tuned SLM replaces frontier model** → cost drops 10-100x for that step
5. **Cost savings fund more process usage** → more data → better models → deeper moat

The key insight is that **the training data pipeline is already built** — it's the trust system itself. What's missing is the extraction, evaluation, and deployment layer that turns accumulated trust data into fine-tuned models.

This is a genuine moat because:
- The training data is proprietary to each customer's operations
- It improves with usage (no competitor can replicate the data without the operational history)
- It compounds: each fine-tuned SLM reduces cost, enabling more processes, generating more training data
- The trust system ensures data quality — only approved outputs become training examples

## Implications

1. The step_runs table already captures everything needed for training data: inputs, outputs, model, status (approved/rejected), purpose, cost, tokens. No schema changes required.
2. The `generateModelRecommendations()` function in model-routing.ts already analyzes per-step model performance. This extends naturally to "recommend fine-tuning" when volume + consistency thresholds are met.
3. The model-purpose-resolver (Brief 128) already classifies which steps are SLM-suitable (classification, extraction). Fine-tuning candidates are a subset: SLM-suitable steps with sufficient approved training data.
4. The provider abstraction (`LlmProvider` interface) and routing table (`PURPOSE_ROUTING`) already support per-purpose model selection. A fine-tuned SLM is just another provider entry.

## Where It Should Land

- Brief for the SLM Training Data Pipeline
- Eventually architecture.md L5 (Learning Layer) — "training data accumulation as a learning primitive"
- Consider for docs/vision.md — this is a strategic differentiator, not just an optimization
