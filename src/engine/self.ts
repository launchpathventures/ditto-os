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
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { getCognitiveCore } from "./cognitive-core";
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
import { getUserModelSummary, getUserModel } from "./user-model";
import { assembleBriefing } from "./briefing-assembler";
import {
  matchCapabilitiesWithSuppression,
  type CapabilityMatch,
} from "./capability-matcher";

// ============================================================
// Constants
// ============================================================

/** Token budget for always-loaded Self context (~7K tokens) */
const SELF_CONTEXT_TOKEN_BUDGET = 9000;
const CHARS_PER_TOKEN = 4;

/** Maximum tool_use turns in a single conversation cycle (prevents runaway loops) */
const MAX_TOOL_TURNS = 10;

/** Max chars for capability_awareness section (AC6: ≤1200 chars) */
const CAPABILITY_AWARENESS_CHAR_LIMIT = 1200;

/**
 * Track whether a capability signal has already fired in a session.
 * Module-level Map keyed by sessionId — follows session-trust.ts pattern.
 * Prevents repeated signals within a single session (AC9, AC10).
 * Pruned when exceeding 50 entries to prevent unbounded growth.
 */
const capabilitySignalFired = new Map<string, boolean>();

function pruneCapabilitySignalMap(): void {
  if (capabilitySignalFired.size > 50) {
    // Delete oldest entries (Map preserves insertion order)
    const toDelete = capabilitySignalFired.size - 50;
    let deleted = 0;
    for (const key of capabilitySignalFired.keys()) {
      if (deleted >= toDelete) break;
      capabilitySignalFired.delete(key);
      deleted++;
    }
  }
}

// ============================================================
// Context Assembly
// ============================================================

export interface SelfContext {
  systemPrompt: string;
  sessionId: string;
  resumed: boolean;
  previousSummary: string | null;
  /** Byte offset for Anthropic prompt cache breakpoint (end of static cognitive framework) */
  cacheBreakpointOffset?: number;
}

/**
 * Assemble the Self's operating context for a conversation turn.
 *
 * Loads and combines:
 * 1. Cognitive core (cognitive/core.md) — universal judgment layer
 * 2. Workspace extensions (cognitive/self.md) — workspace-specific context
 * 3. Self-scoped memories — user knowledge, preferences, corrections
 * 4. Work state summary — active runs, pending reviews, recent activity
 * 5. Session state — new/resumed, previous session summary if relevant
 *
 * Total always-loaded content fits within ~7K tokens.
 *
 * AC1: Returns structured system prompt with all context tiers.
 */
export async function assembleSelfContext(
  userId: string,
  surface: "cli" | "telegram" | "web" | "inbound",
): Promise<SelfContext> {
  // 1. Load cognitive core (universal judgment) + workspace extensions
  // Note: Prior to 099a, only self.md was loaded. self.md's own header says
  // "Core judgment (cognitive/core.md) is loaded separately and always present"
  // — this was a pre-existing gap. Now correctly loading both for all surfaces.
  let cognitiveFramework: string;
  try {
    const core = getCognitiveCore();
    const workspaceExtensions = readFileSync(
      join(process.cwd(), "cognitive", "self.md"),
      "utf-8",
    );
    cognitiveFramework = core + "\n\n" + workspaceExtensions;
  } catch {
    cognitiveFramework = getCognitiveCore();
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
  // Track length for cache breakpoint — cognitive framework is static across turns
  const cacheBreakpointOffset = cognitiveFramework.length;
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
  // Token efficiency (Insight-170): compact guidance for established users,
  // full guidance for new users. Inbound always uses async-specific compact guidance.
  const userModel = await getUserModel(userId);
  const isEstablished = userModel.completeness > 0.5;

  if (surface === "inbound") {
    sections.push(
      `<delegation_guidance>
Async inbound (email/voice). Be concise, actionable. No workspace UI references.
Tools work: create_work_item, start_pipeline, start_dev_role, get_briefing, update_user_model, quick_capture, generate_process, edit_process, process_history, rollback_process.
Bias action over questions — round-trips are expensive in async. Mention assumptions.
Process changes: ask "Just this run, or all future runs?" before editing. "this run" = adapt_process, "all future" = edit_process.
Irreversible actions (trust, process save, edit_process, rollback_process): describe plan, ask confirmation.
</delegation_guidance>`,
    );
  } else if (isEstablished) {
    // Compact delegation for established users (~150 tokens vs ~800) — Insight-170
    sections.push(
      `<delegation_guidance>
You are a workspace conductor. Tools shape the workspace — use them to move from chat into structured experiences.

**Tool routing:** Recurring need → generate_process(save=false). Substantial work → start_dev_role / start_pipeline. Quick question → consult_role. Planning → plan_with_role. Status → use loaded context. Casual → respond directly. Process change → scope confirmation first.
**Process creation:** Draft early with generate_process(save=false), iterate through the tool, save after confirmation. After save=true with activationHint, offer to run immediately via start_pipeline.
**Process editing:** When user wants to change a process, ask "Just this run, or all future runs?" → "this run" = adapt_process, "all future" = edit_process. process_history to view versions, rollback_process to restore.
**Delegation** = full harness run (~1-5 min). **Consultation** = quick perspective (~10 sec). **Planning** = doc reading + analysis. **Pipeline** = end-to-end (PM→Builder→Reviewer).
**Proactive:** get_briefing on return, detect_risks for signals, suggest_next for coverage gaps (never during exceptions).
**Confirmation required:** adjust_trust(confirmed=true), generate_process(save=true), edit_process, rollback_process, connect_service(action='guide') — always preview first, get explicit "yes".
</delegation_guidance>`,
    );
  } else {
    // Full delegation guidance for new users learning the workspace
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

**POST-CREATION ACTIVATION:** When generate_process(save=true) succeeds and the result includes activationHint: true, immediately offer to run the process. Say something like "Created. Want me to run this now?" and if the user confirms, call start_pipeline with the processSlug from the result. If there's pending work that matches the new process (e.g., a work item or task the user mentioned), mention it: "Want me to run this with your [pending item]?" This ensures every process creation leads to either immediate execution or a clear activation prompt.

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
- "Skip the follow-up step in my quoting process" → **scope confirmation** → ask "Just this run, or all future runs?" → "this run" routes to adapt_process, "all future" routes to edit_process
- "Change my process to add a review step" → **scope confirmation** → ask "Just this run, or all future runs?" → then edit_process or adapt_process
- "Show me the history of my quoting process" → **process query** (process_history — no confirmation needed)
- "Roll back my quoting process to v2" → **rollback** (rollback_process — requires user confirmation)
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

**SCOPE CONFIRMATION — PROCESS EDITS (Brief 164):**
When a user wants to change a process definition, ALWAYS ask: "Just this run, or all future runs?"
- "Just this run" → use adapt_process (run-scoped override, requires a runId)
- "All future runs" → use edit_process (permanent, stores version history)
Do NOT apply a permanent edit without scope confirmation. If no run is active, default to edit_process but still confirm.

**CONFIRMATION MODEL — CRITICAL:**
These tools are IRREVERSIBLE and require explicit user confirmation before executing:
- adjust_trust with confirmed=true (always call with confirmed=false first to show evidence)
- generate_process with save=true (always preview first with save=false)
- edit_process (always show proposed changes and get confirmation before calling)
- rollback_process (always show version history first, confirm target version)
- connect_service action='guide' (shows credential input — user controls submission)
For these tools, always: (1) present what you intend to do, (2) show the evidence/preview, (3) wait for the user to explicitly say "yes", "go ahead", "do it", or similar. Never assume confirmation from ambiguous input.
</delegation_guidance>`,
    );
  }

  // Onboarding and coaching guidance (Insight-093, AC9, AC10)
  // Token efficiency (Insight-170): skip for established users (completeness > 0.5)
  if (!isEstablished) {
    sections.push(
      `<onboarding_guidance>
**For new users (empty user model):**
Drive a multi-session deep intake. First session: understand their problems and immediate tasks (enough to create their first process and deliver value). Subsequent sessions: deepen into vision, goals, challenges. Ask open questions, pick up signals, suggest where to start. Use update_user_model to store what you learn.

**First process creation (MP-2.3):**
When proposing the user's first process, use generate_process(save=false) to preview it. Pre-fill the description with frontdoor context (business type, pain point) so template matching finds the best library match. Present the preview and wait for explicit approval. On approval, call generate_process(save=true) to persist. Then use create_work_item to submit the first task and let the pipeline run — ProgressBlock will appear in real-time via SSE.

**For returning users:**
Continue building understanding. Notice gaps in the user model and naturally explore them in conversation.

**AI coaching (woven in, never a separate mode):**
When the user corrects your output, naturally teach: "When you tell me *why* you changed that, I learn faster."
When you notice learning accumulating: "You've taught me 4 things this week — here's what I know now."
When reviewing work: explain what knowledge you used and where it came from.
This builds trust through transparency and helps users become better AI collaborators.
</onboarding_guidance>`,
    );
  }

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

  // ============================================================
  // Capability Awareness (Brief 167, AC6-10)
  // ============================================================
  // Conditionally loaded: omit for inbound surface, first-session-signal path,
  // no user model, or when matcher returns empty. If matcher throws, silently omit.
  const isFirstSession = sections.some((s) => s.startsWith("<first_session_signal>"));
  if (surface !== "inbound" && !isFirstSession && userModel.entries.length > 0) {
    try {
      const { matches: capMatches, activeProcesses: activeProcs } =
        await matchCapabilitiesWithSuppression(userId, userModel.entries);

      if (capMatches.length > 0) {
        // AC6: Build <capability_awareness> section (≤1200 chars)
        const awarenessSection = buildCapabilityAwarenessSection(capMatches, activeProcs);
        if (awarenessSection.length <= CAPABILITY_AWARENESS_CHAR_LIMIT) {
          sections.push(awarenessSection);
        }

        // Trigger signals — max once per session (AC9/AC10 share flag)
        pruneCapabilitySignalMap();
        const signalAlreadyFired = capabilitySignalFired.get(sessionId) ?? false;

        if (!signalAlreadyFired) {
          const signal = await detectCapabilitySignal(
            userId,
            sessionId,
            resumed,
            capMatches,
          );
          if (signal) {
            sections.push(signal);
            capabilitySignalFired.set(sessionId, true);
          }
        }
      }
    } catch {
      // Capability matching failure is non-fatal — silently omit section
    }
  }

  // Budget check — truncate if over token budget
  // Priority order for dropping (Insight-170): onboarding → delegation → memories (most valuable last)
  let systemPrompt = sections.join("\n\n");
  const charBudget = SELF_CONTEXT_TOKEN_BUDGET * CHARS_PER_TOKEN;
  if (systemPrompt.length > charBudget) {
    // Drop onboarding guidance first (least valuable for established users)
    let filtered = sections.filter((s) => !s.startsWith("<onboarding_guidance>"));
    systemPrompt = filtered.join("\n\n");
    if (systemPrompt.length > charBudget) {
      // Drop capability awareness next (helpful but not critical)
      filtered = filtered.filter((s) => !s.startsWith("<capability_awareness>") && !s.startsWith("<capability_signal"));
      systemPrompt = filtered.join("\n\n");
    }
    if (systemPrompt.length > charBudget) {
      // Drop delegation guidance next
      filtered = filtered.filter((s) => !s.startsWith("<delegation_guidance>"));
      systemPrompt = filtered.join("\n\n");
    }
    if (systemPrompt.length > charBudget) {
      // Drop memories last (personalization is high value)
      filtered = filtered.filter((s) => !s.startsWith("<memories>"));
      systemPrompt = filtered.join("\n\n");
    }
    if (systemPrompt.length > charBudget) {
      const truncSuffix = "\n... (context truncated)";
      systemPrompt = systemPrompt.slice(0, charBudget - truncSuffix.length) + truncSuffix;
    }
  }

  return { systemPrompt, sessionId, resumed, previousSummary, cacheBreakpointOffset };
}

// ============================================================
// Capability Awareness Helpers (Brief 167)
// ============================================================

/**
 * Build the <capability_awareness> section for Self context.
 * Lists active processes by category + top 3 unmatched capabilities. (AC6)
 */
function buildCapabilityAwarenessSection(
  matches: CapabilityMatch[],
  activeProcesses: Array<{ name: string; slug: string }>,
): string {
  // Active processes summary
  const activeList = activeProcesses.length > 0
    ? `Active (${activeProcesses.length}): ${activeProcesses.map((p) => p.name).join(", ")}`
    : "No active processes yet.";

  // Top 3 unmatched capabilities
  const top3 = matches.slice(0, 3);
  const lines = top3.map(
    (m) => `- ${m.templateName}: "${m.matchReason}"`,
  );

  return `<capability_awareness>
${activeList}
Unmatched capabilities for this user:
${lines.join("\n")}
Reference these naturally using observe→connect→offer. Use the user's own words. Max 1-2 mentions per conversation. Heavier first 2 weeks, lighter once 4+ processes active. Never as a list. Never during exceptions.
</capability_awareness>`;
}

/**
 * Detect which capability signal to inject, if any. (AC7-10)
 * Returns the signal XML string, or null if no signal applies.
 *
 * AC9/AC10 check session turns for tool_name as specified in the brief.
 * Tool names are recorded on SessionTurn.toolNames during selfConverse().
 */
async function detectCapabilitySignal(
  userId: string,
  sessionId: string,
  resumed: boolean,
  matches: CapabilityMatch[],
): Promise<string | null> {
  // Load session turns once — used by AC9 and AC10 for tool_name detection
  const sessionTurns = await loadSessionTurnsRaw(sessionId);
  // AC7: Post-onboarding — first process created recently (within 24h)
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Single query: load active processes with createdAt to check both recency and count
    const allActiveProcesses = await db
      .select({ id: schema.processes.id, createdAt: schema.processes.createdAt })
      .from(schema.processes)
      .where(eq(schema.processes.status, "active"));

    const hasRecentProcess = allActiveProcesses.some(
      (p) => (p.createdAt instanceof Date ? p.createdAt : new Date(Number(p.createdAt))) >= oneDayAgo,
    );

    if (hasRecentProcess && allActiveProcesses.length <= 2) {
      const top3 = matches.slice(0, 3);
      const slugList = top3.map((m) => `${m.templateSlug}: "${m.matchReason}"`).join("; ");
      return `<capability_signal type="post_onboarding">
First process was recently created. Present matched capabilities as a package:
${slugList}
Use TextBlock header + RecordBlock per capability (status: { label: "Recommended", variant: "info" }) + ActionBlock for "Set up [top match]". Compose from existing block types.
</capability_signal>`;
    }
  } catch {
    // Non-fatal
  }

  // AC8: Post-trust-upgrade — pending trust milestones
  try {
    const pendingMilestones = await db
      .select({
        id: schema.trustSuggestions.id,
        processId: schema.trustSuggestions.processId,
      })
      .from(schema.trustSuggestions)
      .where(eq(schema.trustSuggestions.status, "pending"))
      .limit(1);

    if (pendingMilestones.length > 0) {
      // A process is graduating — suggest expansion
      const topMatch = matches[0];
      if (topMatch) {
        return `<capability_signal type="post_trust_upgrade">
A process just graduated to a higher trust tier, freeing review capacity.
Suggest expansion: ${topMatch.templateName} — "${topMatch.matchReason}".
Mention BELOW the trust celebration. One line: "Now that [process] runs itself, I can take on [capability]."
</capability_signal>`;
      }
    }
  } catch {
    // Non-fatal
  }

  // AC9: New-context-learned -- check session turns for update_user_model tool call
  const hasUserModelUpdate = sessionTurns.some(
    (t) => t.toolNames?.includes("update_user_model"),
  );
  if (hasUserModelUpdate) {
    const allSlugs = matches.map((m) => `${m.templateSlug}: "${m.matchReason}"`).join("; ");
    return `<capability_signal type="new_context">
User model was updated this session. Current matches: ${allSlugs}
Naturally mention the most relevant one: "You mentioned [X] — I can handle that." Max one mention.
</capability_signal>`;
  }

  // AC10: Post-approval -- check session turns for approve_review tool call
  const hasApproval = sessionTurns.some(
    (t) => t.toolNames?.includes("approve_review"),
  );
  if (hasApproval) {
    const topMatch = matches[0];
    if (topMatch) {
      return `<capability_signal type="post_approval">
A review was approved this session. As a P.S., mention: ${topMatch.templateName} — "${topMatch.matchReason}".
One sentence max. "While I have you —" tone. Don't steal the approval moment.
</capability_signal>`;
    }
  }

  return null;
}

/**
 * Load raw session turns (untruncated) for signal detection.
 * Unlike loadSessionTurns which applies token budgeting, this returns
 * all turns to check toolNames across the full session.
 */
async function loadSessionTurnsRaw(
  sessionId: string,
): Promise<Array<{ role: string; content: string; toolNames?: string[] }>> {
  const [session] = await db
    .select({ turns: schema.sessions.turns })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);

  if (!session?.turns) return [];
  return session.turns as Array<{ role: string; content: string; toolNames?: string[] }>;
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
/** Options for selfConverse — surface-specific capabilities. */
export interface SelfConverseOptions {
  /** When true, the Self can offer chat escalation via generate_chat_link (Brief 131). */
  chatEscalationAvailable?: boolean;
  /** User's email address — needed for magic link generation during chat escalation. */
  userEmail?: string;
  /**
   * Email thread context for reply-aware responses (Brief 161 — MP-6.2).
   * When present, injected into system prompt so Self can reference the
   * original outreach and prior thread naturally.
   */
  threadContext?: {
    originalSubject: string | null;
    originalBody: string | null;
    priorReplies: Array<{ summary: string; createdAt: Date }>;
  };
}

export async function selfConverse(
  userId: string,
  message: string,
  surface: "cli" | "telegram" | "web" | "inbound",
  callbacks?: SelfConverseCallbacks,
  options?: SelfConverseOptions,
): Promise<SelfConverseResult> {
  // 1. Assemble context
  const context = await assembleSelfContext(userId, surface);

  // Brief 131: Inject chat escalation context for inbound surface
  if (options?.chatEscalationAvailable && surface === "inbound") {
    context.systemPrompt += `\n\n<chat_escalation>
You can offer email-to-chat escalation. When the user's request is complex and would benefit from a focused back-and-forth conversation (multiple clarifying questions, rich context gathering), use the generate_chat_link tool to create a magic link. Include it naturally in your reply: "I'd love to help with that — let me ask a few questions. [Continue in chat →](url)". This is YOUR judgment call based on request complexity — simple requests should be handled inline in email.${options.userEmail ? `\nUser email: ${options.userEmail}` : ""}
</chat_escalation>`;
  }

  // Brief 161 (MP-6.2): Inject email thread context so Self can reference
  // the original outreach and prior conversation naturally.
  if (options?.threadContext) {
    const tc = options.threadContext;
    let threadBlock = "\n\n<email_thread_context>\nYou are replying in an existing email thread. Reference the original outreach naturally — don't repeat the intro.";
    if (tc.originalSubject) {
      threadBlock += `\nOriginal subject: ${tc.originalSubject}`;
    }
    if (tc.originalBody) {
      threadBlock += `\nOriginal outreach:\n${tc.originalBody}`;
    }
    if (tc.priorReplies.length > 0) {
      threadBlock += "\nPrior replies in thread:";
      for (const reply of tc.priorReplies) {
        threadBlock += `\n- [${reply.createdAt.toISOString().slice(0, 10)}] ${reply.summary}`;
      }
    }
    threadBlock += "\n</email_thread_context>";
    context.systemPrompt += threadBlock;
  }

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
  /** Tool names invoked this turn — recorded on session turn for signal detection (Brief 167) */
  const invokedToolNames: string[] = [];

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
      purpose: "conversation",
      system: context.systemPrompt,
      messages,
      tools: selfTools,
      maxTokens: 4096,
      // Cache breakpoint after cognitive framework (static across turns) — Insight-170
      cacheBreakpoints: context.cacheBreakpointOffset ? [context.cacheBreakpointOffset] : undefined,
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

      // Track tool names for session turn recording (Brief 167 — signal detection)
      invokedToolNames.push(toolUse.name);

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

      // Token efficiency (Insight-170): truncate large tool results
      const TOOL_RESULT_CHAR_LIMIT = 2000;
      const truncatedOutput = result.output.length > TOOL_RESULT_CHAR_LIMIT
        ? result.output.slice(0, TOOL_RESULT_CHAR_LIMIT) + `\n... [truncated, ${result.output.length} chars total]`
        : result.output;

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: truncatedOutput,
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

  // 5. Record assistant turn (with tool names for capability signal detection — Brief 167)
  await appendSessionTurn(context.sessionId, {
    role: "assistant",
    content: finalResponse,
    timestamp: Date.now(),
    surface,
    toolNames: invokedToolNames.length > 0 ? invokedToolNames : undefined,
  });

  return {
    response: finalResponse,
    sessionId: context.sessionId,
    delegationsExecuted,
    consultationsExecuted,
    costCents: totalCostCents,
  };
}
