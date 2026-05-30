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
 * 3. Otherwise → the authenticated workspace home is the Mira/Self
 *    conversation at /chat (Brief 280). EntryPoint no longer renders the
 *    three-panel workspace; it redirects there *after* the Day Zero gate.
 *
 * In local dev mode (WORKSPACE_OWNER_EMAIL not set), the session endpoint
 * returns authenticated:true so iteration isn't gated by magic-link login.
 *
 * Brief 057 AC12: After Day Zero, user lands in the workspace.
 * Brief 143: workspace auth + magic-link gates.
 * Brief 280: post-Day-Zero workspace home is the /chat Self conversation.
 * Provenance: Brief 057 (first-run experience), Brief 143 (auth), Brief 280.
 */

import { useState, useEffect } from "react";
import { DayZero, isDayZeroSeen } from "./day-zero";

interface EntryPointProps {
  userId: string;
  /**
   * Brief 225 — retained for the page.tsx → EntryPoint contract. The
   * post-Day-Zero home is now /chat, so EntryPoint itself no longer
   * renders the three-panel workspace or its "Connect a project" CTA.
   */
  projectOnboardingReady?: boolean;
}

type AuthState = "checking" | "authenticated" | "unauthenticated";

export function EntryPoint({ userId: _userId }: EntryPointProps) {
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

  // Brief 280: once Day Zero has been seen/completed, the authenticated
  // workspace home is the Mira/Self conversation at /chat — not the
  // three-panel workspace. This is a *client* redirect that runs only
  // after the Day Zero gate, so it never skips Day Zero (brief constraint:
  // "Do not server-redirect configured workspace users away from Day Zero
  // before it has been seen/completed").
  useEffect(() => {
    if (authState === "authenticated" && showDayZero === false) {
      window.location.replace("/chat");
    }
  }, [authState, showDayZero]);

  if (showDayZero === true) {
    return <DayZero onComplete={() => setShowDayZero(false)} />;
  }

  // While checking auth, redirecting to /login, or redirecting to /chat
  // after Day Zero — show a quiet canvas so there's no flash of Day Zero
  // or workspace chrome.
  return (
    <main className="h-screen flex items-center justify-center bg-background">
      <div className="w-2.5 h-2.5 rounded-full bg-text-primary/40 animate-pulse" />
    </main>
  );
}
