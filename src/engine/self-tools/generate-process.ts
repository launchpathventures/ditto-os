/**
 * Ditto — Self Tool: Generate Process
 *
 * Generates a process YAML from a conversational description,
 * validates it via process-loader patterns, and saves to DB.
 *
 * The Self drives multi-turn conversation to gather process details,
 * then calls this tool with the assembled specification.
 *
 * Provenance: Existing process-loader.ts, YAML process definitions, Brief 040.
 */

import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import YAML from "yaml";
import type { ProcessDefinition } from "../process-loader";
import {
  validateDependencies,
  validateIntegrationSteps,
  validateStepTools,
  validateModelHints,
} from "../process-loader";
import type { DelegationResult } from "../self-delegation";
import { findProcessModel } from "../system-agents/process-model-lookup";
import { roundTripValidate } from "./yaml-round-trip";

interface ProcessStep {
  id: string;
  name: string;
  executor: string;
  description?: string;
  instructions?: string;
  config?: Record<string, unknown>;
  tools?: string[];
  /** For human steps */
  input_fields?: Array<{
    name: string;
    type: string;
    label?: string;
    required?: boolean;
  }>;
}

interface GenerateProcessInput {
  name: string;
  description: string;
  steps: ProcessStep[];
  /** Trust tier for the new process */
  trustTier?: string;
  /** Whether to save to DB immediately */
  save: boolean;
  /** Brief 154: Optional companion workspace view */
  companionView?: {
    slug: string;
    label: string;
    icon?: string;
    description?: string;
    schema: Record<string, unknown>;
  };
}

export async function handleGenerateProcess(
  input: GenerateProcessInput,
): Promise<DelegationResult> {
  const { name, description, steps, trustTier, save } = input;

  if (!name || !description || !steps || steps.length === 0) {
    return {
      toolName: "generate_process",
      success: false,
      output: "name, description, and at least one step are required.",
    };
  }

  // MP-1.1: Template matching — check library before building from scratch
  // Uses the same findProcessModel() scoring that orchestrator uses in Tier 1 routing
  let templateMatch: Awaited<ReturnType<typeof findProcessModel>> = null;
  let templateDefinition: Record<string, unknown> | null = null;
  try {
    templateMatch = await findProcessModel(description);
    if (templateMatch && templateMatch.confidence >= 0.6 && templateMatch.templatePath) {
      // Load the template YAML to use as structural base
      const fs = await import("fs");
      const templateContent = fs.readFileSync(templateMatch.templatePath, "utf-8");
      templateDefinition = YAML.parse(templateContent) as Record<string, unknown>;
    }
  } catch {
    // Template matching is best-effort — proceed from scratch on failure
  }

  // Generate a slug from the name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Build the process definition — use template as base when confidence >= 0.6
  const templateSteps = templateDefinition?.steps as Array<Record<string, unknown>> | undefined;
  const useTemplateBase = templateMatch && templateMatch.confidence >= 0.6 && templateSteps && templateSteps.length > 0;

  const finalSteps = useTemplateBase
    ? templateSteps.map((ts) => {
        // Preserve template structure (id, executor, tools, config) but allow
        // user-provided steps to override descriptions via name matching
        const userOverride = steps.find(
          (us) => us.id === ts.id || us.name.toLowerCase() === String(ts.name ?? "").toLowerCase(),
        );
        const step: Record<string, unknown> = {
          id: ts.id ?? (ts.name as string || "step").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          name: userOverride?.name ?? ts.name,
          executor: ts.executor ?? "ai-agent",
        };
        if (userOverride?.description ?? ts.description) step.description = userOverride?.description ?? ts.description;
        if (userOverride?.instructions ?? ts.instructions) step.instructions = userOverride?.instructions ?? ts.instructions;
        if (ts.config || userOverride?.config) step.config = userOverride?.config ?? ts.config;
        if (ts.tools || userOverride?.tools) step.tools = userOverride?.tools ?? ts.tools;
        if (ts.input_fields || userOverride?.input_fields) step.input_fields = userOverride?.input_fields ?? ts.input_fields;
        return step;
      })
    : steps.map((s) => {
        const step: Record<string, unknown> = {
          id: s.id,
          name: s.name,
          executor: s.executor,
        };
        if (s.description) step.description = s.description;
        if (s.instructions) step.instructions = s.instructions;
        if (s.config) step.config = s.config;
        if (s.tools) step.tools = s.tools;
        if (s.input_fields) step.input_fields = s.input_fields;
        return step;
      });

  const processDefinition = {
    name,
    id: slug,
    version: 1,
    status: "draft",
    description,
    trigger: templateDefinition?.trigger ?? {
      type: "manual",
      description: `Run ${name}`,
    },
    inputs: templateDefinition?.inputs ?? [
      { name: "task", type: "string", description: "What to do" },
    ],
    governance: {
      trust_tier: trustTier || (templateDefinition?.governance as Record<string, unknown>)?.trust_tier || "supervised",
      quality_criteria: (templateDefinition?.governance as Record<string, unknown>)?.quality_criteria || "Output matches the task description",
      feedback: "implicit",
    },
    steps: finalSteps,
    outputs: (templateDefinition?.outputs as Array<Record<string, unknown>> | undefined) ?? [],
  };

  // Validate the definition — basic checks + process-loader validators
  const validationErrors: string[] = [];

  // Basic structural validation
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (!s.id) validationErrors.push(`Step ${i}: missing id`);
    if (!s.name) validationErrors.push(`Step ${i}: missing name`);
    if (!s.executor) validationErrors.push(`Step ${i}: missing executor`);
    const validExecutors = ["ai-agent", "human", "script", "integration"];
    if (s.executor && !validExecutors.includes(s.executor)) {
      validationErrors.push(`Step ${i}: invalid executor "${s.executor}"`);
    }
  }

  // Run process-loader validators for deeper checks
  const asDef = processDefinition as unknown as ProcessDefinition;
  validationErrors.push(...validateDependencies(asDef));
  validationErrors.push(...validateIntegrationSteps(asDef));
  validationErrors.push(...validateStepTools(asDef));
  validationErrors.push(...validateModelHints(asDef));

  if (validationErrors.length > 0) {
    return {
      toolName: "generate_process",
      success: false,
      output: `Validation errors:\n${validationErrors.join("\n")}`,
    };
  }

  // Brief 173: YAML round-trip validation. Catches definitions that pass
  // structural checks but fail to serialise-then-parse cleanly (e.g. NUL
  // bytes in a prompt, non-JSON-safe values). Better to fail here with a
  // clear reason than at first heartbeat tick.
  const roundTrip = roundTripValidate(processDefinition as unknown as ProcessDefinition);
  if (!roundTrip.ok) {
    const pathNote = roundTrip.path ? ` (at ${roundTrip.path})` : "";
    return {
      toolName: "generate_process",
      success: false,
      output: `YAML round-trip check failed${pathNote}: ${roundTrip.reason}`,
    };
  }
  const yamlStr = roundTrip.yaml;

  // Build template match info for the response
  const templateInfo = templateMatch
    ? templateMatch.confidence >= 0.6
      ? { templateUsed: templateMatch.slug, templateName: templateMatch.name, confidence: templateMatch.confidence }
      : templateMatch.confidence >= 0.3
        ? { templateInspiration: templateMatch.slug, templateName: templateMatch.name, confidence: templateMatch.confidence }
        : null
    : null;

  if (!save) {
    // Preview mode — return YAML for user review
    const previewMessage = templateInfo && "templateUsed" in templateInfo
      ? `Process "${name}" (${finalSteps.length} steps) generated using "${templateInfo.templateName}" as a base. Review the definition and confirm to save.`
      : templateInfo && "templateInspiration" in templateInfo
        ? `Process "${name}" (${finalSteps.length} steps) generated. I found a similar template (${templateInfo.templateName}) — I used that as inspiration. Review the definition and confirm to save.`
        : `Process "${name}" (${finalSteps.length} steps) generated. Review the definition and confirm to save.`;

    return {
      toolName: "generate_process",
      success: true,
      output: JSON.stringify({
        action: "preview",
        slug,
        yaml: yamlStr,
        stepCount: finalSteps.length,
        message: previewMessage,
        ...(templateInfo ?? {}),
      }),
    };
  }

  try {
    // Check for existing process with same slug
    const [existing] = await db
      .select({ id: schema.processes.id })
      .from(schema.processes)
      .where(eq(schema.processes.slug, slug))
      .limit(1);

    if (existing) {
      return {
        toolName: "generate_process",
        success: false,
        output: `A process with slug "${slug}" already exists. Choose a different name.`,
      };
    }

    // Insert into DB
    const [proc] = await db
      .insert(schema.processes)
      .values({
        name,
        slug,
        version: 1,
        status: "draft" as const,
        description,
        trustTier: (trustTier || "supervised") as "supervised" | "spot_checked" | "autonomous" | "critical",
        definition: processDefinition,
      })
      .returning({ id: schema.processes.id });

    // Brief 154: Register companion workspace view if provided
    let companionViewResult: { slug: string; label: string } | undefined;
    if (input.companionView) {
      try {
        const { registerWorkspaceView } = await import("../workspace-push");
        const viewResult = await registerWorkspaceView(
          "founder", // single-user MVP
          "default",
          {
            slug: input.companionView.slug,
            label: input.companionView.label,
            icon: input.companionView.icon,
            description: input.companionView.description,
            schema: input.companionView.schema,
            sourceProcessId: proc.id,
          },
          "generate-process", // synthetic stepRunId for Self tool context
        );
        if (viewResult.success) {
          companionViewResult = { slug: input.companionView.slug, label: input.companionView.label };
        }
      } catch (err) {
        console.warn(`[generate-process] Failed to register companion view:`, err);
      }
    }

    const viewMessage = companionViewResult
      ? ` I've also created a "${companionViewResult.label}" view in your workspace sidebar.`
      : "";

    return {
      toolName: "generate_process",
      success: true,
      output: JSON.stringify({
        action: "saved",
        id: proc.id,
        slug,
        name,
        stepCount: finalSteps.length,
        status: "draft",
        activationHint: true,
        processSlug: slug,
        message: `Process "${name}" saved as draft with ${finalSteps.length} steps. It's ready to activate when you're confident in the definition.${viewMessage}`,
        ...(templateInfo ?? {}),
        ...(companionViewResult ? { companionView: companionViewResult } : {}),
      }),
    };
  } catch (err) {
    return {
      toolName: "generate_process",
      success: false,
      output: `Failed to save process: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
