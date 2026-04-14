import { notFound } from "next/navigation";
import { isWorkspaceDeployment } from "@/lib/deployment";

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
