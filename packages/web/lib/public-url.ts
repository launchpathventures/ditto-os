/**
 * Ditto Web — Public Base URL
 *
 * Returns the workspace's public-facing URL for redirect targets and
 * audience-binding. On Railway, Next.js standalone binds to 0.0.0.0:8080
 * (Dockerfile sets HOSTNAME="0.0.0.0"), and `request.url` in route handlers
 * reports that internal bind, not the public Railway URL. Building redirect
 * URLs from `request.url` therefore leaks `https://0.0.0.0:8080` into the
 * Location header; doing audience-binding from `request.url` rejects every
 * legitimately-signed bootstrap token because the public-URL `aud` never
 * matches the internal-bind origin.
 *
 * `NEXT_PUBLIC_APP_URL` is injected by the provisioner (see
 * `src/engine/workspace-provisioner.ts:303`) with the workspace's canonical
 * public URL. When present, it wins.
 *
 * Fallback to `request.url` preserves local dev where `NEXT_PUBLIC_APP_URL`
 * isn't set.
 *
 * Edge-runtime compatible: only reads `process.env`.
 */
export function getPublicBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Misconfigured env value — fall through to request.url
    }
  }
  return new URL(request.url).origin;
}
