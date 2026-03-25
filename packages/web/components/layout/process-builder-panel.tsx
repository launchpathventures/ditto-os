"use client";

/**
 * Ditto — Process Builder Panel (Right Panel Variant)
 *
 * Renders the emerging process structure during Self-guided creation.
 * Read-only — the conversation drives changes, not this panel.
 * All data parsed from YAML string prop.
 *
 * AC6: generate_process(save=false) → right panel shows Process Builder.
 * AC8: Renders name, "Drafting" badge, inputs, steps, quality criteria.
 *
 * Provenance: Brief 046, Melty IDE "PR #1432" badge pattern.
 */

import { useMemo } from "react";

interface ProcessBuilderPanelProps {
  yaml: string;
  slug?: string;
}

interface ParsedProcess {
  name: string;
  description?: string;
  inputs?: Array<{ name: string; description?: string; required?: boolean }>;
  steps?: Array<{ id: string; name: string; executor?: string; description?: string }>;
  quality_criteria?: string[];
  outputs?: Array<{ name: string; description?: string }>;
}

function parseYaml(yaml: string): ParsedProcess | null {
  try {
    // Simple YAML-like parsing for the structured process data.
    // The generate_process tool returns a structured result, but the YAML
    // string is what we display. Parse key fields for structured rendering.
    const lines = yaml.split("\n");
    const result: ParsedProcess = { name: "Untitled Process" };

    let section: string | null = null;
    let stepsList: ParsedProcess["steps"] = [];
    let inputsList: ParsedProcess["inputs"] = [];
    let qualityList: string[] = [];
    let outputsList: ParsedProcess["outputs"] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Top-level keys
      if (trimmed.startsWith("name:")) {
        result.name = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
      } else if (trimmed.startsWith("description:")) {
        result.description = trimmed.slice(12).trim().replace(/^["']|["']$/g, "");
      } else if (trimmed === "inputs:" || trimmed === "input_fields:") {
        section = "inputs";
      } else if (trimmed === "steps:") {
        section = "steps";
      } else if (trimmed === "quality_criteria:") {
        section = "quality";
      } else if (trimmed === "outputs:" || trimmed === "output_delivery:") {
        section = "outputs";
      } else if (/^\w+:/.test(trimmed) && !trimmed.startsWith("-") && !trimmed.startsWith(" ")) {
        section = null;
      }

      // Section items
      if (section === "steps" && trimmed.startsWith("- id:")) {
        stepsList.push({ id: trimmed.slice(5).trim(), name: "", executor: "ai-agent" });
      } else if (section === "steps" && trimmed.startsWith("name:") && stepsList.length > 0) {
        stepsList[stepsList.length - 1].name = trimmed.slice(5).trim().replace(/^["']|["']$/g, "");
      } else if (section === "steps" && trimmed.startsWith("executor:") && stepsList.length > 0) {
        stepsList[stepsList.length - 1].executor = trimmed.slice(9).trim();
      } else if (section === "inputs" && trimmed.startsWith("- name:")) {
        inputsList.push({ name: trimmed.slice(7).trim().replace(/^["']|["']$/g, "") });
      } else if (section === "quality" && trimmed.startsWith("-")) {
        qualityList.push(trimmed.slice(1).trim().replace(/^["']|["']$/g, ""));
      } else if (section === "outputs" && trimmed.startsWith("- name:")) {
        outputsList.push({ name: trimmed.slice(7).trim().replace(/^["']|["']$/g, "") });
      }
    }

    if (stepsList.length > 0) result.steps = stepsList;
    if (inputsList.length > 0) result.inputs = inputsList;
    if (qualityList.length > 0) result.quality_criteria = qualityList;
    if (outputsList.length > 0) result.outputs = outputsList;

    return result;
  } catch {
    return null;
  }
}

export function ProcessBuilderPanel({ yaml, slug }: ProcessBuilderPanelProps) {
  const parsed = useMemo(() => parseYaml(yaml), [yaml]);

  if (!parsed) {
    return (
      <div className="text-sm text-text-muted">
        Building process structure...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with drafting badge */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-text-primary truncate flex-1">
          {parsed.name}
        </h3>
        <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
          Drafting
        </span>
      </div>

      {parsed.description && (
        <p className="text-sm text-text-secondary leading-relaxed">
          {parsed.description}
        </p>
      )}

      {/* Inputs checklist */}
      {parsed.inputs && parsed.inputs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Inputs
          </p>
          <div className="space-y-1.5">
            {parsed.inputs.map((input, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-shrink-0 w-4 h-4 rounded border border-border flex items-center justify-center text-xs text-text-muted">
                  ✓
                </span>
                <span className="text-text-secondary">{input.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Steps list */}
      {parsed.steps && parsed.steps.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Steps
          </p>
          <div className="space-y-2">
            {parsed.steps.map((step, i) => (
              <div key={step.id || i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-surface flex items-center justify-center text-xs text-text-muted font-medium">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary">
                    {step.name || step.id}
                  </p>
                  {step.executor && (
                    <span className="text-xs text-text-muted">
                      {step.executor === "human" ? "You" : step.executor === "ai-agent" ? "Ditto" : step.executor}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quality criteria */}
      {parsed.quality_criteria && parsed.quality_criteria.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Quality checks
          </p>
          <div className="space-y-1.5">
            {parsed.quality_criteria.map((criterion, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-accent flex-shrink-0 mt-0.5">◦</span>
                <span className="text-text-secondary">{criterion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outputs */}
      {parsed.outputs && parsed.outputs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
            Outputs
          </p>
          <div className="space-y-1.5">
            {parsed.outputs.map((output, i) => (
              <div key={i} className="text-sm text-text-secondary">
                → {output.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {slug && (
        <p className="text-xs text-text-muted pt-2 border-t border-border">
          {slug}
        </p>
      )}
    </div>
  );
}
