import { redirect } from "next/navigation";
import { isConfigured, loadConfig, applyConfigToEnv } from "@/lib/config";
import { EntryPoint } from "./entry-point";

/**
 * Ditto Entry Point
 *
 * State-based routing:
 * - No config → redirect to /setup
 * - Configured → progressive reveal (conversation-only or workspace)
 *
 * Brief 042 AC15: Progressive reveal — new users see conversation-only;
 * Self can trigger workspace transition; user preference persisted.
 */

export const dynamic = "force-dynamic";

export default function Home() {
  if (!isConfigured()) {
    redirect("/setup");
  }

  // Apply config to env so engine picks it up
  const config = loadConfig();
  if (config) {
    applyConfigToEnv(config);
  }

  // Server-side: check if user has active processes
  // Pass this to the client for progressive reveal decision
  return <EntryPoint userId="default" />;
}
