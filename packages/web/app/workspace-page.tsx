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
}

export function WorkspacePage({ userId }: WorkspacePageProps) {
  return (
    <EngineViewProvider>
      <Workspace userId={userId} />
    </EngineViewProvider>
  );
}
