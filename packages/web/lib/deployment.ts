/**
 * Ditto Web — Deployment Mode
 *
 * Two deployment modes control which surfaces ship:
 *
 * - `public`    — marketing/demo site. `/` = front door, `/welcome` and
 *                 `/admin` are accessible.
 * - `workspace` — client workspace install. `/` requires auth (redirects to
 *                 `/login`), `/welcome` and `/admin` are 404'd.
 *
 * Controlled by `DITTO_DEPLOYMENT`. Defaults to `workspace` — the safer
 * default so a stray env that forgets to set it doesn't accidentally expose
 * front door/admin on a client install.
 *
 * Edge-runtime compatible: no node imports, only `process.env`.
 */

export type DeploymentMode = "public" | "workspace";

const VALID_MODES: ReadonlySet<string> = new Set(["public", "workspace"]);

/**
 * Boot-time warning for typos. Runs once per worker on module load. A typo
 * like `DITTO_DEPLOYMENT=publik` silently falls back to `workspace` (safe
 * default) which would otherwise leave an operator wondering why their
 * marketing site won't render the front door.
 */
const _raw = process.env.DITTO_DEPLOYMENT?.trim().toLowerCase();
if (_raw && !VALID_MODES.has(_raw)) {
  // eslint-disable-next-line no-console
  console.warn(
    `[ditto] DITTO_DEPLOYMENT="${process.env.DITTO_DEPLOYMENT}" is not a recognized value ` +
      `(expected "public" or "workspace"). Falling back to "workspace".`,
  );
}

export function getDeploymentMode(): DeploymentMode {
  const raw = process.env.DITTO_DEPLOYMENT?.trim().toLowerCase();
  return raw === "public" ? "public" : "workspace";
}

export function isPublicDeployment(): boolean {
  return getDeploymentMode() === "public";
}

export function isWorkspaceDeployment(): boolean {
  return getDeploymentMode() === "workspace";
}
