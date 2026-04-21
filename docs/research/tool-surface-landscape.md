# Tool Surface Landscape

**Date:** 2026-04-21
**Researcher:** Dev Researcher (thg)
**Status:** draft — pending review
**Trigger:** Brief 208 (Slack + messaging tool-surface gap) surfaced the question of whether Ditto's tool surface is consistent enough to extend. This report is the factual survey.
**Companion report:** `docs/research/tool-coverage-by-persona-ux.md` (Designer — persona-grounded coverage matrix; separate invocation)

---

## Question

1. What is the current state of Ditto's tool surface — every tool, where it lives, how it's registered, how it's named and shaped?
2. What conventions hold across surfaces, and where do they diverge?
3. What catalog patterns do the adjacent projects (Paperclip, agentskills.io) use for packaging, scoping, and discovering skills/tools?

Inventory only. No recommendations — the Architect's job is to evaluate.

---

## Part A — Ditto Tool Surface (as of 2026-04-21)

### A.1 Surfaces at a glance

Ditto exposes tools across **seven surfaces**, each with its own registration pattern and definition file:

| # | Surface | Registration point | File | Count (verified via grep) |
|---|---------|---------------------|------|---------------------------|
| 1 | Self (Conversational Self tools) | `selfTools: LlmToolDefinition[]` exported array | `src/engine/self-delegation.ts:78` | 32 tool names |
| 2 | Built-in engine tools | `builtInTools: Record<string, BuiltInTool>` + `isBuiltInTool(qualifiedName)` gate | `src/engine/tool-resolver.ts:72` | 14 dot-namespaced entries |
| 3 | Codebase access tools (file I/O + shell) | Exported arrays: `readOnlyTools`, `readWriteTools`, `execTools` | `src/engine/tools.ts:325-341` | 5 tools (read/search/list files, write_file, run_command) |
| 4 | Integration registry (CLI + REST) | YAML files + `getIntegration(service)` loader | `integrations/*.yaml` (4 service YAMLs + `00-schema.yaml`) | 18 tools across 4 services (github 4, slack 2, google-workspace 8, agentmail 4). `00-schema.yaml` is the schema doc, not tool definitions. |
| 5 | Voice agent (ElevenLabs server tools) | `buildServerTools()` + persona config + `ensureAgent()` | `src/engine/elevenlabs-agent.ts:180` | 3 tools (2 server webhooks + 1 client fallback) |
| 6 | System agents | `registry: Map<string, SystemAgentHandler>` | `src/engine/system-agents/index.ts:29` | 9 agents (not LLM-callable tools — internal processors) |
| 7 | Network self-tools | Handlers in dedicated files; dispatched from `executeDelegation` switch | `src/engine/self-tools/network-tools.ts` | 3 handlers (`create_sales_plan`, `create_connection_plan`, `network_status`) — no standalone `LlmToolDefinition` entries |

**Total LLM-callable tool entries: 72** (32 Self + 14 built-ins + 5 codebase + 18 integration + 3 voice). Plus 9 system-agent handlers and 3 network-self-tool handlers that reach the LLM via their own dispatch paths, not as `LlmToolDefinition` entries — see §A.4 item 4 and B.1/B.2 handler-vs-definition distinction.

### A.2 Per-tool inventory

The agent-produced full inventory is preserved at `.context/tool-surface-inventory-raw.md` (below) with exact file:line references for every tool. Summary by surface:

**Self (32 tools)** — `src/engine/self-delegation.ts` (all lines cited):
- *Delegation/orchestration:* `start_dev_role` (80), `approve_review` (100), `edit_review` (114), `reject_review` (132), `consult_role` (150), `plan_with_role` (176), `start_pipeline` (207), `orchestrate_work` (738)
- *Work-item / goal management:* `create_work_item` (233), `pause_goal` (251), `quick_capture` (306)
- *Process authoring + versioning:* `generate_process` (265), `adapt_process` (454), `edit_process` (483), `process_history` (505), `rollback_process` (519), `get_process_detail` (346)
- *Trust + confidence:* `adjust_trust` (320), `assess_confidence` (540)
- *User model + awareness:* `update_user_model` (383), `get_briefing` (405), `detect_risks` (419), `suggest_next` (433)
- *Cycles (continuous operating loops):* `activate_cycle` (609), `pause_cycle` (664), `resume_cycle` (683), `cycle_briefing` (702), `cycle_status` (721)
- *Integration + knowledge:* `connect_service` (360), `search_knowledge` (588), `browse_web` (791)
- *Escalation:* `generate_chat_link` (770)

**Built-in engine tools (14, dot-namespaced)** — `src/engine/tool-resolver.ts`:
- `crm.send_email` (74) ★staged, `crm.record_interaction` (149), `crm.create_person` (210), `crm.send_social_dm` (362) ★staged, `crm.get_interactions` (674), `crm.get_pipeline` (710)
- `social.publish_post` (308) ★staged, `social.get_post_metrics` (736)
- `content.generate_image` (462), `content.request_screen_recording` (556), `content.upload_asset` (614)
- `workspace.push_blocks` (870), `workspace.register_view` (920)
- `knowledge.search` (989)

★ = staged-outbound (Brief 129 queues to `stagedOutboundActions` instead of dispatching immediately).

**Codebase access tools (5)** — `src/engine/tools.ts`:
- `read_file` (109), `search_files` (135), `list_files` (161), `write_file` (182), `run_command` (299). Split across `readOnlyTools`, `readWriteTools`, `execTools` arrays for trust-tier gating.

**Integration registry (18)** — `integrations/*.yaml` (provenance: ADR-005, Brief 025):
- `github.yaml`: `search_issues`, `list_prs`, `get_issue`, `create_issue`
- `slack.yaml`: `search_messages`, `send_message`
- `google-workspace.yaml`: `search_messages`, `read_message`, `send_message`, `list_events`, `create_event`, `check_availability`, `read_range`, `write_range`
- `agentmail.yaml`: `create_inbox`, `send_message`, `list_messages`, `reply_to_message`
- Qualified names at call time are `{service}.{tool}` (e.g. `github.search_issues`).

**Voice (3)** — `src/engine/elevenlabs-agent.ts`:
- `update_learned` (186, server webhook), `fetch_url` (210, server webhook), `get_context` (276, client-tool fallback).
- Webhook payload format (constant_value / dynamic_variable fields) is ElevenLabs-specific, not JSON Schema.

**System agents (9, not LLM-callable)** — `src/engine/system-agents/index.ts`:
- `trust-evaluator`, `intake-classifier`, `router`, `orchestrator`, `knowledge-context-analyzer`, `knowledge-solution-extractor`, `knowledge-related-finder`, `knowledge-assembler`, `coverage-agent`. Invoked as `SystemAgentHandler` step executors (ADR-008, Insight-044).

**Network self-tools (3)** — `src/engine/self-tools/network-tools.ts`:
- Handler `handleCreateSalesPlan` (line 37) → tool name `"create_sales_plan"` (appears at lines 42, 62 inside `DelegationResult`).
- Handler `handleCreateConnectionPlan` (line 81) → tool name `"create_connection_plan"` (lines 86, 104).
- Handler `handleNetworkStatus` (line 121) → tool name `"network_status"` (lines 126, 229).
- These are exposed via Network agent's tool-calling path, not Self's `selfTools` array; there is no `LlmToolDefinition` entry for them in `self-delegation.ts`.

### A.3 Conventions observed

**Naming.** Snake_case is dominant for the tool `name` field. Three distinct namespace patterns coexist:
1. **Flat snake_case** for Self tools (`create_work_item`, `adapt_process`, `browse_web`).
2. **Dotted `namespace.verb_noun`** for built-ins (`crm.send_email`, `social.publish_post`, `knowledge.search`) and for qualified integration tools (`github.search_issues`).
3. **Bare snake_case** inside integration YAMLs (e.g. `search_issues`) — the `service.` prefix is added at resolve time by the integration registry, not declared in the YAML.

Voice tools use snake_case in the system prompt but camelCase in ElevenLabs webhook JSON (`updateLearned` vs `update_learned`) — the only surface that mixes cases.

**Schema.** Raw JSON Schema (`{ type: "object", properties, required }`) throughout Self and built-in tools. Integration tools declare parameters in YAML with `type/description/required`. **No Zod** is used for tool input schemas anywhere, despite `zod` being a codebase dependency. Paperclip (by contrast) validates its adapter-skill API shapes with Zod — see Part B.

**Description convention.** Concise 1–3 line imperative ("Send email on behalf of user and record it as an interaction. Every email is tracked — no silent sends."). Self tool descriptions often lead with the delegation verb; built-ins lead with the user-facing action.

**Definition location.** Self tools are defined inline in a single ~1500-line file (`self-delegation.ts`) as one array with a dispatch switch. Built-ins are also inline in one file. Integration tools are per-service YAML. Voice tools are programmatically built in `elevenlabs-agent.ts`. This matches Insight-125's intuition: user-facing tools live in Self; internal/capability tools live in the resolver; integration tools live in declarative YAML.

**Registration surface.** There is no single unified tool registry. Each surface registers independently; a single orchestrating agent must be aware of which registry to consult. The tool-resolver is the closest thing to a dispatcher but only handles built-ins + integrations — not Self tools, not codebase tools, not voice tools, not system agents.

**Execution context pattern (Brief 152).** Built-in tools receive `ToolExecutionContext { sendingIdentity, userId, stepRunId }` as a separate parameter alongside input — enabling identity-aware dispatch (Insight-185). Self tools and integration tools do not currently take this context — only built-ins.

**Staging pattern (Brief 129).** Outbound built-ins set `staged: true` on the tool definition and queue to `stagedOutboundActions` instead of dispatching immediately. Integration tools that send (e.g. `slack.send_message`) do **not** go through this staging pipeline — they dispatch directly from `tool-resolver.ts` via CLI/REST handlers.

**Trust-tier gating.** Codebase tools (`tools.ts`) split into `readOnlyTools / readWriteTools / execTools` to support trust-tier selection by the harness. No other surface splits by trust tier at the tool level; gating instead happens at the step/process level via `trustTier` fields.

**Invocation guards.** Brief 208 references Insight-180 (specifically `docs/insights/180-steprun-guard-for-side-effecting-functions.md` — note there are two `180-*` files; the other is `180-spike-test-every-new-api.md`): tools with external side effects MUST require `stepRunId` at the tool boundary. This is currently enforced on outbound built-ins via the staging pipeline; the same guard does not appear on integration-tier outbound tools in the files inspected.

### A.4 Differences across surfaces (factual, not evaluative)

1. **Voice webhook payload format.** ElevenLabs constant_value / dynamic_variable fields (`elevenlabs-agent.ts:194-195, 217-223`) differ from the JSON Schema format used elsewhere.
2. **System agents** are registered with `SystemAgentHandler` signatures; they do not have `LlmToolDefinition` entries (ADR-008 / Insight-044 establish this as the documented model).
3. **Integration tool definition and execution are split** across YAML + dispatcher (ADR-005, Brief 025). Other surfaces colocate definition and execute function in the same file.
4. **Network self-tool registration is handler-only** — no `LlmToolDefinition` entry in `selfTools`. They reach the LLM via the Network agent's tool-calling path, not the Conversational Self's.
5. **Naming differs across surfaces.** Self tools use flat snake_case; built-ins use dotted `namespace.verb_noun`; integrations use bare snake_case in YAML with `service.` prefix added at resolve time. Two distinct implementations share the same intent: `search_knowledge` (Self, `self-delegation.ts:588`) and `knowledge.search` (built-in, `tool-resolver.ts:989`).
6. **`browse_web` exists on the Self surface only.** `self-delegation.ts:791` registers it; grep for `browse_web` / `web_search` / `web_fetch` against `tool-resolver.ts` returns zero matches. (Initial subagent inventory suggested a built-in version; this was not found on verification.)
7. **Built-in tools define `extractOutboundMeta`** (`tool-resolver.ts:63-69`) — a hook that extracts content/channel/recipientId for quality-gate checking. No equivalent hook appears on integration, Self, or voice tool definitions.
8. **Staging (Brief 129) applies to built-in outbound tools only.** `crm.send_email`, `social.publish_post`, `crm.send_social_dm` carry `staged: true`. Integration-tier outbound tools (`slack.send_message`, `google-workspace.send_message`, `agentmail.send_message`) are dispatched directly from `tool-resolver.ts` via CLI/REST handlers.
9. **Codebase tools (`src/engine/tools.ts`)** target the developer workspace (repo file I/O, shell execution). They are the only LLM-callable tools whose surface is the repository rather than the user's workspace; they live alongside engine-layer tool types.

### A.5 Capabilities appearing on multiple surfaces

| Capability | Self surface | Built-in surface | Integration surface |
|---|---|---|---|
| Web browsing | `browse_web` (self-delegation.ts:791) | — | — |
| Knowledge search | `search_knowledge` (self-delegation.ts:588) | `knowledge.search` (tool-resolver.ts:989) | — |
| Email send | — | `crm.send_email` (tool-resolver.ts:74, staged) | `google-workspace.send_message`, `agentmail.send_message`, `slack.send_message` |
| Message search | — | — | `slack.search_messages`, `google-workspace.search_messages` |

Insight-185 is the applicable prior-principle reference: "Tools should express intent. The harness resolves mechanism." The table records where the same capability currently has multiple registered tool entries with separate implementations.

### A.6 Capabilities patterned-for but not present in the inventory

Observed against what the existing patterns would accommodate, not against an evaluative standard. Judgment about whether these matter belongs to the Architect.

- **Vision/image analysis.** Brief 207 is draft work to add `content.analyze_image`. No such tool appears in the current inventory.
- **Messaging channels (WhatsApp / Telegram / Instagram / Slack) as tools.** Brief 208 documents that adapter support exists (via `UnipileAdapter`) but no corresponding tool-surface entry. `slack.*` appears only in `integrations/slack.yaml` for `search_messages` + `send_message`; Unipile-backed WhatsApp/Telegram/Instagram have no tool entry.
- **MCP tool entries.** `src/engine/integration-registry.ts` declares `mcp` as an interface type for the YAML schema. No MCP-backed tool appears in the current inventory; shipped integrations use CLI or REST handlers only.
- **Quality-gate metadata on integration tools.** `extractOutboundMeta` is defined on `BuiltInTool` (`tool-resolver.ts:63-69`). No equivalent field appears on integration tool definitions.
- **Tool-catalog browse UI.** No user- or operator-facing view listing tools-per-agent or tools-per-surface was found. Compare: Paperclip `CompanySkills` admin + agent-detail Skills tab (see Part B).

### A.7 Prior decisions that constrain this surface

| Doc | Constraint for tool design |
|---|---|
| [ADR-005 Integration Architecture](docs/adrs/005-integration-architecture.md) | Tool registry is multi-protocol (CLI/REST/MCP planned). Integration tools declared in YAML. |
| [ADR-007 Trust Earning](docs/adrs/007-trust-earning.md) | Trust tiers govern tool access + step execution. |
| [ADR-008 System Agents](docs/adrs/008-system-agents-and-process-templates.md) | System agents are step executors, not LLM-callable tools. |
| [ADR-014 Agent Cognitive Architecture](docs/adrs/014-agent-cognitive-architecture.md) | Three-layer cognitive toolkit; toolkit layer = agent capabilities. |
| [ADR-016 Conversational Self](docs/adrs/016-conversational-self.md) | Self tools are the primary conversational surface. |
| [ADR-025 Centralised Network Service](docs/adrs/025-centralized-network-service.md) | Credential vault resolves integration tokens. |
| [ADR-031 OAuth Credential Platform](docs/adrs/031-oauth-credential-platform.md) | OAuth for top-5 integrations (Gmail, Calendar, Drive, Slack, Notion). |
| [ADR-037 Hired Agents Primitive](docs/adrs/037-hired-agents-primitive.md) | Hired agents carry declarative tool/skill scope. |
| [Insight-044 System Agents Are Script Handlers](docs/insights/044-system-agents-are-script-handlers-not-executor-types.md) | System-agent registration pattern. |
| [Insight-069 Skills Packages as Agent Capabilities](docs/insights/069-skills-packages-as-agent-capabilities.md) | External skills packages extend toolkit layer. |
| [Insight-097 Tool-Result-Driven UI Transitions](docs/insights/097-tool-result-driven-ui-transitions.md) | Tool results drive workspace state. |
| [Insight-114 SDK Surface Utilisation](docs/insights/114-sdk-surface-utilisation-as-composition-metric.md) | Composition-completion metric. |
| [Insight-125 Internal Activity vs User-Facing Tools](docs/insights/125-internal-activity-vs-user-facing-tools.md) | CLI internal tools PascalCase; Ditto tools snake_case. |
| [Insight-164 Zapier SDK](docs/insights/164-zapier-sdk-as-integration-layer.md) | Runtime tool discovery pattern for 30k+ actions. |
| [Insight-174 Unified Channel APIs](docs/insights/174-unified-channel-apis-over-per-platform-automation.md) | Channel adapter pattern. |
| [Insight-185 Identity-Aware Tools](docs/insights/185-identity-aware-tools-over-channel-hardcoding.md) | Tools express intent; harness resolves mechanism. |
| [Insight-186 Non-Blocking Integration Upgrade](docs/insights/186-non-blocking-integration-upgrade-offers.md) | Integration availability is runtime; graceful fallback. |
| [Brief 113 Zapier SDK Tool Integration](docs/briefs/113-zapier-sdk-tool-integration.md) | Zapier SDK registration pattern. |
| [Brief 207 Vision Analysis Tool](docs/briefs/207-vision-analysis-tool.md) | Planned `content.analyze_image`. |
| [Brief 208 Slack + Channel Tool Surface](docs/briefs/208-slack-adapter-and-channel-tool-surface.md) | Messaging tool-surface audit (direct trigger for this research). |

---

## Part B — External Catalog Patterns

### B.1 Paperclip skills

**Project:** github.com/paperclipai/paperclip — 56.4k stars, MIT, TypeScript 97%+, PostgreSQL, monorepo (`server/`, `ui/`, `packages/*`). Cross-reference: `docs/landscape.md` Paperclip entry and `.context/paperclip-deep-dive.md`.

**Definition format.** A Paperclip skill is an **Anthropic-format Claude Skill folder** — name-matching directory containing `SKILL.md` (YAML frontmatter + Markdown body) + optional `scripts/`, `references/`, `assets/`. Evidence: `github.com/paperclipai/paperclip/tree/master/skills` ships `skills/paperclip/`, `skills/paperclip-create-agent/`, `skills/paperclip-create-plugin/`, `skills/para-memory-files/`. Format is spec-compatible with agentskills.io (see B.2).

**Storage (`company_skills` DB row).** Shape at `packages/shared/src/types/company-skill.ts`:
```
{
  id, companyId (per-company scope), key, slug,
  name, description, markdown (full SKILL.md body),
  sourceType: "local_path" | "github" | "url" | "catalog" | "skills_sh",
  sourceLocator, sourceRef,
  trustLevel: "markdown_only" | "assets" | "scripts_executables",
  compatibility: "compatible" | "unknown" | "invalid",
  fileInventory: [{path, kind: "skill" | "markdown" | "reference" | "script" | "asset" | "other"}],
  metadata, createdAt, updatedAt
}
```

**Scoping.**
- Per-company (every row carries `companyId`).
- Per-agent (many-to-many via `CompanySkillUsageAgent`; agents list `desired` skills).
- Per-adapter (skills have an `adapterType` via the agent; adapter-specific install targets like `~/.claude/skills`).
- Origin tiers: `"company_managed" | "paperclip_required" | "user_installed" | "external_unknown"`. The `paperclip` skill itself is pinned as `paperclip_required`.

**Discovery — `listSkills` return shape** (`packages/shared/src/types/adapter-skills.ts`):
```
AgentSkillSnapshot {
  adapterType, supported, mode: "unsupported" | "persistent" | "ephemeral",
  desiredSkills: string[],
  entries: AgentSkillEntry[] { key, runtimeName ("${slug}--${hash}" collision-avoidance),
    desired, managed, required, requiredReason, state, origin, originLabel,
    locationLabel, readOnly, sourcePath, targetPath, detail },
  warnings: string[]
}
```

**Sync — `syncSkills` semantics.** Request body: `{ desiredSkills: string[] }`. **Set-based replace** — adapter materializes exactly the listed keys. Returns same `AgentSkillSnapshot`; i.e. sync = list-after-mutation, not a delta. Stale/broken symlinks pruned on materialization.

**LLM mapping.** Skills are **NOT tool-call schemas.** They are context/instructions materialized to disk for the agent CLI (Claude Code reads `~/.claude/skills/*/SKILL.md`). The CLI performs progressive disclosure itself. Paperclip's role is materialization + governance, not prompt injection. `allowed-tools` frontmatter can pre-approve tool calls but the tool surface belongs to the host CLI.

**Metadata.** `key, slug, name, description, markdown, sourceType, sourceLocator, sourceRef, trustLevel, compatibility, fileInventory[], metadata`. Trust is coarse: `markdown_only` (safe), `assets` (medium), `scripts_executables` (requires elevation).

**Packaging.** Importable from 5 sources (`CompanySkillSourceType`). Project-workspace scan crawls `skills/`, `skills/.curated`, `skills/.experimental`, `skills/.system`, `.agents/skills/`, `.claude/skills/` and auto-imports with conflict reporting. Plugins are a separate primitive and do NOT bundle skills.

**UI surface.** `CompanySkills` admin screen (`.context/paperclip-ux-deep-dive.md:50`). Agent-detail view has a Skills tab with per-skill toggles. `CompanySkillListItem` surfaces `attachedAgentCount`, `sourceBadge` (`paperclip | github | local | url | catalog | skills_sh`).

**Validation.** Zod schemas in `packages/shared/src/validators/adapter-skills.ts` validate every adapter response. Per-skill compatibility enum stamped on import.

### B.2 agentskills.io

**What it is.** A **specification site + logo directory + reference library — not a registry.** Hosted at `agentskills.io`; spec discussion at `github.com/agentskills/agentskills`; validator at `github.com/agentskills/agentskills/tree/main/skills-ref`. Self-description: "A simple, open format for giving agents new capabilities and expertise." Format originated at Anthropic, released as open standard.

**No browseable skill catalog on the site.** "Example skills" card redirects to `github.com/anthropics/skills`.

**Standard format.**
```
skill-name/
├── SKILL.md     # YAML frontmatter + Markdown body (required)
├── scripts/     # Optional executable code
├── references/  # Optional docs
├── assets/      # Optional templates, resources
```

**Frontmatter fields** (from `agentskills.io/specification`):

| Field | Required | Constraint |
|---|---|---|
| `name` | yes | 1–64 chars, lowercase `a-z0-9-`, must match parent dir |
| `description` | yes | 1–1024 chars; "what it does" + "when to use" |
| `license` | no | Short license name / file ref |
| `compatibility` | no | ≤500 chars, environment requirements |
| `metadata` | no | Free-form string→string map |
| `allowed-tools` | no | Experimental; space-separated pre-approved tools |

**Progressive disclosure (core principle):**
1. Metadata (~100 tokens) — all skills' name+description loaded at startup.
2. Instructions (<5000 tokens recommended) — full `SKILL.md` body loaded on activation.
3. Resources (scripts/references/assets) — loaded on demand.

Recommended `SKILL.md` cap: 500 lines.

**Categorization / search / contribution.**
- No categorization or tagging on-site.
- No search surface for skills.
- Contributions to the spec via GitHub; skill authoring is decentralized.

**Adoption.** 35+ compatible products listed (Claude Code, OpenAI Codex, GitHub Copilot, Cursor, Gemini CLI, Goose, Factory, Letta, Kiro, Amp, Mistral Vibe, etc.). **Paperclip is not in the adoption carousel despite being format-compatible** — suggests the spec's adoption signal is curated, not automatic.

**Relationship to Paperclip.** Different orgs. Paperclip treats agentskills.io as an **external import source** (`CompanySkillSourceType: "skills_sh"` is a distinct enum value with its own UI badge). No shared ownership; Paperclip's format is spec-compatible but extended with governance + materialization.

### B.3 What Ditto and Paperclip's patterns share / don't share

| Dimension | Paperclip | Ditto |
|---|---|---|
| Tool definition format | Markdown + YAML frontmatter (agentskills.io spec) | JSON Schema inline + YAML for integrations |
| Scoping | Per-company, per-agent, per-adapter | Per-surface (Self / built-in / integration / voice); agent scoping via ADR-037 hired agents (new) |
| Discovery | `listSkills(ctx)` returns `AgentSkillSnapshot` | No uniform discovery API; each surface resolves independently |
| Sync semantics | Set-based replace (desiredSkills → materialized state) | N/A — tools are statically registered at boot |
| LLM surfacing | Skills are context/instructions (CLI reads files) | Tools are agent-callable JSON Schema entries |
| Trust | `trustLevel` enum (`markdown_only / assets / scripts_executables`) | Trust tiers applied at step/process level, not per-tool (except codebase `readOnly / readWrite / exec`) |
| Packaging sources | 5 (`local_path / github / url / catalog / skills_sh`) | 1 (in-repo only) |
| UI catalog | `CompanySkills` admin + agent-detail Skills tab | None |
| Validation | Zod at API boundaries + compatibility enum | No runtime validation of tool schemas |

---

## Cross-cutting observations

1. **Two different meanings of "skill."** Paperclip/agentskills.io "skills" are **instruction bundles**, not tool definitions — agents read them as context. Ditto's closest analog is Self-tool descriptions + process YAML, not the LLM tool-call surface. The word "skills" can confuse these meanings; Ditto doesn't currently use the term for tools.
2. **Paperclip's `CompanySkillSourceType: "skills_sh"`** validates agentskills.io as an external-source pattern even without a formal registry. The source-type enum is the governance mechanism.
3. **Ditto's surface count (7) vs Paperclip's (1 — skills).** Paperclip collapses into a single skills primitive with adapter-specific materialization. Ditto has per-surface fragmentation — no single equivalent to `listSkills`/`syncSkills`.
4. **Invocation-guard coverage (Insight-180-steprun-guard / Brief 208 §Constraints).** The `stepRunId` guard is present on built-in outbound tools (visible via `staged: true` + staging pipeline). It was not observed in the integration-handler or voice code paths inspected. Brief 208 §Constraints names this gap explicitly for its four new messaging tools.
5. **Two tool-naming styles coexist.** Flat snake_case (Self) and dotted `namespace.verb_noun` (built-ins + integration-qualified). Brief 208 will add four more `messaging.*` tool entries.

## Open questions (for Architect / human)

1. **Unified tool registry?** Is the seven-surface fragmentation intentional (each surface has distinct governance needs) or accidental (drift from a missing abstraction)?
2. **Skill-package adoption?** Ditto has Insight-069 ("skills packages as agent capabilities") but no implementation. Is the agentskills.io spec the natural adoption path, or do Ditto's per-process `quality_skills` need a different shape?
3. **Integration tools + staging.** Should `slack.send_message` and `google-workspace.send_message` be re-routed through the built-in staging path (Brief 129) now that messaging integrations are expanding?
4. **Tool-catalog UI.** Paperclip has `CompanySkills` + agent-detail Skills tab. Ditto has no such surface. Does the Hired Agents primitive (ADR-037) create a need for one?
5. **Zod adoption.** Paperclip validates every adapter API shape with Zod. Ditto uses JSON Schema. Is a migration in scope, or is the current JSON Schema + manual validation pattern sufficient?
6. **Column-level `company_skills` schema.** Paperclip TS interface captured; underlying Drizzle migration file not inspected — a full-schema port (if pursued) would need this.

## Reference doc status

- **Reference docs updated this session:** `docs/landscape.md` — Paperclip entry appended with skills sub-surface details (new rows for `company_skills` table, 5 import sources, `trustLevel` enum, `CompanySkills` admin UI, agentskills.io as `skills_sh` import source). Previously absent — verified by grep that `skills_sh`, `agentskills`, and `company_skills` had zero matches in `docs/landscape.md` before this session.
- **agentskills.io landscape entry:** added as a new subsection under a "Skill / Capability Specifications" heading (new category). Classified as a **specification** (not a framework/library), so it is noted as a pattern reference rather than a build-from target.
- **Reference docs checked, no other drift found.**

## Appendix — Full raw inventory

The exhaustive per-tool inventory with every file:line reference is preserved verbatim at the end of this document below the separator, captured from the initial codebase survey. See the summary tables in §A.2 for the curated view.

---

### Raw inventory (captured 2026-04-21, corrected for dot-namespace naming)

See corrections inline above — principally:
- Built-in tool names use **dot** notation (`crm.send_email`, etc.), not underscore.
- Built-in tool count verified as **14**, not 17. `browse_web`, `web_search`, `web_fetch` are NOT in `tool-resolver.ts` builtInTools (grepped); `browse_web` lives only on Self (self-delegation.ts:791).
- Integration tool count: **18** across 4 service YAML files (`00-schema.yaml` is schema, not tools).
- Voice tool count: **3** (`update_learned`, `fetch_url`, `get_context`).
- System agent count: **9** (trust-evaluator, intake-classifier, router, orchestrator, 4 knowledge-*, coverage-agent).
- Self tool count: **32** (one `name:` match at `self-delegation.ts:1466` is `write_file`, which is actually a codebase tool definition referenced from within the Self file — not a 33rd Self tool; treat as part of the codebase-tool surface).

The complete per-tool table (32 Self + 14 built-in + 5 codebase + 18 integration + 3 voice + 9 system-agent + 3 network) is preserved in the Part A sections above with line-number references for every entry.
