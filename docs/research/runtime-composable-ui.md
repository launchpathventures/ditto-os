# Research: Runtime Composable UI for Agent-Driven Platforms

**Date:** 2026-03-20
**Status:** complete
**Researcher:** Dev Researcher
**Research question:** How do we ensure our UI is composable at runtime around universal components in response to the need of the user? What is the best technical approach and what are others doing?

---

## Context

Agent OS's architecture already defines 16 domain-agnostic UI primitives and 8 view compositions. The current design assumes views are **pre-composed** — Home = Brief + Queue + Capture. This research investigates the next step: making view composition **dynamic** — driven by agent intent, user need, or data shape at runtime, rather than hardcoded screens.

The motivating insight: as software matures, opinionated functional UIs (CRM, accounts, HR) will not necessarily be interacted with directly by humans. Agents handle the work; humans need UI only when required to complete one of the six jobs (Orient, Review, Define, Delegate, Capture, Decide). The UI should compose itself around the job, not around the domain.

---

## 1. Server-Driven UI (SDUI) — Production Patterns at Scale

### 1.1 The Core Architecture

SDUI is the most battle-tested approach to runtime UI composition. The server — rather than the client — controls the structure, layout, and composition of the interface. The client maintains a **component registry** and renders whatever the server describes.

**The universal pattern across all SDUI implementations:**

1. Client maintains a component registry — a map of type names to renderer implementations
2. Server sends JSON with component type IDs, data payloads, and layout instructions
3. Client parses JSON, looks up component type in registry, instantiates renderer with data
4. Renderer produces native UI

**The key architectural separation:**
- **Server decides:** What to show (which components, what data, personalisation, context)
- **Client decides:** How to show it (design polish, native interactions, animations, accessibility)

### 1.2 Airbnb — Ghost Platform

- **Source:** [Airbnb Engineering Blog](https://medium.com/airbnb-engineering/a-deep-dive-into-airbnbs-server-driven-ui-system-842244c5f5)
- Unified GraphQL schema across Web, iOS, Android
- Three-tier component model: **Sections** (UI groups) → **Screens** (where sections appear) → **Actions** (interactions)
- Section Components: renderers that convert a data model + SectionComponentType into native UI
- Powers majority of core features (search, listings, checkout)
- Enables rapid A/B testing without app store involvement
- **Note:** Unverified reports suggest potential deprecation (no primary source found)

### 1.3 Lyft — BFF-Driven SDUI

- **Source:** [Lyft Engineering Blog](https://eng.lyft.com/the-journey-to-server-driven-ui-at-lyft-bikes-and-scooters-c19264a0378e)
- Dedicated Backend-for-Frontend (BFF) microservice per product surface
- Unidirectional architecture: state passed for UI independently from actions
- **Key metric:** Server-driven experiments deploy in 1-2 days vs. 2+ weeks for client-driven (due to app store bake time)
- Fully server-driven live activities — server controls activity lifecycle

### 1.4 DoorDash — Facets Framework

- **Source:** [DoorDash Engineering Blog](https://careersatdoordash.com/blog/improving-development-velocity-with-generic-server-driven-ui-components/)
- Identified that UI components were strongly coupled with data models — any deviation required changes across multiple microservices
- Facets Framework: generic, server-driven UI components with **recursive data model** enabling hierarchical compositions
- Facet data flows through GraphQL; gateway flattens responses; client reconstructs hierarchy
- Decouples UI from data models for faster iteration

### 1.5 Netflix — Selective SDUI

- **Source:** [InfoQ — QCon London 2024](https://www.infoq.com/news/2024/07/netflix-server-driven-ui/)
- Uses SDUI **selectively** — for Customer Lifecycle touchpoints (notifications, onboarding, account features), NOT for core browsing
- Universal Messaging Alerts (UMA): JSON wire protocol + Hawkins design system
- Strategic choice: SDUI where speed of iteration matters more than performance; native code where performance matters most

### 1.6 Open-Source SDUI Frameworks

**DivKit (Yandex)**
- **Source:** [divkit.tech](https://divkit.tech/en/), [GitHub](https://github.com/divkit/divkit)
- Apache 2.0 licensed. Cross-platform JSON-to-native UI
- Schema generates platform-specific APIs for Android (Kotlin), iOS (Swift), Web (JS), Flutter
- Visual editor with live preview via WebSocket, Figma plugin
- Production-proven at Yandex scale

**Beagle (Zupit)**
- **Source:** [GitHub](https://github.com/ZupIT/beagle-android)
- Client registers a design system of supported components; server controls which render and with what data
- Three-pillar model: Content, Visual Structure, Flow (actions + navigation)
- JSON-to-native rendering via Jackson/Moshi serialisation

### 1.7 Key Observations — SDUI

**Advantages observed in production:**
- Rapid iteration (1-2 days vs. 2+ weeks)
- No app store delays for UI changes
- Cross-platform consistency from single backend
- A/B testing at scale without client deployments
- Data-UI decoupling — backends can refactor without UI changes

**Challenges observed in production:**
- Offline support requires comprehensive caching
- Versioning and compatibility across client versions is the largest documented challenge
- Network dependency adds latency
- Features released via SDUI lack traditional release-train stability/regression testing
- Debugging is harder when UI comes from server

---

## 2. Agent-Driven UI Protocols — Emerging Standards

### 2.1 Google A2UI (Agent-to-User Interface)

- **Source:** [a2ui.org](https://a2ui.org/), [Google Developers Blog](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/), [GitHub](https://github.com/google/A2UI)
- **Released:** December 2025. Apache 2.0 license. Version v0.8-v0.9.
- **What it is:** A declarative protocol for agents to compose UI at runtime

**How it works:**
1. Agent generates A2UI response (JSON) describing components, properties, and data model
2. Client application parses JSON
3. Client's A2UI Renderer maps abstract components to concrete implementations (React, Flutter, SwiftUI, etc.)

**Message types (server → client):**
- `createSurface` — allocate a rendering surface
- `updateComponents` — add/update component definitions
- `updateDataModel` — provide data for the surface
- `deleteSurface` — remove a surface

**Security model:**
- Declarative, not executable code
- Client maintains a **trusted component catalog** (Card, Button, TextField, etc.)
- Agent can only reference types in this catalog — no arbitrary code execution
- Framework-agnostic: client determines rendering

**Example payload:**
```json
{
  "surfaces": [{
    "id": "dashboard-1",
    "components": [{
      "id": "card-1",
      "type": "Card",
      "properties": { "title": "Outstanding Invoices" },
      "children": [...]
    }],
    "dataModel": { "totalOwed": 14200 }
  }]
}
```

**Current adoption:** Reference renderers, production use in Opal, Gemini Enterprise, Flutter GenUI

### 2.2 AG-UI (Agent-User Interaction Protocol)

- **Source:** [docs.ag-ui.com](https://docs.ag-ui.com/introduction), [GitHub](https://github.com/ag-ui-protocol/ag-ui)
- **What it is:** Event-driven bidirectional protocol connecting agent backends to user-facing applications. Complements A2UI.

**How it works:**
- ~16 standard event types for agent-user interaction
- Real-time streaming of tool results and agent status
- Bidirectional: agents send data/UI updates; users send input to redirect agent execution
- Works with A2UI for dynamic UI composition

**Relationship to A2UI:**
- A2UI = the **what** (declarative UI specification for agents to deliver widgets)
- AG-UI = the **how** (protocol for streaming events between agent and frontend)
- Together: agents generate and update UI dynamically within a conversation

**Adoption:** Production implementations in CopilotKit, Microsoft Agent Framework, Oracle Agent Specification. SDKs for React, Vue, Angular, TypeScript, Python.

### 2.3 MCP Apps (Model Context Protocol)

- **Source:** [MCP Blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- **Launched:** January 2026
- **What it is:** An MCP extension enabling interactive UI within agent conversations

**How it works:**
1. Tool metadata includes `_meta.ui.resourceUri` pointing to a UI resource
2. Client fetches HTML/JavaScript from server via `ui://` scheme
3. Client renders in sandboxed iframe
4. Bidirectional JSON-RPC communication via `postMessage`

**Key characteristics:**
- UI resources pre-served by tool server (not arbitrary streaming)
- Security via sandboxing — no parent page access
- Framework-agnostic but client-specific implementation required
- Early adoption phase

---

## 3. AI-Generated UI Composition

### 3.1 Vercel AI SDK — Generative UI (streamUI)

- **Source:** [ai-sdk.dev](https://ai-sdk.dev/docs/ai-sdk-rsc/streaming-react-components), [Vercel Blog](https://vercel.com/blog/ai-sdk-3-generative-ui)
- LLM outputs tool calls which trigger deterministic code paths
- Developer's `generate` functions produce React Server Components
- Components stream to client progressively as tokens arrive
- **Note:** AI SDK RSC development currently paused; ecosystem transitioning

**How it works:**
- Developer defines tools with Zod schemas and `generate` functions
- LLM decides which tool to call based on conversation context
- Tool's `generate` function yields loading state → final component
- React Server Components stream to client

**Limitation:** Tools must be pre-defined; LLM cannot invent new tools dynamically. Best suited for Next.js + React.

### 3.2 v0.dev by Vercel

- **Source:** [Vercel Blog](https://vercel.com/blog/announcing-v0-generative-ui)
- Multi-stage pipeline: prompt → retrieval grounding → LLM reasoning → AutoFix post-processor → code output
- Outputs production-ready React/TypeScript using Tailwind CSS + shadcn/ui
- AutoFix scans output stream for errors, unused imports, styling bugs
- **Limitation:** Design-time tool, not runtime composition. Generates code for humans to integrate.

### 3.3 OpenAI Structured Outputs

- **Source:** [platform.openai.com/docs/guides/structured-outputs](https://platform.openai.com/docs/guides/structured-outputs)
- `strict: true` mode enforces JSON Schema compliance in LLM output
- Developer defines schema (via Zod/Pydantic); model output guaranteed to match
- Can define recursive schemas for nested component trees
- **UI relevance:** Output defines component types, props, and children — application maps to renderers

### 3.4 Claude Artifacts

- **Source:** [Claude Help Center](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- Claude generates self-contained web applications rendered in a side panel
- Artifact types: `application/vnd.ant.react` (React), `text/html`, `image/svg+xml`, `text/markdown`, `application/vnd.ant.mermaid`
- Progressive streaming: UI builds as tokens arrive
- MCP integration enables artifacts that connect to external services
- **Limitation:** Vendor-specific, non-portable format. Generates executable code, not declarative data.

### 3.5 Generative UI — Academic Research

**"Generative UI: LLMs are Effective UI Generators"** (Leviathan & Valevski)
- **Source:** [generativeui.github.io](https://generativeui.github.io/static/pdfs/paper.pdf)
- Defines generative UI as a new modality: AI generates the entire UX, not just content
- Contrasts with traditional UI: layout is fixed / content dynamic → both are dynamic

**"Towards a Working Definition of Designing Generative User Interfaces"** (2025 ACM DIS)
- **Source:** [arxiv.org/abs/2505.15049](https://arxiv.org/abs/2505.15049)
- Multi-method study: 127 publications, 18 expert interviews, 12 case studies
- Key distinction: **design-time generation** (humans + AI collaborate to create) vs. **runtime generation** (UI adapts dynamically). Current tools excel at design-time; runtime adaptivity remains an open problem.

**"The GenUI Study"** (2025)
- **Source:** [arxiv.org/abs/2501.13145](https://arxiv.org/abs/2501.13145)
- Study with 37 UX professionals
- Finding: adoption depends on customisation speed and design system alignment

---

## 4. Schema-Driven and Block-Based UI Rendering

### 4.1 JSON Schema Forms

- **Source:** [react-jsonschema-form](https://github.com/rjsf-team/react-jsonschema-form)
- Two complementary schemas: JSON Schema (data structure + validation) + uiSchema (rendering hints)
- Three abstraction layers: Widgets (input types) → Fields (layout) → Field Templates (row structure)
- Ajv compiles schemas into optimised validation functions
- **Maturity:** Production-grade, widely adopted for form generation

### 4.2 Block-Based Editors (Notion, Gutenberg, Editor.js)

**Editor.js**
- **Source:** [editorjs.io](https://editorjs.io/), [GitHub](https://github.com/codex-team/editor.js)
- Core architecture: separate independent blocks united by Editor's Core
- All functional units (Blocks, Inline Tools, Block Tunes) are external plugins using Editor's API
- Clean JSON output instead of HTML — enables multi-platform rendering (web, mobile, AMP, audio)
- Plugin-based: each block type is a class with `render()`, `save()`, `validate()` methods
- **Rendering:** Block type (from JSON) → plugin lookup → render method → DOM/output

**WordPress Gutenberg**
- Block-based page composition model
- Component library provides accessible UI primitives
- Interoperability tools convert between block formats

### 4.3 Low-Code Builders (Retool, Appsmith, Tooljet)

- All share same architecture: pre-built components + data connectors + state management + event bindings
- Canvas definition stored as JSON → component instantiation → data binding → interactive updates
- **Appsmith:** Java backend, React frontend, embedded MongoDB
- **Tooljet:** Node.js backend, React frontend, PostgreSQL, debug tree view
- **Retool:** Proprietary backend, extensive data source support
- **Maturity:** All production-grade for enterprise internal tools

### 4.4 Headless CMS Patterns

**Sanity + GROQ:**
- **Source:** Sanity.io
- GROQ enables declarative querying without upfront schema knowledge ("return whatever's there")
- Portable Text: rich text stored as JSON blocks, renderable to any output format
- Pattern: content query → dynamic type detection → custom renderer per type

**Strapi:**
- Dynamic Zones allow content editors to mix content types
- Auto-generates REST/GraphQL APIs from content type definitions
- Framework-agnostic frontend consumption

### 4.5 shadcn/ui Registry Pattern

- **Source:** [ui.shadcn.com](https://ui.shadcn.com/docs/changelog/2025-08-cli-3-mcp)
- CLI 3.0 (August 2025): namespaced registries `@registry/name:component`
- No central authority — any team creates their own namespace
- Cross-registry dependencies: components can depend on resources from different registries
- Automatic dependency resolution and installation
- Private registries with enterprise auth (basic, bearer, API key, custom headers)

### 4.6 Design Token Systems

**Tailwind CSS 4 — @theme directive:**
- Tokens declared in `@theme` block as CSS custom properties
- Compiled to utilities AND available at runtime as CSS variables
- Enables runtime theming via variable override

**Radix UI:**
- Design system exposes token values as CSS variables at runtime
- Composable with Tailwind — tokens align where possible

---

## 5. Messaging Platform UI — Mature Runtime Composition

### 5.1 Slack Block Kit

- **Source:** [docs.slack.dev/block-kit](https://docs.slack.dev/block-kit/)
- Apps construct JSON-structured component definitions; Slack renders natively
- Component types: Blocks (containers), Block Elements (interactive), Composition Objects (text, options)
- Max 50 blocks per message, 100 per modal/Home tab
- Native table block added August 2025
- **Key characteristics:** Safe (no code execution), platform-native rendering, real-time updateable, constraint-enforced (limited to approved types)

### 5.2 Microsoft Teams Adaptive Cards

- **Source:** [learn.microsoft.com/en-us/adaptive-cards](https://learn.microsoft.com/en-us/adaptive-cards/)
- Open card format: JSON → platform-native rendering
- Framework-agnostic: maps to Angular, Flutter, React, SwiftUI
- Templating with dynamic values via `$` syntax and conditions
- SDKs in C#, Python, TypeScript/JavaScript
- Cross-platform: Teams, Outlook, Power Automate, third-party apps

### 5.3 Relevance to Agent OS

Both Block Kit and Adaptive Cards demonstrate mature, production-proven patterns for:
- Agents composing JSON → platform renders native UI
- Trusted component catalog approach (agents can only use approved types)
- Runtime data binding without code execution
- Cross-platform rendering from single JSON definition

---

## 6. Agent Platform UI Approaches

### 6.1 Salesforce Agentforce — Custom Lightning Types

- **Source:** [Salesforce Developers Blog](https://developer.salesforce.com/blogs/2025/07/enhance-the-agent-ui-with-custom-lwcs-and-lightning-types)
- Custom Lightning Types (CLTs): developer-defined schema + editor + renderer
- Schema (schema.json) points to Apex class for data storage
- Renderer: Lightning Web Component maps data to visual presentation
- Pattern: developer pre-defines component types; agent outputs populate them

### 6.2 Microsoft Power Apps — Generative React

- **Source:** [Power Platform Blog](https://www.microsoft.com/en-us/power-platform/blog/power-apps/whats-new-in-power-platform-february-2026-feature-update/)
- Power Apps generates working React UI from natural language descriptions
- Modern Card Control: layout-aware card primitive that adapts responsively
- Computer Use (preview): Copilot agents can operate existing apps via virtual mouse/keyboard

### 6.3 Dust.tt — Workflow Inspection UI

- **Source:** [Temporal Blog](https://temporal.io/blog/how-dust-builds-agentic-ai-temporal)
- UI displays results from each step in multi-step agent workflows
- Built on Temporal for reliable execution
- No dynamic UI composition — emphasis on workflow observability

### 6.4 Lindy AI / Relevance AI

- Both use pre-configured workflow builders with drag-and-drop
- No dynamic/generative UI composition
- Agent outputs go to connected services (Slack, CRM, spreadsheet), not composed UIs

---

## 7. Cross-Cutting Observations

### 7.1 Six Composition Patterns Identified

| Pattern | Example | Agent composes? | Safety model | Maturity |
|---------|---------|----------------|--------------|----------|
| **Declarative JSON → Component registry** | SDUI (Airbnb), Block Kit, Adaptive Cards, A2UI | Yes — emits JSON | Trusted catalog | Production-proven |
| **Generative code** | Claude Artifacts, v0.dev | Yes — emits code | Sandbox execution | Production but vendor-specific |
| **Schema → Form/View** | JSON Schema Forms, Retool | No — developer-defined | Schema validation | Production-proven |
| **Block → Plugin** | Editor.js, Gutenberg | No — user-composed | Plugin registry | Production-proven |
| **Structured output → Renderer** | OpenAI Structured Outputs, BAML | Yes — emits typed data | Schema enforcement | Production |
| **Event protocol** | AG-UI + A2UI | Yes — streams events | Protocol-level | Emerging |

### 7.2 Constraint-Driven Success

All mature approaches rely on **constraints**, not open-ended generation:
- A2UI: predefined component catalog
- Slack Block Kit: approved block types only
- SDUI: client component registry
- Structured Outputs: JSON Schema enforcement

Production systems that have scaled successfully all rely on constraints rather than open-ended generation. Academic research ("The GenUI Study") found that adoption depends on design system alignment, and all mature production implementations surveyed use a predefined component catalog rather than arbitrary generation.

### 7.3 The Validation Stack

Three tiers emerge across all approaches:
1. **Structural validation:** Does the JSON/schema conform? (JSON Schema, Zod, Ajv)
2. **Semantic validation:** Does the component exist? Do properties make sense? (Component catalog, enum constraints)
3. **Design system alignment:** Does it match brand tokens, accessibility standards? (Design tokens, Tailwind @theme, Radix)

Current tools address 1-2; design system alignment (3) remains mostly manual.

### 7.4 Design-Time vs. Runtime

Academic research distinguishes:
- **Design-time generation:** Humans + AI collaborate to create interfaces (v0.dev, Figma AI). Iterative, creative.
- **Runtime generation:** UI adapts dynamically based on context (A2UI, SDUI). Automated, responsive.

Current tools excel at design-time. Runtime adaptivity driven by agent intent is nascent. SDUI systems have done runtime composition for years, but A2UI and AG-UI are the first protocols designed specifically for **agent-driven** runtime composition (as distinct from developer-defined SDUI).

### 7.5 RSC vs. Traditional SDUI

React Server Components and traditional SDUI are both "server-driven" but solve different problems:

| Aspect | Traditional SDUI | React Server Components |
|--------|------------------|------------------------|
| Purpose | Server describes arbitrary layouts in JSON | Server executes component logic; output serialised |
| Flexibility | Any registered component type | Requires code changes for new types |
| Use case | Rapid iteration, A/B testing, no-code updates | Performance, bundle reduction, data fetching |
| Agent relevance | High — JSON is LLM-friendly | Medium — requires code generation |

---

## 8. Gaps Where No Existing Solution Fits

### 8.1 Intent-Driven View Composition

No existing system composes views from **user intent + data availability + job type**. SDUI systems require a developer to pre-define which views exist. A2UI lets an agent compose from a catalog but doesn't encode the concept of "the human needs to Orient" or "the human needs to Decide." This mapping from job-to-view is **Original to Agent OS**.

### 8.2 Trust-Aware UI Composition

No existing system adjusts what UI surfaces based on earned trust. A supervised process should show more detail and require more interaction; an autonomous process should show less. This dynamic adjustment of UI density based on trust tier is **Original to Agent OS**.

### 8.3 Process-Scoped View Assembly

SDUI systems (especially Airbnb's) compose from context + user data + personalisation + platform — a structurally similar four-dimensional model. Agent OS's version is differentiated by using **process** and **job** as first-class dimensions rather than "feature" and "personalisation." The composition pattern itself is not unprecedented; what is original is the specific dimensions Agent OS uses: process + data + job + device. This is a **differentiated application of a known pattern** rather than a wholly original concept.

### 8.4 Feedback-Embedded Composition

No existing runtime composition system embeds implicit feedback capture into the composed UI. Slack Block Kit can compose a review card, but it doesn't track edits-as-feedback or detect correction patterns. The integration of composition + feedback is **Original to Agent OS**.

---

## Sources

### SDUI
- [A Deep Dive into Airbnb's Server-Driven UI System](https://medium.com/airbnb-engineering/a-deep-dive-into-airbnbs-server-driven-ui-system-842244c5f5)
- [The Journey to Server Driven UI At Lyft](https://eng.lyft.com/the-journey-to-server-driven-ui-at-lyft-bikes-and-scooters-c19264a0378e)
- [Improving Development Velocity with Generic SDUI Components — DoorDash](https://careersatdoordash.com/blog/improving-development-velocity-with-generic-server-driven-ui-components/)
- [Netflix Saves Time and Money with Server-Driven Notifications](https://www.infoq.com/news/2024/07/netflix-server-driven-ui/)
- [DivKit — Cross-platform SDUI framework](https://divkit.tech/en/)
- [DivKit GitHub](https://github.com/divkit/divkit)
- [Beagle — A New Way of Doing SDUI](https://medium.com/@Uziasf/beagle-a-new-way-of-doing-server-driven-ui-99e5e21f8328)
- [Server-Driven UI: What Airbnb, Netflix, and Lyft Learned](https://medium.com/@aubreyhaskett/server-driven-ui-what-airbnb-netflix-and-lyft-learned-building-dynamic-mobile-experiences-20e346265305)

### Agent-Driven UI Protocols
- [A2UI — Agent-to-User Interface](https://a2ui.org/)
- [Introducing A2UI — Google Developers Blog](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)
- [A2UI Protocol v0.9](https://a2ui.org/specification/v0.9-a2ui/)
- [A2UI GitHub](https://github.com/google/A2UI)
- [AG-UI — Agent-User Interaction Protocol](https://docs.ag-ui.com/introduction)
- [AG-UI GitHub](https://github.com/ag-ui-protocol/ag-ui)
- [AG-UI Integration with Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui/)
- [MCP Apps — Bringing UI Capabilities to MCP Clients](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)

### AI-Generated UI
- [AI SDK RSC: Streaming React Components](https://ai-sdk.dev/docs/ai-sdk-rsc/streaming-react-components)
- [Introducing AI SDK 3.0 with Generative UI support](https://vercel.com/blog/ai-sdk-3-generative-ui)
- [Announcing v0: Generative UI](https://vercel.com/blog/announcing-v0-generative-ui)
- [OpenAI Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Claude Artifacts — What They Are](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Reverse-engineering Claude's generative UI](https://michaellivs.com/blog/reverse-engineering-claude-generative-ui/)

### Academic
- [Generative UI: LLMs are Effective UI Generators](https://generativeui.github.io/static/pdfs/paper.pdf)
- [Towards a Working Definition of Designing Generative User Interfaces](https://arxiv.org/abs/2505.15049)
- [The GenUI Study](https://arxiv.org/abs/2501.13145)

### Schema-Driven & Block-Based
- [react-jsonschema-form](https://github.com/rjsf-team/react-jsonschema-form)
- [BAML Documentation](https://docs.boundaryml.com/home)
- [Editor.js](https://editorjs.io/)
- [shadcn/ui CLI 3.0 Registry](https://ui.shadcn.com/docs/changelog/2025-08-cli-3-mcp)
- [Tailwind CSS 4 @theme](https://tailwindcss.com/docs/theme)
- [Radix UI Themes](https://www.radix-ui.com/themes/docs/overview/styling)

### Agent Platforms
- [Salesforce Agentforce — Custom Lightning Types](https://developer.salesforce.com/blogs/2025/07/enhance-the-agent-ui-with-custom-lwcs-and-lightning-types)
- [Power Platform February 2026 Update](https://www.microsoft.com/en-us/power-platform/blog/power-apps/whats-new-in-power-platform-february-2026-feature-update/)
- [Slack Block Kit](https://docs.slack.dev/block-kit/)
- [Microsoft Adaptive Cards](https://learn.microsoft.com/en-us/adaptive-cards/)
- [Dust.tt + Temporal](https://temporal.io/blog/how-dust-builds-agentic-ai-temporal)

### Messaging Platforms
- [Slack Block Kit Table Block (August 2025)](https://docs.slack.dev/changelog/2025/08/14/block-kit-table-block/)
- [Building with Block Kit](https://api.slack.com/block-kit/building)
- [Adaptive Cards Overview](https://learn.microsoft.com/en-us/adaptive-cards/)
