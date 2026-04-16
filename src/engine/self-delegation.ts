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
import { startProcessRun, fullHeartbeat, pauseGoal, goalHeartbeatLoop, startSystemAgentRun } from "./heartbeat";
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
import { handleEditProcess, handleProcessHistory, handleRollbackProcess } from "./self-tools/edit-process";
import { handleAssessConfidence } from "./self-tools/assess-confidence";
import { handleSearchKnowledge } from "./self-tools/search-knowledge";
import {
  handleActivateCycle,
  handlePauseCycle,
  handleResumeCycle,
  handleCycleBriefing,
  handleCycleStatus,
} from "./self-tools/cycle-tools";
import { handleBrowseWeb } from "./self-tools/browser-tools";
import { updateUserModel, type UserModelDimension, USER_MODEL_DIMENSIONS } from "./user-model";
import { setSessionTrust } from "./session-trust";
import { createMagicLink } from "./magic-link";
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
      "Delegate task to a dev role (PM, Researcher, Architect, Builder, etc). Full harness run with memory, trust, review.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: {
          type: "string",
          enum: VALID_ROLES as unknown as string[],
          description: "Dev role to delegate to",
        },
        task: {
          type: "string",
          description: "Task description",
        },
      },
      required: ["role", "task"],
    },
  },
  {
    name: "approve_review",
    description: "Approve a process run waiting for review.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "Process run ID",
        },
      },
      required: ["runId"],
    },
  },
  {
    name: "edit_review",
    description: "Provide feedback on a run waiting for review. Correction is recorded and applied.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "Process run ID",
        },
        feedback: {
          type: "string",
          description: "Feedback or correction",
        },
      },
      required: ["runId", "feedback"],
    },
  },
  {
    name: "reject_review",
    description: "Reject a process run waiting for review. Reason is recorded.",
    input_schema: {
      type: "object" as const,
      properties: {
        runId: {
          type: "string",
          description: "Process run ID",
        },
        reason: {
          type: "string",
          description: "Rejection reason",
        },
      },
      required: ["runId", "reason"],
    },
  },
  {
    name: "consult_role",
    description: "Quick perspective check with a dev role (~10 sec, no harness). For second opinions before deciding.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: {
          type: "string",
          enum: VALID_ROLES as unknown as string[],
          description: "Role to consult",
        },
        question: {
          type: "string",
          description: "Question for the role",
        },
        context: {
          type: "string",
          description: "Relevant context for the consultation",
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
    description: "Collaborative planning with a dev role. Reads docs, produces briefs/ADRs/insights. PM, Researcher, Designer, Architect only.",
    input_schema: {
      type: "object" as const,
      properties: {
        role: {
          type: "string",
          enum: ["pm", "researcher", "designer", "architect"],
          description: "Planning role (pm, researcher, designer, architect)",
        },
        objective: {
          type: "string",
          description: "Planning objective",
        },
        context: {
          type: "string",
          description: "Optional conversation context",
        },
        documents: {
          type: "array",
          items: { type: "string" },
          description: "Optional file paths to read",
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
    description: "Full dev pipeline (PM→Builder→Reviewer). Async — returns runId. For end-to-end execution requests.",
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
          description: "Per-role trust overrides. Values: 'spot_checked'. Cannot relax builder/reviewer.",
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
    description: "Create work item from natural language. Auto-classified as task/question/goal/insight/outcome.",
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "Work item description",
        },
        goalContext: {
          type: "string",
          description: "Optional goal context",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "pause_goal",
    description: "Pause a goal — halts child runs. Resumable via approve_review.",
    input_schema: {
      type: "object" as const,
      properties: {
        goalWorkItemId: {
          type: "string",
          description: "Goal work item ID",
        },
      },
      required: ["goalWorkItemId"],
    },
  },
  {
    name: "generate_process",
    description: "Generate process from description. save=false to preview, save=true after confirmation. IRREVERSIBLE when save=true.",
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
    description: "Capture a quick note or observation. Auto-classified as work item.",
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
    description: "Propose/apply trust tier change. confirmed=false for proposal, confirmed=true after user approval. IRREVERSIBLE.",
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
    description: "Get process details: steps, trust data, recent runs, correction rates, trend.",
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
    description: "Connect external service. check=list, guide=setup instructions, verify=check credentials.",
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
    description: "Store user insight across 9 dimensions (problems, tasks, work, challenges, communication, frustrations, vision, goals, concerns).",
    input_schema: {
      type: "object" as const,
      properties: {
        dimension: {
          type: "string",
          enum: USER_MODEL_DIMENSIONS as unknown as string[],
          description: "User model dimension",
        },
        content: {
          type: "string",
          description: "What you learned",
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
    description: "Contextual briefing: focus, attention, upcoming, signals, suggestions. Call proactively on user return.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "User ID",
        },
      },
      required: [],
    },
  },
  {
    name: "detect_risks",
    description: "Detect operational signals: aging items, data staleness, correction patterns. Weave naturally, never say 'risk'.",
    input_schema: {
      type: "object" as const,
      properties: {
        thresholds: {
          type: "object",
          description: "Optional threshold overrides",
        },
      },
      required: [],
    },
  },
  {
    name: "suggest_next",
    description: "Generate 1-2 suggestions from user model, coverage gaps, trust upgrades. Never during exceptions.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "User ID",
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
    description: "Adapt running process at runtime (run-scoped override). For onboarding industry-specific steps. Full definition required.",
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
  // Brief 164 — Process Editing & Versioning
  // ============================================================
  {
    name: "edit_process",
    description: "Permanently edit a process definition (all future runs). Stores previous version for rollback. Use ONLY after scope confirmation ('all future runs'). For 'just this run', use adapt_process instead.",
    input_schema: {
      type: "object" as const,
      properties: {
        processSlug: {
          type: "string",
          description: "Slug of the process to edit",
        },
        updatedDefinition: {
          type: "object",
          description: "Full updated process definition (same shape as YAML). Must include steps array.",
        },
        changeSummary: {
          type: "string",
          description: "Human-readable summary of what changed (shown to user)",
        },
      },
      required: ["processSlug", "updatedDefinition", "changeSummary"],
    },
  },
  {
    name: "process_history",
    description: "List version history for a process. Shows all prior versions with timestamps and change summaries.",
    input_schema: {
      type: "object" as const,
      properties: {
        processSlug: {
          type: "string",
          description: "Slug of the process to query",
        },
      },
      required: ["processSlug"],
    },
  },
  {
    name: "rollback_process",
    description: "Rollback a process to a prior version. Stores current version before restoring. IRREVERSIBLE — requires user confirmation.",
    input_schema: {
      type: "object" as const,
      properties: {
        processSlug: {
          type: "string",
          description: "Slug of the process to rollback",
        },
        targetVersion: {
          type: "number",
          description: "Version number to restore (must be less than current version)",
        },
      },
      required: ["processSlug", "targetVersion"],
    },
  },
  // ============================================================
  // Brief 068 — Confidence Assessment Tool
  // ============================================================
  {
    name: "assess_confidence",
    description: "Assess confidence after tool work. Final tool call only. Conservative: flag uncertainties. Skip for chat-only turns.",
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

  // Brief 079 — Knowledge Base Search
  // ============================================================
  {
    name: "search_knowledge",
    description: "Search knowledge base. Returns chunks with source citations. For factual grounding from ingested docs.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The search query — natural language question or keywords",
        },
        topK: {
          type: "number",
          description: "Number of results to return (default: 5)",
        },
      },
      required: ["query"],
    },
  },
  // ============================================================
  // Brief 118 — Operating Cycle Management Tools
  // ============================================================
  {
    name: "activate_cycle",
    description: "Start a continuous operating cycle (sales-marketing, network-connecting, relationship-nurture, gtm-pipeline). Asks config questions if incomplete.",
    input_schema: {
      type: "object" as const,
      properties: {
        cycleType: {
          type: "string",
          enum: ["sales-marketing", "network-connecting", "relationship-nurture", "gtm-pipeline"],
          description: "Which operating cycle to activate",
        },
        userId: {
          type: "string",
          description: "User ID (defaults to 'default')",
        },
        icp: {
          type: "string",
          description: "Ideal customer profile — who to target",
        },
        goals: {
          type: "string",
          description: "What the user wants to achieve",
        },
        channels: {
          type: "string",
          description: "Preferred channels (email, LinkedIn, etc.)",
        },
        boundaries: {
          type: "string",
          description: "Constraints — who not to contact, topics to avoid, etc.",
        },
        cadence: {
          type: "string",
          description: "How often to operate (e.g., 'daily on weekdays')",
        },
        continuous: {
          type: "boolean",
          description: "Run continuously (default: true). If false, runs once.",
        },
        gtmContext: {
          type: "object",
          description: "GTM pipeline context: planName (required), product, audience, differentiator, channels. Required for gtm-pipeline cycle type.",
          properties: {
            planName: { type: "string", description: "Unique name for this growth plan" },
            product: { type: "string", description: "What you're selling (plain language)" },
            audience: { type: "string", description: "Who it's for (what they say when frustrated)" },
            differentiator: { type: "string", description: "Why it's different (the moment they can't go back)" },
            channels: { type: "string", description: "Where the audience is (channels, communities)" },
          },
          required: ["planName"],
        },
      },
      required: ["cycleType"],
    },
  },
  {
    name: "pause_cycle",
    description: "Pause a running operating cycle. Stops all cycle operations until resumed. For gtm-pipeline, use planName to target a specific plan.",
    input_schema: {
      type: "object" as const,
      properties: {
        cycleType: {
          type: "string",
          enum: ["sales-marketing", "network-connecting", "relationship-nurture", "gtm-pipeline"],
          description: "Which cycle to pause",
        },
        planName: {
          type: "string",
          description: "Plan name to target (required for gtm-pipeline when multiple plans active)",
        },
      },
      required: ["cycleType"],
    },
  },
  {
    name: "resume_cycle",
    description: "Resume a paused operating cycle. For gtm-pipeline, use planName to target a specific plan.",
    input_schema: {
      type: "object" as const,
      properties: {
        cycleType: {
          type: "string",
          enum: ["sales-marketing", "network-connecting", "relationship-nurture", "gtm-pipeline"],
          description: "Which cycle to resume",
        },
        planName: {
          type: "string",
          description: "Plan name to target (required for gtm-pipeline when multiple plans active)",
        },
      },
      required: ["cycleType"],
    },
  },
  {
    name: "cycle_briefing",
    description: "Generate a standardised briefing for a cycle: context, summary, recommendations, options. The handoff format. For gtm-pipeline, use planName to target a specific plan.",
    input_schema: {
      type: "object" as const,
      properties: {
        cycleType: {
          type: "string",
          enum: ["sales-marketing", "network-connecting", "relationship-nurture", "gtm-pipeline"],
          description: "Which cycle to brief on",
        },
        planName: {
          type: "string",
          description: "Plan name to target a specific GTM plan",
        },
      },
      required: ["cycleType"],
    },
  },
  {
    name: "cycle_status",
    description: "Pipeline view: all active cycles, current phase per cycle, pending reviews, next scheduled runs.",
    input_schema: {
      type: "object" as const,
      properties: {
        userId: {
          type: "string",
          description: "User ID (optional)",
        },
      },
      required: [],
    },
  },
  // ============================================================
  // Brief 131 — Self Cognitive Orchestration
  // ============================================================
  {
    name: "orchestrate_work",
    description: "Spawn a thin process template with context. Selects the right template, injects context, starts it via the harness. Can adapt mid-flight via adapt_process.",
    input_schema: {
      type: "object" as const,
      properties: {
        goal: {
          type: "string",
          description: "What the work should accomplish",
        },
        detectedMode: {
          type: "string",
          enum: ["connecting", "selling", "chief-of-staff", "nurturing", "ghost"],
          description: "Cognitive mode guiding orchestration strategy",
        },
        templateSlug: {
          type: "string",
          description: "Process template slug to spawn (e.g., 'front-door-intake', 'follow-up-sequences', 'person-research')",
        },
        conversationContext: {
          type: "string",
          description: "Relevant conversation context to inject into the process",
        },
        userDetails: {
          type: "object",
          description: "User details relevant to this work (name, email, preferences)",
          additionalProperties: { type: "string" },
        },
      },
      required: ["goal", "detectedMode", "templateSlug"],
    },
  },
  {
    name: "generate_chat_link",
    description: "Generate a magic link for email-to-chat escalation. Creates a focused chat session pre-seeded with context. Use when a user's email request needs rich context gathering.",
    input_schema: {
      type: "object" as const,
      properties: {
        userEmail: {
          type: "string",
          description: "User's email address",
        },
        emailContext: {
          type: "string",
          description: "Summary of the email request to pre-seed the chat session",
        },
      },
      required: ["userEmail", "emailContext"],
    },
  },
  // ============================================================
  // Brief 134 — Browser Research Skill
  // ============================================================
  {
    name: "browse_web",
    description: "Browse a URL or search the web and extract structured data. READ-only — for research, profile viewing, data extraction. No form submission or message sending.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to navigate to (e.g., LinkedIn profile, company website)",
        },
        query: {
          type: "string",
          description: "Search query (used when no URL provided — searches via Google)",
        },
        extractionGoal: {
          type: "string",
          description: "What to extract from the page — natural language instruction (e.g., 'recent posts and activity')",
        },
        tokenBudget: {
          type: "number",
          description: "Max tokens for Stagehand AI calls (default: 500)",
        },
      },
      required: ["extractionGoal"],
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

    // Brief 074 — Goal Pause
    case "pause_goal":
      return await handlePauseGoal(toolInput.goalWorkItemId as string);

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

    // Brief 164 — Process Editing & Versioning
    case "edit_process":
      return await handleEditProcess({
        processSlug: toolInput.processSlug as string,
        updatedDefinition: toolInput.updatedDefinition as Record<string, unknown>,
        changeSummary: toolInput.changeSummary as string,
      });

    case "process_history":
      return await handleProcessHistory({
        processSlug: toolInput.processSlug as string,
      });

    case "rollback_process":
      return await handleRollbackProcess({
        processSlug: toolInput.processSlug as string,
        targetVersion: toolInput.targetVersion as number,
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

    // Brief 079 — Knowledge Base Search
    case "search_knowledge":
      return await handleSearchKnowledge({
        query: toolInput.query as string,
        topK: toolInput.topK as number | undefined,
      });

    // Brief 118 — Operating Cycle Management
    case "activate_cycle":
      return await handleActivateCycle({
        cycleType: toolInput.cycleType as string,
        userId: toolInput.userId as string | undefined,
        icp: toolInput.icp as string | undefined,
        goals: toolInput.goals as string | undefined,
        channels: toolInput.channels as string | undefined,
        boundaries: toolInput.boundaries as string | undefined,
        cadence: toolInput.cadence as string | undefined,
        continuous: toolInput.continuous as boolean | undefined,
        gtmContext: toolInput.gtmContext as { planName: string; product?: string; audience?: string; differentiator?: string; channels?: string } | undefined,
      });

    case "pause_cycle":
      return await handlePauseCycle({
        cycleType: toolInput.cycleType as string,
        planName: toolInput.planName as string | undefined,
      });

    case "resume_cycle":
      return await handleResumeCycle({
        cycleType: toolInput.cycleType as string,
        planName: toolInput.planName as string | undefined,
      });

    case "cycle_briefing":
      return await handleCycleBriefing({
        cycleType: toolInput.cycleType as string,
        planName: toolInput.planName as string | undefined,
      });

    case "cycle_status":
      return await handleCycleStatus({
        userId: toolInput.userId as string | undefined,
      });

    // Brief 131 — Self Cognitive Orchestration
    case "orchestrate_work":
      return await handleOrchestrateWork({
        goal: toolInput.goal as string,
        detectedMode: toolInput.detectedMode as string,
        templateSlug: toolInput.templateSlug as string,
        conversationContext: toolInput.conversationContext as string | undefined,
        userDetails: toolInput.userDetails as Record<string, string> | undefined,
      });

    case "generate_chat_link":
      return await handleGenerateChatLink({
        userEmail: toolInput.userEmail as string,
        emailContext: toolInput.emailContext as string | undefined,
      });

    // Brief 134 — Browser Research
    case "browse_web":
      return await handleBrowseWeb({
        url: toolInput.url as string | undefined,
        query: toolInput.query as string | undefined,
        extractionGoal: toolInput.extractionGoal as string,
        tokenBudget: toolInput.tokenBudget as number | undefined,
      });

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
    const { action, heartbeat: hb } = await approveRun(runId);

    // Brief 074: after approving, check if this run belongs to a goal's child task.
    // If so, trigger goalHeartbeatLoop to check for newly unblocked tasks.
    if (hb.status === "completed") {
      try {
        await checkAndResumeGoal(runId);
      } catch {
        // Non-critical: if goal resume check fails, don't break approval
      }
    }

    return {
      toolName: "approve_review",
      success: action.success,
      output: `${action.message} Pipeline status: ${hb.status}`,
    };
  } catch (err) {
    return {
      toolName: "approve_review",
      success: false,
      output: `Approve failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Check if a completed run belongs to a goal's child task, and if so,
 * trigger goalHeartbeatLoop to check for newly unblocked tasks.
 * Brief 074.
 */
async function checkAndResumeGoal(runId: string): Promise<void> {
  const { db: dbRef, schema: schemaRef } = await import("../db");

  // Find work items associated with this run
  const workItems = await dbRef
    .select()
    .from(schemaRef.workItems)
    .limit(50);

  for (const wi of workItems) {
    const execIds = (wi.executionIds as string[]) || [];
    if (execIds.includes(runId) && wi.spawnedFrom) {
      // This work item is a child of a goal — trigger goal heartbeat loop
      goalHeartbeatLoop(wi.spawnedFrom).catch((err: unknown) => {
        console.error(`Goal heartbeat resume failed for ${wi.spawnedFrom}:`, err);
      });
      break;
    }
  }
}

/**
 * Pause a goal — halts all active child runs, prevents new ones from starting.
 * Brief 074.
 */
async function handlePauseGoal(goalWorkItemId: string): Promise<DelegationResult> {
  try {
    await pauseGoal(goalWorkItemId);
    return {
      toolName: "pause_goal",
      success: true,
      output: `Goal ${goalWorkItemId} paused. All active child runs halted.`,
    };
  } catch (err) {
    return {
      toolName: "pause_goal",
      success: false,
      output: `Failed to pause goal: ${err instanceof Error ? err.message : String(err)}`,
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

// ============================================================
// Brief 131 — Self Cognitive Orchestration Handlers
// ============================================================

/**
 * Orchestrate work by spawning a thin process template with context.
 * The Self selects which template to spawn and injects relevant context.
 * Reuses startSystemAgentRun() for process spawning (ADR-027).
 */
async function handleOrchestrateWork(params: {
  goal: string;
  detectedMode: string;
  templateSlug: string;
  conversationContext?: string;
  userDetails?: Record<string, string>;
}): Promise<DelegationResult> {
  const { goal, detectedMode, templateSlug, conversationContext, userDetails } = params;

  try {
    const inputs: Record<string, unknown> = {
      goal,
      detectedMode,
      ...(conversationContext && { conversationContext }),
      ...(userDetails && { userDetails }),
    };

    const result = await startSystemAgentRun(templateSlug, inputs, "self");

    if (!result) {
      return {
        toolName: "orchestrate_work",
        success: false,
        output: `Process template not found: ${templateSlug}. Available templates include: front-door-intake, follow-up-sequences, person-research, selling-outreach, connecting-introduction, user-nurture-first-week, ghost-follow-up.`,
      };
    }

    return {
      toolName: "orchestrate_work",
      success: true,
      output: JSON.stringify({
        runId: result.processRunId,
        status: "spawned",
        templateSlug,
        detectedMode,
        goal: goal.slice(0, 200),
        stepsExecuted: result.stepsExecuted,
        runStatus: result.status,
        message: result.message,
      }),
      metadata: { runId: result.processRunId, templateSlug, detectedMode },
    };
  } catch (err) {
    return {
      toolName: "orchestrate_work",
      success: false,
      output: `Failed to orchestrate work: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Generate a magic link for email-to-chat escalation (Brief 131).
 *
 * Creates a chat session pre-seeded with context from the email request,
 * then generates a magic link URL. The Self includes this URL in its
 * email reply when it decides (cognitively) that the request needs
 * richer context gathering than email allows.
 */
async function handleGenerateChatLink(params: {
  userEmail: string;
  emailContext?: string;
}): Promise<DelegationResult> {
  const { userEmail, emailContext } = params;

  try {
    const { db: dbRef, schema: schemaRef } = await import("../db");
    const { randomUUID } = await import("crypto");

    // Create a new chat session pre-seeded with email context
    const sessionId = randomUUID();
    const initialMessages: Array<{ role: string; content: string }> = [];

    if (emailContext) {
      initialMessages.push({
        role: "system",
        content: `This chat session was started from an email conversation. Context: ${emailContext}`,
      });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await dbRef.insert(schemaRef.chatSessions).values({
      sessionId,
      messages: initialMessages,
      context: "escalated",
      ipHash: "email-escalation",
      messageCount: 0,
      authenticatedEmail: userEmail.toLowerCase(),
      expiresAt,
    });

    // Generate magic link for this session
    const magicLinkResult = await createMagicLink(userEmail.toLowerCase(), sessionId);

    if (!magicLinkResult) {
      return {
        toolName: "generate_chat_link",
        success: false,
        output: "Rate limited — too many magic links generated recently. Try again later.",
      };
    }

    return {
      toolName: "generate_chat_link",
      success: true,
      output: JSON.stringify({
        url: magicLinkResult.url,
        sessionId,
        expiresIn: "24 hours",
      }),
      metadata: { sessionId, url: magicLinkResult.url },
    };
  } catch (err) {
    return {
      toolName: "generate_chat_link",
      success: false,
      output: `Failed to generate chat link: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
