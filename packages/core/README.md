# @ditto/core

Reusable engine primitives for governed AI process execution. Provides the harness pipeline, trust system, LLM abstraction, cognitive framework, and database schema that any application can build on.

## What's Inside

| Module | Import | Contents |
|--------|--------|----------|
| **Database** | `@ditto/core/db` | Core schema (processes, runs, steps, memories, trust, feedback), type unions, `CoreDatabase` type |
| **Harness** | `@ditto/core/harness` | Pipeline runner, handler interface, context types, built-in handlers (routing, trust-gate, step-execution) |
| **Trust** | `@ditto/core/trust` | Constants, diff computation, edit severity classification |
| **LLM** | `@ditto/core/llm` | Provider-agnostic types (messages, tools, completions), purpose-based routing types, utility functions |
| **Cognitive** | `@ditto/core/cognitive` | Cognitive framework loader (configurable path, caching, section extraction) |
| **Content Blocks** | `@ditto/core` | 22 typed content block definitions + text fallback renderer |
| **Interfaces** | `@ditto/core` | `EngineConfig`, `StepAdapter`, `SystemAgentHandler`, `MemoryProvider` |

## Usage

```typescript
import {
  HarnessPipeline,
  createHarnessContext,
  routingHandler,
  trustGateHandler,
  stepExecutionHandler,
  setAdapterRegistry,
  type EngineConfig,
  type StepAdapter,
} from "@ditto/core";

// 1. Register your adapters
setAdapterRegistry({
  "ai-agent": myClaudeAdapter,
  "email-agent": myEmailAdapter,
});

// 2. Build the harness pipeline
const pipeline = new HarnessPipeline();
pipeline.register(stepExecutionHandler);
pipeline.register(routingHandler);
pipeline.register(trustGateHandler);

// 3. Create context and run
const context = createHarnessContext({
  processRun: { id: "run-1", processId: "proc-1", inputs: { task: "..." } },
  stepDefinition: myStep,
  processDefinition: myProcess,
  trustTier: "supervised",
  stepRunId: "step-run-1",
});

const result = await pipeline.run(context);
```

## Architecture

```
Consumer (Ditto, ProcessOS, etc.)
  │
  ├── Provides: database, adapters, system agents, cognitive framework
  │
  └── @ditto/core
        ├── Harness pipeline (chain-of-responsibility)
        ├── Process types (YAML definitions → typed structures)
        ├── Trust system (tiers, sampling, diff classification)
        ├── LLM types (provider-agnostic contract)
        ├── Cognitive framework (configurable markdown loader)
        ├── Content blocks (22-type discriminated union)
        └── Database schema (Drizzle, portable across SQLite/Postgres)
```

## What Stays in the Consumer

- **LLM provider implementations** — the actual Anthropic/OpenAI/Google SDK calls
- **Adapters** — Claude CLI adapter, script adapter, etc.
- **DB-coupled handlers** — memory-assembly, feedback-recorder, metacognitive-check, review-pattern
- **System agents** — intake classifier, orchestrator, router, etc.
- **Conversational Self** — the personality and delegation layer
- **Process YAML files** — domain-specific process definitions
- **Frontend** — web app, Telegram bot, etc.

## Extraction Status

Phase 1 (complete): Package structure, types, interfaces, pure modules.

Phase 2 (next): Dependency inversion — replace `import { db } from "../db"` with injected database in the DB-coupled handlers, then move them to core.

Phase 3 (future): Move LLM provider implementations, integration handlers, and heartbeat engine to core once DB injection is complete.
