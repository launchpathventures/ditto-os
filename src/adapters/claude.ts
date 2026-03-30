/**
 * Ditto — Claude Adapter
 *
 * Executes AI agent steps using the Anthropic Claude API.
 * This is the primary AI adapter for Ditto.
 *
 * Follows the adapter pattern from Paperclip: invoke(), status(), cancel().
 * Each step gets a fresh context (ralph pattern) to avoid degradation.
 *
 * Tool use: Two categories of tools, merged at execution time:
 * 1. Codebase tools (read_file, search_files, list_files, write_file) — selected
 *    by step.config.tools ("read-only" | "read-write") or legacy input-type detection.
 * 2. Integration tools (Brief 025) — resolved by the harness memory-assembly handler
 *    from step.tools declarations. Dispatched via executeIntegrationTool().
 *
 * Provenance: Paperclip adapter pattern, Claude Code tool patterns, Brief 025 (Insight-065)
 */

import fs from "fs";
import nodePath from "path";
import type { ProcessDefinition, StepDefinition } from "../engine/process-loader";
import type { StepExecutionResult, ToolCallRecord } from "../engine/step-executor";
import { readOnlyTools, readWriteTools, execTools, toolDefinitions, executeTool, MAX_TOOL_CALLS } from "../engine/tools";
import {
  createCompletion,
  extractText,
  extractToolUse,
  type LlmMessage,
  type LlmToolDefinition,
  type LlmToolResultBlock,
} from "../engine/llm";
import { resolveModel } from "../engine/model-routing";
import type { ResolvedTools } from "../engine/tool-resolver";

/** Set of codebase tool names — used to dispatch to the right handler */
const CODEBASE_TOOL_NAMES = new Set(["read_file", "search_files", "list_files", "write_file", "run_command"]);

/**
 * Build a system prompt for an agent step based on its role and context.
 */
function buildSystemPrompt(
  step: StepDefinition,
  processDefinition: ProcessDefinition
): string {
  const role = step.agent_role || "general";

  const rolePrompts: Record<string, string> = {
    planner: `You are a senior software architect. Your job is to analyse a feature brief and produce a clear implementation plan.

Your plan must include:
- Architecture approach and rationale
- Files to create or modify (with specific paths)
- Key decisions and trade-offs
- Edge cases and risks to consider
- Step-by-step implementation order

You have tools to read files, search the codebase, and list directory contents. USE THEM to ground your plan in the actual codebase — reference real files, real patterns, real conventions. Do not guess at project structure.

Be specific and actionable. The builder agent will follow your plan exactly.`,

    builder: `You are a senior software engineer. Your job is to implement code changes according to a plan.

Follow the plan precisely. Write clean, typed, tested code.
Use existing patterns and conventions in the codebase.
Don't over-engineer — implement exactly what's needed.
If you encounter something the plan didn't anticipate, note it clearly.

You have tools to read files and search the codebase. Use them to understand existing code before writing new code.`,

    reviewer: `You are a senior code reviewer. Your job is to review code changes for quality, correctness, and convention compliance.

Check for:
- Convention compliance (does it follow project patterns?)
- Bugs and logic errors
- Security vulnerabilities (OWASP top 10)
- Missing edge cases
- Unnecessary complexity

Distinguish BLOCKING issues from suggestions.
Be specific — reference exact lines and explain WHY something is a problem.
Don't flag style preferences — only real issues.

You have tools to read and search the codebase. Use them to verify claims and check patterns.`,

    "convention-checker": `You are a convention checker. Your job is to verify code follows project conventions.

Check against the provided conventions document. Flag deviations with:
- What the convention says
- What the code does
- Where (exact file and line)

Only flag real deviations, not style preferences. Be precise.`,

    "bug-hunter": `You are an adversarial code reviewer. Your job is to find bugs.

Think like a QA engineer trying to break things:
- Race conditions and concurrency issues
- Null/undefined edge cases
- Off-by-one errors
- State management bugs
- Error handling gaps
- Incorrect assumptions about data

For each potential bug, explain:
- What could go wrong
- Under what conditions
- Severity (critical, high, medium, low)`,

    "security-reviewer": `You are a security reviewer. Check for:

- Injection vulnerabilities (SQL, XSS, command)
- Authentication/authorisation gaps
- Secrets in code
- Insecure data handling
- OWASP Top 10 issues

Flag with severity. Only flag real vulnerabilities, not theoretical risks.`,

    "lead-reviewer": `You are a lead reviewer synthesising multiple review passes.

You'll receive flags from convention checker, bug hunter, and security reviewer.
Your job:
- Deduplicate overlapping flags
- Prioritise by severity (blocking → high → medium → low)
- Produce a single annotated review
- Clearly separate BLOCKING issues from suggestions
- Provide an overall assessment: approve, request changes, or reject`,

    scout: `You are a codebase improvement scout. Your job is to identify opportunities to improve the codebase.

Look for:
- Outdated dependencies with important updates
- Patterns that could be simplified
- Repeated correction patterns (things humans keep fixing)
- New tools or approaches that could help
- Performance improvements

Be evidence-based. Every suggestion needs data supporting it.`,

    pm: `You are a project manager AI. Your job is to synthesise project state into actionable priorities.

Produce a daily brief that:
- Leads with top 3 priorities and WHY they're priorities
- Surfaces risks and blockers
- Shows what's in the review queue
- Notes process health (improving/degrading)
- Is scannable in under 60 seconds

Be specific and concise. No filler. Every sentence earns its place.`,

    debugger: `You are a senior debugger. Your job is to reproduce bugs, trace root causes, and propose minimal fixes.

Approach:
1. Reproduce the exact issue
2. Trace the execution path to find WHERE it breaks
3. Identify WHY it breaks (root cause, not symptom)
4. Propose the minimal fix that addresses the root cause
5. Flag any areas the fix might affect

Don't just patch symptoms. Find and fix the actual cause.`,
  };

  // Load role contract from file if configured, otherwise use hardcoded prompts
  let basePrompt: string;
  if (step.config?.role_contract) {
    try {
      const contractPath = nodePath.resolve(process.cwd(), step.config.role_contract as string);
      basePrompt = fs.readFileSync(contractPath, "utf-8");
    } catch {
      console.warn(`Role contract not found: ${step.config.role_contract}, using fallback`);
      basePrompt = rolePrompts[role] ||
        `You are an AI agent executing the "${step.name}" step of the "${processDefinition.name}" process.`;
    }
  } else {
    basePrompt = rolePrompts[role] ||
      `You are an AI agent executing the "${step.name}" step of the "${processDefinition.name}" process.`;
  }

  const context = `
Process: ${processDefinition.name}
Step: ${step.name}
Description: ${step.description || "No description"}

${step.verification ? `Verification criteria:\n${step.verification.map((v) => `- ${v}`).join("\n")}` : ""}
`;

  // Append confidence instruction so trust gate can use it
  const confidenceInstruction = `

End your response with a confidence assessment on a separate line:
CONFIDENCE: high | medium | low`;

  return `${basePrompt}\n\n---\n\n${context}${confidenceInstruction}`;
}

/**
 * Build the user message with the step's inputs.
 */
function buildUserMessage(
  step: StepDefinition,
  runInputs: Record<string, unknown>
): string {
  const parts: string[] = [];

  if (step.inputs) {
    for (const inputName of step.inputs) {
      const value = runInputs[inputName];
      if (value) {
        parts.push(`## ${inputName}\n\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);
      }
    }
  }

  if (parts.length === 0) {
    // Pass all inputs if no specific inputs are referenced
    parts.push(
      `## Inputs\n\n${JSON.stringify(runInputs, null, 2)}`
    );
  }

  return parts.join("\n\n---\n\n");
}

/**
 * Determine if a step needs codebase tools based on its declared inputs
 * resolved against the process definition's input declarations.
 *
 * AC5: Include tools when inputs include type: "repository" or
 * type: "document" with source: "file" or "git".
 */
function stepNeedsTools(
  step: StepDefinition,
  processDefinition: ProcessDefinition
): boolean {
  if (!step.inputs || !processDefinition.inputs) return false;

  for (const inputName of step.inputs) {
    const inputDef = processDefinition.inputs.find(
      (i) => i.name === inputName
    );
    if (!inputDef) continue;

    if (inputDef.type === "repository") return true;
    if (
      inputDef.type === "document" &&
      (inputDef.source === "file" || inputDef.source === "git")
    ) {
      return true;
    }
  }

  return false;
}

export const claudeAdapter = {
  /**
   * Execute an AI agent step using Claude.
   */
  async execute(
    step: StepDefinition,
    runInputs: Record<string, unknown>,
    processDefinition: ProcessDefinition,
    resolvedTools?: ResolvedTools,
  ): Promise<StepExecutionResult> {
    const systemPrompt = buildSystemPrompt(step, processDefinition);
    const userMessage = buildUserMessage(step, runInputs);

    // Determine which codebase tools to include:
    // 1. step.config.tools explicitly declares "read-only" or "read-write"
    // 2. Legacy: stepNeedsTools() checks input types for backward compatibility
    // 3. Default: no codebase tools
    const toolsConfig = step.config?.tools as string | undefined;
    let codebaseTools: LlmToolDefinition[] = [];
    if (toolsConfig === "read-write-exec") {
      codebaseTools = execTools;
    } else if (toolsConfig === "read-write") {
      codebaseTools = readWriteTools;
    } else if (toolsConfig === "read-only") {
      codebaseTools = readOnlyTools;
    } else if (stepNeedsTools(step, processDefinition)) {
      codebaseTools = readOnlyTools; // Legacy backward compatible
    }

    // Merge codebase tools with integration tools (Brief 025)
    const integrationToolDefs = resolvedTools?.tools ?? [];
    const allTools: LlmToolDefinition[] = [...codebaseTools, ...integrationToolDefs];
    const tools = allTools.length > 0 ? allTools : undefined;

    const model = resolveModel(step.config?.model_hint as string | undefined);
    console.log(`    Claude adapter: ${step.agent_role || "general"} agent`);
    console.log(`    Model: ${model}`);
    if (tools) {
      console.log(`    Tools: ${tools.map(t => t.name).join(", ")}`);
    }

    // Build initial messages
    const messages: LlmMessage[] = [
      { role: "user", content: userMessage },
    ];

    let totalTokens = 0;
    let totalCostCents = 0;
    let toolCallCount = 0;
    let finalText = "";
    let actualModel = model; // Will be updated with the actual model from API response
    const toolCallRecords: ToolCallRecord[] = [];

    // Tool use loop: call API, handle tool_use responses, repeat until text
    while (true) {
      const response = await createCompletion({
        model,
        system: systemPrompt,
        messages,
        ...(tools ? { tools } : {}),
      });

      totalTokens += response.tokensUsed;
      totalCostCents += response.costCents;
      actualModel = response.model;

      // Check if response contains tool use
      const toolUseBlocks = extractToolUse(response.content);

      // Extract any text from this response
      const text = extractText(response.content);
      if (text) {
        finalText += (finalText ? "\n\n" : "") + text;
      }

      // If no tool use or we've hit the limit, we're done
      if (
        toolUseBlocks.length === 0 ||
        response.stopReason === "end_turn" ||
        response.stopReason === "max_tokens"
      ) {
        break;
      }

      // Safety limit on tool calls
      if (toolCallCount + toolUseBlocks.length > MAX_TOOL_CALLS) {
        console.log(
          `    Tool call limit reached (${MAX_TOOL_CALLS}). Finishing.`
        );
        break;
      }

      // Execute tool calls and build tool results
      const toolResults: LlmToolResultBlock[] = [];

      for (const toolBlock of toolUseBlocks) {
        toolCallCount++;
        const toolInput = toolBlock.input as Record<string, unknown>;
        console.log(
          `    Tool [${toolCallCount}]: ${toolBlock.name}(${summariseToolInput(toolInput)})`
        );

        let result: string;

        if (CODEBASE_TOOL_NAMES.has(toolBlock.name)) {
          // Codebase tool — sync for read/write, async for run_command
          const toolResult = executeTool(toolBlock.name, toolInput);
          result = typeof toolResult === "string" ? toolResult : await toolResult;
        } else if (resolvedTools) {
          // Integration tool — async dispatch (Brief 025)
          result = await resolvedTools.executeIntegrationTool(toolBlock.name, toolInput);
          // Record integration tool call for logging on stepRuns
          toolCallRecords.push({
            name: toolBlock.name,
            args: toolInput,
            resultSummary: result.slice(0, 500),
            timestamp: Date.now(),
          });
        } else {
          result = `Unknown tool: ${toolBlock.name}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: result,
        });
      }

      // Append assistant response + tool results to conversation
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });

    }

    // Parse confidence from response text
    const confidenceMatch = finalText.match(/CONFIDENCE:\s*(high|medium|low)/i);
    const confidence = confidenceMatch
      ? (confidenceMatch[1].toLowerCase() as "high" | "medium" | "low")
      : "medium";

    // Determine output name from step definition
    const outputName = step.outputs?.[0] || "result";

    return {
      outputs: {
        [outputName]: finalText,
      },
      tokensUsed: totalTokens,
      costCents: totalCostCents,
      confidence,
      model: actualModel,
      toolCalls: toolCallRecords.length > 0 ? toolCallRecords : undefined,
      logs: [
        `Model: ${actualModel}`,
        `Tokens: ${totalTokens}`,
        `Tool calls: ${toolCallCount}`,
        ...(toolCallRecords.length > 0
          ? [`Integration tool calls: ${toolCallRecords.map((t) => t.name).join(", ")}`]
          : []),
        `Confidence: ${confidence}`,
        `Stop reason: complete`,
      ],
    };
  },

  /**
   * Check status of a running agent (for long-running tasks).
   */
  async status(): Promise<"idle" | "running" | "complete"> {
    // Claude API is synchronous per call — status is always idle or complete
    return "idle";
  },

  /**
   * Cancel a running agent.
   */
  async cancel(): Promise<void> {
    // Claude API calls are atomic — nothing to cancel
  },
};

/**
 * Summarise tool input for log output.
 */
function summariseToolInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const str = String(value);
    parts.push(`${key}=${str.length > 40 ? str.slice(0, 37) + "..." : str}`);
  }
  return parts.join(", ");
}
