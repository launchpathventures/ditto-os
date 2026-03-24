/**
 * CLI Command: generate-integration
 * Generate a Ditto integration YAML from an OpenAPI 3.x spec.
 *
 * ditto generate-integration --spec <file|url> --service <name> [--output <path>]
 *
 * Provenance: Brief 037, citty command pattern (existing)
 */

import fs from "fs";
import path from "path";
import { defineCommand } from "citty";
import { generateFromOpenApi, emitYaml } from "../../engine/integration-generator";

export const generateIntegrationCommand = defineCommand({
  meta: {
    name: "generate-integration",
    description: "Generate integration YAML from an OpenAPI 3.x spec",
  },
  args: {
    spec: {
      type: "string",
      description: "Path or URL to OpenAPI 3.x spec (JSON or YAML)",
      required: true,
    },
    service: {
      type: "string",
      description: "Service name (used as filename and service field)",
      required: true,
    },
    output: {
      type: "string",
      description: "Output file path (default: integrations/{service}.yaml)",
    },
  },
  async run({ args }) {
    const specPath = args.spec;
    const serviceName = args.service;
    const outputPath =
      args.output || path.join(process.cwd(), "integrations", `${serviceName}.yaml`);

    console.log(`Parsing OpenAPI spec: ${specPath}`);

    try {
      const result = await generateFromOpenApi(specPath, serviceName);

      // Print warnings to stderr
      if (result.warnings.length > 0) {
        console.error(`\nWarnings (${result.warnings.length}):`);
        for (const w of result.warnings) {
          console.error(`  ⚠ ${w}`);
        }
      }

      // Emit YAML
      const yaml = emitYaml(result, specPath);

      // Ensure output directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, yaml, "utf-8");

      // Summary
      const readCount = result.tools.filter((t) => t.classification === "read-only").length;
      const writeCount = result.tools.filter((t) => t.classification === "write").length;
      console.log(
        `\nGenerated ${result.tools.length} tools (${readCount} read, ${writeCount} write) for ${serviceName}.`
      );
      console.log(`Review and curate: ${outputPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  },
});
