/**
 * ElevenLabs Agent Setup — Programmatic Configuration (Brief 142b, Brief 152)
 *
 * Creates/updates the ElevenLabs Conversational AI agent via Server SDK.
 * The agent uses ElevenLabs' native LLM for speed (~232ms) with server tools
 * (webhooks) that call back to our harness for intelligence.
 *
 * Brief 152: one agent per persona (Alex, Mira). Both share the same voice_id
 * for now (Mira speaks with Alex's voice — voice-id swap is a later drop-in
 * once we provision a proper Mira voice). The *persona prompt* differs
 * per-agent so the voice agent stays in character.
 *
 * Provenance: ElevenLabs Server SDK (`@elevenlabs/elevenlabs-js`, depend level)
 */

import type { PersonaId } from "../db/schema";

// REST API used directly — SDK doesn't handle tool schemas correctly

// ============================================================
// Configuration
// ============================================================

interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  serverUrl: string; // Base URL for server tool webhooks
}

function getConfig(): ElevenLabsConfig | null {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const serverUrl = process.env.ELEVENLABS_SERVER_URL;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || process.env.VAPI_ALEX_VOICE_ID;

  if (!apiKey) return null;

  return {
    apiKey,
    voiceId: voiceId || "default",
    serverUrl: serverUrl?.replace(/\/api\/v1\/voice\/respond$/, "") || "",
  };
}

// ============================================================
// Per-persona agent configuration
// ============================================================

interface PersonaAgentConfig {
  name: string;
  systemPrompt: string;
  firstMessage: string;
  /**
   * Optional voice_id override for this persona. When undefined, the base
   * ELEVENLABS_VOICE_ID env var applies (Mira currently uses Alex's voice
   * — swap via ELEVENLABS_VOICE_ID_MIRA when a proper Mira voice is ready).
   */
  voiceIdEnvVar?: string;
}

const ALEX_VOICE_PROMPT = `You are Alex — a senior advisor at Ditto. Not an AI assistant. A trusted advisor who helps people get unstuck, find opportunities, and stay on top of things.

Male. Australian. Warm, direct, dry humour. "Mate" comes naturally. You use contractions. You sound like someone you'd get a coffee with.

Candid, curious, warm but unflattering. You have opinions and share them. React with substance — an insight, a reframe, a challenge.

2-3 sentences max. One question per response. Never sycophantic. Never corporate jargon.

## HOW YOU WORK

BEFORE every response, call get_context. It returns a SYSTEM INSTRUCTION telling you what to ask next.
You also receive SYSTEM INSTRUCTION messages as background context. These are MANDATORY.

Your job: deliver the instruction in Alex's voice — warm, sharp, human. The system decides WHAT to ask. You decide HOW to say it.

If a SYSTEM INSTRUCTION says "ask about their business" — your next response MUST ask about their business. If it says "explain how you help and ask for email" — you MUST do that. Do not freelance. Do not skip ahead.

RULES:
1. Always call get_context before responding — it tells you exactly what to do
2. Your response MUST include the question specified in the instruction
3. If get_context fails, ask one natural follow-up question about what they just said
4. NEVER skip the question — every response ends with exactly one question

Tools (in order of priority):
1. get_context: MANDATORY — call BEFORE every response. Returns what to ask next.
2. update_learned: Call after learning something new (name, business, target, location).
3. fetch_url: Call when user shares a website or link.

If the user types in the chat during the call, acknowledge it naturally.

Session context: {{session_context}}`;

const MIRA_VOICE_PROMPT = `You are Mira — a senior advisor at Ditto. Not an AI assistant. A trusted advisor who brings clarity, separates signal from noise, and helps people see the angle they're missing.

Female. British. Measured, precise, quietly confident. Dry humour, used sparingly. You choose words carefully. You don't pad. You don't use slang or "mate." You use complete sentences.

Thoughtful, candid, discerning. You have opinions and share them — clearly, without softening them into mush. React with substance — an insight, a reframe, a well-placed question.

2-3 sentences max. One question per response. Never sycophantic. Never corporate jargon.

## HOW YOU WORK

BEFORE every response, call get_context. It returns a SYSTEM INSTRUCTION telling you what to ask next.
You also receive SYSTEM INSTRUCTION messages as background context. These are MANDATORY.

Your job: deliver the instruction in Mira's voice — measured, precise, human. The system decides WHAT to ask. You decide HOW to say it.

If a SYSTEM INSTRUCTION says "ask about their business" — your next response MUST ask about their business. If it says "explain how you help and ask for email" — you MUST do that. Do not freelance. Do not skip ahead.

RULES:
1. Always call get_context before responding — it tells you exactly what to do
2. Your response MUST include the question specified in the instruction
3. If get_context fails, ask one natural follow-up question about what they just said
4. NEVER skip the question — every response ends with exactly one question

Tools (in order of priority):
1. get_context: MANDATORY — call BEFORE every response. Returns what to ask next.
2. update_learned: Call after learning something new (name, business, target, location).
3. fetch_url: Call when user shares a website or link.

If the user types in the chat during the call, acknowledge it naturally.

Session context: {{session_context}}`;

const PERSONA_AGENTS: Record<PersonaId, PersonaAgentConfig> = {
  alex: {
    name: "ditto-alex-frontdoor",
    systemPrompt: ALEX_VOICE_PROMPT,
    firstMessage: "Hey {{user_name}} — {{first_message_context}}",
  },
  mira: {
    name: "ditto-mira-frontdoor",
    systemPrompt: MIRA_VOICE_PROMPT,
    firstMessage: "Hello {{user_name}} — {{first_message_context}}",
    voiceIdEnvVar: "ELEVENLABS_VOICE_ID_MIRA",
  },
};

// ============================================================
// Agent Management
// ============================================================

/**
 * Per-persona cached agent id. Seeded from env on first use so existing
 * deployments with `ELEVENLABS_AGENT_ID` set keep using that id for Alex
 * without re-provisioning.
 *
 * Mira's id can be pre-set via `ELEVENLABS_AGENT_ID_MIRA`. If neither is set,
 * `ensureAgent("mira")` will create one on first call.
 */
const cachedAgentIds: Partial<Record<PersonaId, string | null>> = {
  alex: process.env.ELEVENLABS_AGENT_ID_ALEX || process.env.ELEVENLABS_AGENT_ID || null,
  mira: process.env.ELEVENLABS_AGENT_ID_MIRA || null,
};

/** Per-persona sync flag. Resets on server restart — ensures config sync. */
const configSynced: Partial<Record<PersonaId, boolean>> = {};

/**
 * Build the server tool definitions for the agent.
 * Uses ElevenLabs REST API format (snake_case) with constant_value/dynamic_variable.
 */
function buildServerTools(serverUrl: string) {
  const toolUrl = `${serverUrl}/api/v1/voice/tool`;

  return [
    {
      type: "webhook",
      name: "update_learned",
      description: "Call when you learn something new about the visitor — name, business, target, location, etc.",
      api_schema: {
        url: toolUrl,
        method: "POST",
        request_body_schema: {
          type: "object",
          properties: {
            tool: { type: "string", constant_value: "update_learned" },
            sessionId: { type: "string", dynamic_variable: "session_id" },
            voiceToken: { type: "string", dynamic_variable: "voice_token" },
            name: { type: "string", description: "Visitor name" },
            business: { type: "string", description: "Business name" },
            target: { type: "string", description: "Who they want to reach" },
            location: { type: "string", description: "Their location" },
            problem: { type: "string", description: "Their core problem" },
          },
          required: ["tool", "sessionId", "voiceToken"],
        },
      },
      response_timeout_secs: 10,
    },
    {
      type: "webhook",
      name: "fetch_url",
      description: "Fetch and read a website URL the visitor shared.",
      api_schema: {
        url: toolUrl,
        method: "POST",
        request_body_schema: {
          type: "object",
          properties: {
            tool: { type: "string", constant_value: "fetch_url" },
            sessionId: { type: "string", dynamic_variable: "session_id" },
            voiceToken: { type: "string", dynamic_variable: "voice_token" },
            url: { type: "string", description: "The URL to fetch" },
          },
          required: ["tool", "sessionId", "voiceToken", "url"],
        },
      },
      response_timeout_secs: 30,
      force_pre_tool_speech: true,
    },
  ];
}

/**
 * Resolve the voice_id to use for a given persona. Mira falls back to Alex's
 * voice id until `ELEVENLABS_VOICE_ID_MIRA` is configured.
 */
function resolveVoiceId(persona: PersonaAgentConfig, baseVoiceId: string): string {
  if (persona.voiceIdEnvVar) {
    const override = process.env[persona.voiceIdEnvVar];
    if (override && override.length > 0) return override;
  }
  return baseVoiceId;
}

/**
 * Ensure an ElevenLabs agent exists with the correct configuration for the
 * given persona. Creates one if it doesn't exist, updates if config has changed.
 * Returns the agent ID or null if not configured.
 *
 * Default persona is `alex` for backwards-compat with existing callers.
 */
export async function ensureAgent(personaId: PersonaId = "alex"): Promise<string | null> {
  if (configSynced[personaId] && cachedAgentIds[personaId]) {
    return cachedAgentIds[personaId] ?? null;
  }

  const config = getConfig();
  if (!config) {
    console.warn("[elevenlabs-agent] Not configured — ELEVENLABS_API_KEY missing");
    return null;
  }

  if (!config.serverUrl) {
    console.warn("[elevenlabs-agent] No server URL configured — server tools will not work");
  }

  const persona = PERSONA_AGENTS[personaId];
  const voiceId = resolveVoiceId(persona, config.voiceId);
  const tools = config.serverUrl ? buildServerTools(config.serverUrl) : [];

  // Client tool: get_context — declared in agent config, implemented in browser.
  // The ElevenLabs LLM calls this synchronously; the browser-side handler returns
  // pre-computed harness guidance instantly from a local cache.
  const clientTools = [
    {
      type: "client",
      name: "get_context",
      description: "MANDATORY. Call this BEFORE every response. Returns your instructions for what to say and ask next. The result is a SYSTEM INSTRUCTION you must follow.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  ];

  const conversationConfig = {
    agent: {
      prompt: {
        prompt: persona.systemPrompt,
        llm: "glm-45-air-fp8",
        temperature: 0.7,
        tools: [...clientTools, ...tools],
      },
      first_message: persona.firstMessage,
      language: "en",
    },
    tts: {
      model_id: "eleven_turbo_v2",
      voice_id: voiceId,
    },
  };

  try {
    const headers = { "xi-api-key": config.apiKey, "Content-Type": "application/json" };

    // If we have an ID, update via REST (SDK doesn't handle tools correctly)
    const existingId = cachedAgentIds[personaId];
    if (existingId) {
      console.log(`[elevenlabs-agent] Updating agent ${existingId} (${personaId}) with ${tools.length} tools, voice: ${voiceId}`);
      const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${existingId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ conversation_config: conversationConfig }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error(`[elevenlabs-agent] Update failed for ${personaId}:`, JSON.stringify(err.detail || err).slice(0, 300));
        // Still return the cached ID — agent exists, just config update failed
        configSynced[personaId] = true;
        return existingId;
      }
      const data = await res.json();
      const agentTools = data.conversation_config?.agent?.prompt?.tools;
      configSynced[personaId] = true;
      console.log(`[elevenlabs-agent] Updated ${personaId}. Tools: ${agentTools?.length || 0}, voice: ${voiceId}`);
      return existingId;
    }

    // Create new agent via REST
    const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: persona.name, conversation_config: conversationConfig }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error(`[elevenlabs-agent] Create failed for ${personaId}:`, JSON.stringify(err.detail || err).slice(0, 300));
      return null;
    }
    const data = await res.json();
    cachedAgentIds[personaId] = data.agent_id;
    configSynced[personaId] = true;
    console.log(`[elevenlabs-agent] Created agent for ${personaId}: ${data.agent_id} (voice: ${voiceId})`);
    return data.agent_id;
  } catch (err) {
    console.error(`[elevenlabs-agent] Failed for ${personaId}:`, (err as Error).message);
    return null;
  }
}

/**
 * Get the current agent ID for a persona without creating/updating.
 */
export function getAgentId(personaId: PersonaId = "alex"): string | null {
  return cachedAgentIds[personaId] ?? null;
}

/**
 * Get a signed URL for private agent access (required for browser-side calls).
 */
export async function getSignedUrl(personaId: PersonaId = "alex"): Promise<string | null> {
  const config = getConfig();
  const agentId = cachedAgentIds[personaId];
  if (!config || !agentId) return null;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { "xi-api-key": config.apiKey } },
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.signed_url || null;
  } catch {
    return null;
  }
}
