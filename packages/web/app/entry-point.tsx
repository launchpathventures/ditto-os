"use client";

/**
 * Ditto — Entry Point (Client Component)
 *
 * Post-auth routing:
 * 1. Verify workspace session — unauthenticated visitors are redirected
 *    to /login. Day Zero and the workspace are gated behind auth so that
 *    a public-domain visitor can never land on the post-setup onboarding
 *    or the authenticated workspace surface.
 * 2. If Day Zero not seen → show Day Zero welcome.
 * 3. Otherwise → show workspace.
 *
 * In local dev mode (WORKSPACE_OWNER_EMAIL not set), the session endpoint
 * returns authenticated:true so iteration isn't gated by magic-link login.
 *
 * Brief 057 AC12: After Day Zero, user lands in full workspace.
 * Brief 143: workspace auth + magic-link gates.
 * Provenance: Brief 057 (first-run experience), Brief 143 (auth).
 */

import { useState, useEffect } from "react";
import { WorkspacePage } from "./workspace-page";
import { DayZero, isDayZeroSeen } from "./day-zero";

interface EntryPointProps {
  userId: string;
  /** Brief 225 — when true, the workspace shows the "Connect a project" CTA. */
  projectOnboardingReady?: boolean;
}

type AuthState = "checking" | "authenticated" | "unauthenticated";

export function EntryPoint({
  userId,
  projectOnboardingReady = false,
}: EntryPointProps) {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [showDayZero, setShowDayZero] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/workspace/session")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data: { authenticated?: boolean }) => {
        if (cancelled) return;
        if (!data.authenticated) {
          // Hard redirect — unauthenticated visitors must never see Day
          // Zero or the workspace shell. Send them through /login.
          window.location.replace("/login");
          return;
        }
        setAuthState("authenticated");
        setShowDayZero(!isDayZeroSeen());
      })
      .catch(() => {
        if (cancelled) return;
        // Session endpoint unreachable — fail closed: redirect to login
        // rather than render the gated surface.
        window.location.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // While we're checking auth (or already redirecting), show a quiet
  // canvas so there's no flash of Day Zero or workspace chrome.
  if (authState === "checking" || authState === "unauthenticated" || showDayZero === null) {
    return (
      <main className="h-screen flex items-center justify-center bg-background">
        <div className="w-2.5 h-2.5 rounded-full bg-text-primary/40 animate-pulse" />
      </main>
    );
  }

  if (showDayZero) {
    return <DayZero onComplete={() => setShowDayZero(false)} />;
  }

  return (
    <WorkspacePage
      userId={userId}
      projectOnboardingReady={projectOnboardingReady}
    />
  );
}
