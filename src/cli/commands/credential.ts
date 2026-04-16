/**
 * CLI Command: credential
 * Manage encrypted credentials in the vault.
 *
 * ditto credential add <service> --process <slug>  — store (masked input)
 * ditto credential list [--process <slug>]          — list (never shows values)
 * ditto credential remove <service> --process <slug> — delete
 *
 * Provenance: Brief 035, @clack/prompts for masked input
 */

import { defineCommand } from "citty";
import * as clack from "@clack/prompts";
import { db, schema } from "../../db";
import { eq } from "drizzle-orm";
import {
  storeCredential,
  deleteCredential,
  listCredentials,
} from "../../engine/credential-vault";

export const credentialAddCommand = defineCommand({
  meta: {
    name: "add",
    description: "Store an encrypted credential for a service",
  },
  args: {
    service: {
      type: "positional",
      description: "Service name (e.g., github, slack)",
      required: true,
    },
    process: {
      type: "string",
      description: "Process slug to scope credential to",
      required: true,
    },
    expiresAt: {
      type: "string",
      description: "Expiration timestamp (ISO 8601 or epoch ms)",
    },
  },
  async run({ args }) {
    // Validate DITTO_VAULT_KEY is set
    if (!process.env.DITTO_VAULT_KEY) {
      console.error("Error: DITTO_VAULT_KEY environment variable is required");
      process.exit(1);
    }

    // Look up the process by slug
    const processRow = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, args.process));

    if (processRow.length === 0) {
      console.error(`Error: no process found with slug '${args.process}'`);
      process.exit(1);
    }

    const processId = processRow[0].id;

    // Prompt for credential value (masked)
    clack.intro(`Store credential: ${args.service} → ${args.process}`);

    const value = await clack.password({
      message: `Enter credential value for ${args.service}`,
    });

    if (clack.isCancel(value) || !value) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }

    // Parse optional expiry
    let expiresAt: number | undefined;
    if (args.expiresAt) {
      const parsed = Date.parse(args.expiresAt);
      expiresAt = isNaN(parsed) ? Number(args.expiresAt) : parsed;
      if (isNaN(expiresAt)) {
        console.error("Error: invalid expiresAt value");
        process.exit(1);
      }
    }

    await storeCredential(processId, args.service, value, expiresAt);

    clack.outro(`Credential stored (encrypted) for ${args.service} → ${args.process}`);
  },
});

export const credentialListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List stored credentials (values never shown)",
  },
  args: {
    process: {
      type: "string",
      description: "Filter by process slug",
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    // Resolve process slug to ID if provided
    let processId: string | undefined;
    if (args.process) {
      const processRow = await db
        .select()
        .from(schema.processes)
        .where(eq(schema.processes.slug, args.process));

      if (processRow.length === 0) {
        console.error(`Error: no process found with slug '${args.process}'`);
        process.exit(1);
      }
      processId = processRow[0].id;
    }

    const creds = await listCredentials(processId);

    if (creds.length === 0) {
      if (args.json) {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      console.log("No credentials stored.");
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(creds.map(c => ({
        service: c.service,
        processId: c.processId,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
      })), null, 2));
      return;
    }

    // Look up process slugs for display
    const processIds = [...new Set(creds.map(c => c.processId))];
    const processRows = await db.select().from(schema.processes);
    const slugMap = new Map(processRows.map(p => [p.id, p.slug]));

    console.log(`CREDENTIALS (${creds.length})\n`);
    for (const cred of creds) {
      const slug = cred.processId ? (slugMap.get(cred.processId) ?? cred.processId.slice(0, 8)) : "(user-scoped)";
      const expires = cred.expiresAt
        ? new Date(cred.expiresAt).toISOString().slice(0, 10)
        : "never";
      const added = new Date(cred.createdAt).toISOString().slice(0, 10);
      console.log(`  ${cred.service.padEnd(20)} process: ${slug.padEnd(20)} expires: ${expires.padEnd(12)} added: ${added}`);
    }
  },
});

export const credentialRemoveCommand = defineCommand({
  meta: {
    name: "remove",
    description: "Remove a stored credential",
  },
  args: {
    service: {
      type: "positional",
      description: "Service name (e.g., github, slack)",
      required: true,
    },
    process: {
      type: "string",
      description: "Process slug",
      required: true,
    },
  },
  async run({ args }) {
    // Validate DITTO_VAULT_KEY is set
    if (!process.env.DITTO_VAULT_KEY) {
      console.error("Error: DITTO_VAULT_KEY environment variable is required");
      process.exit(1);
    }

    // Look up process
    const processRow = await db
      .select()
      .from(schema.processes)
      .where(eq(schema.processes.slug, args.process));

    if (processRow.length === 0) {
      console.error(`Error: no process found with slug '${args.process}'`);
      process.exit(1);
    }

    const processId = processRow[0].id;

    const confirm = await clack.confirm({
      message: `Remove ${args.service} credential for process '${args.process}'?`,
    });

    if (clack.isCancel(confirm) || !confirm) {
      console.log("Cancelled.");
      process.exit(0);
    }

    await deleteCredential(processId, args.service);
    console.log(`Credential removed: ${args.service} → ${args.process}`);
  },
});

export const credentialCommand = defineCommand({
  meta: {
    name: "credential",
    description: "Manage encrypted credentials",
  },
  subCommands: {
    add: credentialAddCommand,
    list: credentialListCommand,
    remove: credentialRemoveCommand,
  },
});
