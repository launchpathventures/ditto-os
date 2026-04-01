/**
 * Ditto — Self Delegation (Tool Definitions + Handlers)
 *
 * Delegation tools for the Conversational Self. The Self delegates
 * to dev pipeline roles via structured tool_use — preventing prompt
 * injection from triggering process runs.
 *
 * Original 5 tools (Brief 030, ADR-016):
 * - start_dev_role → startProcessRun() + fullHeartbeat()
 * - consult_role → createCompletion() with role contract (Inline weight, Brief 034a)
 * - approve_review → approveRun()
 * - edit_review → editRun()
 * - reject_review → rejectRun()
 *
 * 6 new tools (Brief 040 — Self Extensions):
 * - create_work_item → workItems table + intake-classifier
 * - generate_process → process YAML generation + validation + DB save
 * - quick_capture → lightweight capture + auto-classify
 * - adjust_trust → trust state evidence + tier change (requires confirmation)
 * - get_process_detail → process detail with trust data + recent runs
 * - connect_service → integration auth guidance + credential vault
 *
 * Provenance: Anthropic SDK tool use pattern (Brief 030, ADR-016).
 * Consultation pattern: ADR-017 Inline weight class (Brief 034a, Insight-063).
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import type { LlmToolDefinition, LlmMessage, LlmToolResultBlock } from "./llm";
import { createCompletion, extractText, extractToolUse } from "./llm";
import { startProcessRun, fullHeartbeat } from "./heartbeat";
import { approveRun, editRun, rejectRun, getWaitingStepOutput } from "./review-actions";
import { readOnlyTools, executeTool } from "./tools";
import { recordSelfDecision } from "./self-context";
import { handleCreateWorkItem } from "./self-tools/create-work-item";
import { handleGenerateProcess } from "./self-tools/generate-process";
import { handleQuickCapture } from "./self-tools/quick-capture";
import { handleAdjustTrust } from "./self-tools/adjust-trust";
import { handleGetProcessDetail } from "./self-tools/get-process-detail";
import { handleConnectService } from "./self-tools/connect-service";
import { handleGetBriefing } from "./self-tools/get-briefing";
import { handleDetectRisks } from "./self-tools/detect-risks";
import { handleSuggestNext } from "./self-tools/suggest-next";
import { handleAdaptProcess } from "./self-tools/adapt-process";
import { handleAssessConfidence } from "./self-tools/assess-confidence";
import { updateUserModel, type UserModelDimension, USER_MODEL_DIMENSIONS } from "./user-model";
import { setSessionTrust } from "./session-trust";
import { loadProcessFile } from "./process-loader";
import { flattenSteps } from "./process-loader";

// ============================================================
// Tool Definitions (Ditto-native format)
// ============================================================

const VALID_ROLES = [
  "pm",
  "researcher",
  "designer",
  "architect",
  "builder",
  "reviewer",
  "documenter",
] as const;

export type DevRole = (typeof VALID_ROLES)[number];

export const selfTools: LlmToolDefinition[] = [
  {
    name: "start_dev_role",
    description:
      "Delegate a task to a dev pipeline role. The role runs through the full harness (memory, trust, review, feedback). Use this when the human's request requires a specific dev role — PM for triage, Researcher for investigation, Architect for design, Builder for implementation, etc. The role executes and returns its output for you to synthesize.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: {
          type: "string",
          enum: VALID_ROLES as unknown as string[],
          description: "Which dev role to delegate to",
        },
        task: {
          type: "string",
          description: "The task description for the role to execute",
        },
      },
      required: ["role", "task"],
    },
  },
  {
    name: "approve_review",
    description:
      "Approve a process run that is waiting for review. Use when the human confirms the output is acceptable.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "The process run ID to approve",
        },
      },
      required: ["runId"],
    },
  },
  {
    name: "edit_review",
    description:
      "Provide feedback on a process run that is waiting for review. The feedback is recorded and the run continues with the correction.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "The process run ID to edit",
        },
        feedback: {
          type: "string",
          description: "The feedback or correction to apply",
        },
      },
      required: ["runId", "feedback"],
    },
  },
  {
    name: "reject_review",
    description:
      "Reject a process run that is waiting for review. The rejection reason is recorded.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "The process run ID to reject",
        },
        reason: {
          type: "string",
          description: "Why the output is being rejected",
        },
      },
      required: ["runId", "reason"],
    },
  },
  {
    name: "consult_role",
    description:
      "Quick check with a dev role's perspective. NOT a full delegation — just a lightweight LLM call that thinks from that role's viewpoint. Use this when you want a second opinion before deciding: 'Does this architecture make sense?' 'Am I interpreting this triage correctly?' Returns the role's perspective in ~10 seconds. Much cheaper than delegation.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: {
          type: "string",
          enum: VALID_ROLES as unknown as string[],
          description: "Which role's perspective to consult",
        },
        question: {
          type: "string",
          description: "What you want the role's perspective on",
        },
        context: {
          type: "string",
          description:
            "Relevant context for the consultation (your current reasoning, the human's request, etc.)",
        },
      },
      required: ["role", "question"],
    },
  },
  // ============================================================
  // Brief 052 — Planning Workflow Tool
  // ============================================================
  {
    name: "plan_with_role",
    description:
      "Collaborative planning with a dev role's perspective. The role reads project documents, analyzes the situation, and produces structured output (briefs, ADRs, insights, roadmap analysis). Richer than consult_role (document access, multi-turn tool use) but lighter than start_dev_role (no harness pipeline). Planning roles only: PM, Researcher, Designer, Architect. The Architect can additionally propose writes to docs/ — proposed content returns to you for user confirmation before persisting. Use this for planning conversations: scoping features, reviewing architecture, prioritizing work, exploring ideas.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: {
          type: "string",
          enum: ["pm", "researcher", "designer", "architect"],
          description: "Which planning role to engage (pm, researcher, designer, architect only)",
        },
        objective: {
          type: "string",
          description: "What the planning conversation should achieve",
        },
        context: {
          type: "string",
          description: "Optional: relevant context from the conversation so far",
        },
        documents: {
          type: "array",
          items: { type: "string" },
          description: "Optional: file paths to read (e.g., 'docs/roadmap.md', 'docs/briefs/052-planning-workflow.md')",
        },
      },
      required: ["role", "objective"],
    },
  },
  // ============================================================
  // Brief 053 — Execution Pipeline Wiring
  // ============================================================
  {
    name: "start_pipeline",
    description:
      "Trigger the full dev pipeline for a task. Unlike start_dev_role (single role), this runs the full pipeline: PM → Researcher → Designer → Architect → Builder → Reviewer → Documenter. The pipeline runs asynchronously — you get back immediately with a runId and can track progress via SSE events. Use this when the human says 'Build Brief X', 'implement X', or otherwise requests end-to-end execution through the pipeline.",
    input_schema: {
      type: "object" as const,
      properties: {
        processSlug: {
          type: "string",
          description: "Process to run (default: 'dev-pipeline')",
        },
        task: {
          type: "string",
          description: "The work description — what the pipeline should accomplish",
        },
        sessionTrust: {
          type: "object",
          description:
            "Optional: per-role trust overrides for this run. Keys are role names, values must be 'spot_checked'. Cannot relax builder or reviewer (maker-checker). Example: { 'researcher': 'spot_checked', 'designer': 'spot_checked' }",
          additionalProperties: { type: "string", enum: ["spot_checked"] },
        },
      },
      required: ["task"],
    },
  },
  // ============================================================
  // Brief 040 — Self Extension Tools
  // ============================================================
  {
    name: "create_work_item",
    description:
      "Create a new work item from the user's natural language description. The item is auto-classified (task, question, goal, insight, outcome) via the intake classifier. Use when the user describes something they need done, a question they need answered, or a goal they want to achieve.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "Natural language description of the work item",
        },
        goalContext: {
          type: "string",
          description: "Optional: what goal this work serves",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "generate_process",
    description:
      "Generate a new process definition from a conversational description. First call with save=false to preview the YAML. Then call again with save=true after the user confirms. IRREVERSIBLE when save=true — always preview first and get user confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Human-readable process name (e.g., 'Quote Generation')",
        },
        description: {
          type: "string",
          description: "What this process does",
        },
        steps: {
          type: "array",
          description: "Array of step definitions",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Step identifier (kebab-case)" },
              name: { type: "string", description: "Human-readable step name" },
              executor: { type: "string", description: "ai-agent, human, script, or integration" },
              description: { type: "string" },
              instructions: { type: "string", description: "For human steps: what the user needs to do" },
            },
            required: ["id", "name", "executor"],
          },
        },
        trustTier: {
          type: "string",
          description: "Initial trust tier: supervised (default), spot_checked, autonomous, critical",
        },
        save: {
          type: "boolean",
          description: "false=preview YAML, true=save to database. Always preview first.",
        },
      },
      required: ["name", "description", "steps", "save"],
    },
  },
  {
    name: "quick_capture",
    description:
      "Capture a quick note, observation, or piece of information. Stores it as a work item and auto-classifies. Use when the user says 'remember that...', 'note that...', or drops a quick piece of context.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "The text to capture",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "adjust_trust",
    description:
      "Propose or apply a trust tier change for a process. IRREVERSIBLE — always call first with confirmed=false to get the proposal with evidence, present it to the user, and only call with confirmed=true after explicit user confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        processSlug: {
          type: "string",
          description: "Process slug to adjust trust for",
        },
        newTier: {
          type: "string",
          description: "Target trust tier: supervised, spot_checked, autonomous, critical",
        },
        reason: {
          type: "string",
          description: "Why this change is appropriate",
        },
        confirmed: {
          type: "boolean",
          description: "false=propose with evidence, true=apply after user confirms",
        },
      },
      required: ["processSlug", "newTier", "reason", "confirmed"],
    },
  },
  {
    name: "get_process_detail",
    description:
      "Get detailed information about a process: its steps, trust data, recent runs, correction rates, and trend. Returns structured data for inline rendering. Use when the user asks about a process or you need data to support a decision.",
    input_schema: {
      type: "object" as const,
      properties: {
        processSlug: {
          type: "string",
          description: "Process slug to get details for",
        },
      },
      required: ["processSlug"],
    },
  },
  {
    name: "connect_service",
    description:
      "Guide the user through connecting an external service (GitHub, Slack, etc.). Use action='check' to list available services, action='guide' to show setup instructions and trigger the secure credential input, action='verify' to check if credentials are stored.",
    input_schema: {
      type: "object" as const,
      properties: {
        service: {
          type: "string",
          description: "Service name from the integration registry",
        },
        processSlug: {
          type: "string",
          description: "Process that needs this service (for credential scoping)",
        },
        action: {
          type: "string",
          enum: ["check", "guide", "verify"],
          description: "check=list services, guide=setup instructions, verify=check credentials",
        },
      },
      required: ["service", "action"],
    },
  },
  {
    name: "update_user_model",
    description:
      "Store something you've learned about the user across one of 9 dimensions: problems, tasks, work, challenges, communication, frustrations, vision, goals, concerns. Populate progressively — prioritize problems and tasks first (immediate value), deepen into vision and goals across sessions. Call this whenever you learn something meaningful about who the user is and what they need.",
    input_schema: {
      type: "object" as const,
      properties: {
        dimension: {
          type: "string",
          enum: USER_MODEL_DIMENSIONS as unknown as string[],
          description: "Which dimension of understanding this fills",
        },
        content: {
          type: "string",
          description: "What you learned (concise, factual)",
        },
      },
      required: ["dimension", "content"],
    },
  },
  // ============================================================
  // Brief 043 — Proactive Engine Tools
  // ============================================================
  {
    name: "get_briefing",
    description:
      "Get a contextual briefing for the user. Assembles 5 dimensions: focus (what needs attention), attention (aging items), upcoming (predicted work), risk signals (woven naturally — NEVER use the word 'risk'), and suggestions. Call this proactively when a user returns after a session gap. Adapt briefing length: verbose for new users, terse for established users.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "User ID (defaults to 'default')",
        },
      },
      required: [],
    },
  },
  {
    name: "detect_risks",
    description:
      "Detect operational signals: temporal (aging items), data staleness (stale integration polls), correction patterns (high correction rates). Returns typed signals to weave into briefing. NEVER present these as 'risks' to the user — weave naturally into conversation.",
    input_schema: {
      type: "object" as const,
      properties: {
        thresholds: {
          type: "object",
          description: "Optional override thresholds (temporalInactiveDays, dataStalenessHours, correctionRateBaseline, correctionMinRuns)",
        },
      },
      required: [],
    },
  },
  {
    name: "suggest_next",
    description:
      "Generate 1-2 suggestions based on user model (9 dimensions), industry patterns (coverage gaps), and process maturity (trust upgrades). NEVER suggest during exceptions — fix those first. Suggestions are offered naturally, not as a list.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "User ID (defaults to 'default')",
        },
        hasExceptions: {
          type: "boolean",
          description: "If true, skip suggestions (exceptions active)",
        },
      },
      required: [],
    },
  },
  // ============================================================
  // Brief 044 — Onboarding Experience Tool
  // ============================================================
  {
    name: "adapt_process",
    description:
      "Adapt a running process definition at runtime. Writes a run-scoped override — the canonical template stays untouched. Use during onboarding to add industry-specific steps after learning about the user's business. Scoped to system processes only. Changes take effect on the next heartbeat iteration. ALWAYS provide the full adapted definition, not a diff.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "Process run ID to adapt",
        },
        adaptedDefinition: {
          type: "object",
          description: "Full adapted process definition (same shape as YAML). Must include steps array.",
        },
        reasoning: {
          type: "string",
          description: "Why this adaptation is being made (logged for audit)",
        },
        expectedVersion: {
          type: "number",
          description: "Expected version for optimistic locking (optional, prevents races)",
        },
      },
      required: ["runId", "adaptedDefinition", "reasoning"],
    },
  },
  // ============================================================
  // Brief 068 — Confidence Assessment Tool
  // ============================================================
  {
    name: "assess_confidence",
    description:
      "Assess your confidence in the current response after completing tool-assisted work. Call this as your FINAL tool call when you used other tools during this conversation turn. Be conservative — it's better to flag a minor uncertainty than to miss something the user should check. Do NOT call this for conversational responses where no tools were used.",
    input_schema: {
      type: "object" as const,
      properties: {
        level: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "high = all data current and complete. medium = some data stale or assumptions made. low = critical data missing or significant assumptions needed.",
        },
        summary: {
          type: "string",
          description: "Compact summary of what was checked, in outcome language the user understands (e.g., 'Checked pricing, project history, margins'). No file paths or tool names.",
        },
        checks: {
          type: "array",
          description: "What was verified — outcome-oriented labels (not file paths or tool names).",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "What was checked (e.g., 'Henderson project history')" },
              detail: { type: "string", description: "Brief result (e.g., '2 similar quotes found')" },
              category: { type: "string", description: "Source category: knowledge, files, code, web, processes, or other" },
            },
            required: ["label", "detail", "category"],
          },
        },
        uncertainties: {
          type: "array",
          description: "What the user should watch out for. Be specific and actionable. Flag anything that could affect the user's decision.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "What is uncertain (e.g., 'Q4 copper pricing unavailable')" },
              detail: { type: "string", description: "What the user should do about it (e.g., 'Used Q3 estimates — verify before sending')" },
              severity: { type: "string", enum: ["minor", "major"], description: "minor = informational caveat, major = could significantly affect the outcome" },
            },
            required: ["label", "detail", "severity"],
          },
        },
      },
      required: ["level", "summary", "checks", "uncertainties"],
    },
  },
];

// ============================================================
// Tool Handlers
// ============================================================

export interface DelegationResult {
  toolName: string;
  success: boolean;
  output: string;
  /** Cost of this tool call in cents (used for decision tracking). */
  costCents?: number;
  /** Structured metadata from the tool execution (e.g., runId, processId). */
  metadata?: Record<string, unknown>;
}

/**
 * Execute a delegation tool call. Maps tool_use blocks to engine functions.
 */
export async function executeDelegation(
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<DelegationResult> {
  switch (toolName) {
    case "start_dev_role":
      return await handleStartDevRole(
        toolInput.role as string,
        toolInput.task as string,
      );

    case "approve_review":
      return await handleApproveReview(toolInput.runId as string);

    case "edit_review":
      return await handleEditReview(
        toolInput.runId as string,
        toolInput.feedback as string,
      );

    case "reject_review":
      return await handleRejectReview(
        toolInput.runId as string,
        toolInput.reason as string,
      );

    case "consult_role":
      return await handleConsultRole(
        toolInput.role as string,
        toolInput.question as string,
        toolInput.context as string | undefined,
      );

    // Brief 052 — Planning Workflow
    case "plan_with_role":
      return await handlePlanWithRole({
        role: toolInput.role as string,
        objective: toolInput.objective as string,
        context: toolInput.context as string | undefined,
        documents: toolInput.documents as string[] | undefined,
      });

    // Brief 053 — Execution Pipeline Wiring
    case "start_pipeline":
      return await handleStartPipeline({
        processSlug: (toolInput.processSlug as string) ?? "dev-pipeline",
        task: toolInput.task as string,
        sessionTrust: toolInput.sessionTrust as Record<string, string> | undefined,
      });

    // Brief 040 — Self Extension Tools
    case "create_work_item":
      return await handleCreateWorkItem({
        content: toolInput.content as string,
        goalContext: toolInput.goalContext as string | undefined,
      });

    case "generate_process":
      return await handleGenerateProcess({
        name: toolInput.name as string,
        description: toolInput.description as string,
        steps: toolInput.steps as Array<{
          id: string;
          name: string;
          executor: string;
          description?: string;
          instructions?: string;
          config?: Record<string, unknown>;
          tools?: string[];
          input_fields?: Array<{ name: string; type: string; label?: string; required?: boolean }>;
        }>,
        trustTier: toolInput.trustTier as string | undefined,
        save: toolInput.save as boolean,
      });

    case "quick_capture":
      return await handleQuickCapture({
        text: toolInput.text as string,
      });

    case "adjust_trust":
      return await handleAdjustTrust({
        processSlug: toolInput.processSlug as string,
        newTier: toolInput.newTier as string,
        reason: toolInput.reason as string,
        confirmed: toolInput.confirmed as boolean,
      });

    case "get_process_detail":
      return await handleGetProcessDetail({
        processSlug: toolInput.processSlug as string,
      });

    case "connect_service":
      return await handleConnectService({
        service: toolInput.service as string,
        processSlug: toolInput.processSlug as string | undefined,
        action: toolInput.action as "check" | "guide" | "verify",
      });

    // Brief 043 — Proactive Engine Tools
    case "get_briefing":
      return await handleGetBriefing({
        userId: toolInput.userId as string | undefined,
      });

    case "detect_risks":
      return await handleDetectRisks({
        thresholds: toolInput.thresholds as Record<string, number> | undefined,
      });

    case "suggest_next":
      return await handleSuggestNext({
        userId: toolInput.userId as string | undefined,
        hasExceptions: toolInput.hasExceptions as boolean | undefined,
      });

    // Brief 044 — Onboarding Experience Tool
    case "adapt_process":
      return await handleAdaptProcess({
        runId: toolInput.runId as string,
        adaptedDefinition: toolInput.adaptedDefinition as Record<string, unknown>,
        reasoning: toolInput.reasoning as string,
        expectedVersion: toolInput.expectedVersion as number | undefined,
      });

    // Brief 068 — Confidence Assessment
    case "assess_confidence":
      return await handleAssessConfidence({
        level: toolInput.level as string,
        summary: toolInput.summary as string,
        checks: toolInput.checks as Array<{ label: string; detail: string; category: string }>,
        uncertainties: toolInput.uncertainties as Array<{ label: string; detail: string; severity: string }>,
      });

    case "update_user_model": {
      try {
        await updateUserModel(
          "default", // userId — matches the default in conversation
          toolInput.dimension as UserModelDimension,
          toolInput.content as string,
        );
        return {
          toolName: "update_user_model",
          success: true,
          output: `Stored: [${toolInput.dimension}] ${toolInput.content}`,
        };
      } catch (err) {
        return {
          toolName: "update_user_model",
          success: false,
          output: `Failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    default:
      return {
        toolName,
        success: false,
        output: `Unknown tool: ${toolName}`,
      };
  }
}

/**
 * Delegate to a dev pipeline role via the engine harness.
 */
async function handleStartDevRole(
  role: string,
  task: string,
): Promise<DelegationResult> {
  if (!VALID_ROLES.includes(role as DevRole)) {
    return {
      toolName: "start_dev_role",
      success: false,
      output: `Invalid role: ${role}. Valid roles: ${VALID_ROLES.join(", ")}`,
    };
  }

  const processSlug = `dev-${role}-standalone`;

  try {
    const runId = await startProcessRun(processSlug, { task }, "self");
    const result = await fullHeartbeat(runId);

    // Collect step outputs for synthesis
    let outputText = "";
    if (result.status === "waiting_review") {
      const stepOutput = await getWaitingStepOutput(runId);
      if (stepOutput) {
        outputText = stepOutput.outputText;
      }
    }

    return {
      toolName: "start_dev_role",
      success: true,
      output: outputText
        ? `Role: ${role}\nStatus: ${result.status}\nRun ID: ${runId}\n\n${outputText}`
        : `Role: ${role}\nStatus: ${result.status}\nRun ID: ${runId}\nSteps executed: ${result.stepsExecuted}\n${result.message}`,
      metadata: { runId, processSlug, role },
    };
  } catch (err) {
    return {
      toolName: "start_dev_role",
      success: false,
      output: `Failed to run ${role}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Trigger the full dev pipeline asynchronously (Brief 053).
 *
 * Calls startProcessRun(), then kicks off fullHeartbeat() in a detached
 * async context (non-blocking). Returns immediately with runId and step list.
 * Session trust overrides are validated and stored before the pipeline starts.
 */
async function handleStartPipeline(params: {
  processSlug: string;
  task: string;
  sessionTrust?: Record<string, string>;
}): Promise<DelegationResult> {
  const { processSlug, task, sessionTrust } = params;

  try {
    // Load process definition to get step names
    let stepNames: string[];
    try {
      const processDir = resolve(process.cwd(), "processes");
      const definition = loadProcessFile(resolve(processDir, `${processSlug}.yaml`));
      stepNames = flattenSteps(definition).map((s) => s.name);
    } catch {
      return {
        toolName: "start_pipeline",
        success: false,
        output: `Process not found: ${processSlug}. Check that processes/${processSlug}.yaml exists.`,
      };
    }

    // Start the process run
    const runId = await startProcessRun(processSlug, { task }, "self");

    // Set session trust overrides if provided
    let trustInfo = "";
    if (sessionTrust && Object.keys(sessionTrust).length > 0) {
      const { stored, errors } = setSessionTrust(runId, sessionTrust);
      if (Object.keys(stored).length > 0) {
        trustInfo = `\nSession trust overrides: ${Object.entries(stored).map(([r, t]) => `${r}=${t}`).join(", ")}`;
      }
      if (errors.length > 0) {
        trustInfo += `\nRejected overrides: ${errors.map((e) => `${e.role}: ${e.reason}`).join("; ")}`;
      }
    }

    // Kick off fullHeartbeat in a detached async context (non-blocking)
    setImmediate(() => {
      fullHeartbeat(runId).catch((err) => {
        console.error(`Pipeline ${runId} failed:`, err);
      });
    });

    const result: Record<string, unknown> = {
      runId,
      processSlug,
      status: "started",
      steps: stepNames,
    };

    // Include trust override feedback so the Self can inform the user
    if (trustInfo) {
      result.trustInfo = trustInfo;
    }

    return {
      toolName: "start_pipeline",
      success: true,
      output: JSON.stringify(result),
      metadata: { runId, processSlug, steps: stepNames },
    };
  } catch (err) {
    return {
      toolName: "start_pipeline",
      success: false,
      output: `Failed to start pipeline: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function handleApproveReview(runId: string): Promise<DelegationResult> {
  try {
    const { action, heartbeat } = await approveRun(runId);
    return {
      toolName: "approve_review",
      success: action.success,
      output: `${action.message} Pipeline status: ${heartbeat.status}`,
    };
  } catch (err) {
    return {
      toolName: "approve_review",
      success: false,
      output: `Approve failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function handleEditReview(
  runId: string,
  feedback: string,
): Promise<DelegationResult> {
  try {
    const { action, heartbeat } = await editRun(runId, feedback);
    let output = `${action.message} Pipeline status: ${heartbeat.status}`;
    if (action.correctionPattern) {
      output += ` (Pattern detected: "${action.correctionPattern.pattern}" — ${action.correctionPattern.count} times)`;
    }
    return {
      toolName: "edit_review",
      success: action.success,
      output,
    };
  } catch (err) {
    return {
      toolName: "edit_review",
      success: false,
      output: `Edit failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function handleRejectReview(
  runId: string,
  reason: string,
): Promise<DelegationResult> {
  try {
    const result = await rejectRun(runId, reason);
    return {
      toolName: "reject_review",
      success: result.success,
      output: result.message,
    };
  } catch (err) {
    return {
      toolName: "reject_review",
      success: false,
      output: `Reject failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Consult a dev role for a quick perspective check.
 * Inline weight (ADR-017) — no harness, no process run.
 * Loads the role contract and calls createCompletion() directly.
 *
 * Provenance: Role contract loading from src/adapters/claude.ts (Brief 031).
 * Consultation pattern: Insight-063 (two-loop metacognitive oversight).
 */
async function handleConsultRole(
  role: string,
  question: string,
  context?: string,
): Promise<DelegationResult> {
  if (!VALID_ROLES.includes(role as DevRole)) {
    return {
      toolName: "consult_role",
      success: false,
      output: `Invalid role: ${role}. Valid roles: ${VALID_ROLES.join(", ")}`,
    };
  }

  try {
    // Load role contract — same pattern as src/adapters/claude.ts lines 160-174
    let roleContract: string;
    try {
      const contractPath = resolve(
        process.cwd(),
        ".claude",
        "commands",
        `dev-${role}.md`,
      );
      roleContract = readFileSync(contractPath, "utf-8");
    } catch {
      roleContract = `You are a ${role} on a software development team.`;
    }

    // Build consultation system prompt — terse framing + role contract
    const systemPrompt = `${roleContract}

---

You are being consulted briefly by a teammate (Ditto's Conversational Self). They want your perspective on a question. Be concise and direct — this is a quick check, not a full analysis. Give your honest assessment in 2-5 sentences.`;

    const userContent = context
      ? `Question: ${question}\n\nContext: ${context}`
      : `Question: ${question}`;

    const completion = await createCompletion({
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      maxTokens: 1024,
    });

    const responseText = extractText(completion.content);

    return {
      toolName: "consult_role",
      success: true,
      output: `[${role} perspective]\n${responseText}`,
      costCents: completion.costCents,
    };
  } catch (err) {
    return {
      toolName: "consult_role",
      success: false,
      output: `Consultation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================
// Planning Workflow Handler (Brief 052)
// ============================================================

const PLANNING_ROLES = ["pm", "researcher", "designer", "architect"] as const;
type PlanningRole = (typeof PLANNING_ROLES)[number];

/** Max tool-use turns for document reading in plan_with_role */
const MAX_PLANNING_TOOL_TURNS = 5;

/**
 * Plan with a dev role — collaborative planning with document access.
 *
 * Richer than consult_role (document access, multi-turn tool use) but
 * lighter than start_dev_role (no harness pipeline, no process run).
 *
 * All planning roles get read-only codebase tools.
 * Architect additionally gets write_file restricted to docs/ paths.
 * Proposed writes return to the Self for user confirmation.
 *
 * Provenance: consult_role pattern (Brief 034a) + codebase tools (Brief 031).
 */
async function handlePlanWithRole(params: {
  role: string;
  objective: string;
  context?: string;
  documents?: string[];
}): Promise<DelegationResult> {
  const { role, objective, context, documents } = params;

  // AC4: Reject non-planning roles
  if (!PLANNING_ROLES.includes(role as PlanningRole)) {
    return {
      toolName: "plan_with_role",
      success: false,
      output: "Planning uses PM, Researcher, Designer, and Architect roles. For execution, use start_dev_role.",
    };
  }

  try {
    // Load role contract (same pattern as handleConsultRole)
    let roleContract: string;
    try {
      const contractPath = resolve(
        process.cwd(),
        ".claude",
        "commands",
        `dev-${role}.md`,
      );
      roleContract = readFileSync(contractPath, "utf-8");
    } catch {
      roleContract = `You are a ${role} on a software development team.`;
    }

    // AC2: Build planning tools — read-only for all, architect gets docs-restricted write
    const planningTools = [...readOnlyTools];

    // AC5: Architect gets write_file restricted to docs/ paths
    if (role === "architect") {
      planningTools.push({
        name: "write_file",
        description:
          "Propose content for a file within the docs/ directory. The proposed content will be reviewed by the user before being persisted. Path MUST start with 'docs/'.",
        input_schema: {
          type: "object" as const,
          properties: {
            path: {
              type: "string",
              description: "File path relative to project root (MUST be within docs/)",
            },
            content: {
              type: "string",
              description: "The full content to write to the file",
            },
          },
          required: ["path", "content"],
        },
      });
    }

    // Build planning system prompt
    const systemPrompt = `${roleContract}

---

You are being engaged for a **planning conversation** by Ditto's Conversational Self. Your job is to analyze, think through, and produce structured output for the objective below.

**Your tools:** You have read-only access to the codebase (read_file, search_files, list_files)${role === "architect" ? " and can propose writes to files within docs/ (write_file)" : ""}. Use these to read relevant documents, understand the current state, and ground your analysis in the actual codebase.

**Your output should be structured:**
- Lead with your analysis or recommendation
- Reference specific documents you read
- If producing a document (brief, ADR, insight), include the full content
- If proposing file writes, include the complete file content

${role === "architect" ? "**IMPORTANT:** When you use write_file, the content will be returned to the user for approval — it will NOT be persisted immediately. Propose writes only for paths within docs/." : ""}`;

    // Build user message with objective + context + requested documents
    const userParts: string[] = [`**Objective:** ${objective}`];
    if (context) {
      userParts.push(`\n**Context:** ${context}`);
    }
    if (documents && documents.length > 0) {
      userParts.push(`\n**Documents to review:** ${documents.join(", ")}`);
    }

    // AC3: Tool-use loop (up to MAX_PLANNING_TOOL_TURNS turns)
    const messages: LlmMessage[] = [
      { role: "user", content: userParts.join("\n") },
    ];

    let totalCostCents = 0;
    let finalOutput = "";
    const filesRead: string[] = [];
    const proposedWrites: Array<{ path: string; content: string }> = [];

    for (let turn = 0; turn < MAX_PLANNING_TOOL_TURNS; turn++) {
      const completion = await createCompletion({
        system: systemPrompt,
        messages,
        tools: planningTools,
        maxTokens: 4096,
      });

      totalCostCents += completion.costCents;

      const textContent = extractText(completion.content);
      const toolUses = extractToolUse(completion.content);

      if (toolUses.length === 0) {
        // Final response — no tool calls
        finalOutput = textContent;
        break;
      }

      // Add assistant message with tool_use blocks
      messages.push({ role: "assistant", content: completion.content });

      // Execute tool calls
      const toolResults: LlmToolResultBlock[] = [];

      for (const toolUse of toolUses) {
        const input = toolUse.input as Record<string, unknown>;
        let toolResult: string;

        if (toolUse.name === "write_file") {
          // AC5: Validate path is within docs/ (resolve to prevent traversal)
          const filePath = input.path as string;
          const resolvedWrite = resolve(process.cwd(), filePath);
          const docsDir = resolve(process.cwd(), "docs");
          if (!resolvedWrite.startsWith(docsDir + "/") && resolvedWrite !== docsDir) {
            toolResult = "Error: Planning write access is restricted to docs/ directory. Path must resolve to within docs/.";
          } else {
            // AC6: Don't persist — collect as proposed writes
            proposedWrites.push({
              path: filePath,
              content: input.content as string,
            });
            toolResult = `Proposed write to ${filePath} (${(input.content as string).split("\n").length} lines). This will be presented to the user for approval.`;
          }
        } else {
          // Read-only tools — execute normally
          const result = executeTool(toolUse.name, input as Parameters<typeof executeTool>[1]);
          toolResult = typeof result === "string" ? result : await result;

          // Track files read
          if (toolUse.name === "read_file" && input.path) {
            filesRead.push(input.path as string);
          }
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: toolResult,
        });
      }

      messages.push({ role: "user", content: toolResults });

      // If this was the last turn, extract text from what we have
      if (turn === MAX_PLANNING_TOOL_TURNS - 1) {
        finalOutput = textContent || "(Planning tool turn limit reached)";
      }
    }

    // AC12: Determine output type from content
    let outputType: "brief" | "adr" | "insight" | "task" | "update" | "analysis" = "analysis";
    const lowerOutput = finalOutput.toLowerCase();
    if (proposedWrites.some((w) => w.path.includes("briefs/"))) outputType = "brief";
    else if (proposedWrites.some((w) => w.path.includes("adrs/"))) outputType = "adr";
    else if (proposedWrites.some((w) => w.path.includes("insights/"))) outputType = "insight";
    else if (lowerOutput.includes("# brief") || lowerOutput.includes("## brief")) outputType = "brief";
    else if (lowerOutput.includes("# adr") || lowerOutput.includes("## decision")) outputType = "adr";
    else if (lowerOutput.includes("roadmap") && lowerOutput.includes("update")) outputType = "update";
    else if (lowerOutput.includes("task") && lowerOutput.includes("create")) outputType = "task";

    // AC7: Record planning decision
    await recordSelfDecision({
      decisionType: "planning",
      details: {
        role,
        objective: objective.slice(0, 200),
        outputType,
        filesRead,
        proposedWriteCount: proposedWrites.length,
      },
      costCents: totalCostCents,
    });

    return {
      toolName: "plan_with_role",
      success: true,
      output: finalOutput,
      costCents: totalCostCents,
      metadata: {
        role,
        outputType,
        filesRead,
        proposedWrites: proposedWrites.length > 0 ? proposedWrites : undefined,
      },
    };
  } catch (err) {
    return {
      toolName: "plan_with_role",
      success: false,
      output: `Planning failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
