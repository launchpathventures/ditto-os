/**
 * Ditto — Credential Vault
 *
 * Encrypted, per-process credential storage using AES-256-GCM.
 * Key derivation via HKDF (SHA-256) from DITTO_VAULT_KEY env var.
 *
 * Unified auth resolution: vault-first, env-var fallback with deprecation warning.
 *
 * Provenance: ADR-005 (brokered credentials), Node.js crypto (AES-256-GCM),
 * Nango managed auth (token lifecycle), Brief 035
 */

import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from "crypto";
import { db, schema } from "../db";
import { eq, and } from "drizzle-orm";
import type { CliInterface, RestInterface } from "./integration-registry";

// ============================================================
// Key Derivation
// ============================================================

/**
 * Derive a 256-bit AES key from DITTO_VAULT_KEY using HKDF.
 * Salt is the IV (per-credential), ensuring unique keys per encryption.
 */
function deriveKey(salt: Buffer): Buffer {
  const vaultKey = process.env.DITTO_VAULT_KEY;
  if (!vaultKey) {
    throw new Error("DITTO_VAULT_KEY environment variable is required for credential vault operations");
  }
  return Buffer.from(hkdfSync("sha256", vaultKey, salt, "ditto-credential-vault", 32));
}

// ============================================================
// Encryption / Decryption
// ============================================================

interface EncryptedPayload {
  encryptedValue: string; // base64
  iv: string;            // base64
  authTag: string;       // base64
}

function encrypt(plaintext: string): EncryptedPayload {
  const iv = randomBytes(16);
  const key = deriveKey(iv);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

function decrypt(payload: EncryptedPayload): string {
  const iv = Buffer.from(payload.iv, "base64");
  const key = deriveKey(iv);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  let decrypted = decipher.update(payload.encryptedValue, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ============================================================
// Vault Operations
// ============================================================

/**
 * Store or replace a credential for a (processId, service) scope.
 * Value is encrypted at rest. For multi-value credentials (e.g., username + token),
 * store as JSON string: '{"GH_TOKEN":"...","GH_USERNAME":"..."}'.
 */
export async function storeCredential(
  processId: string,
  service: string,
  value: string,
  expiresAt?: number,
): Promise<void> {
  const { encryptedValue, iv, authTag } = encrypt(value);

  // Upsert: delete existing, then insert
  await db.delete(schema.credentials).where(
    and(
      eq(schema.credentials.processId, processId),
      eq(schema.credentials.service, service),
    ),
  );

  await db.insert(schema.credentials).values({
    processId,
    service,
    encryptedValue,
    iv,
    authTag,
    expiresAt: expiresAt ?? null,
    createdAt: Date.now(),
  });
}

/**
 * Retrieve a credential for a (processId, service) scope.
 * Returns decrypted value + source, or null if not found.
 */
export async function getCredential(
  processId: string,
  service: string,
): Promise<{ value: string; source: "vault" } | null> {
  const rows = await db
    .select()
    .from(schema.credentials)
    .where(
      and(
        eq(schema.credentials.processId, processId),
        eq(schema.credentials.service, service),
      ),
    );

  if (rows.length === 0) return null;

  const row = rows[0];
  const value = decrypt({
    encryptedValue: row.encryptedValue,
    iv: row.iv,
    authTag: row.authTag,
  });

  return { value, source: "vault" };
}

/**
 * Brief 216 — project-scoped credentials (no `processId`).
 *
 * Used for outbound bearers tied to a project_runner config (e.g.,
 * `routine.<projectSlug>.bearer`). Plaintext is encrypted at the boundary;
 * the returned credential id is stored in `project_runners.credentialIds`.
 * Lookup uses `getCredentialById` since the credentials table's
 * `(processId, service)` unique constraint does not enforce on NULL processId.
 *
 * Returns the inserted row's id.
 */
export async function storeProjectCredential(
  service: string,
  value: string,
  expiresAt?: number,
): Promise<string> {
  const { encryptedValue, iv, authTag } = encrypt(value);
  const inserted = await db
    .insert(schema.credentials)
    .values({
      service,
      encryptedValue,
      iv,
      authTag,
      expiresAt: expiresAt ?? null,
      createdAt: Date.now(),
    })
    .returning({ id: schema.credentials.id });
  return inserted[0].id;
}

/**
 * Brief 216 — lookup a credential by id and return the decrypted value.
 * Used by adapters that hold a `credentialId` reference (project-scoped
 * credentials).
 */
export async function getCredentialById(
  credentialId: string,
): Promise<{ value: string; service: string } | null> {
  const rows = await db
    .select()
    .from(schema.credentials)
    .where(eq(schema.credentials.id, credentialId))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  const value = decrypt({
    encryptedValue: row.encryptedValue,
    iv: row.iv,
    authTag: row.authTag,
  });
  return { value, service: row.service };
}

/**
 * Brief 216 — delete a credential by id (used during bearer rotation).
 */
export async function deleteCredentialById(credentialId: string): Promise<void> {
  await db.delete(schema.credentials).where(eq(schema.credentials.id, credentialId));
}

/**
 * Delete a credential for a (processId, service) scope.
 */
export async function deleteCredential(
  processId: string,
  service: string,
): Promise<void> {
  await db.delete(schema.credentials).where(
    and(
      eq(schema.credentials.processId, processId),
      eq(schema.credentials.service, service),
    ),
  );
}

// ============================================================
// User-Scoped Credentials (Brief 152)
// ============================================================

/**
 * Store or replace a user-scoped credential (userId, service).
 * Used for user-level integrations like Google Workspace OAuth.
 */
export async function storeUserCredential(
  userId: string,
  service: string,
  value: string,
  expiresAt?: number,
): Promise<void> {
  const { encryptedValue, iv, authTag } = encrypt(value);

  // Upsert: delete existing, then insert
  await db.delete(schema.credentials).where(
    and(
      eq(schema.credentials.userId, userId),
      eq(schema.credentials.service, service),
    ),
  );

  await db.insert(schema.credentials).values({
    processId: null,
    userId,
    service,
    encryptedValue,
    iv,
    authTag,
    expiresAt: expiresAt ?? null,
    createdAt: Date.now(),
  });
}

/**
 * Retrieve a user-scoped credential (userId, service).
 * Returns decrypted value + source, or null if not found.
 */
export async function getUserCredential(
  userId: string,
  service: string,
): Promise<{ value: string; source: "vault" } | null> {
  const rows = await db
    .select()
    .from(schema.credentials)
    .where(
      and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.service, service),
      ),
    );

  if (rows.length === 0) return null;

  const row = rows[0];
  const value = decrypt({
    encryptedValue: row.encryptedValue,
    iv: row.iv,
    authTag: row.authTag,
  });

  return { value, source: "vault" };
}

/**
 * Check if a user-scoped credential exists and is not expired.
 */
export async function hasUserCredential(
  userId: string,
  service: string,
): Promise<boolean> {
  const rows = await db
    .select({ expiresAt: schema.credentials.expiresAt })
    .from(schema.credentials)
    .where(
      and(
        eq(schema.credentials.userId, userId),
        eq(schema.credentials.service, service),
      ),
    );

  if (rows.length === 0) return false;

  const row = rows[0];
  // If expiresAt is set and in the past, credential is expired
  if (row.expiresAt && row.expiresAt < Date.now()) return false;

  return true;
}

/**
 * List credentials (never reveals values).
 * Filter by processId if provided.
 */
export async function listCredentials(
  processId?: string,
): Promise<Array<{ processId: string | null; service: string; expiresAt: number | null; createdAt: number }>> {
  const query = processId
    ? db.select({
        processId: schema.credentials.processId,
        service: schema.credentials.service,
        expiresAt: schema.credentials.expiresAt,
        createdAt: schema.credentials.createdAt,
      }).from(schema.credentials).where(eq(schema.credentials.processId, processId))
    : db.select({
        processId: schema.credentials.processId,
        service: schema.credentials.service,
        expiresAt: schema.credentials.expiresAt,
        createdAt: schema.credentials.createdAt,
      }).from(schema.credentials);

  return query;
}

// ============================================================
// Unified Auth Resolution
// ============================================================

export interface ResolvedAuth {
  envVars: Record<string, string>;
  source: "vault" | "env";
}

/**
 * Unified auth resolution: vault-first, env-var fallback.
 *
 * For CLI services: returns env vars to inject into process.env.
 * For REST services: returns env vars used to construct auth headers.
 *
 * Vault credentials are stored as a single string. For multi-value services
 * (e.g., CLI with multiple env_vars), the value is JSON: {"VAR1":"val1","VAR2":"val2"}.
 * For single-value services (e.g., REST bearer token), the value is the raw token.
 */
export async function resolveServiceAuth(
  processId: string | undefined,
  service: string,
  authConfig: { envVars?: string[]; authType?: string },
): Promise<ResolvedAuth> {
  // Try vault first (requires processId)
  if (processId) {
    // Fail hard if DITTO_VAULT_KEY is absent and processId is provided (AC-4).
    // Only credential-not-found (null return) falls through to env var fallback.
    if (process.env.DITTO_VAULT_KEY) {
      const credential = await getCredential(processId, service);
      if (credential) {
        // Parse vault value — JSON for multi-value, raw for single-value
        let envVars: Record<string, string>;
        try {
          const parsed = JSON.parse(credential.value);
          if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
            envVars = parsed as Record<string, string>;
          } else {
            // Single value stored as JSON string — wrap with first env var name
            const firstVar = authConfig.envVars?.[0] ?? `${service.toUpperCase()}_TOKEN`;
            envVars = { [firstVar]: credential.value };
          }
        } catch {
          // Not JSON — single raw value, wrap with first env var name
          const firstVar = authConfig.envVars?.[0] ?? `${service.toUpperCase()}_TOKEN`;
          envVars = { [firstVar]: credential.value };
        }
        return { envVars, source: "vault" };
      }
    }
    // No DITTO_VAULT_KEY but processId provided — fall through to env var fallback.
    // The vault is opt-in: if the key isn't set, env vars are the only source.
  }

  // Env var fallback with deprecation warning
  const envVars: Record<string, string> = {};
  let foundAny = false;

  if (authConfig.envVars) {
    for (const varName of authConfig.envVars) {
      const value = process.env[varName];
      if (value) {
        envVars[varName] = value;
        foundAny = true;
      }
    }
  }

  // Also check common REST auth patterns
  if (!foundAny && authConfig.authType) {
    if (authConfig.authType === "bearer_token") {
      const envName = `${service.toUpperCase()}_BOT_TOKEN`;
      const fallbackName = `${service.toUpperCase()}_TOKEN`;
      const token = process.env[envName] || process.env[fallbackName];
      if (token) {
        envVars[envName] = token;
        foundAny = true;
      }
    } else if (authConfig.authType === "api_key") {
      const envName = `${service.toUpperCase()}_API_KEY`;
      const key = process.env[envName];
      if (key) {
        envVars[envName] = key;
        foundAny = true;
      }
    }
  }

  if (foundAny) {
    console.warn(
      `[DEPRECATION] Using env var for ${service} auth — migrate to: ditto credential add ${service} --process <slug>`,
    );
  }

  return { envVars, source: "env" };
}
