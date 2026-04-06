/**
 * Ditto — Tool Resolver
 *
 * Resolves step-level `tools: [service.action]` declarations into
 * LlmToolDefinition[] and an execution dispatch function.
 *
 * Tool definitions come from integration registry YAML.
 * Execution dispatches to CLI or REST handlers based on each tool's execute config.
 *
 * Provenance: ADR-005 Section 4, Insight-065 (Ditto-native tools), Brief 025
 */

import type { LlmToolDefinition } from "./llm";
import type {
  IntegrationTool,
  CliExecuteConfig,
  RestExecuteConfig,
} from "./integration-registry";
import { getIntegration } from "./integration-registry";
import { executeCli } from "./integration-handlers/cli";
import { executeRest } from "./integration-handlers/rest";
// Dynamic import to avoid pulling LanceDB native binary into webpack bundle
// import { searchKnowledge, formatResultsForPrompt } from "./knowledge/search";

export interface ResolvedTools {
  /** LLM-native tool definitions for the LLM to call */
  tools: LlmToolDefinition[];
  /** Dispatch function: given tool name + input, executes and returns result text */
  executeIntegrationTool: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<string>;
}

// ============================================================
// Built-in engine tools (Brief 079)
// Resolved via `knowledge.search` etc in process YAML.
// ============================================================

interface BuiltInTool {
  definition: LlmToolDefinition;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

const builtInTools: Record<string, BuiltInTool> = {
  "knowledge.search": {
    definition: {
      name: "knowledge_search",
      description:
        "Search the knowledge base for relevant documents. Returns chunks with source citations (file, page, section, line range).",
      input_schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The search query — natural language question or keywords",
          },
          topK: {
            type: "number",
            description: "Number of results to return (default: 5)",
          },
        },
        required: ["query"],
      },
    },
    execute: async (input: Record<string, unknown>): Promise<string> => {
      const { searchKnowledge, formatResultsForPrompt } = await import("./knowledge/search");
      const query = input.query as string;
      const topK = (input.topK as number) ?? 5;
      const results = await searchKnowledge(query, topK);
      return formatResultsForPrompt(results);
    },
  },
};

/**
 * Interpolate template strings with parameter values.
 * Replaces {param} with the value. No eval() — simple string replacement.
 */
function interpolate(template: string, params: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      result = result.replaceAll(`{${key}}`, String(value));
    }
  }
  return result;
}

/**
 * Build a CLI command from a tool's execute config and input parameters.
 */
function buildCliCommand(
  config: CliExecuteConfig,
  input: Record<string, unknown>,
): string {
  let command = interpolate(config.command_template, input);

  // Append optional arg templates when their parameters are provided
  if (config.args) {
    for (const [paramName, argTemplate] of Object.entries(config.args)) {
      if (input[paramName] !== undefined && input[paramName] !== null && input[paramName] !== "") {
        command += " " + interpolate(argTemplate, input);
      }
    }
  }

  return command;
}

/**
 * Convert an IntegrationTool to an LlmToolDefinition.
 * Tool name is prefixed with service name: service.tool_name
 */
function toolToLlmDefinition(
  service: string,
  tool: IntegrationTool,
): LlmToolDefinition {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [paramName, param] of Object.entries(tool.parameters)) {
    properties[paramName] = {
      type: param.type === "string" ? "string" : param.type,
      ...(param.description ? { description: param.description } : {}),
      ...(param.default !== undefined ? { default: param.default } : {}),
    };
    if (param.required) {
      required.push(paramName);
    }
  }

  return {
    name: `${service}.${tool.name}`,
    description: tool.description,
    input_schema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

/**
 * Execute a CLI-backed integration tool.
 */
async function executeCliTool(
  service: string,
  config: CliExecuteConfig,
  input: Record<string, unknown>,
  processId?: string,
): Promise<string> {
  const integration = getIntegration(service);
  const cliInterface = integration?.interfaces.cli;
  if (!cliInterface) {
    return `Error: service '${service}' has no CLI interface`;
  }

  const command = buildCliCommand(config, input);
  const result = await executeCli({
    service,
    command,
    cliInterface,
    processId,
  });

  // Return the result text for the LLM
  if (result.confidence === "low") {
    return `Error: ${JSON.stringify(result.outputs)}`;
  }
  const output = result.outputs.result;
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}

/**
 * Execute a REST-backed integration tool.
 */
async function executeRestTool(
  service: string,
  config: RestExecuteConfig,
  input: Record<string, unknown>,
  processId?: string,
): Promise<string> {
  const integration = getIntegration(service);
  const restInterface = integration?.interfaces.rest;
  if (!restInterface) {
    return `Error: service '${service}' has no REST interface`;
  }

  // Interpolate endpoint, body, and query with input params
  const endpoint = interpolate(config.endpoint, input);
  const body = config.body
    ? Object.fromEntries(
        Object.entries(config.body).map(([k, v]) => [k, interpolate(v, input)]),
      )
    : undefined;
  const query = config.query
    ? Object.fromEntries(
        Object.entries(config.query).map(([k, v]) => [k, interpolate(v, input)]),
      )
    : undefined;

  const { result, logs } = await executeRest({
    service,
    restInterface,
    method: config.method,
    endpoint,
    body,
    query,
    processId,
  });

  // Check for error
  if (result && typeof result === "object" && "error" in result) {
    return `Error: ${JSON.stringify(result)}\n${logs.join("\n")}`;
  }

  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

/**
 * Resolve a list of tool names (service.action format) into LLM tool
 * definitions and an execution dispatch function.
 *
 * Rejects tool names not found in the registry (AC-6: authorisation).
 * Returns empty tools array if no valid tools found.
 */
export function resolveTools(
  toolNames: string[],
  integrationDir?: string,
  processId?: string,
): ResolvedTools {
  const tools: LlmToolDefinition[] = [];
  // Map from qualified name (service.action) to { service, tool, executeConfig }
  const toolMap = new Map<string, { service: string; tool: IntegrationTool }>();

  // Track built-in tools for dispatch
  const builtInMap = new Map<string, BuiltInTool>();

  for (const qualifiedName of toolNames) {
    // Check built-in engine tools first (e.g., knowledge.search)
    const builtIn = builtInTools[qualifiedName];
    if (builtIn) {
      tools.push(builtIn.definition);
      builtInMap.set(builtIn.definition.name, builtIn);
      continue;
    }

    const dotIndex = qualifiedName.indexOf(".");
    if (dotIndex === -1) {
      console.warn(`  Tool '${qualifiedName}' missing service prefix (expected service.tool_name)`);
      continue;
    }

    const service = qualifiedName.slice(0, dotIndex);
    const toolName = qualifiedName.slice(dotIndex + 1);

    const integration = getIntegration(service, integrationDir);
    if (!integration) {
      console.warn(`  Tool '${qualifiedName}': service '${service}' not in registry`);
      continue;
    }

    const integrationTool = integration.tools?.find((t) => t.name === toolName);
    if (!integrationTool) {
      console.warn(`  Tool '${qualifiedName}': tool '${toolName}' not found in service '${service}'`);
      continue;
    }

    const llmDef = toolToLlmDefinition(service, integrationTool);
    tools.push(llmDef);
    toolMap.set(qualifiedName, { service, tool: integrationTool });
  }

  const executeIntegrationTool = async (
    name: string,
    input: Record<string, unknown>,
  ): Promise<string> => {
    // Check built-in tools first
    const builtIn = builtInMap.get(name);
    if (builtIn) {
      return builtIn.execute(input);
    }

    const entry = toolMap.get(name);
    if (!entry) {
      return `Error: tool '${name}' not resolved (authorisation rejected)`;
    }

    const { service, tool } = entry;
    const config = tool.execute;

    if (config.protocol === "cli") {
      return executeCliTool(service, config, input, processId);
    } else if (config.protocol === "rest") {
      return executeRestTool(service, config as RestExecuteConfig, input, processId);
    }

    return `Error: unsupported protocol '${(config as { protocol: string }).protocol}'`;
  };

  return { tools, executeIntegrationTool };
}
