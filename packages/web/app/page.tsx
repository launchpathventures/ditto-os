import { redirect } from "next/navigation";
import { isConfigured, loadConfig, applyConfigToEnv } from "@/lib/config";
import { EntryPoint } from "./entry-point";

/**
 * Ditto Entry Point
 *
 * State-based routing:
 * - No config → redirect to /setup
 * - Configured → EntryPoint (Day Zero check, then workspace)
 *
 * Brief 057: Workspace always shown for all users. Day Zero welcome
 * appears once after setup, then workspace from then on.
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

  return <EntryPoint userId="default" />;
}
