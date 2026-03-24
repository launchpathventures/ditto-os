# Research Reports Index

Reports in `docs/research/`. Detailed pattern analysis feeding architectural decisions.

| Report | Topic | Date | Status | Consumed by |
|--------|-------|------|--------|-------------|
| `knowledge-management-for-ai-dev.md` | Knowledge lifecycle, context tiering, state splitting for AI-dev | 2026-03-20 | Active | Pending — Architect to design meta-process |
| `context-and-token-efficiency.md` | Context assembly, caching, compression, model routing (30+ sources) | 2026-03-20 | Active | ADR-012 |
| `human-cognition-models-for-ditto.md` | Cognitive science for work oversight (7 frameworks, 3 architectures) | 2026-03-20 | Active | ADR-013 |
| `autonomous-oversight-patterns.md` | Confidence routing, batch/digest, management by exception | 2026-03-20 | Active | ADR-011 |
| `workspace-interaction-model.md` | 14 systems: work input, HITL, work evolution, meta-processes | 2026-03-20 | Active | ADR-010 |
| `phase-4-composition-sweep.md` | 7 projects: agent assembly, routing, HITL, middleware, CLI | 2026-03-20 | Active | Briefs 011-016 |
| `phase-4-workspace-cli-ux.md` | CLI interaction spec: personas, commands, formatting | 2026-03-20 | Consumed | Briefs 012, 013 |
| `phase-4-design-assessment.md` | Phase 4 design readiness assessment | 2026-03-20 | Consumed | Brief 011 |
| `phase-4a-research-validation.md` | Phase 4a research validation | 2026-03-20 | Consumed | Brief 012 |
| `qa-tester-role-in-dev-pipeline.md` | QA as role: 6 options, 11 projects | 2026-03-20 | Consumed | Decision: no 8th role |
| `runtime-composable-ui.md` | SDUI, A2UI, AG-UI, schema-driven rendering | 2026-03-20 | Active | ADR-009 |
| `pre-baked-agents-and-process-templates.md` | Templates, system agents, cold-start, APQC | 2026-03-20 | Active | ADR-008 |
| `hosted-cloud-patterns.md` | 10 OSS projects' hosted cloud approaches | 2026-03-20 | Active | ADR-006 |
| `runtime-deployment-models.md` | Cloud vs local vs hybrid, always-on, cost, sovereignty | 2026-03-20 | Active | ADR-006 |
| `process-discovery-from-organizational-data.md` | Process mining, 7 data sources, 5 discovery approaches | 2026-03-20 | Active | ADR-006 (Analyze mode) |
| `external-integrations-architecture.md` | 7 options, 6 patterns, CLI/MCP/REST comparison | 2026-03-20 | Active | ADR-005 |
| `ux-process-design-role.md` | 5 options for UX/process design role | 2026-03-20 | Consumed | ADR-004 |
| `mobile-remote-experience-ux.md` | Mobile UX spec: primitives, three-depth review, notifications | 2026-03-20 | Active | Phase 13 |
| `mobile-interfaces-for-agent-platforms.md` | Mobile UX patterns, PWA vs native, approval patterns | 2026-03-20 | Active | Phase 13 |
| `input-type-taxonomies.md` | Input taxonomies: PM tools, GTD, BPMN, ITIL, AI agents | 2026-03-20 | Active | Phase 4 work items |
| `trust-earning-patterns.md` | Trust algorithms, multi-source, gaming prevention | 2026-03-20 | Consumed | ADR-007, Briefs 008-009 |
| `trust-visibility-ux.md` | 18 UX patterns for trust visibility | 2026-03-20 | Consumed | Brief 008 |
| `phase-3-trust-earning-ux.md` | UX spec: persona journeys, interaction patterns | 2026-03-20 | Consumed | Brief 007 |
| `oversight-frequency-calibration.md` | Oversight frequency patterns | 2026-03-20 | Active | ADR-011 |
| `phase-2-harness-patterns.md` | Harness patterns across 7 projects | 2026-03-19 | Consumed | Briefs 003-005 |
| `memory-systems.md` | 9 memory systems surveyed | 2026-03-19 | Consumed | ADR-003 |
| `process-driven-skill-orchestration.md` | Skill orchestration patterns | 2026-03-20 | Active | Brief 016 |
| `qmd-obsidian-knowledge-search.md` | QMD markdown search, Obsidian patterns, OpenClaw memory model | 2026-03-21 | Active | Pending — Insight-042 (knowledge-manager), landscape.md |
| `goal-directed-orchestrator-patterns.md` | Goal decomposition, work-queue scheduling, confidence-based stopping across 12 frameworks | 2026-03-21 | Active | Phase 5 brief, ADR-010, Insight-045 |
| `phase-5-orchestrator-ux.md` | Orchestrator UX: goal setting, decomposition visibility, progress/routing, stopping conditions, templates | 2026-03-21 | Active | Phase 5 brief (Architect) |
| `cognitive-prompting-architectures.md` | Cognitive architectures for agents: structured reasoning evidence, executive function, metacognition, structure-vs-intuition balance (30+ sources) | 2026-03-21 | Active | ADR-014 (Agent Cognitive Architecture) |
| `llm-model-routing-patterns.md` | Model routing patterns: per-step selection, capability hints, model tracking, learned routing, multi-provider families (11 projects) | 2026-03-23 | Active | Brief 033 (Model Routing Intelligence) |
| `rendered-output-architectures.md` | AI-generated UI rendering: json-render (deep extraction), Vercel AI SDK, OpenUI, Streamlit/Gradio. Catalog/registry/renderer patterns, streaming, cross-platform, actions, state. 8 key patterns, 5 gaps (Original to Ditto) | 2026-03-23 | Active | ADR-009 reframe, output architecture design, Insights 066/067 |
| `phase-10-dashboard-workspace.md` | Phase 10 Web Dashboard: AI workspace UIs (10 products + Paperclip deep dive), HITL oversight UX, process visualization, streaming (AG-UI), tech stack, AI SDK Elements deep dive (3 examples: chatbot, IDE, v0), three-layer rendering architecture (React chrome + json-render outputs + AI SDK conversation), full component dependency stack. 5 cross-cutting patterns, 5 Ditto-original gaps. | 2026-03-24 | Active | Brief 037 (Phase 10 MVP), Dev Architect, Dev Designer |
| `api-to-tool-generation.md` | API spec→tool generation (Composio, LangChain, Taskade, FastMCP, Neon), source code→API discovery (tsoa, fastify-swagger, Prisma), agent-as-operator platforms, MCP vs CLI landscape (March 2026). Generate-then-curate pattern. 30+ sources. | 2026-03-23 | Active | Integration generation brief (037?), Insights 071/072, ADR-005 validation |
| `human-in-the-loop-interface-patterns.md` | HITL interface patterns for AI agent oversight: context overload (confidence routing, quiet shift report, information budget), orientation (airport board, hill chart, heatmap heartbeat, weather report), attention management (calm tech, management by exception, attention dial, tide line), decision fatigue (diff-first, 3-2-1 review, review energy budget, correction velocity), novel patterns (trust thermometer, teaching moments, walk the floor, exception-only surface, standup, quality audit). 5-layer oversight stack. Physical-world management analogies. MS 18 guidelines + UX laws applied. | 2026-03-23 | Active | Dev Designer (Layer 6), Dev Architect (ADR-010/011), Phase 10 MVP |
| `work-context-feed-patterns.md` | Work-context feed UX: 11 products surveyed (GitHub, Linear Pulse, Slack, Notion, Asana, Monday, Superhuman, Apple News, Google Discover, Artifact, ChatGPT Pulse, Reclaim). Feed mechanics (card vs stream, progressive disclosure, grouping, rich media, actions, filtering, ordering). AI-generated feed items (insights, process updates, teaching moments, shift report cards). Rendering architectures (component registry, server-driven composition, SSE real-time, GetStream materialized feed). 5 Ditto-specific gaps, 10-point recommended architecture. | 2026-03-23 | Active | Dev Designer (Layer 6 feed), Dev Architect (ADR-009 feed rendering), Phase 10 MVP |
| `quality-standards-for-agent-execution.md` | Agent execution quality: AgentBench/AgentBoard benchmarks, Braintrust/Langfuse/LangSmith evaluation platforms, CrewAI guardrails (3 types + chaining), AutoGen termination-as-quality, Constitutional AI principles, LLM-as-judge patterns (direct/pairwise/reference-based, rubric design, bias), process mining conformance (4 dimensions), APQC PCF (taxonomy/benchmark separation). 7 cross-cutting architectural patterns. 30+ sources. | 2026-03-24 | Active | Dev Architect (quality standard encoding), Process primitive design, Dev Designer (quality visibility UX) |
| `standards-library-community-intelligence.md` | Standards library + community intelligence: runtime quality benchmarking (SonarQube, ESLint, Grammarly, Great Expectations, ML monitoring), community learning (federated learning/DP, npm signals, crowdsourced quality, telemetry), agent quality (companion report), workflow tool quality (n8n, Zapier, CrewAI, LangSmith, APQC), standards evolution patterns. 5 Ditto-original gaps (runtime scouting, cross-instance execution intelligence, three-layer risk baselines, unified standards, standards as learning loop output). 3 architectural options. | 2026-03-24 | Active | Insight-078 (Standards Library), Insight-077 (Risk baselines), Dev Architect (standards architecture, ADR candidate), Phase 10 MVP |

**Statuses:** Active = still informing decisions. Consumed = primary consumer complete, retained for reference.
