/**
 * Ditto — Integration Registry
 *
 * Loads integration declarations from YAML files in the integrations/ directory.
 * Each file declares a service, its available protocol interfaces, and its tools.
 * Pattern: Mirrors process-loader (YAML → typed definitions).
 *
 * Provenance: ADR-005 (integration architecture), Insight-007 (declarations vs state),
 * Insight-065 (integration tools are Ditto-native)
 */

import fs from "fs";
import path from "path";
import YAML from "yaml";

// ============================================================
// Types
// ============================================================

export interface CliInterface {
  command: string;
  auth?: string;
  env_vars?: string[];
}

export interface McpInterface {
  uri: string;
  auth?: string;
}

export interface RestInterface {
  base_url: string;
  auth?: string;
  headers?: Record<string, string>;
}

/** Parameter definition for an integration tool */
export interface IntegrationToolParam {
  type: string;
  description?: string;
  required?: boolean;
  default?: string;
}

/** Execute config for a CLI-backed tool */
export interface CliExecuteConfig {
  protocol: "cli";
  command_template: string;
  /** Optional per-arg templates keyed by parameter name. Appended when param is provided. */
  args?: Record<string, string>;
}

/** Execute config for a REST-backed tool */
export interface RestExecuteConfig {
  protocol: "rest";
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  body?: Record<string, string>;
  query?: Record<string, string>;
}

export type ToolExecuteConfig = CliExecuteConfig | RestExecuteConfig;

/** A tool declared in an integration YAML's tools section (Brief 025, Insight-065) */
export interface IntegrationTool {
  name: string;
  description: string;
  parameters: Record<string, IntegrationToolParam>;
  execute: ToolExecuteConfig;
}

/** Connection metadata for conversational service setup (Brief 040, AC13) */
export interface ConnectionMetadata {
  /** Auth type: api_key, oauth2, cli_login, mcp */
  auth_type: string;
  /** Human-readable provider name */
  provider_name: string;
  /** URL where the user can get credentials */
  setup_url?: string;
  /** Step-by-step setup instructions */
  setup_instructions?: string;
}

export interface IntegrationDefinition {
  service: string;
  description: string;
  interfaces: {
    cli?: CliInterface;
    mcp?: McpInterface;
    rest?: RestInterface;
  };
  preferred: "cli" | "mcp" | "rest";
  tools?: IntegrationTool[];
  /** Connection metadata for conversational setup (Brief 040) */
  connection?: ConnectionMetadata;
}

// ============================================================
// Validation
// ============================================================

/**
 * Validate a single tool definition.
 * Returns error messages (empty array = valid).
 */
function validateTool(tool: Record<string, unknown>, index: number): string[] {
  const errors: string[] = [];
  const prefix = `tools[${index}]`;

  if (!tool.name || typeof tool.name !== "string") {
    errors.push(`${prefix}: missing or invalid 'name'`);
  }
  if (!tool.description || typeof tool.description !== "string") {
    errors.push(`${prefix}: missing or invalid 'description'`);
  }
  if (!tool.parameters || typeof tool.parameters !== "object") {
    errors.push(`${prefix}: missing or invalid 'parameters'`);
  }
  if (!tool.execute || typeof tool.execute !== "object") {
    errors.push(`${prefix}: missing or invalid 'execute'`);
  } else {
    const exec = tool.execute as Record<string, unknown>;
    if (!exec.protocol || !["cli", "rest"].includes(exec.protocol as string)) {
      errors.push(`${prefix}.execute: 'protocol' must be 'cli' or 'rest'`);
    }
    if (exec.protocol === "cli" && !exec.command_template) {
      errors.push(`${prefix}.execute: CLI tool requires 'command_template'`);
    }
    if (exec.protocol === "rest") {
      if (!exec.method || !["GET", "POST", "PUT", "DELETE"].includes(exec.method as string)) {
        errors.push(`${prefix}.execute: REST tool requires valid 'method'`);
      }
      if (!exec.endpoint || typeof exec.endpoint !== "string") {
        errors.push(`${prefix}.execute: REST tool requires 'endpoint'`);
      }
    }
  }

  return errors;
}

/**
 * Validate an integration definition has all required fields.
 * Returns error messages (empty array = valid).
 */
export function validateIntegration(def: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!def.service || typeof def.service !== "string") {
    errors.push("Missing or invalid 'service' field");
  }
  if (!def.description || typeof def.description !== "string") {
    errors.push("Missing or invalid 'description' field");
  }
  if (!def.interfaces || typeof def.interfaces !== "object") {
    errors.push("Missing or invalid 'interfaces' field");
    return errors; // Can't validate further
  }

  const ifaces = def.interfaces as Record<string, unknown>;
  const hasInterface = ifaces.cli || ifaces.mcp || ifaces.rest;
  if (!hasInterface) {
    errors.push("At least one interface (cli, mcp, rest) is required");
  }

  // Validate CLI interface if present
  if (ifaces.cli) {
    const cli = ifaces.cli as Record<string, unknown>;
    if (!cli.command || typeof cli.command !== "string") {
      errors.push("CLI interface missing 'command' field");
    }
  }

  // Validate MCP interface if present
  if (ifaces.mcp) {
    const mcp = ifaces.mcp as Record<string, unknown>;
    if (!mcp.uri || typeof mcp.uri !== "string") {
      errors.push("MCP interface missing 'uri' field");
    }
  }

  // Validate REST interface if present
  if (ifaces.rest) {
    const rest = ifaces.rest as Record<string, unknown>;
    if (!rest.base_url || typeof rest.base_url !== "string") {
      errors.push("REST interface missing 'base_url' field");
    }
  }

  if (!def.preferred || typeof def.preferred !== "string") {
    errors.push("Missing or invalid 'preferred' field");
  } else if (!["cli", "mcp", "rest"].includes(def.preferred as string)) {
    errors.push(`Invalid preferred protocol: ${def.preferred}`);
  } else if (ifaces && !(ifaces as Record<string, unknown>)[def.preferred as string]) {
    errors.push(`Preferred protocol '${def.preferred}' has no matching interface`);
  }

  // Validate tools if present (Brief 025)
  if (def.tools) {
    if (!Array.isArray(def.tools)) {
      errors.push("'tools' must be an array");
    } else {
      const toolNames = new Set<string>();
      for (let i = 0; i < def.tools.length; i++) {
        const tool = def.tools[i] as Record<string, unknown>;
        const toolErrors = validateTool(tool, i);
        errors.push(...toolErrors);

        // Check for duplicate tool names within a service
        if (tool.name && typeof tool.name === "string") {
          if (toolNames.has(tool.name)) {
            errors.push(`tools[${i}]: duplicate tool name '${tool.name}'`);
          }
          toolNames.add(tool.name);
        }
      }
    }
  }

  return errors;
}

// ============================================================
// Loading
// ============================================================

/**
 * Load a single integration YAML file.
 */
export function loadIntegrationFile(filePath: string): IntegrationDefinition {
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = YAML.parse(content) as Record<string, unknown>;

  const errors = validateIntegration(parsed);
  if (errors.length > 0) {
    throw new Error(
      `Invalid integration file ${path.basename(filePath)}:\n  ${errors.join("\n  ")}`
    );
  }

  return parsed as unknown as IntegrationDefinition;
}

/**
 * Load all integration definitions from the integrations/ directory.
 * Skips schema files (00-*.yaml).
 */
export function loadAllIntegrations(
  integrationDir: string = path.join(process.cwd(), "integrations")
): IntegrationDefinition[] {
  if (!fs.existsSync(integrationDir)) {
    return [];
  }

  const files = fs
    .readdirSync(integrationDir)
    .filter(
      (f) =>
        (f.endsWith(".yaml") || f.endsWith(".yml")) &&
        !f.startsWith("00-") // Skip schema files
    );

  return files.map((f) => loadIntegrationFile(path.join(integrationDir, f)));
}

// ============================================================
// Registry (in-memory lookup)
// ============================================================

let registryCache: Map<string, IntegrationDefinition> | null = null;

/**
 * Get the integration registry (loads on first call, caches after).
 */
export function getIntegrationRegistry(
  integrationDir?: string
): Map<string, IntegrationDefinition> {
  if (!registryCache) {
    const defs = loadAllIntegrations(integrationDir);
    registryCache = new Map(defs.map((d) => [d.service, d]));
  }
  return registryCache;
}

/**
 * Look up an integration by service name.
 */
export function getIntegration(
  service: string,
  integrationDir?: string
): IntegrationDefinition | undefined {
  return getIntegrationRegistry(integrationDir).get(service);
}

/**
 * Get tools for a specific service from the registry.
 * Returns empty array if service has no tools.
 */
export function getIntegrationTools(
  service: string,
  integrationDir?: string
): IntegrationTool[] {
  const integration = getIntegration(service, integrationDir);
  return integration?.tools ?? [];
}

/**
 * Clear the registry cache (used in tests and after sync).
 */
export function clearRegistryCache(): void {
  registryCache = null;
}
