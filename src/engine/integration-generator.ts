/**
 * Ditto — Integration Generator
 *
 * Parses an OpenAPI 3.x spec and emits a valid Ditto integration YAML file.
 * The generated YAML is identical in format to hand-written YAMLs and passes
 * the same registry validation (integration-registry.ts).
 *
 * Pipeline: OpenAPI spec → parse + $ref resolve → map operations → classify → emit YAML
 *
 * Provenance:
 * - Mapping rules: universal pipeline from Composio, Taskade, FastMCP, OpenAI (research report)
 * - Generate-then-curate: Neon analysis + Taskade codegen pattern
 * - GET/mutation classification: FastMCP from_openapi() pattern
 * - Parser: @apidevtools/swagger-parser (depend)
 *
 * Brief: 037 (Integration Generation)
 */

import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPI, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

// ============================================================
// Types
// ============================================================

export interface GeneratedTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description?: string; required?: boolean }>;
  execute: {
    protocol: "rest";
    method: "GET" | "POST" | "PUT" | "DELETE";
    endpoint: string;
    query?: Record<string, string>;
    body?: Record<string, string>;
  };
  /** read-only (GET) or write (POST/PUT/DELETE) — informational classification */
  classification: "read-only" | "write";
}

export interface GenerationResult {
  service: string;
  description: string;
  baseUrl: string;
  auth: string;
  tools: GeneratedTool[];
  warnings: string[];
}

// ============================================================
// Helpers
// ============================================================

/** Convert camelCase or PascalCase to snake_case */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

/** Map OpenAPI security scheme to Ditto auth type */
function mapAuthScheme(
  schemes: Record<string, OpenAPIV3.SecuritySchemeObject | OpenAPIV3_1.SecuritySchemeObject>
): string {
  const entries = Object.values(schemes);
  if (entries.length === 0) return "bearer_token";

  const first = entries[0];
  if (first.type === "http") {
    const httpScheme = first as OpenAPIV3.HttpSecurityScheme;
    if (httpScheme.scheme === "bearer") return "bearer_token";
    if (httpScheme.scheme === "basic") return "basic_auth";
    return "bearer_token";
  }
  if (first.type === "apiKey") return "api_key";
  if (first.type === "oauth2") return "oauth2";
  if (first.type === "openIdConnect") return "oauth2";
  return "bearer_token";
}

type SchemaObject = OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;
type ParameterObject = OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject;
type RequestBodyObject = OpenAPIV3.RequestBodyObject | OpenAPIV3_1.RequestBodyObject;

/** Check if an object is a $ref (ReferenceObject) rather than a resolved object */
function isRef(obj: unknown): obj is { $ref: string } {
  return typeof obj === "object" && obj !== null && "$ref" in obj;
}

/**
 * Flatten schema properties into Ditto-compatible flat parameters.
 * Only flattens one level deep. Returns warnings for deeply nested properties.
 */
function flattenSchemaProperties(
  schema: SchemaObject,
  requiredFields: string[],
  warnings: string[],
  context: string
): Record<string, { type: string; description?: string; required?: boolean }> {
  const params: Record<string, { type: string; description?: string; required?: boolean }> = {};

  if (!schema.properties) return params;

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    if (isRef(propSchema)) {
      warnings.push(`${context}: skipping unresolved $ref for property '${propName}'`);
      continue;
    }

    const prop = propSchema as SchemaObject;

    // Skip deeply nested objects (>1 level)
    if (prop.type === "object" && prop.properties) {
      warnings.push(
        `${context}: skipping nested object property '${propName}' (>1 level deep)`
      );
      continue;
    }

    let type = "string";
    let description = prop.description;

    if (prop.type === "array") {
      type = "string";
      description = (description || "") + " (JSON array)";
      description = description.trim();
    } else if (prop.type === "integer" || prop.type === "number") {
      type = "string";
    } else if (prop.type === "boolean") {
      type = "string";
    }

    // Add enum values to description
    if (prop.enum) {
      const enumStr = prop.enum.join(", ");
      description = (description || "") + ` (enum: ${enumStr})`;
      description = description.trim();
    }

    const param: { type: string; description?: string; required?: boolean } = { type };
    if (description) param.description = description;
    if (requiredFields.includes(propName)) param.required = true;

    params[propName] = param;
  }

  return params;
}

// ============================================================
// Core Generation
// ============================================================

/**
 * Generate a Ditto integration definition from an OpenAPI spec.
 *
 * @param specPath - Path or URL to OpenAPI 3.x spec
 * @param serviceName - Service name for the integration
 * @returns GenerationResult with tools and warnings
 */
export async function generateFromOpenApi(
  specPath: string,
  serviceName: string
): Promise<GenerationResult> {
  const warnings: string[] = [];

  // Step 1: Parse + validate + dereference (resolve all $refs)
  const api = (await SwaggerParser.dereference(specPath)) as
    | OpenAPIV3.Document
    | OpenAPIV3_1.Document;

  // Step 2: Extract service metadata
  const description = api.info.description
    ? `${api.info.title} — ${api.info.description}`
    : api.info.title;

  let baseUrl = "https://api.example.com  # UPDATE THIS";
  if (api.servers && api.servers.length > 0 && api.servers[0].url) {
    baseUrl = api.servers[0].url;
  }

  let auth = "bearer_token";
  if (api.components?.securitySchemes) {
    const schemes = api.components.securitySchemes as Record<
      string,
      OpenAPIV3.SecuritySchemeObject | OpenAPIV3_1.SecuritySchemeObject
    >;
    auth = mapAuthScheme(schemes);
  }

  // Step 3: Map operations → tools
  const tools: GeneratedTool[] = [];
  const usedNames = new Map<string, number>();

  if (api.paths) {
    for (const [pathStr, pathItem] of Object.entries(api.paths)) {
      if (!pathItem || isRef(pathItem)) continue;

      const methods = ["get", "post", "put", "patch", "delete"] as const;

      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)[method] as
          | OpenAPIV3.OperationObject
          | OpenAPIV3_1.OperationObject
          | undefined;
        if (!operation) continue;

        // Skip PATCH — not supported by integration registry validator
        if (method === "patch") {
          if (operation.operationId) {
            warnings.push(
              `Skipping ${operation.operationId}: PATCH method not supported by integration registry`
            );
          } else {
            warnings.push(
              `Skipping PATCH ${pathStr}: PATCH method not supported by integration registry`
            );
          }
          continue;
        }

        // Skip deprecated operations
        if (operation.deprecated) {
          if (operation.operationId) {
            warnings.push(
              `Skipping deprecated operation ${operation.operationId}`
            );
          }
          continue;
        }

        // Skip operations without operationId
        if (!operation.operationId) {
          warnings.push(`Skipping ${method.toUpperCase()} ${pathStr}: no operationId`);
          continue;
        }

        // Skip file upload operations
        const requestBody = operation.requestBody as RequestBodyObject | undefined;
        if (requestBody?.content?.["multipart/form-data"]) {
          warnings.push(
            `Skipping ${operation.operationId}: file upload (multipart/form-data) not supported`
          );
          continue;
        }

        // Generate tool name from operationId
        let toolName = toSnakeCase(operation.operationId);

        // Handle duplicate names
        const nameCount = usedNames.get(toolName) || 0;
        if (nameCount > 0) {
          toolName = `${method}_${toolName}`;
          // If still duplicate, add a number
          const newCount = usedNames.get(toolName) || 0;
          if (newCount > 0) {
            toolName = `${toolName}_${newCount}`;
          }
        }
        usedNames.set(toolName, (usedNames.get(toolName) || 0) + 1);

        // Description
        const toolDescription =
          operation.summary || operation.description || `${method.toUpperCase()} ${pathStr}`;

        // Parameters
        const params: Record<string, { type: string; description?: string; required?: boolean }> =
          {};
        const queryMapping: Record<string, string> = {};
        const bodyMapping: Record<string, string> = {};

        // Path and query parameters
        if (operation.parameters) {
          for (const paramOrRef of operation.parameters) {
            if (isRef(paramOrRef)) {
              warnings.push(
                `${operation.operationId}: skipping unresolved $ref parameter`
              );
              continue;
            }

            const param = paramOrRef as ParameterObject;
            const paramDef: { type: string; description?: string; required?: boolean } = {
              type: "string",
            };

            if (param.description) paramDef.description = param.description;

            // Add enum to description if present
            const paramSchema = param.schema as SchemaObject | undefined;
            if (paramSchema?.enum) {
              paramDef.description =
                (paramDef.description || "") + ` (enum: ${paramSchema.enum.join(", ")})`;
              paramDef.description = paramDef.description.trim();
            }

            if (param.required) paramDef.required = true;

            // Path parameters are always required
            if (param.in === "path") paramDef.required = true;

            params[param.name] = paramDef;

            // Query params need query mapping
            if (param.in === "query") {
              queryMapping[param.name] = `{${param.name}}`;
            }
          }
        }

        // Request body parameters
        if (requestBody) {
          const jsonContent =
            requestBody.content?.["application/json"] ||
            requestBody.content?.["application/x-www-form-urlencoded"];

          if (jsonContent?.schema) {
            const bodySchema = jsonContent.schema as SchemaObject;
            if (isRef(bodySchema)) {
              warnings.push(
                `${operation.operationId}: skipping unresolved $ref in request body`
              );
            } else {
              const requiredFields =
                (bodySchema.required as string[] | undefined) || [];
              const bodyParams = flattenSchemaProperties(
                bodySchema,
                requiredFields,
                warnings,
                operation.operationId
              );

              for (const [name, def] of Object.entries(bodyParams)) {
                params[name] = def;
                bodyMapping[name] = `{${name}}`;
              }
            }
          }
        }

        // Build execute config
        const execute: GeneratedTool["execute"] = {
          protocol: "rest",
          method: method.toUpperCase() as "GET" | "POST" | "PUT" | "DELETE",
          endpoint: pathStr,
        };

        if (Object.keys(queryMapping).length > 0) {
          execute.query = queryMapping;
        }
        if (Object.keys(bodyMapping).length > 0) {
          execute.body = bodyMapping;
        }

        // Classification
        const classification: "read-only" | "write" =
          method === "get" ? "read-only" : "write";

        tools.push({
          name: toolName,
          description: toolDescription,
          parameters: params,
          execute,
          classification,
        });
      }
    }
  }

  return { service: serviceName, description, baseUrl, auth, tools, warnings };
}

// ============================================================
// YAML Emission
// ============================================================

/**
 * Emit a Ditto integration YAML string from a GenerationResult.
 * Produces the same format as hand-written integrations (github.yaml, slack.yaml).
 *
 * Note: Comment annotations (# read-only, # write) are prepended manually
 * since YAML.stringify does not preserve comments. These are informational
 * for human readers during curation and not machine-parseable.
 */
export function emitYaml(result: GenerationResult, specSource: string): string {
  const readCount = result.tools.filter((t) => t.classification === "read-only").length;
  const writeCount = result.tools.filter((t) => t.classification === "write").length;
  const date = new Date().toISOString().slice(0, 10);

  // Build header
  const lines: string[] = [
    `# Generated by: ditto generate-integration`,
    `# Source: ${specSource}`,
    `# Date: ${date}`,
    `# Tools: ${result.tools.length} (${readCount} read, ${writeCount} write)`,
    `# ⚠ Review and curate before use`,
    ``,
    `service: ${result.service}`,
    `description: ${yamlString(result.description)}`,
    `interfaces:`,
    `  rest:`,
    `    base_url: ${result.baseUrl}`,
    `    auth: ${result.auth}  # Configure via: ditto credential add ${result.service}`,
    `    headers:`,
    `      Content-Type: application/json`,
    `preferred: rest`,
  ];

  if (result.tools.length > 0) {
    lines.push(``, `tools:`);

    for (const tool of result.tools) {
      lines.push(`  - name: ${tool.name}  # ${tool.classification}`);
      lines.push(`    description: ${yamlString(tool.description)}`);

      // Parameters
      if (Object.keys(tool.parameters).length === 0) {
        lines.push(`    parameters: {}`);
      } else {
        lines.push(`    parameters:`);
        for (const [pName, pDef] of Object.entries(tool.parameters)) {
          lines.push(`      ${pName}:`);
          lines.push(`        type: ${pDef.type}`);
          if (pDef.required) lines.push(`        required: true`);
          if (pDef.description) lines.push(`        description: ${yamlString(pDef.description)}`);
        }
      }

      // Execute
      lines.push(`    execute:`);
      lines.push(`      protocol: rest`);
      lines.push(`      method: ${tool.execute.method}`);
      lines.push(`      endpoint: ${tool.execute.endpoint}`);

      if (tool.execute.query && Object.keys(tool.execute.query).length > 0) {
        lines.push(`      query:`);
        for (const [k, v] of Object.entries(tool.execute.query)) {
          lines.push(`        ${k}: "${v}"`);
        }
      }

      if (tool.execute.body && Object.keys(tool.execute.body).length > 0) {
        lines.push(`      body:`);
        for (const [k, v] of Object.entries(tool.execute.body)) {
          lines.push(`        ${k}: "${v}"`);
        }
      }

      lines.push(``);
    }
  }

  return lines.join("\n") + "\n";
}

/** Safely encode a string for YAML — quote if it contains special characters */
function yamlString(s: string): string {
  // Quote if contains colons, special chars, or starts with special YAML tokens
  if (
    s.includes(":") ||
    s.includes("#") ||
    s.includes("{") ||
    s.includes("}") ||
    s.includes("[") ||
    s.includes("]") ||
    s.includes("'") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.startsWith("*") ||
    s.startsWith("&") ||
    s.startsWith("!") ||
    s.startsWith("%") ||
    s.startsWith("@") ||
    s.startsWith("`") ||
    s === "true" ||
    s === "false" ||
    s === "null" ||
    s === "yes" ||
    s === "no"
  ) {
    // Use double quotes, escaping internal double quotes
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
  }
  return s;
}
