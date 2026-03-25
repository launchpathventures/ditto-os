import { redirect } from "next/navigation";
import { isConfigured, loadConfig, applyConfigToEnv } from "@/lib/config";
import { ProcessPage } from "./process-page";

/**
 * Process detail page — direct URL access to a specific process.
 *
 * Renders the workspace layout with the process detail pre-selected.
 * Redirects to /setup if not configured.
 */

export const dynamic = "force-dynamic";

interface ProcessRouteProps {
  params: Promise<{ id: string }>;
}

export default async function ProcessRoute({ params }: ProcessRouteProps) {
  if (!isConfigured()) {
    redirect("/setup");
  }

  const config = loadConfig();
  if (config) {
    applyConfigToEnv(config);
  }

  const { id } = await params;
  return <ProcessPage processId={id} />;
}
