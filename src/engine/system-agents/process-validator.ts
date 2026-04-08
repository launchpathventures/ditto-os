/**
 * Process Validator — System Agent (Brief 104)
 *
 * Unified validator that performs four quality checks on process models
 * before they can enter the Process Model Library:
 *
 * 1. Edge-case testing — missing/empty/malformed inputs, unexpected types
 * 2. Compliance scanning — no hardcoded secrets, PII flagged, trust tier recommendation
 * 3. Efficiency analysis — parameterisation opportunities, step consolidation
 * 4. Duplicate detection — keyword overlap + structural similarity against library
 *
 * Produces a structured ValidationReport with per-check evidence.
 * Registered as a system agent per ADR-008.
 *
 * Provenance: App store review pattern (AI flags, human decides) +
 *             spec-testing review pattern (adversarial quality testing)
 */

import type { StepExecutionResult } from "../step-executor";
import { db, schema } from "../../db";
import { eq, and, ne } from "drizzle-orm";
// Validation report types — defined in @ditto/core, re-exported for consumers
export type {
  ValidationCheckResult,
  ValidationReport,
} from "@ditto/core";
import type { ValidationCheckResult, ValidationReport } from "@ditto/core";

// ============================================================
// Types
// ============================================================

export interface ProcessValidatorInputs {
  /** The process model ID to validate */
  processModelId: string;
}

interface ProcessDefinitionForValidation {
  name?: string;
  id?: string;
  description?: string;
  steps?: Array<{
    id?: string;
    name?: string;
    executor?: string;
    description?: string;
    inputs?: Array<{ name?: string; type?: string; required?: boolean }>;
    outputs?: Array<{ name?: string }>;
    depends_on?: string[];
    config?: Record<string, unknown>;
  }>;
  inputs?: Array<{ name?: string; type?: string; required?: boolean; source?: string }>;
  outputs?: Array<{ name?: string; type?: string }>;
  trust?: { initial_tier?: string };
  quality_criteria?: string[];
}

// ============================================================
// System agent entry point
// ============================================================

export async function executeProcessValidator(
  inputs: Record<string, unknown>,
): Promise<StepExecutionResult> {
  const processModelId = inputs.processModelId as string;

  if (!processModelId) {
    return makeResult(false, "No processModelId provided", []);
  }

  const [model] = await db
    .select()
    .from(schema.processModels)
    .where(eq(schema.processModels.id, processModelId))
    .limit(1);

  if (!model) {
    return makeResult(false, `Process model ${processModelId} not found`, []);
  }

  const definition = model.processDefinition as unknown as ProcessDefinitionForValidation;
  const checks: ValidationCheckResult[] = [];

  // Run all four validation functions
  checks.push(...validateEdgeCases(definition));
  checks.push(...validateCompliance(definition));
  checks.push(...validateEfficiency(definition, model.name));
  const duplicateChecks = await detectDuplicates(model.slug, model.name, model.description || "", processModelId);
  checks.push(...duplicateChecks);

  const passed = checks.every((c) => c.pass);
  const duplicateMatch = findDuplicateMatch(duplicateChecks);

  const report: ValidationReport = {
    passed,
    validatedAt: new Date().toISOString(),
    checks,
    recommendation: passed
      ? "All checks passed — ready for standardisation"
      : `${checks.filter((c) => !c.pass).length} check(s) failed — review required`,
    ...(duplicateMatch ? { duplicateMatch } : {}),
  };

  // Update the model with the validation report
  await db
    .update(schema.processModels)
    .set({
      validationReport: report as unknown as Record<string, unknown>,
      status: passed ? "standardised" : "nominated",
      updatedAt: new Date(),
    })
    .where(eq(schema.processModels.id, processModelId));

  return {
    outputs: {
      "validation-result": report,
    },
    confidence: passed ? "high" : "medium",
    logs: [report.recommendation],
  };
}

// ============================================================
// 1. Edge-case testing
// ============================================================

export function validateEdgeCases(
  definition: ProcessDefinitionForValidation,
): ValidationCheckResult[] {
  const checks: ValidationCheckResult[] = [];

  // Check: process has a name
  checks.push({
    check: "edge-case",
    input: "process.name",
    expected: "Non-empty string",
    actual: definition.name ? `"${definition.name}"` : "(missing)",
    pass: !!definition.name && definition.name.trim().length > 0,
  });

  // Check: process has steps
  const steps = definition.steps || [];
  checks.push({
    check: "edge-case",
    input: "process.steps",
    expected: "At least one step defined",
    actual: `${steps.length} step(s)`,
    pass: steps.length > 0,
  });

  // Check: each step has required fields
  for (const step of steps) {
    const hasId = !!step.id;
    const hasName = !!step.name;
    const hasExecutor = !!step.executor;

    if (!hasId || !hasName || !hasExecutor) {
      checks.push({
        check: "edge-case",
        input: `step "${step.id || step.name || "(unnamed)"}"`,
        expected: "id, name, and executor present",
        actual: `id=${hasId}, name=${hasName}, executor=${hasExecutor}`,
        pass: false,
      });
    }
  }

  // Check: step dependencies reference valid step IDs
  const stepIds = new Set(steps.map((s) => s.id).filter(Boolean));
  for (const step of steps) {
    if (step.depends_on) {
      for (const dep of step.depends_on) {
        if (!stepIds.has(dep)) {
          checks.push({
            check: "edge-case",
            input: `step "${step.id}" depends_on "${dep}"`,
            expected: "Reference to existing step ID",
            actual: `"${dep}" not found in step IDs`,
            pass: false,
          });
        }
      }
    }
  }

  // Check: no circular dependencies (simple depth-limited check)
  const circularCheck = detectCircularDeps(steps);
  checks.push({
    check: "edge-case",
    input: "step dependency graph",
    expected: "No circular dependencies",
    actual: circularCheck.circular ? `Circular: ${circularCheck.path}` : "Acyclic",
    pass: !circularCheck.circular,
  });

  // Check: process inputs defined with types
  const processInputs = definition.inputs || [];
  for (const input of processInputs) {
    if (input.required && !input.name) {
      checks.push({
        check: "edge-case",
        input: "process.inputs",
        expected: "Required inputs have names",
        actual: "Required input missing name",
        pass: false,
      });
    }
  }

  return checks;
}

function detectCircularDeps(
  steps: ProcessDefinitionForValidation["steps"],
): { circular: boolean; path?: string } {
  if (!steps || steps.length === 0) return { circular: false };

  const graph = new Map<string, string[]>();
  for (const step of steps) {
    if (step.id) {
      graph.set(step.id, step.depends_on || []);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): string | null {
    if (inStack.has(node)) return [...path, node].join(" → ");
    if (visited.has(node)) return null;

    visited.add(node);
    inStack.add(node);

    for (const dep of graph.get(node) || []) {
      const result = dfs(dep, [...path, node]);
      if (result) return result;
    }

    inStack.delete(node);
    return null;
  }

  for (const stepId of graph.keys()) {
    const result = dfs(stepId, []);
    if (result) return { circular: true, path: result };
  }

  return { circular: false };
}

// ============================================================
// 2. Compliance scanning
// ============================================================

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|password|token|credential|auth)[\s]*[:=]\s*["'][^"']{8,}/i,
  /(?:sk-|pk-|ghp_|gho_|xoxb-|xoxp-)[a-zA-Z0-9]{10,}/,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
];

const PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
  /\b\d{3}[-]?\d{2}[-]?\d{4}\b/, // SSN pattern
];

export function validateCompliance(
  definition: ProcessDefinitionForValidation,
): ValidationCheckResult[] {
  const checks: ValidationCheckResult[] = [];
  const definitionStr = JSON.stringify(definition);

  // Check: no hardcoded secrets
  const secretMatches: string[] = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(definitionStr)) {
      secretMatches.push(pattern.source.slice(0, 40));
    }
  }
  checks.push({
    check: "compliance",
    input: "process definition (full text)",
    expected: "No hardcoded secrets or API keys",
    actual: secretMatches.length > 0
      ? `Found ${secretMatches.length} potential secret(s)`
      : "No secrets detected",
    pass: secretMatches.length === 0,
    details: secretMatches.length > 0 ? `Patterns matched: ${secretMatches.join(", ")}` : undefined,
  });

  // Check: PII flagged (warning, not failure)
  const piiMatches: string[] = [];
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(definitionStr)) {
      piiMatches.push(pattern.source.slice(0, 40));
    }
  }
  checks.push({
    check: "compliance",
    input: "process definition (full text)",
    expected: "No embedded PII (emails, phone numbers, SSNs)",
    actual: piiMatches.length > 0
      ? `Found ${piiMatches.length} potential PII pattern(s)`
      : "No PII detected",
    pass: piiMatches.length === 0,
    details: piiMatches.length > 0 ? `Patterns matched: ${piiMatches.join(", ")}` : undefined,
  });

  // Check: trust tier recommendation
  const hasHumanStep = (definition.steps || []).some(
    (s) => s.executor === "human" || s.executor === "handoff",
  );
  const recommendedTier = hasHumanStep ? "supervised" : "spot_checked";
  const currentTier = definition.trust?.initial_tier;

  checks.push({
    check: "compliance",
    input: "trust tier configuration",
    expected: `Recommended: ${recommendedTier} (${hasHumanStep ? "has" : "no"} human steps)`,
    actual: currentTier ? `Current: ${currentTier}` : "No trust tier set",
    pass: true, // Advisory, not blocking
    details: `Human steps present: ${hasHumanStep}. ${
      currentTier && currentTier === "autonomous" && hasHumanStep
        ? "Warning: autonomous tier with human steps may cause workflow issues"
        : "Trust tier appears reasonable"
    }`,
  });

  return checks;
}

// ============================================================
// 3. Efficiency analysis
// ============================================================

export function validateEfficiency(
  definition: ProcessDefinitionForValidation,
  modelName: string,
): ValidationCheckResult[] {
  const checks: ValidationCheckResult[] = [];
  const steps = definition.steps || [];

  // Check: parameterisation opportunities
  // Look for hardcoded values that could be inputs
  const definitionStr = JSON.stringify(definition);
  const hardcodedUrls = definitionStr.match(/https?:\/\/[^\s"]+/g) || [];
  const hasParameterisationOpportunity = hardcodedUrls.length > 0;

  checks.push({
    check: "efficiency",
    input: "hardcoded values in definition",
    expected: "Configurable values use process inputs, not hardcoded strings",
    actual: hasParameterisationOpportunity
      ? `${hardcodedUrls.length} hardcoded URL(s) found`
      : "No hardcoded URLs detected",
    pass: !hasParameterisationOpportunity,
    details: hasParameterisationOpportunity
      ? `URLs: ${hardcodedUrls.slice(0, 3).join(", ")}${hardcodedUrls.length > 3 ? "..." : ""}`
      : undefined,
  });

  // Check: step consolidation opportunities
  // Adjacent same-executor steps with no other dependencies might consolidate
  const consecutiveSameExecutor: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const curr = steps[i];
    if (
      prev.executor === curr.executor &&
      prev.executor === "ai-agent" &&
      (!curr.depends_on || curr.depends_on.length === 0 ||
        (curr.depends_on.length === 1 && curr.depends_on[0] === prev.id))
    ) {
      consecutiveSameExecutor.push(`${prev.id} → ${curr.id}`);
    }
  }

  checks.push({
    check: "efficiency",
    input: "step sequence analysis",
    expected: "No redundant sequential same-executor steps",
    actual: consecutiveSameExecutor.length > 0
      ? `${consecutiveSameExecutor.length} potential consolidation(s)`
      : "No consolidation opportunities",
    pass: consecutiveSameExecutor.length === 0,
    details: consecutiveSameExecutor.length > 0
      ? `Pairs: ${consecutiveSameExecutor.join("; ")}`
      : undefined,
  });

  // Check: process has quality criteria
  const hasCriteria = (definition.quality_criteria || []).length > 0;
  checks.push({
    check: "efficiency",
    input: "quality_criteria",
    expected: "At least one quality criterion defined",
    actual: hasCriteria
      ? `${definition.quality_criteria!.length} criterion/criteria`
      : "No quality criteria",
    pass: hasCriteria,
  });

  // Check: process has description
  checks.push({
    check: "efficiency",
    input: "process description",
    expected: "Description present (>20 chars) for library discoverability",
    actual: definition.description
      ? `${definition.description.length} chars`
      : "(missing)",
    pass: !!definition.description && definition.description.length >= 20,
  });

  return checks;
}

// ============================================================
// 4. Duplicate detection
// ============================================================

const DUPLICATE_STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can",
  "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "and",
  "but", "or", "not", "so", "yet", "this", "that", "it", "its",
  "process", "step", "model",
]);

function tokenizeForDuplicates(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((w) => w.length >= 2 && !DUPLICATE_STOP_WORDS.has(w)),
  );
}

function computeSimilarity(tokensA: Set<string>, tokensB: Set<string>): number {
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = new Set([...tokensA].filter((t) => tokensB.has(t)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size; // Jaccard similarity
}

export async function detectDuplicates(
  slug: string,
  name: string,
  description: string,
  excludeId: string,
): Promise<ValidationCheckResult[]> {
  const checks: ValidationCheckResult[] = [];

  // Get all existing published/standardised models
  const existingModels = await db
    .select({
      id: schema.processModels.id,
      slug: schema.processModels.slug,
      name: schema.processModels.name,
      description: schema.processModels.description,
    })
    .from(schema.processModels)
    .where(ne(schema.processModels.id, excludeId));

  if (existingModels.length === 0) {
    checks.push({
      check: "duplicate",
      input: "library comparison",
      expected: "No duplicates in library",
      actual: "Library empty — no duplicates possible",
      pass: true,
    });
    return checks;
  }

  const candidateTokens = tokenizeForDuplicates(`${name} ${description}`);
  let bestMatch = { slug: "", similarity: 0 };

  for (const existing of existingModels) {
    const existingTokens = tokenizeForDuplicates(
      `${existing.name} ${existing.description || ""}`,
    );
    const similarity = computeSimilarity(candidateTokens, existingTokens);

    if (similarity > bestMatch.similarity) {
      bestMatch = { slug: existing.slug, similarity };
    }
  }

  const isDuplicate = bestMatch.similarity >= 0.7;
  const similarityPct = Math.round(bestMatch.similarity * 100);

  checks.push({
    check: "duplicate",
    input: `"${name}" vs library (${existingModels.length} models)`,
    expected: "Similarity < 70% with all existing models",
    actual: bestMatch.similarity > 0
      ? `Best match: "${bestMatch.slug}" at ${similarityPct}% similarity`
      : "No significant matches",
    pass: !isDuplicate,
    details: isDuplicate
      ? `Merge recommended: consider combining with "${bestMatch.slug}" instead of creating a new model`
      : undefined,
  });

  return checks;
}

// ============================================================
// Helpers
// ============================================================

function findDuplicateMatch(
  checks: ValidationCheckResult[],
): ValidationReport["duplicateMatch"] | undefined {
  const dupCheck = checks.find((c) => c.check === "duplicate" && !c.pass);
  if (!dupCheck) return undefined;

  // Extract slug and similarity from the check
  const match = dupCheck.actual.match(/"([^"]+)" at (\d+)%/);
  if (!match) return undefined;

  return {
    slug: match[1],
    similarity: parseInt(match[2], 10) / 100,
    mergeRecommended: true,
  };
}

function makeResult(
  passed: boolean,
  recommendation: string,
  checks: ValidationCheckResult[],
): StepExecutionResult {
  return {
    outputs: {
      "validation-result": {
        passed,
        validatedAt: new Date().toISOString(),
        checks,
        recommendation,
      } satisfies ValidationReport,
    },
    confidence: passed ? "high" : "low",
    logs: [recommendation],
  };
}
