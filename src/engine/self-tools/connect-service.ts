/**
 * Ditto — Self Tool: Connect Service
 *
 * Guides the user through connecting an external service integration.
 * Detects available integrations from the registry, presents setup
 * instructions, and stores credentials to the vault.
 *
 * The actual credential value is submitted via a separate /api/credential
 * route with a masked input — NEVER written to conversation history,
 * activity logs, or stepRuns.
 *
 * Provenance: credential-vault.ts (Brief 035), integration-registry.ts,
 * ADR-005, Insight-090 (integration auth is a conversation moment).
 */

import { getIntegrationRegistry } from "../integration-registry";
import type { IntegrationDefinition } from "../integration-registry";
import { listCredentials } from "../credential-vault";
import type { DelegationResult } from "../self-delegation";

interface ConnectServiceInput {
  /** Service name from the integration registry */
  service: string;
  /** Process slug that needs this service (for credential scoping) */
  processSlug?: string;
  /** Action: 'check' to see what's available, 'guide' to show setup instructions */
  action: "check" | "guide" | "verify";
}

export async function handleConnectService(
  input: ConnectServiceInput,
): Promise<DelegationResult> {
  const { service, processSlug, action } = input;

  // service is required for "guide" and "verify", optional for "check"
  if (!service && action !== "check") {
    return {
      toolName: "connect_service",
      success: false,
      output: "Service name is required for guide and verify actions.",
    };
  }

  try {
    const registry = getIntegrationRegistry();

    if (action === "check") {
      // List available integrations (optionally filtered by service)
      let entries = Array.from(registry.values());
      if (service) {
        entries = entries.filter((def) => def.service === service);
      }
      const services = entries.map((def: IntegrationDefinition) => ({
        service: def.service,
        description: def.description,
        preferred: def.preferred,
        connection: def.connection ?? null,
      }));

      return {
        toolName: "connect_service",
        success: true,
        output: JSON.stringify({
          action: "available_services",
          services,
          message: `${services.length} integration(s) available.`,
        }),
      };
    }

    // Look up the specific service
    const integration = registry.get(service);
    if (!integration) {
      const available = Array.from(registry.keys()).join(", ");
      return {
        toolName: "connect_service",
        success: false,
        output: `Service "${service}" not found in registry. Available: ${available || "none"}`,
      };
    }

    if (action === "guide") {
      // Determine auth requirements from the preferred interface
      const iface = integration.interfaces[integration.preferred];
      const authType = iface && "auth" in iface ? (iface as { auth?: string }).auth ?? null : null;
      const envVars = iface && "env_vars" in iface ? (iface as { env_vars?: string[] }).env_vars ?? null : null;
      const connection = integration.connection;

      // Check if already connected
      const existingCreds = processSlug
        ? await listCredentials(processSlug)
        : [];
      const isConnected = existingCreds.some((c) => c.service === service);

      return {
        toolName: "connect_service",
        success: true,
        output: JSON.stringify({
          action: "setup_guide",
          service: integration.service,
          description: integration.description,
          authType: authType ?? "api_key",
          envVars: envVars ?? [],
          setupUrl: connection?.setup_url ?? null,
          setupInstructions: connection?.setup_instructions ?? getDefaultInstructions(service) as string,
          isConnected,
          processSlug: processSlug ?? null,
          // Signal to frontend to show masked credential input
          requiresCredential: !isConnected,
          credentialRequest: !isConnected ? {
            service,
            processSlug: processSlug ?? null,
            fieldLabel: `${integration.service} API Key`,
            placeholder: "sk-...",
          } : null,
          message: isConnected
            ? `${integration.service} is already connected.`
            : `To connect ${integration.service}, you'll need an API key. I'll show you a secure input field — the key will be encrypted and never appear in our conversation.`,
        }),
      };
    }

    if (action === "verify") {
      // Check if credentials exist for this service
      const creds = processSlug
        ? await listCredentials(processSlug)
        : [];
      const hasCredential = creds.some((c) => c.service === service);

      return {
        toolName: "connect_service",
        success: true,
        output: JSON.stringify({
          action: "verification",
          service,
          connected: hasCredential,
          message: hasCredential
            ? `${service} credentials are stored and ready.`
            : `${service} credentials not found. Please complete the setup.`,
        }),
      };
    }

    return {
      toolName: "connect_service",
      success: false,
      output: `Unknown action: ${action}. Use "check", "guide", or "verify".`,
    };
  } catch (err) {
    return {
      toolName: "connect_service",
      success: false,
      output: `Failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function getDefaultInstructions(service: string): string {
  switch (service) {
    case "github":
      return "Create a personal access token at https://github.com/settings/tokens. Select the scopes you need (repo, issues, pull requests).";
    case "slack":
      return "Create a Slack app at https://api.slack.com/apps, then generate a Bot User OAuth Token under OAuth & Permissions.";
    default:
      return `Check the ${service} documentation for API key or token setup instructions.`;
  }
}
