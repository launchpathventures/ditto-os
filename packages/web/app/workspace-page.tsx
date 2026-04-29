"use client";

/**
 * Workspace layout page.
 *
 * Three-panel layout: sidebar + center (feed or process detail) + Self panel.
 * Rendered when the user is in workspace mode.
 *
 * AC14: Three-panel layout.
 * AC15: Self can trigger workspace transition.
 */

import { Workspace } from "@/components/layout/workspace";
import { EngineViewProvider } from "@/components/detail/engine-view";

interface WorkspacePageProps {
  userId: string;
  /** Brief 225 — controls visibility of the "Connect a project" CTA. */
  projectOnboardingReady?: boolean;
}

export function WorkspacePage({
  userId,
  projectOnboardingReady = false,
}: WorkspacePageProps) {
  return (
    <EngineViewProvider>
      <Workspace
        userId={userId}
        projectOnboardingReady={projectOnboardingReady}
      />
    </EngineViewProvider>
  );
}
