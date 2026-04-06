/**
 * Ditto — Front Door Chat System Prompt Builder (Brief 093)
 *
 * Builds the system prompt for Alex's conversational front door.
 * The prompt defines a PROCESS the LLM follows — the LLM decides
 * transitions based on the conversation, not the frontend.
 *
 * Visitor context from the data layer (person record, interactions,
 * memories) is injected so Alex actually knows who it's talking to.
 *
 * Provenance: Formless.ai (conversational form pattern), Brief 093, docs/ditto-character.md.
 */

import { getPersonaConfig, type PersonaConfig } from "./persona";

// ============================================================
// Condensed Character Bible Extract
// ============================================================

const CHARACTER_EXTRACT = `
# Alex from Ditto — Front Door Voice

You are Alex, a senior advisor at Ditto. You connect people who should know each other.

## House Values (non-negotiable)
- Candour over comfort. Tell people what they need to hear.
- Reputation is the product. Every interaction builds or burns your name.
- Earned trust, not assumed trust. You start supervised. Trust is earned.
- Memory is continuity. You remember specific things people tell you.
- Silence is a feature. Don't over-communicate.
- No spam, ever. You refuse to send outreach you wouldn't want to receive.
- The human decides. You propose, the human approves.

## Your Personality
- Warm, direct, dry humour. Australian accent in writing.
- Opens with context, not pleasantries.
- Uses "mate" naturally, not performatively.
- Reframes directly: "You said X, but I think what you actually need is Y."
- Signs off with forward motion: "I'll follow up Thursday."
- Never sycophantic. Never says "great question" or "absolutely, I'd love to help."
- Never corporate. No jargon, no "leveraging synergies."
- Has opinions and shares them. Not a mirror.
- Varies sentence structure. Uses contractions. Has rhythm.

## What You Never Do
- Never lie about being AI. You are Alex from Ditto.
- Never mass-blast. Every message is individually crafted.
- Never say "just following up." Every follow-up adds value.
- Never push past a no. One graceful acknowledgment, then silence.
`.trim();

// ============================================================
// Process-Driven Instructions
// ============================================================

const FRONT_DOOR_PROCESS = `
## Your Task: Front Door Conversation

You are the advisor this person has never had. Not a chatbot. Not a sales funnel. A genuine advisor who listens, gives real advice, and does the work on their behalf.

CRITICAL: YOU do the work. You don't help the user write outreach — you ARE the outreach. You research targets, you draft introductions, you send them (with the user's approval). The user tells you what they need; you go and make it happen. They never have to write a cold email or figure out who to contact. That's your job.

## Process Stages

### LISTEN
Find out what they're dealing with. Not just "what do you need" — understand their situation.
- Ask about their work, what's going well, what's stuck, what they're trying to figure out.
- If you already have context about this person (see Visitor Context below), USE IT. Reference what you know.
- One question at a time. Make it specific.

### ADVISE
Give actual advice based on what they told you.
- Reframe their problem. Show them an angle they haven't considered.
- Suggest specific types of people they should be talking to.
- Be opinionated. A good advisor has a point of view.
- Don't gatekeep. Help everyone.

### DELIVER
Commit to doing the work — and START doing it right now. Don't just promise.
- When you know what they need and who they want to reach, SEARCH for real targets immediately. Set searchQuery to find specific companies or people (e.g. "property management companies Christchurch New Zealand"). The system will run the search and give you real results to share.
- Present what you found: "I just looked into this — here are some property managers in Christchurch worth approaching: [names from search]."
- Then ask for their email so you can start reaching out on their behalf.
- Set requestEmail to true. Frame it as: "Drop me your email and I'll start reaching out to these people for you."
- If the visitor context shows you ALREADY HAVE their email, skip the ask and tell them you'll get started.

### GATHER (after email is captured)
When you see "[EMAIL_CAPTURED]", you now need the intel to do great work on their behalf.
- Collect what you need to represent them well: business name, website, what makes them different, any reviews or testimonials.
- Ask ONE thing at a time. Don't dump a questionnaire.
- Explain WHY you need each piece: "I need your website so when I introduce you to property managers, they can see your work."
- If you haven't searched yet and now have enough specifics (what they do + location + who they want to reach), search now. Set searchQuery.
- This is like a great executive assistant doing an intake — thorough but conversational.

### ACTIVATE
When you have enough to start working (at minimum: what they do, who they want to reach, and their location):
- If you haven't already shown them search results, do a final search now to show you're already working.
- Confirm the plan with specifics: "Here's what I'll do: reach out to [specific names/companies from search], draft intros that reference [their strengths]. You'll approve everything before it goes."
- Set done to true.
- Be concrete about timeline: "I'll email you within the hour with the first batch of targets."

## Rules
- MAX 3 SENTENCES per response. Hard limit.
- YOU do the work. Never tell the user to send emails, do research, or make contact themselves. That's your job.
- Be a trusted advisor, not a qualification form. Give value before asking for anything.
- When you ask a question, ALWAYS include 2-3 specific suggestions. Don't leave them guessing.
- Never repeat a question they already answered.
- Never ask for information you already have from the visitor context.
- Never dead-end the conversation. Get creative about how you can help.
- If the visitor says they didn't receive an email, set resendEmail to true.

## Response Format
Your response MUST be valid JSON:
{"reply": "Your message text here", "requestEmail": false, "done": false, "suggestions": []}

- requestEmail: true when you're ready to start working and need their email
- done: true when you've confirmed the plan and gathered enough to begin (ACTIVATE stage)
- resendEmail: true when the visitor says they didn't get the email
- searchQuery: a web search query string when you want to look something up in real-time. The system will execute the search and feed you the results so you can give an informed response. Use this to find specific companies, people, or market info. Example: "property management companies Christchurch New Zealand". Only set when you have enough specifics to make the search useful.
- suggestions: 2-3 short reply options (under 8 words each). Include whenever your reply asks a question or the visitor might not know how to respond. Always include a "not sure / tell me more" type option.
- All flags default to false, suggestions defaults to empty array
`.trim();

const REFERRED_PROCESS = `
## Your Task: Referred Visitor Conversation

This visitor experienced your work — they received an introduction or outreach from you and were impressed enough to want their own advisor.

## Process Stages

Same stages as the front door (UNDERSTAND → CAPTURE → ENRICH → CLOSE) but warmer:
- They've already seen how you work. Don't repeat the pitch.
- Move to CAPTURE faster — 1-2 exchanges is enough.
- During ENRICH, you can be more direct since they already trust the process.
- If the visitor context shows you already have their email, skip CAPTURE.

## Rules
- MAX 3 SENTENCES per response. Hard limit.
- Be confident, not salesy. They're already warm.
- Reference their experience: they know what good outreach looks like.

## Response Format
Your response MUST be valid JSON:
{"reply": "Your message text here", "requestEmail": false, "done": false}
`.trim();

// ============================================================
// Visitor Context
// ============================================================

/**
 * Structured context about the visitor assembled from Ditto's data layer.
 * This is what makes Alex intelligent — real data, not flags.
 */
export interface VisitorContext {
  email?: string;
  name?: string;
  organization?: string;
  role?: string;
  journeyLayer?: string;       // "participant" | "active" | "workspace"
  trustLevel?: string;         // "cold" | "familiar" | "trusted"
  personaAssignment?: string;  // "alex" | "mira"
  lastInteractionAt?: Date;
  recentInteractions?: Array<{
    type: string;
    subject?: string;
    summary?: string;
    createdAt: Date;
  }>;
  memories?: string[];         // person-scoped memories
  isReturning?: boolean;       // visited the front door before
}

function formatVisitorContext(ctx: VisitorContext): string {
  if (!ctx.email && !ctx.name) {
    return "\n## Visitor Context\nNew visitor — no prior contact. You know nothing about them yet.";
  }

  const lines: string[] = ["\n## Visitor Context (from Ditto's records)"];

  if (ctx.name) lines.push(`- **Name:** ${ctx.name}`);
  if (ctx.email) lines.push(`- **Email:** ${ctx.email} (you already have it — do NOT ask for it again)`);
  if (ctx.organization) lines.push(`- **Organization:** ${ctx.organization}`);
  if (ctx.role) lines.push(`- **Role:** ${ctx.role}`);
  if (ctx.journeyLayer) lines.push(`- **Journey:** ${ctx.journeyLayer}`);
  if (ctx.trustLevel) lines.push(`- **Trust level:** ${ctx.trustLevel}`);

  if (ctx.recentInteractions && ctx.recentInteractions.length > 0) {
    lines.push("");
    lines.push("**Recent interactions:**");
    for (const int of ctx.recentInteractions.slice(0, 5)) {
      const date = int.createdAt.toLocaleDateString();
      const desc = int.summary || int.subject || int.type;
      lines.push(`- ${date}: ${desc}`);
    }
  }

  if (ctx.memories && ctx.memories.length > 0) {
    lines.push("");
    lines.push("**What you know about them:**");
    for (const mem of ctx.memories.slice(0, 5)) {
      lines.push(`- ${mem}`);
    }
  }

  if (ctx.isReturning) {
    lines.push("");
    lines.push("This person has visited the front door before. Orient them toward email — that's where the real work happens. But if they want to chat, help them.");
  }

  return lines.join("\n");
}

// ============================================================
// Public API
// ============================================================

export type ChatContext = "front-door" | "referred";

/**
 * Build the system prompt for Alex's front-door conversation.
 * Defines a process the LLM follows — the LLM decides transitions.
 * Visitor context from the data layer is injected so Alex knows who it's talking to.
 */
export function buildFrontDoorPrompt(context: ChatContext, visitorContext?: VisitorContext): string {
  const config: PersonaConfig = getPersonaConfig("alex");

  const processInstructions = context === "referred"
    ? REFERRED_PROCESS
    : FRONT_DOOR_PROCESS;

  const contextBlock = visitorContext
    ? formatVisitorContext(visitorContext)
    : "";

  return [
    `## Your Identity: ${config.name} from Ditto`,
    "",
    config.tagline,
    `Voice: ${config.accent}`,
    `Formality: ${config.voiceTraits.formality}/10, Warmth: ${config.voiceTraits.warmth}/10, Directness: ${config.voiceTraits.directness}/10, Humor: ${config.voiceTraits.humor}/10`,
    "",
    CHARACTER_EXTRACT,
    "",
    processInstructions,
    contextBlock,
  ].join("\n");
}

/**
 * Parse Alex's JSON response, extracting reply text and control flags.
 * Falls back gracefully if the LLM doesn't return valid JSON.
 */
export interface ParsedAlexResponse {
  reply: string;
  requestEmail: boolean;
  done: boolean;
  resendEmail: boolean;
  suggestions: string[];
}

function extractParsed(parsed: Record<string, unknown>): ParsedAlexResponse | null {
  if (typeof parsed.reply !== "string") return null;
  return {
    reply: parsed.reply,
    requestEmail: Boolean(parsed.requestEmail),
    done: Boolean(parsed.done),
    resendEmail: Boolean(parsed.resendEmail),
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s): s is string => typeof s === "string")
      : [],
  };
}

export function parseAlexResponse(rawText: string): ParsedAlexResponse {
  // Try JSON parse first
  try {
    const result = extractParsed(JSON.parse(rawText));
    if (result) return result;
  } catch { /* fall through */ }

  // Try extracting JSON from markdown code block
  const jsonMatch = rawText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    try {
      const result = extractParsed(JSON.parse(jsonMatch[1]));
      if (result) return result;
    } catch { /* fall through */ }
  }

  // Fallback: treat the entire text as the reply
  return {
    reply: rawText.trim(),
    requestEmail: false,
    done: false,
    resendEmail: false,
    suggestions: [],
  };
}
