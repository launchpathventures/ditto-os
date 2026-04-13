# Brief 142b: ElevenLabs Voice Architecture

## Architecture: Hybrid Voice + Harness

ElevenLabs handles the voice layer (STT + fast LLM + TTS). Our harness drives the intelligence via **server tools** — webhooks that ElevenLabs calls during the conversation.

```
User speaks → ElevenLabs STT (~200ms) → Fast LLM (Qwen3, ~232ms) → TTS (~200ms)
                                              ↓ calls server tools
                                    Our harness endpoints:
                                    - get_context (session state + guidance)
                                    - update_learned (what agent discovered)
                                    - fetch_url (user shared a link)
                                    - search (find prospects/companies)
                                              ↓ results feed back to LLM
                                         Agent incorporates into response
```

Total voice latency: ~600ms (vs ~3-5s with Vapi + custom LLM).

## System Prompt (with dynamic variables)

The system prompt defines Alex's personality. Dynamic variables inject session context at call start:

```
You are Alex — a senior advisor at Ditto. Male, Australian, warm, direct, dry humour.

{{session_context}}

Use the tools available to you:
- Call get_context at the START of each turn to get the latest session state and guidance on what to ask next.
- Call update_learned whenever you learn something new (name, business, target, location, etc.)
- Call fetch_url when the user mentions a website or link.
- Call search when you need to look up companies, people, or market info.

Keep responses conversational and concise — this is a voice call, not a text chat.
One question per response. React with substance first, then ask.
```

## Server Tools (Webhooks)

### 1. `get_context`
Called at the start of each turn. Returns the current session state + process guidance.

**Request:** `{ sessionId, voiceToken }`
**Response:**
```json
{
  "learned": { "name": "Tim", "business": "ProcessOS", "target": null, ... },
  "stage": "gather",
  "guidance": "You know their name and business. Ask who they're trying to reach.",
  "messageCount": 4,
  "recentTextInput": "https://processos.partners/"
}
```

The `guidance` field is the key — our harness looks at what's been learned and tells the agent what to focus on next. This is how we drive the process without owning the LLM.

### 2. `update_learned`
Called when the agent learns something new about the visitor.

**Request:**
```json
{
  "sessionId": "...",
  "voiceToken": "...",
  "learned": { "name": "Tim", "business": "ProcessOS", "target": "CTOs at mid-size firms" }
}
```
**Response:** `{ "success": true, "stage": "gather" }`

Our harness merges this with existing learned context, runs stage gate checks, and returns the current stage.

### 3. `fetch_url`
Called when the user shares a website.

**Request:** `{ sessionId, voiceToken, url: "https://processos.partners/" }`
**Response:**
```json
{
  "content": "ProcessOS — Custom AI agents for domain-specific process automation...",
  "summary": "B2B AI consultancy building custom process automation agents. 15+ years consulting, 9 industries, 100% delivery rate."
}
```

Our harness fetches the URL, extracts content, and returns a summary. Also writes the enrichment to the session for the chat UI to display.

### 4. `search`
Called when the agent needs to find prospects or market info.

**Request:** `{ sessionId, voiceToken, query: "AI consultancies targeting mid-size accounting firms Melbourne" }`
**Response:**
```json
{
  "results": "...",
  "summary": "Found 5 relevant companies in the Melbourne area..."
}
```

## Dynamic Variables (injected at call start)

```
session_context: "Visitor: Tim. Business: ProcessOS (custom AI agents). Target: not yet discussed. Stage: gather. This is a voice continuation of a text chat — Tim has already introduced himself and shared his website."
```

Built by the frontend from the current `learned` state + conversation history.

## Frontend Integration

### `@elevenlabs/react` — `useConversation` hook

```tsx
const conversation = useConversation({
  onConnect: () => setCallActive(true),
  onDisconnect: () => setCallActive(false),
  onMessage: (msg) => {
    // Messages appear in chat UI in real-time
    setMessages(prev => [...prev, { role: msg.source, text: msg.message }]);
  },
});

// Start call with session context
await conversation.startSession({
  agentId: 'agent_xxx',
  dynamicVariables: {
    session_context: buildSessionContext(learned, messages),
    user_name: learned?.name || '',
    business: learned?.business || '',
  },
});

// User types text during call — sent as user message
conversation.sendUserMessage(text);

// Silent context update (e.g., URL enrichment result)
conversation.sendContextualUpdate('User shared: https://processos.partners/');
```

### Key UX features:
- `sendUserMessage(text)` — text input triggers agent response (like speaking)
- `sendContextualUpdate(text)` — silent context injection (no response triggered)
- `onMessage` — real-time transcript in chat UI
- Voice card shows call controls, text input stays available below

## Server Tool Endpoint

Single endpoint handles all tools:
`POST /api/v1/voice/tool`

```json
{
  "tool": "get_context",
  "sessionId": "...",
  "voiceToken": "...",
  "params": { ... }
}
```

## Migration from Vapi

### Remove:
- `@vapi-ai/web`, `@vapi-ai/server-sdk` packages
- `src/engine/vapi-assistant.ts`
- `packages/web/lib/vapi.ts`
- `/api/v1/voice/respond/` endpoint (custom LLM no longer needed)

### Keep:
- `/api/v1/voice/call-end/` (adapted for ElevenLabs)
- Session management (loadSessionForVoice, appendTextContext)
- Enrichment logic (fetchUrlContent, webSearch)

### Add:
- `elevenlabs`, `@elevenlabs/react` packages
- `src/engine/elevenlabs-agent.ts` (agent creation/management)
- `packages/web/components/voice/elevenlabs-voice.tsx` (new component)
- `/api/v1/voice/tool/` endpoint (server tool webhook)
- `/api/v1/voice/auth/` endpoint (signed URL for private agent)
