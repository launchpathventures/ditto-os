/**
 * Integration Generator Tests (Brief 037)
 *
 * Tests: valid spec generation, $ref resolution, missing operationId handling,
 * nested parameter flattening, auth scheme mapping, duplicate name handling,
 * deprecated operation skipping, empty parameters, YAML emission + validation.
 */

import { describe, it, expect } from "vitest";
import {
  generateFromOpenApi,
  emitYaml,
  toSnakeCase,
} from "./integration-generator";
import { validateIntegration } from "./integration-registry";
import YAML from "yaml";
import fs from "fs";
import path from "path";
import os from "os";

// ============================================================
// Helper: write a temp OpenAPI spec file and return its path
// ============================================================

function writeTempSpec(spec: object): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ditto-gen-test-"));
  const filePath = path.join(dir, "spec.json");
  fs.writeFileSync(filePath, JSON.stringify(spec), "utf-8");
  return filePath;
}

/** Minimal valid OpenAPI 3.0 spec */
function minimalSpec(overrides: Record<string, unknown> = {}): object {
  return {
    openapi: "3.0.3",
    info: { title: "Test API", version: "1.0.0", ...((overrides.info as object) || {}) },
    servers: overrides.servers || [{ url: "https://api.test.com" }],
    paths: overrides.paths || {},
    components: overrides.components || {},
  };
}

// ============================================================
// toSnakeCase
// ============================================================

describe("toSnakeCase", () => {
  it("converts camelCase to snake_case", () => {
    expect(toSnakeCase("listCustomers")).toBe("list_customers");
    expect(toSnakeCase("getOrderById")).toBe("get_order_by_id");
  });

  it("converts PascalCase to snake_case", () => {
    expect(toSnakeCase("ListCustomers")).toBe("list_customers");
  });

  it("converts kebab-case to snake_case", () => {
    expect(toSnakeCase("list-customers")).toBe("list_customers");
  });

  it("handles consecutive uppercase letters", () => {
    expect(toSnakeCase("getHTTPResponse")).toBe("get_http_response");
    expect(toSnakeCase("parseJSONData")).toBe("parse_json_data");
  });

  it("handles already snake_case", () => {
    expect(toSnakeCase("list_customers")).toBe("list_customers");
  });
});

// ============================================================
// generateFromOpenApi
// ============================================================

describe("generateFromOpenApi", () => {
  it("generates tools from a valid spec with GET and POST operations", async () => {
    const spec = minimalSpec({
      paths: {
        "/users": {
          get: {
            operationId: "listUsers",
            summary: "List all users",
            parameters: [
              { name: "limit", in: "query", schema: { type: "integer" }, description: "Max results" },
            ],
          },
          post: {
            operationId: "createUser",
            summary: "Create a user",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["email"],
                    properties: {
                      email: { type: "string", description: "User email" },
                      name: { type: "string", description: "User name" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "test-api");

    expect(result.service).toBe("test-api");
    expect(result.baseUrl).toBe("https://api.test.com");
    expect(result.tools).toHaveLength(2);

    // GET tool
    const getTool = result.tools.find((t) => t.name === "list_users");
    expect(getTool).toBeDefined();
    expect(getTool!.description).toBe("List all users");
    expect(getTool!.classification).toBe("read-only");
    expect(getTool!.execute.method).toBe("GET");
    expect(getTool!.execute.endpoint).toBe("/users");
    expect(getTool!.parameters.limit).toBeDefined();
    expect(getTool!.execute.query).toEqual({ limit: "{limit}" });

    // POST tool
    const postTool = result.tools.find((t) => t.name === "create_user");
    expect(postTool).toBeDefined();
    expect(postTool!.classification).toBe("write");
    expect(postTool!.execute.method).toBe("POST");
    expect(postTool!.parameters.email).toEqual({
      type: "string",
      description: "User email",
      required: true,
    });
    expect(postTool!.execute.body).toEqual({ email: "{email}", name: "{name}" });
  });

  it("resolves $ref references", async () => {
    const spec = minimalSpec({
      paths: {
        "/items": {
          get: {
            operationId: "listItems",
            summary: "List items",
            parameters: [
              { $ref: "#/components/parameters/LimitParam" },
            ],
          },
        },
      },
      components: {
        parameters: {
          LimitParam: {
            name: "limit",
            in: "query",
            schema: { type: "integer" },
            description: "Max results",
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "ref-api");

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].parameters.limit).toBeDefined();
    expect(result.tools[0].parameters.limit.description).toBe("Max results");
    expect(result.warnings).toHaveLength(0);
  });

  it("skips operations without operationId and warns", async () => {
    const spec = minimalSpec({
      paths: {
        "/health": {
          get: {
            summary: "Health check",
            // No operationId
          },
        },
        "/users": {
          get: {
            operationId: "listUsers",
            summary: "List users",
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "skip-api");

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("list_users");
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Skipping GET /health: no operationId")
    );
  });

  it("flattens top-level body properties and warns on nested objects", async () => {
    const spec = minimalSpec({
      paths: {
        "/orders": {
          post: {
            operationId: "createOrder",
            summary: "Create order",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      amount: { type: "number", description: "Order total" },
                      shipping: {
                        type: "object",
                        description: "Shipping details",
                        properties: {
                          address: { type: "string" },
                          city: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "nested-api");

    expect(result.tools).toHaveLength(1);
    // amount should be flattened
    expect(result.tools[0].parameters.amount).toBeDefined();
    // shipping should be skipped (nested object)
    expect(result.tools[0].parameters.shipping).toBeUndefined();
    expect(result.warnings).toContainEqual(
      expect.stringContaining("skipping nested object property 'shipping'")
    );
  });

  it("maps auth schemes correctly", async () => {
    const specs: Array<{ scheme: object; expected: string }> = [
      { scheme: { type: "http", scheme: "bearer" }, expected: "bearer_token" },
      { scheme: { type: "apiKey", name: "X-API-Key", in: "header" }, expected: "api_key" },
      { scheme: { type: "oauth2", flows: {} }, expected: "oauth2" },
    ];

    for (const { scheme, expected } of specs) {
      const spec = minimalSpec({
        components: {
          securitySchemes: { primary: scheme },
        },
        paths: {},
      });

      const filePath = writeTempSpec(spec);
      const result = await generateFromOpenApi(filePath, "auth-test");
      expect(result.auth).toBe(expected);
    }
  });

  it("handles duplicate operationId names by prefixing with method", async () => {
    const spec = minimalSpec({
      paths: {
        "/users": {
          get: {
            operationId: "users",
            summary: "List users",
          },
          post: {
            operationId: "users",
            summary: "Create user",
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "dup-api");

    expect(result.tools).toHaveLength(2);
    const names = result.tools.map((t) => t.name);
    // First one gets "users", second gets "post_users"
    expect(names).toContain("users");
    expect(names).toContain("post_users");
  });

  it("skips deprecated operations with warning", async () => {
    const spec = minimalSpec({
      paths: {
        "/old": {
          get: {
            operationId: "oldEndpoint",
            summary: "Deprecated",
            deprecated: true,
          },
        },
        "/new": {
          get: {
            operationId: "newEndpoint",
            summary: "Current",
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "dep-api");

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("new_endpoint");
    expect(result.warnings).toContainEqual(
      expect.stringContaining("Skipping deprecated operation oldEndpoint")
    );
  });

  it("emits empty parameters for operations with no params", async () => {
    const spec = minimalSpec({
      paths: {
        "/health": {
          get: {
            operationId: "healthCheck",
            summary: "Health check",
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "health-api");

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].parameters).toEqual({});
  });

  it("preserves path parameter placeholders in endpoint", async () => {
    const spec = minimalSpec({
      paths: {
        "/users/{userId}/orders/{orderId}": {
          get: {
            operationId: "getUserOrder",
            summary: "Get a user order",
            parameters: [
              { name: "userId", in: "path", required: true, schema: { type: "string" } },
              { name: "orderId", in: "path", required: true, schema: { type: "string" } },
            ],
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "path-api");

    expect(result.tools[0].execute.endpoint).toBe("/users/{userId}/orders/{orderId}");
    expect(result.tools[0].parameters.userId).toEqual({ type: "string", required: true });
    expect(result.tools[0].parameters.orderId).toEqual({ type: "string", required: true });
  });

  it("handles enum parameters by listing values in description", async () => {
    const spec = minimalSpec({
      paths: {
        "/items": {
          get: {
            operationId: "listItems",
            summary: "List items",
            parameters: [
              {
                name: "status",
                in: "query",
                description: "Item status",
                schema: { type: "string", enum: ["active", "archived", "draft"] },
              },
            ],
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "enum-api");

    expect(result.tools[0].parameters.status.description).toContain("enum: active, archived, draft");
  });

  it("skips multipart/form-data operations with warning", async () => {
    const spec = minimalSpec({
      paths: {
        "/upload": {
          post: {
            operationId: "uploadFile",
            summary: "Upload a file",
            requestBody: {
              content: {
                "multipart/form-data": {
                  schema: {
                    type: "object",
                    properties: {
                      file: { type: "string", format: "binary" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "upload-api");

    expect(result.tools).toHaveLength(0);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("file upload")
    );
  });

  it("skips PATCH operations with warning", async () => {
    const spec = minimalSpec({
      paths: {
        "/users/{id}": {
          patch: {
            operationId: "updateUser",
            summary: "Partially update a user",
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string" } },
            ],
          },
          get: {
            operationId: "getUser",
            summary: "Get a user",
            parameters: [
              { name: "id", in: "path", required: true, schema: { type: "string" } },
            ],
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "patch-api");

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("get_user");
    expect(result.warnings).toContainEqual(
      expect.stringContaining("PATCH method not supported")
    );
  });

  it("uses placeholder base_url when no servers array", async () => {
    const spec = {
      openapi: "3.0.3",
      info: { title: "No Server API", version: "1.0.0" },
      paths: {},
    };

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "noserver-api");

    expect(result.baseUrl).toContain("UPDATE THIS");
  });
});

// ============================================================
// emitYaml + registry validation
// ============================================================

describe("emitYaml", () => {
  it("produces YAML that passes integration registry validation", async () => {
    const spec = minimalSpec({
      paths: {
        "/users": {
          get: {
            operationId: "listUsers",
            summary: "List all users",
            parameters: [
              { name: "limit", in: "query", schema: { type: "integer" } },
            ],
          },
          post: {
            operationId: "createUser",
            summary: "Create a user",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["email"],
                    properties: {
                      email: { type: "string", description: "User email" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "validation-test");
    const yamlStr = emitYaml(result, filePath);

    // Parse the emitted YAML
    const parsed = YAML.parse(yamlStr) as Record<string, unknown>;

    // Validate using the existing registry validator
    const errors = validateIntegration(parsed);
    expect(errors).toEqual([]);
  });

  it("includes header comments with metadata", async () => {
    const spec = minimalSpec({
      paths: {
        "/items": {
          get: { operationId: "listItems", summary: "List items" },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "header-test");
    const yamlStr = emitYaml(result, "./test-spec.yaml");

    expect(yamlStr).toContain("# Generated by: ditto generate-integration");
    expect(yamlStr).toContain("# Source: ./test-spec.yaml");
    expect(yamlStr).toContain("# Date:");
    expect(yamlStr).toContain("# Tools: 1 (1 read, 0 write)");
    expect(yamlStr).toContain("# ⚠ Review and curate before use");
  });

  it("annotates tools with read-only or write classification", async () => {
    const spec = minimalSpec({
      paths: {
        "/items": {
          get: { operationId: "listItems", summary: "List items" },
          post: { operationId: "createItem", summary: "Create item" },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "classify-test");
    const yamlStr = emitYaml(result, filePath);

    expect(yamlStr).toContain("name: list_items  # read-only");
    expect(yamlStr).toContain("name: create_item  # write");
  });

  it("emits empty parameters as {} for parameterless operations", async () => {
    const spec = minimalSpec({
      paths: {
        "/health": {
          get: { operationId: "healthCheck", summary: "Health check" },
        },
      },
    });

    const filePath = writeTempSpec(spec);
    const result = await generateFromOpenApi(filePath, "empty-params");
    const yamlStr = emitYaml(result, filePath);

    expect(yamlStr).toContain("parameters: {}");

    // Also validate it passes registry validation
    const parsed = YAML.parse(yamlStr) as Record<string, unknown>;
    const errors = validateIntegration(parsed);
    expect(errors).toEqual([]);
  });
});
