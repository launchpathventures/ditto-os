import { notFound } from "next/navigation";
import { isWorkspaceDeployment } from "@/lib/deployment";

// Must evaluate DITTO_DEPLOYMENT at request time, not build time.
// Without this, `next build` bakes in the default ("workspace") and
// the admin route is permanently 404'd regardless of runtime env vars.
export const dynamic = "force-dynamic";

/**
 * The admin dashboard only exists in `public` deployments. In `workspace`
 * mode we 404 it — belt-and-braces alongside the middleware-level hard
 * block (see ../../middleware.ts).
 *
 * Server component wrapper — sub-pages may be client components.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  if (isWorkspaceDeployment()) {
    notFound();
  }
  return <>{children}</>;
}
