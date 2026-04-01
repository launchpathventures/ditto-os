/**
 * Ditto — Self Tool: Detect Risks
 *
 * Runs risk detection and returns typed signals.
 * The Self weaves these into briefing narrative — never says "risk".
 *
 * MVP scope: temporal, data staleness, correction-pattern.
 *
 * Provenance: Insight-077 (risk detection first-class), Brief 043.
 */

import { detectAllRisks, type RiskThresholds } from "../risk-detector";
import type { DelegationResult } from "../self-delegation";

interface DetectRisksInput {
  thresholds?: Partial<RiskThresholds>;
}

export async function handleDetectRisks(
  input: DetectRisksInput,
): Promise<DelegationResult> {
  try {
    const risks = await detectAllRisks(input.thresholds);

    if (risks.length === 0) {
      return {
        toolName: "detect_risks",
        success: true,
        output: "No signals detected. Everything is running normally.",
      };
    }

    const lines = risks.map(
      (r) => `[${r.severity}] ${r.type}: ${r.entityLabel} — ${r.detail}`,
    );

    return {
      toolName: "detect_risks",
      success: true,
      output: `${risks.length} signal(s) detected:\n${lines.join("\n")}`,
      metadata: {
        risks: risks.map((r) => ({
          severity: r.severity,
          type: r.type,
          entityLabel: r.entityLabel,
          detail: r.detail,
        })),
      },
    };
  } catch (err) {
    return {
      toolName: "detect_risks",
      success: false,
      output: `Detection failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
