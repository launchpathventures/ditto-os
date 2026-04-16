/**
 * Ditto — Integration Availability
 *
 * Product-layer functions that check which integrations a user has connected.
 * The credentials table lives in core; these queries are Ditto-specific
 * because they encode knowledge about which services Ditto supports.
 *
 * Provenance: Brief 152 (Sending Identity Channel Routing)
 */

import { hasUserCredential, getUserCredential, storeUserCredential } from "./credential-vault";

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expiry_date: number;
  email: string;
}

/**
 * Check if a user has a connected integration for a given service.
 * Returns true if a non-expired credential exists.
 */
export async function hasIntegration(
  userId: string,
  service: string,
): Promise<boolean> {
  return hasUserCredential(userId, service);
}

/**
 * Retrieve Google Workspace OAuth tokens for a user.
 * Returns null if no credential exists.
 *
 * If the access token is expired but a refresh token exists,
 * the caller (GmailApiAdapter) is responsible for refreshing.
 * This function only retrieves — it does not refresh.
 *
 * Decrypted tokens are confined to the caller's scope and must
 * never appear in logs, tool return values, or HarnessContext.
 */
export async function getGoogleCredential(
  userId: string,
): Promise<GoogleTokens | null> {
  const credential = await getUserCredential(userId, "google-workspace");
  if (!credential) return null;

  try {
    const tokens = JSON.parse(credential.value) as GoogleTokens;
    return tokens;
  } catch {
    console.error("[integration-availability] Failed to parse Google credential for user", userId);
    return null;
  }
}

/**
 * Update stored Google tokens after a refresh.
 * Called by GmailApiAdapter after refreshing an expired access token.
 */
export async function updateGoogleTokens(
  userId: string,
  tokens: GoogleTokens,
): Promise<void> {
  await storeUserCredential(
    userId,
    "google-workspace",
    JSON.stringify(tokens),
  );
}
