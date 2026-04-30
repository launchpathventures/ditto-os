import { isConfigured, loadConfig, applyConfigToEnv } from "@/lib/config";
import { isPublicDeployment } from "@/lib/deployment";
import { EntryPoint } from "./entry-point";
import WelcomePage from "./welcome/page";

/**
 * Ditto Entry Point
 *
 * State-based routing:
 * - `public` mode + no config → Welcome marketing page (front door)
 * - `public` mode + configured → EntryPoint (Day Zero check, then workspace)
 * - `workspace` mode → EntryPoint only; the front door is not shipped and
 *   unauthenticated visitors are redirected to /login by middleware before
 *   this component ever renders.
 *
 * Brief 057: Workspace always shown for all users. Day Zero welcome
 * appears once after setup, then workspace from then on.
 */

export const dynamic = "force-dynamic";

export default function Home() {
  // In public deployments, render the marketing front door when the app
  // hasn't been configured yet. In workspace deployments we never show it —
  // the front door is simply not part of the product surface.
  if (isPublicDeployment() && !isConfigured()) {
    return <WelcomePage />;
  }

  // Apply config to env so engine picks it up
  const config = loadConfig();
  if (config) {
    applyConfigToEnv(config);
  }

  // Brief 225 — surface the env-var-gated project-onboarding readiness as
  // a server-rendered prop. The client can't read non-NEXT_PUBLIC env vars
  // directly, so we thread it down from here.
  const projectOnboardingReady =
    process.env.DITTO_PROJECT_ONBOARDING_READY === "true";

  return (
    <EntryPoint
      userId="default"
      projectOnboardingReady={projectOnboardingReady}
    />
  );
}
