"use client";

/**
 * Ditto — Entry Point (Client Component)
 *
 * Post-setup routing:
 * 1. If Day Zero not seen → show Day Zero welcome
 * 2. Otherwise → show workspace (always, for all users)
 *
 * Brief 057 AC12: After Day Zero, user lands in full workspace.
 * Provenance: Brief 057 (first-run experience).
 */

import { useState, useEffect } from "react";
import { WorkspacePage } from "./workspace-page";
import { DayZero, isDayZeroSeen } from "./day-zero";

interface EntryPointProps {
  userId: string;
}

export function EntryPoint({ userId }: EntryPointProps) {
  const [showDayZero, setShowDayZero] = useState<boolean | null>(null);

  useEffect(() => {
    setShowDayZero(!isDayZeroSeen());
  }, []);

  // Show nothing while checking localStorage (avoids flash)
  if (showDayZero === null) {
    return (
      <main className="h-screen flex items-center justify-center bg-background">
        <div className="w-3 h-3 rounded-full bg-vivid animate-pulse" />
      </main>
    );
  }

  if (showDayZero) {
    return <DayZero onComplete={() => setShowDayZero(false)} />;
  }

  return <WorkspacePage userId={userId} />;
}
