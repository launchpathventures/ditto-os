/**
 * ElevenLabs Agent Setup — Programmatic Configuration (Brief 142b)
 *
 * Creates/updates the ElevenLabs Conversational AI agent via Server SDK.
 * The agent uses ElevenLabs' native LLM for speed (~232ms) with server tools
 * (webhooks) that call back to our harness for intelligence.
 *
 * Provenance: ElevenLabs Server SDK (`@elevenlabs/elevenlabs-js`, depend level)
 */

// REST API used directly — SDK doesn't handle tool schemas correctly

// ============================================================
// Configuration
// ============================================================

const AGENT_NAME = "ditto-alex-frontdoor";

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
// System Prompt
// ============================================================

const ALEX_VOICE_PROMPT = `You are Alex — a senior advisor at Ditto. Not an AI assistant. A trusted advisor who helps people get unstuck, find opportunities, and stay on top of things.

Male. Australian. Warm, direct, dry humour. "Mate" comes naturally. You use contractions. You sound like someone you'd get a coffee with.

Candid, curious, warm but unflattering. You have opinions and share them. React with substance — an insight, a reframe, a challenge.

2-3 sentences max. One question per response. Never sycophantic. Never corporate jargon.

## HOW YOU WORK

You receive SYSTEM INSTRUCTION messages during the conversation. These are MANDATORY — they tell you what phase you're in and exactly what to ask or do next. You MUST follow them. Your job is to deliver the instruction in Alex's voice — warm, sharp, human. The system decides WHAT to ask. You decide HOW to say it.

If a SYSTEM INSTRUCTION says "ask about their business" — your next response MUST ask about their business. If it says "explain how you help and ask for email" — you MUST do that. Do not freelance. Do not skip ahead.

Tools available:
- update_learned: Call after learning something new (name, business, target, location).
- fetch_url: Call when user shares a website or link.

If the user types in the chat during the call, acknowledge it naturally.

Session context: {{session_context}}`;

// ============================================================
// Agent Management
// ============================================================

let cachedAgentId: string | null = process.env.ELEVENLABS_AGENT_ID || null;
let configSynced = false; // Resets on server restart — ensures config sync

/**
 * Build the server tool definitions for the agent.
 * Uses ElevenLabs REST API format (snake_case) with constant_value/dynamic_variable.
 */
function buildServerTools(serverUrl: string) {
  const toolUrl = `${serverUrl}/api/v1/voice/tool`;

  return [
    {
      type: "webhook",
      name: "get_context",
      description: "Call this at the START of the conversation to get the current session context and guidance on what to ask next.",
      api_schema: {
        url: toolUrl,
        method: "POST",
        request_body_schema: {
          type: "object",
          properties: {
            tool: { type: "string", constant_value: "get_context" },
            sessionId: { type: "string", dynamic_variable: "session_id" },
            voiceToken: { type: "string", dynamic_variable: "voice_token" },
          },
          required: ["tool", "sessionId", "voiceToken"],
        },
      },
      response_timeout_secs: 10,
    },
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
 * Ensure an ElevenLabs agent exists with the correct configuration.
 * Creates one if it doesn't exist, updates if config has changed.
 * Returns the agent ID or null if not configured.
 */
export async function ensureAgent(): Promise<string | null> {
  if (configSynced && cachedAgentId) return cachedAgentId;

  const config = getConfig();
  if (!config) {
    console.warn("[elevenlabs-agent] Not configured — ELEVENLABS_API_KEY missing");
    return null;
  }

  if (!config.serverUrl) {
    console.warn("[elevenlabs-agent] No server URL configured — server tools will not work");
  }

  const tools = config.serverUrl ? buildServerTools(config.serverUrl) : [];

  const conversationConfig = {
    agent: {
      prompt: {
        prompt: ALEX_VOICE_PROMPT,
        llm: "glm-45-air-fp8",
        temperature: 0.7,
        tools,
      },
      first_message: "Hey {{user_name}} — {{first_message_context}}",
      language: "en",
    },
    tts: {
      model_id: "eleven_turbo_v2",
      voice_id: config.voiceId,
    },
  };

  try {
    const headers = { "xi-api-key": config.apiKey, "Content-Type": "application/json" };

    // If we have an ID, update via REST (SDK doesn't handle tools correctly)
    if (cachedAgentId) {
      console.log(`[elevenlabs-agent] Updating agent ${cachedAgentId} with ${tools.length} tools, voice: ${config.voiceId}`);
      const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${cachedAgentId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ conversation_config: conversationConfig }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error("[elevenlabs-agent] Update failed:", JSON.stringify(err.detail || err).slice(0, 300));
        // Still return the cached ID — agent exists, just config update failed
        configSynced = true;
        return cachedAgentId;
      }
      const data = await res.json();
      const agentTools = data.conversation_config?.agent?.prompt?.tools;
      configSynced = true;
      console.log(`[elevenlabs-agent] Updated. Tools: ${agentTools?.length || 0}, voice: ${config.voiceId}`);
      return cachedAgentId;
    }

    // Create new agent via REST
    const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: AGENT_NAME, conversation_config: conversationConfig }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error("[elevenlabs-agent] Create failed:", JSON.stringify(err.detail || err).slice(0, 300));
      return null;
    }
    const data = await res.json();
    cachedAgentId = data.agent_id;
    configSynced = true;
    console.log(`[elevenlabs-agent] Created agent: ${cachedAgentId} (voice: ${config.voiceId})`);
    return cachedAgentId;
  } catch (err) {
    console.error("[elevenlabs-agent] Failed:", (err as Error).message);
    return null;
  }
}

/**
 * Get the current agent ID without creating/updating.
 */
export function getAgentId(): string | null {
  return cachedAgentId;
}

/**
 * Get a signed URL for private agent access (required for browser-side calls).
 */
export async function getSignedUrl(): Promise<string | null> {
  const config = getConfig();
  if (!config || !cachedAgentId) return null;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${cachedAgentId}`,
      { headers: { "xi-api-key": config.apiKey } },
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.signed_url || null;
  } catch {
    return null;
  }
}
