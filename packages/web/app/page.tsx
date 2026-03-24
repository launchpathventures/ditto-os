import { redirect } from "next/navigation";
import { ConversationPage } from "./conversation-page";
import { isConfigured, loadConfig, applyConfigToEnv } from "@/lib/config";

/**
 * Ditto Entry Point
 *
 * State-based routing:
 * - No config → redirect to /setup
 * - Configured → full-screen conversation (Self greets)
 *
 * AC9: Entry point routes based on user state.
 * AC10: userId defaults to "default".
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

  return <ConversationPage userId="default" />;
}
