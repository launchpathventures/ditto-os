/**
 * Ditto — The Conversational Self
 *
 * The outermost harness ring. Mediates between the human and the platform.
 * Assembles context, converses via LLM, delegates to dev pipeline roles,
 * mediates reviews, and persists sessions.
 *
 * The Self sits ABOVE the harness pipeline — it produces pipeline inputs,
 * not a handler in the pipeline. Delegated process steps go through the
 * harness normally.
 *
 * Provenance:
 * - Tiered context assembly: Letta core memory blocks (always-in-context identity + recall)
 * - Session lifecycle: LangGraph checkpointing (adapted for conversation state)
 * - Consultative framing: Insight-053 (listen → assess → ask → reflect → hand off)
 * - Delegation via tool_use: Anthropic SDK pattern (prevents prompt injection)
 * - ADR-016 (Conversational Self), Brief 030
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  createCompletion,
  extractText,
  extractToolUse,
  type LlmMessage,
  type LlmToolResultBlock,
} from "./llm";
import {
  loadWorkStateSummary,
  loadSelfMemories,
  loadSessionTurns,
  getOrCreateSession,
  appendSessionTurn,
  recordSelfDecision,
  detectSelfRedirect,
  recordSelfCorrection,
  type SessionTurn,
} from "./self-context";
import { selfTools, executeDelegation } from "./self-delegation";
import { getUserModelSummary } from "./user-model";
import { assembleBriefing } from "./briefing-assembler";

// ============================================================
// Constants
// ============================================================

/** Token budget for always-loaded Self context (~6K tokens) */
const SELF_CONTEXT_TOKEN_BUDGET = 6000;
const CHARS_PER_TOKEN = 4;

/** Maximum tool_use turns in a single conversation cycle (prevents runaway loops) */
const MAX_TOOL_TURNS = 10;

// ============================================================
// Context Assembly
// ============================================================

export interface SelfContext {
  systemPrompt: string;
  sessionId: string;
  resumed: boolean;
  previousSummary: string | null;
}

/**
 * Assemble the Self's operating context for a conversation turn.
 *
 * Loads and combines:
 * 1. Cognitive framework (cognitive/self.md) — core identity
 * 2. Self-scoped memories — user knowledge, preferences, corrections
 * 3. Work state summary — active runs, pending reviews, recent activity
 * 4. Session state — new/resumed, previous session summary if relevant
 *
 * Total always-loaded content fits within ~6K tokens.
 *
 * AC1: Returns structured system prompt with all context tiers.
 */
export async function assembleSelfContext(
  userId: string,
  surface: "cli" | "telegram" | "web",
): Promise<SelfContext> {
  // 1. Load cognitive framework
  let cognitiveFramework: string;
  try {
    cognitiveFramework = readFileSync(
      join(process.cwd(), "cognitive", "self.md"),
      "utf-8",
    );
  } catch {
    cognitiveFramework = "You are Ditto. A competent, persistent entity that helps work evolve.";
  }

  // 2. Load self-scoped memories (budget: ~1K tokens of the 6K total)
  const memories = await loadSelfMemories(userId, 1000);

  // 3. Load work state summary
  const workState = await loadWorkStateSummary();

  // 4. Get or create session
  const { sessionId, resumed, previousSummary } = await getOrCreateSession(
    userId,
    surface,
  );

  // Assemble system prompt within token budget
  const sections: string[] = [];

  // Core identity (always loaded, largest section)
  sections.push(cognitiveFramework);

  // User knowledge from self-scoped memories
  if (memories) {
    sections.push(`<memories>\n${memories}\n</memories>`);
  }

  // User model — structured understanding across 9 dimensions
  const userModelSummary = await getUserModelSummary(userId);
  if (userModelSummary) {
    sections.push(`<user_model>\n${userModelSummary}\n</user_model>`);
  }

  // Work state snapshot
  sections.push(
    `<work_state>\n${workState.details}\n</work_state>`,
  );

  // Delegation guidance — when to use tools vs respond directly
  sections.push(
    `<delegation_guidance>
You have tools to delegate work, manage processes, and help the user build their workspace.

**YOU ARE A WORKSPACE CONDUCTOR, NOT A CHATBOT.**
Your tools don't just return data — they shape the workspace the user is looking at. When you call generate_process(save=false), the right panel transforms into a live process builder showing the emerging structure. When you call get_briefing, the right panel shows a structured briefing. When start_dev_role produces substantial output, the workspace shifts to artifact mode. You must use tools deliberately to move the user from chat into structured experiences. Chat is the entry point, not the destination.

**WORKSPACE MODE TRANSITIONS — when to trigger them:**
Your primary job is recognising when the user's intent has a structural home and moving the workspace there:
- User describes a recurring need or workflow → generate_process(save=false) → process builder panel activates
- User asks about a process → get_process_detail → process context panel activates
- User returns after absence → get_briefing → briefing panel activates
- User requests substantial work → start_dev_role / start_pipeline → artifact mode or pipeline panel activates
Never describe structure in chat text when you can show it in the workspace. A process draft in the builder panel is worth ten messages of clarification.

**PROCESS CREATION — draft first, refine together:**
When you detect a process-worthy intent, call generate_process(save=false) EARLY — after at most 1-2 clarifying questions, not after a long conversation. Make reasonable assumptions. The draft activates the process builder panel and gives the user something concrete to react to.

Process-worthy signals:
- Recurring language: "every day", "each morning", "weekly", "whenever", "regularly", "routine"
- Automation desire: "can you handle", "help me with", "set up", "automate", "I need help with X"
- Pain + frequency: "I keep having to", "I always forget to", "it takes me X every time"
- Integration + schedule: "check my email", "post to Slack", "update the spreadsheet" + any temporal cue
- Workflow language: "steps", "workflow", "process", "first X then Y"

When you detect these signals:
1. Acknowledge briefly: "That's a process — let me draft it."
2. Call generate_process(save=false) with your best draft based on what they said. Gaps are OK — the draft surfaces them.
3. The process builder panel activates. Present a brief summary: "I've drafted this with [assumptions]. What would you change?"
4. Each refinement → re-call generate_process(save=false) with updated YAML. The panel updates live.
5. When the user approves → generate_process(save=true).

Do NOT have a 3-5 turn text conversation about what the process should be, then call generate_process at the end. Draft early, iterate through the tool.

**Delegation** (start_dev_role) spawns a full process run — expensive (~1-5 min). Use ONLY when the human is requesting actual work that needs a specific role's expertise.

**Consultation** (consult_role) is a quick perspective check — cheap (~10 sec, one LLM call). Use when you want a second opinion before committing to a direction.

**Workspace tools** — use these to help the user work:
- create_work_item: When the user describes something to be done
- generate_process: When defining a new process (preview first, then save). See PROCESS CREATION above.
- quick_capture: When the user drops a note or observation
- adjust_trust: When proposing trust tier changes (propose first, confirm, then apply)
- get_process_detail: When showing process status, trust data, recent runs
- connect_service: When an integration needs connecting
- update_user_model: When you learn something about the user

**Proactive tools** — use these to stay ahead:
- get_briefing: When user returns (new session) — deliver a contextual briefing proactively
- detect_risks: To check for operational signals (aging items, stale data, correction patterns)
- suggest_next: To offer 1-2 suggestions (coverage gaps, trust upgrades). NEVER during exceptions.

**Planning** (plan_with_role) engages a role for collaborative planning — document reading, analysis, structured output production. Richer than consultation (reads docs, multi-turn), lighter than delegation (no harness pipeline). Use for:
- Scoping new features or ideas ("I want to add X")
- Architecture discussions ("The auth approach isn't working")
- Roadmap/priority reviews ("What should we work on next?")
- Producing documents: briefs, ADRs, insights, roadmap updates
- Reading and analyzing project documents (roadmap.md, architecture.md, briefs)
Planning roles: PM (triage, priorities), Researcher (investigation), Designer (UX), Architect (design, briefs, ADRs). Architect can propose writes to docs/ — you present proposals to the user for approval before persisting.

**Pipeline** (start_pipeline) triggers the full dev pipeline end-to-end — PM → Researcher → Designer → Architect → Builder → Reviewer → Documenter. Runs asynchronously; you get a runId back immediately and progress arrives via SSE. Use when the user wants end-to-end execution: "Build Brief 050", "implement X", "ship this feature". Optional sessionTrust lets the user auto-approve certain roles (e.g., "auto-approve research").

**Intent routing — how to decide:**
- "I need help checking my emails each day" → **process creation** (generate_process — draft a daily email process)
- "Can you handle my invoicing?" → **process creation** (generate_process — draft an invoice process)
- "I want to add dark mode" → **planning** (scope first: plan_with_role with PM or Architect)
- "Build Brief 050" → **pipeline** (full pipeline: start_pipeline with task "Implement Brief 050")
- "Implement Brief 050" → **pipeline** (start_pipeline)
- "What should we work on next?" → **planning** (plan_with_role with PM to analyze roadmap)
- "The trust model needs rethinking" → **planning** (plan_with_role with Architect)
- "Run the tests" → **execution** (start_dev_role with Builder)
- "I had an idea about onboarding" → **planning** (explore with Designer or Architect)
- "Build Brief 050, auto-approve research and design" → **pipeline** with sessionTrust: { researcher: "spot_checked", designer: "spot_checked" }
When the user's intent is ambiguous, ask: "Are you describing a new feature, updating an existing plan, or refining scope?" Then route accordingly.

Do NOT delegate, plan, or consult for:
- Greetings, casual conversation, or check-ins
- Status questions (you already have work state above)
- Clarifying questions or consultative framing
- Anything you can answer from your loaded context

When the human's first message is casual, respond conversationally. Be the competent teammate — you don't need to call in a specialist to say good morning.

**CONFIRMATION MODEL — CRITICAL:**
These tools are IRREVERSIBLE and require explicit user confirmation before executing:
- adjust_trust with confirmed=true (always call with confirmed=false first to show evidence)
- generate_process with save=true (always preview first with save=false)
- connect_service action='guide' (shows credential input — user controls submission)
For these tools, always: (1) present what you intend to do, (2) show the evidence/preview, (3) wait for the user to explicitly say "yes", "go ahead", "do it", or similar. Never assume confirmation from ambiguous input.
</delegation_guidance>`,
  );

  // Onboarding and coaching guidance (Insight-093, AC9, AC10)
  sections.push(
    `<onboarding_guidance>
**For new users (empty user model):**
Drive a multi-session deep intake. First session: understand their problems and immediate tasks (enough to create their first process and deliver value). Subsequent sessions: deepen into vision, goals, challenges. Ask open questions, pick up signals, suggest where to start. Use update_user_model to store what you learn.

**For returning users:**
Continue building understanding. Notice gaps in the user model and naturally explore them in conversation.

**AI coaching (woven in, never a separate mode):**
When the user corrects your output, naturally teach: "When you tell me *why* you changed that, I learn faster."
When you notice learning accumulating: "You've taught me 4 things this week — here's what I know now."
When reviewing work: explain what knowledge you used and where it came from.
This builds trust through transparency and helps users become better AI collaborators.
</onboarding_guidance>`,
  );

  // Surface context
  sections.push(
    `<context>\nSurface: ${surface}\nSession: ${resumed ? "resumed" : "new"}\n</context>`,
  );

  // Previous session summary (if new session after suspension)
  if (previousSummary && !resumed) {
    sections.push(
      `<previous_session>\n${previousSummary}\n</previous_session>`,
    );
  }

  // Briefing readiness signal — when user returns, Self should proactively brief
  // AC11 (Brief 043): Self proactively delivers briefing on return
  if (!resumed) {
    try {
      const briefing = await assembleBriefing(userId);
      const hasBriefingContent =
        briefing.focus.length > 0 ||
        briefing.attention.length > 0 ||
        briefing.upcoming.length > 0 ||
        briefing.risks.length > 0 ||
        briefing.stats.completedSinceLastVisit > 0;

      if (hasBriefingContent) {
        sections.push(
          `<briefing_signal>
The user just returned (new session). You SHOULD proactively deliver a briefing using the get_briefing tool. Weave the briefing data into a natural narrative — focus on what matters most, mention aging items naturally, never say the word "risk". Adapt length: ${briefing.userFamiliarity === "new" ? "be detailed and welcoming" : briefing.userFamiliarity === "developing" ? "moderate detail" : "be terse — they know the drill"}.
</briefing_signal>`,
        );
      } else if (briefing.userFamiliarity === "new") {
        // AC11 (Brief 044): Self speaks first for new users
        sections.push(
          `<first_session_signal>
This is a brand new user with no work history. You MUST speak first — greet them warmly and start the onboarding conversation. Never present a blank input waiting for them. Follow the onboarding guidelines in your cognitive framework. Use update_user_model to store what you learn.
</first_session_signal>`,
        );
      }
    } catch {
      // Briefing assembly failure is non-critical — Self works without it
    }
  }

  // Budget check — truncate if over ~4K tokens
  let systemPrompt = sections.join("\n\n");
  const charBudget = SELF_CONTEXT_TOKEN_BUDGET * CHARS_PER_TOKEN;
  if (systemPrompt.length > charBudget) {
    // Truncate memories first (they're the most expendable)
    const withoutMemories = sections.filter((s) => !s.startsWith("<memories>"));
    systemPrompt = withoutMemories.join("\n\n");
    if (systemPrompt.length > charBudget) {
      systemPrompt = systemPrompt.slice(0, charBudget - 20) + "\n... (context truncated)";
    }
  }

  return { systemPrompt, sessionId, resumed, previousSummary };
}

// ============================================================
// Conversation Loop
// ============================================================

export interface SelfConverseResult {
  response: string;
  sessionId: string;
  delegationsExecuted: number;
  consultationsExecuted: number;
  costCents: number;
}

/**
 * Optional callbacks for intermediate events during conversation.
 * Allows the surface (e.g., Telegram bot) to provide real-time feedback
 * while the Self is processing — especially during long-running delegations.
 */
export interface SelfConverseCallbacks {
  /** Called when the LLM produces text before a delegation (e.g., "I'll hand this to the PM...") */
  onIntermediateText?: (text: string) => Promise<void>;
  /** Called just before a delegation tool executes */
  onDelegationStart?: (toolName: string, input: Record<string, unknown>) => Promise<void>;
}

/**
 * Process a human message through the Conversational Self.
 *
 * Flow:
 * 1. Assemble context (cognitive framework + memories + work state + session)
 * 2. Load session turns as conversation history
 * 3. Call LLM via createCompletion() with tool_use for delegation
 * 4. Handle tool_use calls (delegation to dev roles, review actions)
 * 5. Append turns to session
 * 6. Return synthesized response
 *
 * AC2: Full conversation cycle through the Self.
 * AC9: Uses createCompletion() from llm.ts, not claude -p.
 */
export async function selfConverse(
  userId: string,
  message: string,
  surface: "cli" | "telegram" | "web",
  callbacks?: SelfConverseCallbacks,
): Promise<SelfConverseResult> {
  // 1. Assemble context
  const context = await assembleSelfContext(userId, surface);

  // 2. Load session turns as conversation history
  const priorTurns = await loadSessionTurns(context.sessionId, 2000);

  // Build messages array from session history + new message
  const messages: LlmMessage[] = [];

  for (const turn of priorTurns) {
    messages.push({
      role: turn.role as "user" | "assistant",
      content: turn.content,
    });
  }

  // Add the new human message
  messages.push({ role: "user", content: message });

  // 3. Record user turn
  await appendSessionTurn(context.sessionId, {
    role: "user",
    content: message,
    timestamp: Date.now(),
    surface,
  });

  // 4. Conversation loop — handle tool_use calls
  let delegationsExecuted = 0;
  let consultationsExecuted = 0;
  let totalCostCents = 0;
  let finalResponse = "";

  // Track last delegated role for cross-turn redirect detection (Flag 2, Brief 034a).
  // Scan prior session turns for the most recent delegation to seed the tracker.
  let lastDelegatedRole: string | null = null;
  for (let i = priorTurns.length - 1; i >= 0; i--) {
    const turnContent = priorTurns[i].content;
    if (typeof turnContent === "string") {
      // Look for delegation results like "Role: pm\nStatus: ..."
      const roleMatch = turnContent.match(/^Role: (\w+)$/m);
      if (roleMatch && priorTurns[i].role === "assistant") {
        lastDelegatedRole = roleMatch[1];
        break;
      }
    }
  }

  // Cross-turn redirect: human's new message contradicts the previous delegation
  if (lastDelegatedRole) {
    const { isRedirect, mentionedRole } = detectSelfRedirect(message);
    if (isRedirect && mentionedRole) {
      await recordSelfCorrection(
        userId,
        lastDelegatedRole,
        mentionedRole,
        message.slice(0, 200),
      );
    }
  }

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const completion = await createCompletion({
      system: context.systemPrompt,
      messages,
      tools: selfTools,
      maxTokens: 4096,
    });

    totalCostCents += completion.costCents;

    // Extract text and tool_use blocks
    const textContent = extractText(completion.content);
    const toolUses = extractToolUse(completion.content);

    if (toolUses.length === 0) {
      // No tool calls — this is the final response (inline response)
      finalResponse = textContent;

      // Record inline response decision
      await recordSelfDecision({
        decisionType: "inline_response",
        details: { responseLength: textContent.length },
        costCents: completion.costCents,
      });
      break;
    }

    // There are tool calls — execute delegations
    // Send intermediate text to the surface immediately (before delegation runs)
    if (textContent && callbacks?.onIntermediateText) {
      await callbacks.onIntermediateText(textContent);
    }

    // First, add the assistant's response (with tool_use blocks) to messages
    messages.push({
      role: "assistant",
      content: completion.content,
    });

    // Execute each tool call and collect results
    const toolResults: LlmToolResultBlock[] = [];

    for (const toolUse of toolUses) {
      const input = toolUse.input as Record<string, unknown>;

      // Track consultations separately from delegations
      if (toolUse.name === "consult_role") {
        consultationsExecuted++;
      } else {
        delegationsExecuted++;
      }

      // Notify surface before delegation/consultation starts
      if (callbacks?.onDelegationStart) {
        await callbacks.onDelegationStart(toolUse.name, input);
      }

      const result = await executeDelegation(toolUse.name, input);

      // Record all Self decisions in one place (unified path)
      if (toolUse.name === "start_dev_role") {
        const role = input.role as string;

        // Detect Self-correction: delegating to a different role than last time
        if (lastDelegatedRole && role !== lastDelegatedRole) {
          const { isRedirect } = detectSelfRedirect(message);
          if (isRedirect) {
            await recordSelfCorrection(
              userId,
              lastDelegatedRole,
              role,
              (input.task as string).slice(0, 200),
            );
          }
        }

        lastDelegatedRole = role;

        await recordSelfDecision({
          decisionType: "delegation",
          details: { role, task: (input.task as string).slice(0, 200) },
          costCents: 0, // delegation cost tracked separately in the process run
        });
      } else if (toolUse.name === "consult_role") {
        await recordSelfDecision({
          decisionType: "consultation",
          details: {
            role: input.role,
            question: input.question,
            responseLength: result.output.length,
          },
          costCents: result.costCents ?? 0,
        });
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.output,
      });
    }

    // Add tool results as user message (Anthropic API convention)
    messages.push({
      role: "user",
      content: toolResults,
    });

    // Accumulate intermediate text for session recording
    // (already sent to user via callback if available)
    if (textContent) {
      finalResponse += textContent + "\n";
    }
  }

  // 5. Record assistant turn
  await appendSessionTurn(context.sessionId, {
    role: "assistant",
    content: finalResponse,
    timestamp: Date.now(),
    surface,
  });

  return {
    response: finalResponse,
    sessionId: context.sessionId,
    delegationsExecuted,
    consultationsExecuted,
    costCents: totalCostCents,
  };
}
