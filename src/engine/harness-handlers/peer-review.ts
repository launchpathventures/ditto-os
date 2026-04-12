/**
 * Peer Review — Stage 2 of Deliberative Perspectives
 *
 * After parallel lens generation (stage 1), each lens receives all other
 * lenses' assessments anonymized as "Perspective A, B, C..." and produces
 * a revised assessment. This is the cross-examination loop where genuine
 * deliberation happens.
 *
 * Constraints:
 * - Single round only (ADR-028 §3 — diminishing returns after round 1)
 * - Anonymized (prevents anchoring on perceived authority)
 * - Uses fast model tier
 *
 * Provenance:
 * - Anonymized peer review: Karpathy llm-council stage 2
 * - Single round: ICLR 2025 meta-analysis (diminishing returns)
 */

import { createCompletion, extractText } from "../llm";
import { resolveModel } from "../model-routing";
import type { PerspectiveResult } from "./deliberative-perspectives";

// ============================================================
// Types
// ============================================================

export interface PeerReviewInput {
  /** The original output being evaluated */
  output: string;
  /** Process name for context */
  processName: string;
  /** Step name for context */
  stepName: string;
  /** All initial perspective results from stage 1 */
  perspectives: PerspectiveResult[];
  /** Model tier override */
  modelTier?: string;
}

export interface PeerReviewResult {
  /** Revised perspectives with updated assessments */
  revisedPerspectives: PerspectiveResult[];
  /** Total cost of peer review round */
  costCents: number;
}

// ============================================================
// Anonymization
// ============================================================

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function anonymizeForLens(
  perspectives: PerspectiveResult[],
  excludeIndex: number,
): string {
  const parts: string[] = [];
  let labelIdx = 0;

  for (let i = 0; i < perspectives.length; i++) {
    if (i === excludeIndex) continue;
    const label = LABELS[labelIdx] ?? `${labelIdx + 1}`;
    const p = perspectives[i];
    parts.push(
      `Perspective ${label}:\n${p.assessment}\n` +
      `Signals: ${p.signals.map((s) => `[${s.severity}/${s.type}] ${s.summary}`).join("; ")}`
    );
    labelIdx++;
  }

  return parts.join("\n\n");
}

// ============================================================
// Peer Review execution
// ============================================================

const PEER_REVIEW_PROMPT = `You previously evaluated an output through a specific lens. Now you will see assessments from other perspectives (anonymized).

Review the other perspectives and update your assessment:
- Where do you agree with other perspectives?
- Where do you disagree? Why?
- What did they catch that you missed?
- What did they get wrong?

Maintain your cognitive function — don't abandon your angle to agree with others. Genuine disagreement is valuable.

Respond with a JSON object:
{
  "revisedAssessment": "Your updated assessment incorporating or rebutting other perspectives",
  "signals": [
    { "type": "risk|opportunity|simplification|precedent|feasibility|user-impact|quality|compliance", "summary": "One sentence", "severity": "critical|significant|minor", "evidence": "optional" }
  ],
  "confidence": "high|medium|low",
  "changesFromInitial": "Brief description of what changed and why"
}`;

export async function runPeerReview(
  input: PeerReviewInput,
): Promise<PeerReviewResult> {
  const model = resolveModel(input.modelTier ?? "fast");
  let totalCostCents = 0;

  // Run peer review for each lens in parallel
  const reviewPromises = input.perspectives.map(async (perspective, index) => {
    const otherPerspectives = anonymizeForLens(input.perspectives, index);

    const systemPrompt = `${perspective.systemPrompt ?? ""}\n\n${PEER_REVIEW_PROMPT}`;

    const userMessage =
      `Process: ${input.processName}\nStep: ${input.stepName}\n\n` +
      `Original output:\n${input.output.slice(0, 1500)}\n\n` +
      `Your initial assessment:\n${perspective.assessment}\n\n` +
      `Other perspectives:\n${otherPerspectives}`;

    const response = await createCompletion({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 768,
    });

    return { response, originalPerspective: perspective };
  });

  const results = await Promise.allSettled(reviewPromises);

  const revisedPerspectives: PerspectiveResult[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const original = input.perspectives[i];

    if (result.status === "rejected") {
      // Peer review failed for this lens — keep original
      revisedPerspectives.push(original);
      continue;
    }

    const { response } = result.value;
    totalCostCents += response.costCents;
    const responseText = extractText(response.content);

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          revisedAssessment?: string;
          signals?: Array<{
            type?: string;
            summary?: string;
            severity?: string;
            evidence?: string;
          }>;
          confidence?: string;
          changesFromInitial?: string;
        };

        revisedPerspectives.push({
          ...original,
          assessment: parsed.revisedAssessment ?? original.assessment,
          signals: Array.isArray(parsed.signals)
            ? parsed.signals
                .filter((s) => s.type && s.summary && s.severity)
                .map((s) => ({
                  type: s.type as PerspectiveResult["signals"][number]["type"],
                  summary: s.summary!,
                  severity: s.severity as "critical" | "significant" | "minor",
                  evidence: s.evidence,
                }))
            : original.signals,
          confidence: (["high", "medium", "low"].includes(parsed.confidence ?? "")
            ? parsed.confidence
            : original.confidence) as "high" | "medium" | "low",
          costCents: original.costCents + response.costCents,
          peerReviewChanges: parsed.changesFromInitial,
        });
        continue;
      }
    } catch {
      // Parse failed — keep original
    }

    revisedPerspectives.push(original);
  }

  return { revisedPerspectives, costCents: totalCostCents };
}
