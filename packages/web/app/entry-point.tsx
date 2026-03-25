"use client";

/**
 * Ditto — Entry Point (Client Component)
 *
 * Handles progressive reveal: determines whether to show conversation-only
 * or workspace based on user preference and process count.
 *
 * AC15: Progressive reveal — new users see conversation-only;
 * Self can trigger workspace transition; user preference persisted.
 * AC17: User preference for surface mode persisted.
 */

import { useState, useEffect, useCallback } from "react";
import { ConversationPage } from "./conversation-page";
import { WorkspacePage } from "./workspace-page";
import { useProcessList } from "@/lib/process-query";
import {
  getSurfaceMode,
  setSurfaceMode,
  determineInitialMode,
  type SurfaceMode,
} from "@/lib/layout-state";
import { onProcessCreated } from "@/lib/workspace-events";

interface EntryPointProps {
  userId: string;
}

export function EntryPoint({ userId }: EntryPointProps) {
  const { data } = useProcessList();
  const [mode, setMode] = useState<SurfaceMode | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Determine initial mode once we have data
  useEffect(() => {
    if (initialized) return;

    const preference = getSurfaceMode();
    const processCount =
      data?.processes.filter((p) => !p.system).length ?? 0;

    const initial = determineInitialMode(processCount, preference);
    setMode(initial);
    setInitialized(true);
  }, [data, initialized]);

  // Allow switching modes (Self can trigger this via a message)
  const switchToWorkspace = useCallback(() => {
    setMode("workspace");
    setSurfaceMode("workspace");
  }, []);

  const switchToConversation = useCallback(() => {
    setMode("conversation");
    setSurfaceMode("conversation");
  }, []);

  // Auto-switch to workspace when first process is created via Self (AC13)
  useEffect(() => {
    return onProcessCreated(() => {
      switchToWorkspace();
    });
  }, [switchToWorkspace]);

  // Show nothing while loading initial state (avoids flash)
  if (!initialized || mode === null) {
    return (
      <main className="h-screen flex items-center justify-center bg-background">
        <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
      </main>
    );
  }

  if (mode === "workspace") {
    return <WorkspacePage userId={userId} />;
  }

  return (
    <main className="h-screen flex flex-col bg-background">
      <ConversationPage userId={userId} />
      {/* Workspace prompt — shown when user has processes but is in conversation mode */}
      {data &&
        data.processes.filter((p) => !p.system).length > 0 && (
          <button
            onClick={switchToWorkspace}
            className="fixed bottom-20 right-6 px-4 py-2 bg-surface-raised rounded-full shadow-[var(--shadow-medium)] text-sm text-text-secondary hover:text-text-primary transition-colors z-30"
          >
            See your workspace →
          </button>
        )}
    </main>
  );
}
