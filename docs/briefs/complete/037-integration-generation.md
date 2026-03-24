# Brief: Integration Generation — OpenAPI → Ditto YAML

**Date:** 2026-03-23
**Status:** ready
**Depends on:** Phase 6 complete (024+025+035+036 — integration registry, tool resolver, credential vault, process I/O)
**Unlocks:** Scalable integration library (N services instead of 2 hand-written), future process generation meta-process, dashboard MVP with richer integration data

## Goal

- **Roadmap phase:** Post-Phase 6 — Integration + Process Generation (Insight-071)
- **Capabilities:** `ditto generate-integration` CLI command that produces integration YAML from an OpenAPI 3.x spec

## Context

Ditto's integration registry (`integrations/*.yaml`) currently has 2 hand-written integrations: GitHub (4 CLI tools) and Slack (2 REST tools). These were hand-crafted during Phase 6 to prove the integration architecture (ADR-005). But hand-authoring YAML is a developer convenience, not a user-facing creation path (Insight-071). Real processes need dozens of integrations — Xero, Google Workspace, Stripe, HubSpot, etc.

Research complete (`docs/research/api-to-tool-generation.md`): surveyed Composio, LangChain, Taskade, FastMCP, OpenAI, Neon, and the MCP landscape. The universal pipeline is: OpenAPI spec → parse → filter → emit format. The critical lesson from production use (Neon): naive 1:1 endpoint-to-tool generation produces unusable results — the winning pattern is **generate-then-curate**.

Insight-072 constrains the design: generation must consume structured sources (OpenAPI specs), not natural language. The YAML is the intermediate representation, not the user interface.

## Objective

Ship a `ditto generate-integration` CLI command that parses an OpenAPI 3.x spec and emits a valid Ditto integration YAML file, ready for human curation and use by the existing integration registry, tool resolver, and credential vault.

## Non-Goals

- **LLM-assisted curation** — the `--curate` flag that uses an LLM to prune and rewrite descriptions is a follow-up. This brief generates all tools; the human curates.
- **CLI interface detection** — no auto-detection of whether a service has a CLI. The generated YAML uses REST protocol only. Human adds CLI interface if desired.
- **MCP schema ingestion** — MCP as an input source is deferred (Insight-065). OpenAPI only.
- **Code-to-spec** — Scenario 3 (Ditto-built apps with fastify-swagger) produces an OpenAPI spec automatically, but the code→spec step is not part of this brief. This brief takes the spec as input.
- **Process generation** — generating process YAMLs from available integrations is a separate, later meta-process.
- **Auto-sync** — the generated YAML is a static file. No watching or re-generation on spec changes.
- **GraphQL schema ingestion** — OpenAPI 3.x only. GraphQL→tools is a future extension.

## Inputs

1. `docs/research/api-to-tool-generation.md` — full research report (pipeline, mapping rules, curation patterns)
2. `docs/insights/071-no-hand-authoring.md` — generation is the creation path
3. `docs/insights/072-sufficiently-detailed-spec-is-code.md` — structured sources required
4. `integrations/github.yaml` — existing hand-written integration (CLI protocol example)
5. `integrations/slack.yaml` — existing hand-written integration (REST protocol example)
6. `src/engine/integration-registry.ts` — `IntegrationDefinition`, `IntegrationTool`, `ToolExecuteConfig` types + validation
7. `src/cli.ts` — existing CLI (add `generate-integration` command)
8. `docs/adrs/005-integration-architecture.md` — multi-protocol, multi-purpose integration architecture

## Constraints

- **Output must pass existing validation** — generated YAML must be loadable by `integration-registry.ts` without modification. The existing `loadIntegrationRegistry()` and `validateTool()` functions are the acceptance test.
- **REST protocol only** — generated tools use `protocol: rest`. CLI and MCP interfaces are not generated (human adds them).
- **No engine changes** — the tool resolver, harness handlers, and credential vault are unchanged. Generated YAML is identical in format to hand-written YAML.
- **OpenAPI 3.0 and 3.1** — must handle both versions. Use an established parser library.
- **$ref resolution** — OpenAPI specs use `$ref` extensively. All references must be resolved before mapping.
- **Flat parameter schemas** — Ditto's `IntegrationToolParam` is flat (type, description, required, default). Nested object schemas from OpenAPI must be flattened or the tool skipped with a warning.
- **Auth is a placeholder** — generated YAML includes the `interfaces.rest.auth` field as a template comment (e.g., `auth: bearer_token  # Configure via ditto credential add`). Never generate actual credentials.
- **Composition: depend on `@apidevtools/swagger-parser`** — mature, governed OpenAPI parser with $ref resolution. 1.7k stars, actively maintained, supports 3.0 and 3.1.

## Provenance

| What | Source | Level | Why this source |
|------|--------|-------|----------------|
| OpenAPI → tool mapping rules | Research report (universal pipeline) | pattern | Every platform follows the same mapping: operationId→name, summary→description, params→parameters, method→protocol |
| Generate-then-curate workflow | Neon analysis + Taskade codegen | pattern | Production-proven: generate all, then prune to useful set. Solves "too many tools" problem. |
| File-based code generation | Taskade `@taskade/mcp-openapi-codegen` | pattern | Generates source files (not runtime objects) for human review and git tracking. Matches Ditto's git-tracked YAML approach. |
| GET/mutation trust classification | FastMCP `from_openapi()` | pattern | GET→read-only, POST/PUT/DELETE→mutation. Maps to Ditto's trust model. |
| OpenAPI parser | `@apidevtools/swagger-parser` | depend | Mature library. Handles $ref resolution, validates spec conformance, supports 3.0+3.1. |
| CLI integration | citty command pattern | pattern (existing) | Existing CLI pattern for all Ditto commands. |

## What Changes (Work Products)

| File | Action |
|------|--------|
| `src/cli/commands/generate-integration.ts` | Create: `ditto generate-integration` command — parses args, calls generator, writes YAML |
| `src/engine/integration-generator.ts` | Create: Core generation logic — OpenAPI parse → mapping → YAML emission |
| `src/engine/integration-generator.test.ts` | Create: Tests for the generation pipeline |
| `src/cli.ts` | Modify: Register `generate-integration` command |
| `package.json` | Modify: Add `@apidevtools/swagger-parser` + `yaml` (already present) dependencies |
| `integrations/00-schema.yaml` | Modify: Add comment noting that integrations can be generated via `ditto generate-integration` |

## Design

### CLI Interface

```bash
# From a local file
ditto generate-integration --spec ./path/to/openapi.yaml --service my-service

# From a URL
ditto generate-integration --spec https://api.example.com/openapi.json --service my-service

# With output path override (default: integrations/{service}.yaml)
ditto generate-integration --spec ./spec.yaml --service stripe --output ./integrations/stripe.yaml
```

**Arguments:**
- `--spec` (required): Path or URL to OpenAPI 3.x spec (JSON or YAML)
- `--service` (required): Service name (used as filename and `service:` field in YAML)
- `--output` (optional): Output file path. Default: `integrations/{service}.yaml`

### Generation Pipeline

```
OpenAPI 3.x Spec (file or URL)
    │
    ▼
┌─────────────────────────────┐
│ 1. Parse + Validate         │  @apidevtools/swagger-parser
│    - Resolve all $refs      │  bundle() + validate()
│    - Validate spec          │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 2. Extract Service Metadata │
│    - info.title → description│
│    - servers[0].url → base_url│
│    - securitySchemes → auth  │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 3. Map Operations → Tools   │  For each path + method:
│    - operationId → name     │  - Skip if no operationId (warn)
│    - summary → description  │  - Flatten params
│    - params → parameters    │  - Map method → REST config
│    - path → endpoint        │
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 4. Classify Tools           │
│    - GET → read-only marker │  Comment annotation: # read-only
│    - POST/PUT/DELETE → write│  Comment annotation: # write
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ 5. Emit YAML                │
│    - Header with generation │  # Generated by: ditto generate-integration
│      metadata               │  # Source: {spec path}
│    - service + description  │  # Date: {timestamp}
│    - interfaces.rest        │  # Tools: {count} ({read} read, {write} write)
│    - preferred: rest        │  # ⚠ Review and curate before use
│    - tools[]                │
└─────────────────────────────┘
    │
    ▼
integrations/{service}.yaml
```

### Mapping Rules (OpenAPI → Ditto YAML)

| OpenAPI | Ditto Integration YAML |
|---------|----------------------|
| `info.title` | `description` (with `info.description` if available) |
| `servers[0].url` | `interfaces.rest.base_url` |
| `components.securitySchemes` | `interfaces.rest.auth` (mapped: `http/bearer` → `bearer_token`, `apiKey` → `api_key`, `oauth2` → `oauth2`) |
| `operationId` | `tools[].name` (slugified: camelCase → snake_case) |
| `summary` (fallback: `description`) | `tools[].description` |
| Path parameters `{id}` | `tools[].parameters` with `required: true` + preserved as `{id}` in endpoint |
| Query parameters | `tools[].parameters` + `tools[].execute.query` mapping |
| `requestBody` properties | `tools[].parameters` + `tools[].execute.body` mapping |
| HTTP method | `tools[].execute.method` |
| Path string | `tools[].execute.endpoint` |
| (implicit) | `preferred: rest` — always `rest` since this brief only generates REST tools |

### Handling Edge Cases

| Edge Case | Handling |
|-----------|---------|
| No `operationId` | Skip operation, emit warning: "Skipping {method} {path}: no operationId" |
| Nested object parameters | Flatten top-level properties. Skip deeply nested (>1 level) with warning. |
| Array parameters | Map as `type: string` with description noting "JSON array" |
| Enum parameters | Map as `type: string` with enum values listed in description |
| File upload (`multipart/form-data`) | Skip operation with warning: "File upload not supported" |
| Multiple security schemes | Use the first scheme. Note others in comment. |
| No `servers` array | Use placeholder `base_url: https://api.example.com  # UPDATE THIS` |
| Duplicate tool names (after slugification) | Append method suffix: `get_user`, `post_user` |
| No parameters (no path, query, or body params) | Emit `parameters: {}` (empty object). Required by registry validation. |
| `deprecated: true` operations | Skip with warning: "Skipping deprecated operation {operationId}" |

### Generated YAML Example

Given a Stripe-like OpenAPI spec, the generator would produce:

```yaml
# Generated by: ditto generate-integration
# Source: ./stripe-openapi.yaml
# Date: 2026-03-23
# Tools: 47 (18 read, 29 write)
# ⚠ Review and curate before use — see https://neon.com/blog/autogenerating-mcp-servers-openai-schemas

service: stripe
description: Stripe API — payment processing, customers, subscriptions, invoices
interfaces:
  rest:
    base_url: https://api.stripe.com/v1
    auth: bearer_token  # Configure via: ditto credential add stripe
    headers:
      Content-Type: application/json
preferred: rest

tools:
  - name: list_customers  # read-only
    description: List all customers. Returns a paginated list of customer objects.
    parameters:
      limit:
        type: string
        description: "Number of results (1-100, default 10)"
      starting_after:
        type: string
        description: "Cursor for pagination — customer ID to start after"
    execute:
      protocol: rest
      method: GET
      endpoint: /customers
      query:
        limit: "{limit}"
        starting_after: "{starting_after}"

  - name: create_customer  # write
    description: Create a new customer.
    parameters:
      email:
        type: string
        required: true
        description: "Customer email address"
      name:
        type: string
        description: "Customer full name"
    execute:
      protocol: rest
      method: POST
      endpoint: /customers
      body:
        email: "{email}"
        name: "{name}"
  # ... (45 more tools)
```

## User Experience

- **Jobs affected:** Define (indirectly — makes integrations available for process definitions)
- **Primitives involved:** None — CLI tooling only
- **Process-owner perspective:** Not directly visible. This is infrastructure that Ditto's development team (and eventually meta-processes) use to expand the integration library. The user benefits when their process can use Stripe tools, Xero tools, etc.
- **Interaction states:** CLI output shows progress (parsing, mapping, writing) and warnings (skipped operations, flattening issues). Final summary: "Generated {N} tools ({R} read, {W} write) for {service}. Review and curate: {output_path}"
- **Designer input:** Not invoked — pure infrastructure/tooling

## Acceptance Criteria

1. [ ] `ditto generate-integration --spec <file> --service <name>` parses an OpenAPI 3.x spec and writes a YAML file to `integrations/{service}.yaml`
2. [ ] Generated YAML passes `loadIntegrationRegistry()` validation without errors (same validation as hand-written YAMLs)
3. [ ] `operationId` is mapped to `tools[].name` with camelCase→snake_case conversion
4. [ ] `summary` (or `description` fallback) is mapped to `tools[].description`
5. [ ] Path parameters, query parameters, and request body properties are mapped to `tools[].parameters`
6. [ ] HTTP method is mapped to `tools[].execute.method` and path to `tools[].execute.endpoint`
7. [ ] Path parameter placeholders (`{id}`) are preserved in endpoint templates
8. [ ] `$ref` references are fully resolved before mapping (no unresolved references in output)
9. [ ] Operations without `operationId` are skipped with a warning printed to stderr
10. [ ] Nested object parameters (>1 level deep) are skipped with a warning; top-level properties are flattened
11. [ ] Generated YAML includes header comments with source, date, tool count, and curation reminder
12. [ ] `interfaces.rest.base_url` is extracted from `servers[0].url`; `auth` is mapped from `securitySchemes`
13. [ ] `--spec` accepts both file paths and URLs
14. [ ] Tools are annotated with `# read-only` or `# write` comment based on HTTP method (informational only — these comments are not preserved by YAML parsers and are for human readers during curation)
15. [ ] Tests cover: valid spec generation, $ref resolution, missing operationId handling, nested parameter flattening, auth scheme mapping, duplicate name handling
16. [ ] `pnpm test` passes — existing 257 tests unbroken + new tests pass

## Review Process

1. Spawn review agent with `docs/architecture.md` + `docs/review-checklist.md`
2. Review agent checks:
   - Generated YAML format matches existing hand-written examples (github.yaml, slack.yaml)
   - No engine changes — tool resolver, harness handlers, credential vault unchanged
   - Research recommendations followed (generate-then-curate, mapping rules, auth handling)
   - Insight-071 and 072 constraints met (structured input, no NL-to-YAML path)
   - Edge cases handled gracefully (warnings, not crashes)
3. Present work + review findings to human for approval

## Smoke Test

```bash
# Generate integration from a small public spec (Petstore — standard OpenAPI test spec)
ditto generate-integration --spec https://petstore3.swagger.io/api/v3/openapi.json --service petstore

# Verify the file was created
cat integrations/petstore.yaml | head -20
# → Header comments with source, date, tool count
# → service: petstore
# → interfaces.rest with base_url

# Verify it loads without errors
pnpm cli sync
# → No validation errors for petstore integration

# Verify tools are usable (spot-check one tool name)
grep "name:" integrations/petstore.yaml | head -5
# → snake_case tool names derived from operationIds

# For stress testing with a large spec:
# ditto generate-integration --spec https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.yaml --service stripe

# Run tests
pnpm test
```

## After Completion

1. Update `docs/state.md` with integration generation status
2. Update `docs/roadmap.md` — add Integration Generation capability as done
3. Update `docs/adrs/005-integration-architecture.md` — add "Creation Path" section noting the codegen pipeline (Insight-071)
4. Generate 2-3 real integrations (e.g., Stripe, Xero, HubSpot) to validate and demonstrate the tool
5. Capture insights about what the curation step needs (informs the future `--curate` flag)
