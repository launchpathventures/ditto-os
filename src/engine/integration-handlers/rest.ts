/**
 * Ditto — REST Protocol Handler
 *
 * Executes integration commands via HTTP (native fetch).
 * Minimal: GET/POST/PUT/DELETE with headers, JSON body, auth header injection.
 * Credential scrubbing on all responses.
 *
 * Provenance: Standard HTTP client patterns, ADR-005 (REST as universal fallback),
 * Brief 025 (Ditto-native integration tools)
 */

import type { RestInterface } from "../integration-registry";
import { scrubCredentials } from "./cli";
import { resolveServiceAuth } from "../credential-vault";
import { scrubCredentialsFromValue, secretsFromAuthEnv } from "./scrub";

/**
 * Resolve auth credentials for a REST service via credential vault.
 * Vault-first, env-var fallback with deprecation warning (Brief 035).
 *
 * Returns { headers, authValues } where authValues are the raw credential
 * values for scrubbing from responses.
 */
export async function resolveRestAuth(
  service: string,
  restInterface: RestInterface,
  processId?: string,
): Promise<{ headers: Record<string, string>; authValues: Record<string, string> }> {
  const headers: Record<string, string> = {};
  const authValues: Record<string, string> = {};

  // Copy static headers from interface definition
  if (restInterface.headers) {
    for (const [key, value] of Object.entries(restInterface.headers)) {
      headers[key] = value;
    }
  }

  // Resolve auth via vault (unified path)
  const resolved = await resolveServiceAuth(processId, service, {
    authType: restInterface.auth,
  });

  // Build auth headers from resolved env vars
  const authType = restInterface.auth;
  const resolvedValues = Object.values(resolved.envVars);
  const token = resolvedValues[0]; // First resolved value is the token

  if (token) {
    if (authType === "bearer_token" || authType === "api_key") {
      headers["Authorization"] = `Bearer ${token}`;
    }
    // Copy all resolved values for scrubbing
    for (const [key, value] of Object.entries(resolved.envVars)) {
      authValues[key] = value;
    }
  }

  return { headers, authValues };
}

export interface RestHandlerParams {
  service: string;
  restInterface: RestInterface;
  method: "GET" | "POST" | "PUT" | "DELETE";
  endpoint: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  timeoutMs?: number;
  processId?: string;
}

/**
 * Execute a REST integration request.
 *
 * Returns { result, logs } — result is the parsed JSON response,
 * logs are scrubbed of credentials.
 */
export async function executeRest(
  params: RestHandlerParams,
): Promise<{ result: unknown; logs: string[] }> {
  const { service, restInterface, method, endpoint, body, query, timeoutMs = 30_000, processId } = params;
  const { headers, authValues } = await resolveRestAuth(service, restInterface, processId);
  const logs: string[] = [];

  // Build URL
  let url = `${restInterface.base_url}${endpoint}`;
  if (query) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) searchParams.set(key, value);
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  logs.push(`${method} ${scrubCredentials(url, authValues)}`);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    };

    if (body && (method === "POST" || method === "PUT")) {
      fetchOptions.body = JSON.stringify(body);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }

    const response = await fetch(url, fetchOptions);
    const responseText = await response.text();

    // Scrub credentials from response
    const scrubbedResponse = scrubCredentials(responseText, authValues);

    if (!response.ok) {
      logs.push(`HTTP ${response.status}: ${scrubbedResponse.slice(0, 500)}`);
      return {
        result: { error: `HTTP ${response.status}`, body: scrubbedResponse.slice(0, 500) },
        logs,
      };
    }

    // Try to parse as JSON — use scrubbed text to prevent credential leaks
    let parsed: unknown;
    try {
      parsed = JSON.parse(scrubbedResponse);
    } catch {
      parsed = scrubbedResponse;
    }

    // Brief 171: belt-and-braces scrub on the structured value in case any
    // auth value survived JSON parsing unchanged (e.g. echoed as a key).
    const secrets = secretsFromAuthEnv(authValues);
    const scrubbedParsed = scrubCredentialsFromValue(parsed, secrets, service);

    logs.push(`OK (${responseText.length} bytes)`);
    return { result: scrubbedParsed, logs };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const scrubbedMsg = scrubCredentials(msg, authValues);
    logs.push(`FAILED: ${scrubbedMsg}`);
    return {
      result: { error: scrubbedMsg },
      logs,
    };
  }
}
