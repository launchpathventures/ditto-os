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

  // Generate a slug from the name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Build the process definition
  const processDefinition = {
    name,
    id: slug,
    version: 1,
    status: "draft",
    description,
    trigger: {
      type: "manual",
      description: `Run ${name}`,
    },
    inputs: [
      { name: "task", type: "string", description: "What to do" },
    ],
    governance: {
      trust_tier: trustTier || "supervised",
      quality_criteria: "Output matches the task description",
      feedback: "implicit",
    },
    steps: steps.map((s) => {
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
    }),
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

  const yamlStr = YAML.stringify(processDefinition);

  if (!save) {
    // Preview mode — return YAML for user review
    return {
      toolName: "generate_process",
      success: true,
      output: JSON.stringify({
        action: "preview",
        slug,
        yaml: yamlStr,
        stepCount: steps.length,
        message: `Process "${name}" (${steps.length} steps) generated. Review the definition and confirm to save.`,
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

    return {
      toolName: "generate_process",
      success: true,
      output: JSON.stringify({
        action: "saved",
        id: proc.id,
        slug,
        name,
        stepCount: steps.length,
        status: "draft",
        message: `Process "${name}" saved as draft with ${steps.length} steps. It's ready to activate when you're confident in the definition.`,
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
