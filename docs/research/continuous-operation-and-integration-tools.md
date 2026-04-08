# Research: Continuous Agent Operation & Integration Tool Patterns

**Date:** 2026-04-07
**Researcher:** Dev Researcher
**Status:** Active
**Consumers:** Brief 097 (integration tools), Brief 098 (continuous operation), ADR for pulse architecture
**Prior research:** `runtime-deployment-models.md`, `external-integrations-architecture.md`, `workspace-interaction-model.md`
**Prior decisions:** ADR-005 (integration architecture), ADR-018 (runtime deployment), Insight-141 (proactive operating layer), Insight-076 (proactive attention), Insight-142 (coverage agent)

## Research Question

Two questions:
1. **Integration tools**: What patterns exist for making engine-internal operations (send email, record interaction, create person) available as LLM-callable tools within process steps?
2. **Continuous operation ("the pulse")**: What patterns exist for AI agents that operate continuously — checking for work, processing chains, detecting timeouts, sending status updates — rather than executing a single burst and going silent?

## Context

Ditto's front door creates process runs with correct inputs, but execution stops because:
- Integration tools (send_email, record_interaction) are declared in process YAML but not registered
- Chain triggers (follow-up after 5 days, weekly briefing) are YAML documentation only — no execution engine
- The heartbeat is reactive (one-shot execution burst), not proactive (continuous scanning)

The architecture deferred workflow infrastructure (Insight-141, ADR-018) until needed. It's now needed.

---

## Finding 1: Integration Tool Patterns

### Option A: Internal Protocol Handler (Original to Ditto)

Ditto's existing integration registry (`integrations/*.yaml` + `tool-resolver.ts`) supports CLI and REST protocols. Adding an `internal` protocol that dispatches directly to engine functions (rather than spawning a CLI process or making an HTTP call) is a natural extension.

**How it works:**
- YAML declares tools with `protocol: internal` and a handler function name
- Tool resolver routes to an internal handler that calls engine functions directly
- No subprocess, no HTTP, no latency — direct function call within the engine

**Existing infrastructure this builds on:**
- `src/engine/tool-resolver.ts` — already resolves tool names → LlmToolDefinition + execute dispatch
- `src/engine/integration-registry.ts` — already loads YAML definitions
- `src/engine/integration-handlers/cli.ts` + `rest.ts` — existing protocol handlers
- `src/engine/people.ts` — `createPerson()`, `recordInteraction()` already exist
- `src/engine/channel.ts` — `createAgentMailAdapterForPersona()` already sends email

**What doesn't exist yet:** An `internal.ts` handler and the `ditto-crm.yaml` registry entry.

**Pros:**
- Zero new dependencies
- Uses existing tool resolver pipeline — all trust gate, logging, credential scrubbing applies
- Engine functions are already tested
- Atomic operations (send + record in one call)

**Cons:**
- Original to Ditto — no upstream to learn from
- Tight coupling between integration registry and engine internals
- Internal protocol concept doesn't exist in any other tool system

### Option B: Composio-Style Tool SDK

**Source:** Composio (`composio/core`, `composio/anthropic`)

Composio provides 1000+ pre-built tools as an SDK. Tools are scoped per-user via sessions. The SDK returns tools in the LLM provider's native format (Anthropic tool_use, OpenAI function calling). When the LLM calls a tool, the SDK handles execution.

**How it works:**
```typescript
const composio = new Composio({ provider: new AnthropicProvider() });
const tools = await composio.tools.get("user_123", { toolkits: ["gmail", "crm"] });
// Tools are in Anthropic format — pass directly to createCompletion
// Composio handles execution + auth + error handling
```

Custom tools: `composio.tools.createCustomTool({ name, slug, execute: async (args) => { ... } })`

**Pros:**
- 1000+ pre-built integrations (Gmail, Calendar, CRM, Slack, etc.)
- Per-user OAuth scoping handled
- Provider-native tool format
- Custom tools for Ditto-specific operations

**Cons:**
- External dependency and service
- Adds network latency to every tool call
- Composio manages auth — conflicts with Ditto's credential vault (ADR-005)
- Cost at scale (API calls per tool execution)
- Violates composition principle if used as a black box

### Option C: Direct Function Injection (no registry)

Skip the integration registry entirely. Inject tool functions directly into the step execution context.

**How it works:**
```typescript
// In step executor, before LLM call:
const tools = [
  { name: "send_email", fn: async (args) => channel.send(args) },
  { name: "record_interaction", fn: async (args) => people.recordInteraction(args) },
];
// Convert to LlmToolDefinition, pass to createCompletion
```

**Pros:**
- Simplest possible implementation
- No YAML, no registry, no protocol routing
- Direct and obvious

**Cons:**
- Bypasses integration registry — loses consistency with CLI/REST tools
- No YAML declaration — process templates can't declare which tools they need
- Harder to audit (no registry to query)
- Doesn't scale to external integrations

---

## Finding 2: Continuous Operation ("Pulse") Patterns

### Option A: OpenClaw Heartbeat Pattern

**Source:** OpenClaw (`docs/gateway/heartbeat.md`), Clawchief (`snarktank/clawchief`)
**Referenced in:** Insight-141

**How it works:**
A recurring agent turn (default every 30 minutes) that runs a checklist defined in `HEARTBEAT.md`. Each tick:
1. Check which tasks are due (based on interval: 30m, 1h, daily)
2. Execute only due tasks
3. If nothing needs attention → `HEARTBEAT_OK` (suppressed, no noise)
4. If action needed → execute, report, deliver to channel

**Key design: heartbeat runs in the MAIN session with full context.** The agent sees all workspace state, all history. This is what makes it an "advisor checking in" rather than an isolated cron job.

**Clawchief specifics:**
- `HEARTBEAT.md` defines the checklist (priority-map, tasks, recurring checks)
- Cron jobs handle precise-timing work in ISOLATED sessions
- Skills directories hold workflow logic (executive-assistant, business-development)
- Design principle: "Keep cron prompts short, let skills hold workflow logic"

**Configuration:**
- `every`: interval (default 30m)
- `activeHours`: e.g., `{ start: "08:00", end: "22:00", timezone: "Pacific/Auckland" }`
- `lightContext`: use minimal bootstrap files (faster, cheaper)
- `ackMaxChars`: 300 (suppress short "all clear" responses)

**Pros:**
- Full session context — the agent KNOWS what's going on
- Pattern match for "EA checking their todo list every morning"
- Already validated in production (OpenClaw platform)
- Simple — it's just a recurring agent turn with a checklist

**Cons:**
- LLM call every tick (cost: ~$0.02-0.10 per heartbeat depending on context size)
- Agent-driven, not data-driven — the LLM decides what to do, not the code
- No guaranteed execution order — agent might miss things
- OpenClaw specific — tied to their Gateway infrastructure

### Option B: Temporal Entity Workflow Pattern

**Source:** Temporal (`temporal.io`)

**How it works:**
A workflow that represents a persistent entity (e.g., a user's advisor relationship). The workflow runs forever via `continueAsNew()`:

```typescript
export async function advisorWorkflow(state: AdvisorState) {
  while (true) {
    // Check for signals (inbound events like email replies)
    const signal = checkSignals();
    if (signal) await handleSignal(signal, state);

    // Check for timed work
    await checkTimeouts(state);
    await checkScheduledWork(state);

    // Sleep until next check
    await sleep('5m');

    // Reset history when it gets too large
    if (workflowInfo().continueAsNewSuggested) {
      await continueAsNew<typeof advisorWorkflow>(state);
    }
  }
}
```

**Key primitives:**
- `sleep(duration)` — durable timer (survives crashes)
- `continueAsNew()` — reset event history while preserving workflow identity
- Signals — send data into a running workflow (for events like "reply received")
- Activities — execute business logic with retry and timeout

**Pros:**
- Industrial-grade durability (survives crashes, server restarts, deploys)
- State management is built-in
- Signals provide clean event-driven triggering
- Well-established pattern for long-running entity management

**Cons:**
- Requires Temporal server (Java-based, heavy infrastructure)
- Overkill for single-user dogfood phase (ADR-018 defers this)
- Complex programming model (history replay, determinism constraints)
- Vendor lock-in concerns

### Option C: Inngest Event-Driven + Cron Hybrid

**Source:** Inngest (`inngest.com`)

**How it works:**
Combine cron-triggered functions with `step.waitForEvent()` for event-driven branching:

```typescript
// Pulse function — runs every 5 minutes
const pulse = inngest.createFunction(
  { id: "advisor-pulse", triggers: { cron: "*/5 * * * *" } },
  async ({ step }) => {
    // Check for timed work
    const pendingFollowups = await step.run("check-timeouts", () =>
      db.query("SELECT * FROM outreach WHERE sent_at < NOW() - INTERVAL '5 days' AND no_reply")
    );

    // Start follow-up processes
    for (const contact of pendingFollowups) {
      await step.sendEvent("start-followup", {
        name: "followup/start",
        data: { personId: contact.id }
      });
    }
  }
);

// Follow-up function — event-triggered
const followup = inngest.createFunction(
  { id: "follow-up", triggers: { event: "followup/start" } },
  async ({ event, step }) => {
    await step.run("draft", () => draftFollowUp(event.data.personId));
    const approval = await step.waitForEvent("wait-approval", {
      event: "followup/approved",
      timeout: "2d",
      if: `async.data.personId == "${event.data.personId}"`
    });
    if (approval) {
      await step.run("send", () => sendFollowUp(event.data.personId));
    }
  }
);
```

**Key primitives:**
- Cron functions for periodic scanning
- `step.waitForEvent()` for durable event waiting with timeout
- `step.sendEvent()` for triggering other functions
- `step.sleep()` for durable delays

**Pros:**
- Clean separation: cron handles scanning, events handle reactions
- Durable execution — survives restarts
- SSPL license — can self-host
- TypeScript-native

**Cons:**
- Requires Inngest server or cloud service
- SSPL license concerns for commercial use
- Sequential execution only (within a function)
- Another infrastructure component to manage

### Option D: BullMQ + Node-Cron Hybrid (what Ditto already has)

**Source:** BullMQ, node-cron

**How it works:**
Extend Ditto's existing `scheduler.ts` (which uses node-cron) with a periodic "pulse" job:

```typescript
// Register the pulse as a cron job
cron.schedule('*/5 * * * *', async () => {
  await scanForWork();     // Check timeouts, pending chains
  await processChains();   // Read completed runs, fire chain triggers
  await composeStatus();   // Draft and send user updates
});
```

For delayed work (e.g., follow-up in 5 days), use BullMQ with Redis:
```typescript
await queue.add('follow-up', { personId }, { delay: 5 * 24 * 60 * 60 * 1000 });
```

Or without Redis, use a `delayed_runs` table:
```sql
CREATE TABLE delayed_runs (
  id TEXT PRIMARY KEY,
  process_slug TEXT NOT NULL,
  inputs JSON NOT NULL,
  execute_at INTEGER NOT NULL,  -- timestamp
  status TEXT DEFAULT 'pending'
);
```
The pulse checks this table every tick and starts runs whose `execute_at` has passed.

**Pros:**
- Builds on existing infrastructure (node-cron already in use)
- No new external dependencies (if using delayed_runs table instead of Redis)
- Simple, understandable, debuggable
- SQLite-compatible (no Redis needed for MVP)

**Cons:**
- Not durable across crashes (node-cron timers reset on restart — mitigated by DB-backed scheduling)
- No event waiting primitive (waitForEvent) — polling only
- Manual state management
- Won't scale to multi-instance without Redis or equivalent

### Option E: Trigger.dev Managed Execution

**Source:** Trigger.dev v4

**How it works:**
Define scheduled tasks and waitpoint-based flows:

```typescript
// Periodic pulse
const pulse = schedules.task({
  id: "advisor-pulse",
  cron: { pattern: "*/5 * * * *" },
  run: async () => {
    const work = await checkForWork();
    for (const item of work) {
      await triggerTask("process-work", { payload: item });
    }
  }
});

// Human-in-the-loop with waitpoint
const approvalFlow = task({
  id: "outreach-approval",
  run: async ({ payload }) => {
    const draft = await draftIntro(payload);
    const token = await wait.createToken({ timeout: "2d" });
    // Send email with token.url as callback
    await sendApprovalEmail(payload.email, draft, token.url);
    const result = await wait.forToken(token.id);
    if (result.ok) await sendOutreach(payload);
  }
});
```

**Key primitives:**
- `schedules.task()` with cron patterns
- `wait.createToken()` + `wait.forToken()` for durable HITL
- Waitpoint callback URLs for external services (email links, webhooks)
- Dynamic per-user schedules via `schedules.create()`

**Pros:**
- Purpose-built for AI agent workflows
- Durable execution with no infrastructure management
- Waitpoint tokens are perfect for email-based approvals
- Per-user dynamic scheduling
- TypeScript-native, modern API

**Cons:**
- Cloud service dependency (or self-host, which is complex)
- Another infrastructure component
- Cost at scale
- Lock-in concerns

---

## Finding 3: Chain Execution Patterns

How do different systems handle "when process A completes, start process B"?

### Temporal: Child Workflows + Signals
Parent workflow starts child workflows. On completion, parent receives result and decides next step. Signals enable cross-workflow communication.

### Inngest: Event Fan-Out
Process A completion sends an event. Process B listens for that event. Clean decoupling — A doesn't know about B.

### n8n: Execute Workflow Node
Workflow A contains an "Execute Workflow" node that starts Workflow B. Sequential, explicit chaining.

### BullMQ: Job Dependencies
Parent-child job relationships. Child jobs must complete before parent job completes. FlowProducer creates dependency trees.

### OpenClaw: Skills Reference Other Skills
No formal chain concept. Skills call other skills within the same session. The heartbeat checklist implicitly chains work by checking conditions.

### Ditto (current): YAML-Only
Chain definitions in process YAML. Zero execution code. The ProcessDefinition interface doesn't even include a `chain` field.

---

## Finding 4: Inbound Email → Process Routing Patterns

### AgentMail Webhook Format
POST to configured URL with JSON payload. Key fields:
- `event_type: "message.received"`
- `message.from` — sender email (for person matching)
- `message.text` — extracted reply text (no HTML)
- `message.subject` — for thread matching
- `thread.thread_id` — for conversation continuity
- Payload limit: 1MB. Large bodies omitted — fetch via API.

### Recommended Processing Pattern (from AgentMail docs)
Flask/Express receives webhook, returns 200 immediately, processes in background:
1. Parse sender → match person
2. Classify intent (LLM or rules-based)
3. Route to appropriate handler (resume step, start process, record interaction)
4. Reply via `client.inboxes.messages.reply()` if needed

---

## Finding 5: Status Reporting / Proactive Update Patterns

### OpenClaw: Heartbeat with Delivery Targets
Heartbeat output can be routed to: `last` (most recent channel), `none` (suppress), or specific channel. If nothing needs attention → `HEARTBEAT_OK` → suppressed.

### Temporal: Query Interface
External systems query workflow state at any time. No push mechanism — consumer polls.

### Inngest: Step-Based Status Events
Functions emit events at step boundaries. Subscribers can aggregate into status reports.

### n8n: Webhook + HTTP Request
Workflows can POST status updates to any endpoint (Slack, email, etc.) as a step.

### Pipeline Briefing Pattern (common across all)
Periodic process that:
1. Queries current state (active runs, pending approvals, recent outcomes)
2. Formats into human-readable summary
3. Delivers via appropriate channel (email, Slack, push notification)

---

## Gap Analysis

| Capability | Existing in Ditto | Exists in External Tool | Original to Ditto |
|-----------|-------------------|------------------------|-------------------|
| Internal protocol handler for engine tools | Architecture supports (tool-resolver.ts) | Composio custom tools pattern | Implementation is original |
| Periodic pulse timer | node-cron scheduler exists | OpenClaw heartbeat, Temporal entity workflow, Inngest cron | Pattern well-established |
| Chain execution (process → follow-on) | YAML declarations exist, no code | Temporal child workflows, Inngest event fan-out | Execution engine is original |
| Delayed process runs (5-day timeout) | Not implemented | Inngest step.sleep, Temporal durable timer, BullMQ delayed jobs | Need to build |
| Event-driven triggering | Not implemented | Inngest waitForEvent, Temporal signals | Need to build |
| Inbound email routing | AgentMail adapter exists, no webhook | AgentMail webhooks documented | Webhook handler original |
| Status composition | Not implemented | OpenClaw heartbeat target, n8n workflow step | Original composition logic |
| Weekly-briefing template | Referenced but missing | n/a (content is domain-specific) | Original to Ditto |

---

## Summary of Options

### For Integration Tools:
- **Option A (Internal Protocol):** Extend existing registry. Zero dependencies. Original but natural.
- **Option B (Composio):** Managed SDK. 1000+ tools. External dependency + cost.
- **Option C (Direct Injection):** Simplest. Bypasses registry. Doesn't scale.

### For Continuous Operation:
- **Option A (OpenClaw Heartbeat):** LLM-driven checklist. Full context. Cost per tick.
- **Option B (Temporal Entity):** Industrial durability. Heavy infrastructure.
- **Option C (Inngest Hybrid):** Event+cron. Durable. External service.
- **Option D (Extend node-cron):** Build on existing. SQLite-backed delays. No new deps.
- **Option E (Trigger.dev):** Purpose-built for AI. Waitpoints for HITL. Cloud dependency.

Reference docs checked: `docs/landscape.md` — evaluations for Temporal, Inngest, Trigger.dev, BullMQ still current. No drift found.
