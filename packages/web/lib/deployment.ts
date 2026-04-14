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
