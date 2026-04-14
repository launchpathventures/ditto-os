import { notFound } from "next/navigation";
import { isWorkspaceDeployment } from "@/lib/deployment";

/**
 * The front door (`/welcome` and sub-routes) only exists in `public`
 * deployments. In `workspace` mode we 404 it — belt-and-braces alongside
 * the middleware-level hard block (see ../../middleware.ts).
 */
export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  if (isWorkspaceDeployment()) {
    notFound();
  }
  return <>{children}</>;
}
