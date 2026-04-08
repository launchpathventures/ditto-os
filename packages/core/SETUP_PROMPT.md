# @ditto/core — Engine Setup Prompt

Give this prompt to your AI coding agent (Claude Code, Cursor, Copilot, etc.) to scaffold a new project that uses the Ditto engine core.

---

## Prompt

I need you to set up a new project that uses `@ditto/core` — a reusable engine for governed AI process execution. The engine provides a harness pipeline, trust system, memory architecture, and process execution framework. My project provides the adapters, cognitive framework, and process definitions.

### What @ditto/core gives us

**Harness pipeline** — a chain-of-responsibility pattern that wraps every AI step execution with quality gates:
- Memory assembly (inject context before execution)
- Step execution (dispatch to adapters)
- Metacognitive check (self-review)
- Review patterns (maker-checker, adversarial, spec-testing)
- Routing (conditional next-step selection)
- Trust gate (pause/advance based on earned trust tier)
- Feedback recording (capture corrections for learning)

**Trust system** — four tiers that processes earn over time:
- `supervised` — every output paused for human review
- `spot_checked` — ~20% sampled for review
- `autonomous` — auto-advance unless review flags an issue
- `critical` — always paused, cannot auto-advance

**Process model** — YAML-defined processes with steps, conditional routing, parallel execution, retry middleware, and human pause/resume steps.

**Database schema** — Drizzle ORM tables for processes, runs, steps, memories, trust, feedback, work items, and more. Currently SQLite; Postgres-compatible via Drizzle driver swap.

**LLM types** — provider-agnostic type contracts for messages, tools, completions. No SDK lock-in.

**Cognitive framework** — loads a markdown file (`core.md`) at startup that defines the system's judgment layer (trade-off heuristics, escalation rules, communication principles). You write your own.

**Content blocks** — 22 typed content block types (text, review cards, data tables, charts, alerts, etc.) with a text fallback renderer for any surface.

### What I need to provide

1. **Database connection** — create a SQLite (or Postgres) database and pass it to the engine
2. **Step adapters** — how my AI steps actually execute (call an LLM, send an email, run a script, etc.)
3. **Cognitive framework** — a `core.md` file that defines my system's personality and judgment rules
4. **Process definitions** — YAML files that define my workflows
5. **System agents** (optional) — pluggable handlers for intake classification, routing, orchestration

### Setup steps

#### 1. Install dependencies

```bash
# If @ditto/core is published to npm:
pnpm add @ditto/core

# If referencing from a monorepo:
# Add to pnpm-workspace.yaml and package.json: "@ditto/core": "workspace:*"
```

The core package depends on: `drizzle-orm`, `better-sqlite3`, `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`, `diff`, `yaml`, `zod`.

#### 2. Create the database

```typescript
// src/db.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as coreSchema from "@ditto/core/db";

// Create SQLite database
const sqlite = new Database("data/my-app.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema: coreSchema.schema });

// You can extend with your own tables:
// import * as appSchema from "./schema";
// export const db = drizzle(sqlite, { schema: { ...coreSchema.schema, ...appSchema } });
```

Run the core schema setup (create tables):
```typescript
// The core schema is defined via Drizzle. Use drizzle-kit push or
// write CREATE TABLE IF NOT EXISTS statements for the core tables.
// See packages/core/src/db/schema.ts for the full table definitions.
```

#### 3. Write a step adapter

A step adapter executes a single process step. This is where your business logic lives.

```typescript
// src/adapters/my-adapter.ts
import type { StepAdapter, StepDefinition, ProcessDefinition } from "@ditto/core";

export const myLlmAdapter: StepAdapter = {
  async execute(step, runInputs, processDefinition, resolvedTools) {
    // Call your LLM, API, or service here
    // step.agent_role, step.description, step.config are available
    // runInputs contains the data flowing through the process

    const response = await callMyLlm({
      system: `You are a ${step.agent_role}. ${step.description}`,
      message: JSON.stringify(runInputs),
    });

    return {
      outputs: { result: response.text },
      tokensUsed: response.tokens,
      costCents: response.cost,
      confidence: "high", // or "medium" or "low"
      model: "claude-sonnet-4-6",
    };
  },
};

// For email-based execution:
export const emailAdapter: StepAdapter = {
  async execute(step, runInputs, processDefinition) {
    const emailBody = runInputs.emailBody as string;
    const analysis = await analyzeEmail(emailBody);

    return {
      outputs: { analysis, recommendation: analysis.recommendation },
      confidence: analysis.confidence,
    };
  },
};

// For script/deterministic execution:
export const scriptAdapter: StepAdapter = {
  async execute(step, runInputs) {
    const result = await runShellCommand(step.commands?.[0] ?? "echo done");
    return { outputs: { stdout: result } };
  },
};
```

#### 4. Write your cognitive framework

Create a `cognitive/core.md` file. This is loaded at startup and injected into every LLM prompt. It defines how your system thinks and communicates.

```markdown
# [Your System Name] — Core Judgment

## Consultative Protocol
1. Listen carefully to the request.
2. Assess what information is needed.
3. Ask clarifying questions if uncertain.
4. Execute with transparency.
5. Report results with confidence assessment.

## Values
- Accuracy over speed.
- Transparency over convenience.
- Human judgment over AI confidence.

## Trade-Off Heuristics
1. When uncertain, ask rather than guess.
2. When data conflicts, flag both sources.
3. When scope is unclear, do less rather than more.

## Communication
- Be direct and professional.
- Lead with the answer, then explain.
- Flag uncertainties explicitly.
```

#### 5. Wire it all together

```typescript
// src/engine.ts
import {
  HarnessPipeline,
  createHarnessContext,
  harnessEvents,
  setAdapterRegistry,
  setSystemAgentResolver,
  configureCognitivePath,
  // Built-in handlers
  stepExecutionHandler,
  routingHandler,
  trustGateHandler,
  // Types
  type HarnessContext,
  type ProcessDefinition,
  type StepDefinition,
} from "@ditto/core";

import { myLlmAdapter, emailAdapter, scriptAdapter } from "./adapters/my-adapter";

// 1. Configure cognitive framework
configureCognitivePath("./cognitive/core.md");

// 2. Register adapters (keyed by executor type from your YAML)
setAdapterRegistry({
  "ai-agent": myLlmAdapter,
  "email-agent": emailAdapter,
  "script": scriptAdapter,
});

// 3. Build the harness pipeline
// Register handlers in the order you want them to run.
// You can add your own custom handlers too.
const pipeline = new HarnessPipeline();
pipeline.register(stepExecutionHandler);  // Execute the step
pipeline.register(routingHandler);        // Conditional routing
pipeline.register(trustGateHandler);      // Trust-based pause/advance

// 4. Subscribe to events (optional — for logging, notifications, etc.)
harnessEvents.on((event) => {
  console.log(`[harness] ${event.type}:`, event);
});

// For specific events:
harnessEvents.onType("gate-pause", (event) => {
  // Send notification: "Output needs review"
  notifyHuman(event.processRunId, event.stepId, event.output);
});

harnessEvents.onType("run-complete", (event) => {
  console.log(`Process ${event.processName} completed (${event.stepsExecuted} steps)`);
});

// 5. Execute a process step
export async function runStep(
  processDefinition: ProcessDefinition,
  step: StepDefinition,
  inputs: Record<string, unknown>,
  trustTier: "supervised" | "spot_checked" | "autonomous" | "critical" = "supervised",
) {
  const context = createHarnessContext({
    processRun: {
      id: crypto.randomUUID(),
      processId: processDefinition.id,
      inputs,
    },
    stepDefinition: step,
    processDefinition,
    trustTier,
    stepRunId: crypto.randomUUID(),
  });

  const result = await pipeline.run(context);

  return {
    outputs: result.stepResult?.outputs ?? {},
    trustAction: result.trustAction,       // "pause" | "advance" | "sample_pause" | "sample_advance"
    reviewResult: result.reviewResult,     // "pass" | "flag" | "retry" | "skip"
    routingDecision: result.routingDecision, // { nextStepId, reasoning, confidence, mode }
    confidence: result.stepResult?.confidence,
  };
}
```

#### 6. Define a process (YAML)

```yaml
# processes/email-analysis.yaml
name: Email Analysis
id: email-analysis
version: 1
status: active
description: Analyze incoming emails and route to appropriate handler

trigger:
  type: event
  event: email.received

inputs:
  - name: emailBody
    type: text
    source: trigger
    required: true
  - name: sender
    type: text
    source: trigger
    required: true

steps:
  - id: classify
    name: Classify Email
    executor: ai-agent
    agent_role: classifier
    description: Classify the email intent (inquiry, complaint, order, spam)
    route_to:
      - condition: "inquiry"
        goto: handle-inquiry
      - condition: "complaint"
        goto: handle-complaint
      - condition: "order"
        goto: handle-order
    default_next: handle-inquiry

  - id: handle-inquiry
    name: Handle Inquiry
    executor: ai-agent
    agent_role: responder
    description: Draft a helpful response to the inquiry
    depends_on: [classify]

  - id: handle-complaint
    name: Handle Complaint
    executor: ai-agent
    agent_role: responder
    description: Draft an empathetic response addressing the complaint
    depends_on: [classify]
    harness:
      review: [maker-checker]  # Always review complaint responses

  - id: handle-order
    name: Handle Order
    executor: ai-agent
    agent_role: order-processor
    description: Extract order details and confirm
    depends_on: [classify]

outputs:
  - name: response
    type: text
    destination: email-reply

quality_criteria:
  - Response addresses the sender's intent
  - Tone matches the context (professional, empathetic, etc.)
  - No hallucinated information

trust:
  initial_tier: supervised
  upgrade_path:
    - after: "20 runs at ≥90% approval"
      upgrade_to: spot_checked
  downgrade_triggers:
    - "3 rejections in 10 runs"

feedback:
  metrics:
    - name: response_quality
      description: Overall quality of generated response
      target: ">90% approval rate"
  capture:
    - approval_rate
    - edit_patterns
```

#### 7. Load and run a process

```typescript
// src/main.ts
import YAML from "yaml";
import fs from "fs";
import { runStep } from "./engine";
import type { ProcessDefinition, StepDefinition } from "@ditto/core";

// Load process definition
const yaml = fs.readFileSync("processes/email-analysis.yaml", "utf-8");
const process = YAML.parse(yaml) as ProcessDefinition;

// Find the first step
const firstStep = process.steps[0] as StepDefinition;

// Run it
const result = await runStep(process, firstStep, {
  emailBody: "Hi, I'd like to know about your pricing for the enterprise plan.",
  sender: "customer@example.com",
});

console.log("Output:", result.outputs);
console.log("Trust action:", result.trustAction);
// If trustAction is "pause" → show to human for review
// If trustAction is "advance" → continue to next step
// If routingDecision.nextStepId → run that step next
```

### Key types reference

```typescript
// From @ditto/core

// Trust tiers
type TrustTier = "supervised" | "spot_checked" | "autonomous" | "critical";

// Trust actions (what the gate decides)
type TrustAction = "pause" | "advance" | "sample_pause" | "sample_advance";

// Review results (from review patterns)
type ReviewResult = "pass" | "flag" | "retry" | "skip";

// Step execution result (what your adapter returns)
interface StepExecutionResult {
  outputs: Record<string, unknown>;
  tokensUsed?: number;
  costCents?: number;
  confidence?: "high" | "medium" | "low";
  model?: string;
}

// Process run statuses
type RunStatus = "queued" | "running" | "waiting_review" | "waiting_human"
  | "approved" | "rejected" | "failed" | "cancelled" | "skipped";

// Work item types
type WorkItemType = "question" | "task" | "goal" | "insight" | "outcome";

// Memory scopes
type MemoryScopeType = "agent" | "process" | "self" | "person";
```

### Custom harness handlers

You can write your own handlers to extend the pipeline:

```typescript
import type { HarnessHandler, HarnessContext } from "@ditto/core";

const myLoggingHandler: HarnessHandler = {
  name: "my-logger",

  canHandle(context: HarnessContext): boolean {
    return true; // Run for every step
  },

  async execute(context: HarnessContext): Promise<HarnessContext> {
    console.log(`Step ${context.stepDefinition.name}: `, {
      trustTier: context.trustTier,
      hasResult: !!context.stepResult,
      confidence: context.stepResult?.confidence,
    });
    return context; // Pass through unchanged
  },
};

// Register it in your pipeline
pipeline.register(myLoggingHandler);
```

### Content blocks for rendering

If your surface needs structured UI rendering:

```typescript
import { type ContentBlock, renderBlockToText } from "@ditto/core";

// Create blocks programmatically
const blocks: ContentBlock[] = [
  { type: "text", text: "## Analysis Complete" },
  {
    type: "review_card",
    processRunId: "run-123",
    stepName: "Email Classification",
    outputText: "This is an inquiry about enterprise pricing.",
    confidence: "high",
    actions: [
      { id: "approve", label: "Approve", style: "primary" },
      { id: "edit", label: "Edit", style: "secondary" },
      { id: "reject", label: "Reject", style: "danger" },
    ],
  },
  {
    type: "data",
    format: "key_value",
    title: "Classification",
    data: { intent: "inquiry", confidence: "92%", category: "pricing" },
  },
];

// Render to plain text (for email, CLI, logs, etc.)
for (const block of blocks) {
  console.log(renderBlockToText(block));
}
```

### My specific project

[Describe your project here. For example:]

- **Project name**: ProcessOS
- **What it does**: Deploys AI agents for small businesses via email
- **How processes trigger**: Email arrives → process starts → analysis runs → response sent via email
- **Adapters needed**: LLM adapter (for analysis), email adapter (for sending responses)
- **Trust model**: Start supervised, earn trust per client/process
- **Surfaces**: Email in/out, admin dashboard (later)

Please scaffold this project with:
1. Package setup (package.json, tsconfig.json)
2. Database initialization
3. Step adapters for my use case
4. A cognitive/core.md tailored to my domain
5. Example process YAML files
6. Main entry point that wires everything together
7. A simple way to trigger a process (CLI command or HTTP endpoint)
