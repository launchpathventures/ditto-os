/**
 * CLI Command: network
 * Manage Network API tokens, workspace provisioning, and fleet administration.
 *
 * ditto network token create --user-id <id> [--admin]  — Generate a new API token
 * ditto network token list                              — List all tokens
 * ditto network token revoke <id>                       — Revoke a token
 * ditto network provision --user-id <id>                — Provision a managed workspace
 * ditto network deprovision --user-id <id> [--confirm]  — Deprovision a managed workspace
 * ditto network fleet                                   — Show fleet status
 *
 * Provenance: Brief 088, Brief 090 (admin auth, provisioning), Brief 100 (Railway migration), ADR-025 (Network API auth).
 */

import { defineCommand } from "citty";

const tokenCreateCommand = defineCommand({
  meta: {
    name: "create",
    description: "Generate a new Network API token for a user",
  },
  args: {
    "user-id": {
      type: "string",
      description: "User ID to create token for",
      required: true,
    },
    admin: {
      type: "boolean",
      description: "Create an admin token (can provision workspaces, manage fleet)",
      default: false,
    },
  },
  async run({ args }) {
    const userId = args["user-id"];
    if (!userId) {
      console.error("Usage: ditto network token create --user-id <id> [--admin]");
      process.exit(1);
    }

    const { createToken } = await import("../../engine/network-api-auth");
    const { token, id } = await createToken(userId, { isAdmin: args.admin });

    const role = args.admin ? "admin" : "user";
    console.log(`Token created for ${role} "${userId}":`);
    console.log(`  ID:    ${id}`);
    console.log(`  Token: ${token}`);
    console.log(`  Admin: ${args.admin}`);
    console.log("");
    console.log("Save this token — it cannot be retrieved again.");
  },
});

const tokenListCommand = defineCommand({
  meta: {
    name: "list",
    description: "List all Network API tokens",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const { listTokens } = await import("../../engine/network-api-auth");
    const tokens = await listTokens();

    if (tokens.length === 0) {
      if (args.json) {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      console.log("No tokens found.");
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(tokens, null, 2));
      return;
    }

    console.log(`NETWORK TOKENS (${tokens.length})\n`);
    for (const t of tokens) {
      const status = t.revokedAt ? "REVOKED" : "active";
      const role = t.isAdmin ? "ADMIN" : "user";
      const created = t.createdAt.toISOString().slice(0, 19).replace("T", " ");
      console.log(
        `  ${t.id.slice(0, 8)}...  ${role.padEnd(6)}  user: ${t.userId.padEnd(15)}  ${status.padEnd(8)}  created: ${created}`,
      );
    }
  },
});

const tokenRevokeCommand = defineCommand({
  meta: {
    name: "revoke",
    description: "Revoke a Network API token",
  },
  args: {
    id: {
      type: "positional",
      description: "Token ID to revoke",
      required: true,
    },
  },
  async run({ args }) {
    if (!args.id) {
      console.error("Usage: ditto network token revoke <token-id>");
      process.exit(1);
    }

    const { revokeToken } = await import("../../engine/network-api-auth");
    const revoked = await revokeToken(args.id);

    if (revoked) {
      console.log(`Token ${args.id} revoked.`);
    } else {
      console.error(`Token not found or already revoked: ${args.id}`);
      process.exit(1);
    }
  },
});

const tokenCommand = defineCommand({
  meta: {
    name: "token",
    description: "Manage Network API tokens",
  },
  subCommands: {
    create: tokenCreateCommand,
    list: tokenListCommand,
    revoke: tokenRevokeCommand,
  },
});

// ============================================================
// Provision Command
// ============================================================

const provisionCommand = defineCommand({
  meta: {
    name: "provision",
    description: "Provision a managed workspace for a user on Railway",
  },
  args: {
    "user-id": {
      type: "string",
      description: "User ID to provision workspace for",
      required: true,
    },
    "image-ref": {
      type: "string",
      description: "Docker image reference (default: DITTO_IMAGE_REF env)",
    },
  },
  async run({ args }) {
    const userId = args["user-id"];
    if (!userId) {
      console.error("Usage: ditto network provision --user-id <id>");
      process.exit(1);
    }

    const railwayToken = process.env.RAILWAY_API_TOKEN;
    const railwayProjectId = process.env.RAILWAY_PROJECT_ID;
    const imageRef = args["image-ref"] ?? process.env.DITTO_IMAGE_REF;
    const networkUrl = process.env.DITTO_NETWORK_URL;

    if (!railwayToken || !railwayProjectId || !imageRef || !networkUrl) {
      console.error("Required environment variables: RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID, DITTO_IMAGE_REF, DITTO_NETWORK_URL");
      process.exit(1);
    }

    const { provisionWorkspace, createRailwayClient } = await import(
      "../../engine/workspace-provisioner"
    );

    const railwayClient = createRailwayClient(railwayToken, railwayProjectId);

    try {
      const result = await provisionWorkspace(userId, {
        railwayClient,
        projectId: railwayProjectId,
        imageRef,
        networkUrl,
        onProgress: (msg) => console.log(msg),
      });

      if (result.status === "existing") {
        console.log(`Workspace already exists: ${result.workspaceUrl} (status: healthy)`);
      } else {
        console.log(`Workspace provisioned: ${result.workspaceUrl}`);
      }
    } catch (error) {
      console.error(`Provisioning failed: ${error instanceof Error ? error.message : "unknown"}`);
      console.error("All resources have been rolled back.");
      process.exit(1);
    }
  },
});

// ============================================================
// Deprovision Command
// ============================================================

const deprovisionCommand = defineCommand({
  meta: {
    name: "deprovision",
    description: "Deprovision a managed workspace (destructive)",
  },
  args: {
    "user-id": {
      type: "string",
      description: "User ID to deprovision workspace for",
      required: true,
    },
    confirm: {
      type: "boolean",
      description: "Confirm destructive operation",
      default: false,
    },
  },
  async run({ args }) {
    const userId = args["user-id"];
    if (!userId) {
      console.error("Usage: ditto network deprovision --user-id <id> --confirm");
      process.exit(1);
    }

    if (!args.confirm) {
      console.log(`WARNING: This will permanently delete all workspace data for ${userId}.`);
      console.log("Use --confirm to proceed.");
      process.exit(0);
    }

    const railwayToken = process.env.RAILWAY_API_TOKEN;
    const railwayProjectId = process.env.RAILWAY_PROJECT_ID;

    if (!railwayToken || !railwayProjectId) {
      console.error("Required environment variables: RAILWAY_API_TOKEN, RAILWAY_PROJECT_ID");
      process.exit(1);
    }

    const { deprovisionWorkspace, createRailwayClient } = await import(
      "../../engine/workspace-provisioner"
    );

    const railwayClient = createRailwayClient(railwayToken, railwayProjectId);

    try {
      await deprovisionWorkspace(userId, {
        railwayClient,
        projectId: railwayProjectId,
        onProgress: (msg) => console.log(msg),
      });

      console.log(`Workspace deprovisioned: ${userId}`);
    } catch (error) {
      console.error(`Deprovisioning failed: ${error instanceof Error ? error.message : "unknown"}`);
      process.exit(1);
    }
  },
});

// ============================================================
// Fleet Command
// ============================================================

const fleetCommand = defineCommand({
  meta: {
    name: "fleet",
    description: "Show all managed workspaces",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const { getFleetStatus } = await import("../../engine/workspace-provisioner");
    const fleet = await getFleetStatus();

    if (fleet.length === 0) {
      if (args.json) {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      console.log("No managed workspaces.");
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(fleet, null, 2));
      return;
    }

    console.log(`MANAGED WORKSPACES (${fleet.length})\n`);
    for (const w of fleet) {
      const lastCheck = w.lastHealthCheckAt
        ? w.lastHealthCheckAt.toISOString().slice(0, 19).replace("T", " ")
        : "never";
      const version = w.currentVersion ?? "unknown";
      console.log(
        `  ${w.userId.padEnd(15)}  ${w.workspaceUrl.padEnd(45)}  ${w.status.padEnd(14)}  ${version.padEnd(10)}  last check: ${lastCheck}`,
      );
    }
  },
});

// ============================================================
// Fleet Upgrade Commands (Brief 091, Brief 100)
// ============================================================

const upgradeCommand = defineCommand({
  meta: {
    name: "upgrade",
    description: "Upgrade all managed workspaces to a new image (canary-first rolling upgrade)",
  },
  args: {
    image: {
      type: "string",
      description: "Target Docker image reference (e.g., ditto:v0.2.0)",
      required: true,
    },
    "max-failures": {
      type: "string",
      description: "Circuit breaker threshold — consecutive failures before halting (default: 2)",
      default: "2",
    },
  },
  async run({ args }) {
    const imageRef = args.image;
    if (!imageRef) {
      console.error("Usage: ditto network upgrade --image <ref> [--max-failures N]");
      process.exit(1);
    }

    const maxFailures = parseInt(args["max-failures"] || "2", 10);

    const { db, schema } = await import("../../db");
    const {
      createWorkspaceUpgrader,
      createRailwayServiceClient,
      createHealthChecker,
      UpgradeConflictError,
    } = await import("../../engine/workspace-upgrader");
    const { createAlertSender } = await import("../../engine/workspace-alerts");

    const railwayToken = process.env.RAILWAY_API_TOKEN;
    const railwayProjectId = process.env.RAILWAY_PROJECT_ID;
    if (!railwayToken || !railwayProjectId) {
      console.error("RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID environment variables are required");
      process.exit(1);
    }

    const railwayClient = createRailwayServiceClient({
      apiToken: railwayToken,
      projectId: railwayProjectId,
    });

    const upgrader = createWorkspaceUpgrader({
      db: db as any,
      schema,
      railwayClient,
      healthChecker: createHealthChecker(),
      alertSender: createAlertSender(process.env.DITTO_ALERT_WEBHOOK_URL),
    });

    try {
      const result = await upgrader.upgradeFleet({
        imageRef,
        maxFailures,
        triggeredBy: "cli",
        onProgress: (msg) => console.log(msg),
      });

      console.log("");
      console.log(`Status: ${result.status}`);
      console.log(`Upgrade ID: ${result.upgradeId}`);
      process.exit(result.status === "completed" ? 0 : 1);
    } catch (error) {
      if (error instanceof UpgradeConflictError) {
        console.error("Error: An upgrade is already in progress.");
        process.exit(1);
      }
      throw error;
    }
  },
});

const rollbackCommand = defineCommand({
  meta: {
    name: "rollback",
    description: "Rollback the most recent fleet upgrade (reverts all upgraded workspaces)",
  },
  args: {},
  async run() {
    const { db, schema } = await import("../../db");
    const {
      createWorkspaceUpgrader,
      createRailwayServiceClient,
      createHealthChecker,
      UpgradeConflictError,
    } = await import("../../engine/workspace-upgrader");
    const { createAlertSender } = await import("../../engine/workspace-alerts");

    const railwayToken = process.env.RAILWAY_API_TOKEN;
    const railwayProjectId = process.env.RAILWAY_PROJECT_ID;
    if (!railwayToken || !railwayProjectId) {
      console.error("RAILWAY_API_TOKEN and RAILWAY_PROJECT_ID environment variables are required");
      process.exit(1);
    }

    const railwayClient = createRailwayServiceClient({
      apiToken: railwayToken,
      projectId: railwayProjectId,
    });

    const upgrader = createWorkspaceUpgrader({
      db: db as any,
      schema,
      railwayClient,
      healthChecker: createHealthChecker(),
      alertSender: createAlertSender(process.env.DITTO_ALERT_WEBHOOK_URL),
    });

    try {
      const result = await upgrader.rollbackFleet({
        triggeredBy: "cli",
        onProgress: (msg) => console.log(msg),
      });

      console.log("");
      console.log(`Upgrade ID: ${result.upgradeId}`);
      process.exit(result.failed > 0 ? 1 : 0);
    } catch (error) {
      if (error instanceof UpgradeConflictError) {
        console.error("Error: An upgrade is already in progress.");
        process.exit(1);
      }
      throw error;
    }
  },
});

const upgradesCommand = defineCommand({
  meta: {
    name: "upgrades",
    description: "Show fleet upgrade history",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
    limit: {
      type: "string",
      description: "Number of entries to show (default: 20)",
      default: "20",
    },
  },
  async run({ args }) {
    const { db, schema } = await import("../../db");
    const {
      createWorkspaceUpgrader,
      createRailwayServiceClient,
      createHealthChecker,
    } = await import("../../engine/workspace-upgrader");
    const { createAlertSender } = await import("../../engine/workspace-alerts");

    const railwayClient = createRailwayServiceClient({
      apiToken: process.env.RAILWAY_API_TOKEN || "",
      projectId: process.env.RAILWAY_PROJECT_ID || "",
    });

    const upgrader = createWorkspaceUpgrader({
      db: db as any,
      schema,
      railwayClient,
      healthChecker: createHealthChecker(),
      alertSender: createAlertSender(),
    });

    const limit = parseInt(args.limit || "20", 10);
    const history = await upgrader.getUpgradeHistory({ limit });

    if (history.length === 0) {
      if (args.json) {
        console.log(JSON.stringify([], null, 2));
        return;
      }
      console.log("No upgrade history.");
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(history, null, 2));
      return;
    }

    console.log(`UPGRADE HISTORY (${history.length} attempts)\n`);
    for (const u of history) {
      const started = u.startedAt
        ? new Date(u.startedAt as unknown as number).toISOString().slice(0, 19).replace("T", " ")
        : "unknown";
      const status = u.status.padEnd(24);
      const counts = `${u.upgradedCount}/${u.totalWorkspaces} upgraded`;
      console.log(
        `  ${u.id.slice(0, 8)}...  ${u.imageRef.padEnd(20)}  ${status}  ${counts.padEnd(16)}  ${started}`,
      );
    }
  },
});

// ============================================================
// Root Network Command
// ============================================================

export const networkCommand = defineCommand({
  meta: {
    name: "network",
    description: "Network administration, provisioning, and token management",
  },
  subCommands: {
    token: tokenCommand,
    provision: provisionCommand,
    deprovision: deprovisionCommand,
    fleet: fleetCommand,
    upgrade: upgradeCommand,
    rollback: rollbackCommand,
    upgrades: upgradesCommand,
  },
});
