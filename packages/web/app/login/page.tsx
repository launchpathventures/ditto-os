"use client";

/**
 * Ditto — Workspace Login Page (Brief 143)
 *
 * Magic-link-only login. Shows email input, sends magic link to
 * the workspace owner. No passwords.
 *
 * Provenance: Brief 143, /chat magic link pattern (Brief 123).
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { HeroBackdrop } from "@/components/hero-backdrop";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams?.get("error");
  const redirect = searchParams?.get("redirect");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(
    error === "missing_token" ? "Invalid login link." :
    error === "invalid_or_expired" ? "This link has expired or was already used. Request a new one." :
    error === "invalid_token_type" ? "Invalid login link." :
    error === "server_error" ? "Something went wrong. Please try again." :
    "",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/v1/workspace/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (res.ok) {
        setSent(true);
      } else {
        setErrorMsg("Failed to send link. Please try again.");
      }
    } catch {
      setErrorMsg("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
        <HeroBackdrop variant="atmosphere" height={420} intensity={0.75} />
        <nav className="relative z-10 flex items-center px-6 py-5 md:px-10">
          <span className="text-xl font-bold tracking-tight text-text-primary">ditto</span>
        </nav>
        <main className="relative z-10 flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-text-primary">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Check your email</h1>
            <p className="mt-2 text-sm text-text-secondary">
              We sent a login link to <strong className="text-text-primary">{email}</strong>.
              Click the link in the email to sign in.
            </p>
            <p className="mt-4 text-xs text-text-muted">
              The link expires in 24 hours and can only be used once.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="mt-6 text-sm text-text-muted underline underline-offset-2 hover:text-text-primary transition-colors"
            >
              Use a different email
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <HeroBackdrop variant="workspace" height={520} intensity={0.85} priority />
      <nav className="relative z-10 flex items-center px-6 py-5 md:px-10">
        <span className="text-xl font-bold tracking-tight text-text-primary">ditto</span>
      </nav>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-[44px] font-semibold leading-[1.1] tracking-[-0.03em] text-text-primary">Sign in to your workspace</h1>
          <p className="mt-3 text-base text-text-secondary">
            Enter your email and we&apos;ll send you a magic link.
          </p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-[16px] text-text-primary placeholder:text-text-muted/60 focus:outline-none focus:border-text-primary/40 focus:ring-2 focus:ring-text-primary/10 transition-all"
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-base font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {loading ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : null}
              {loading ? "Sending..." : "Send magic link"}
            </button>
            {errorMsg && <p className="text-sm text-negative">{errorMsg}</p>}
          </form>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-3 h-3 rounded-full bg-text-muted animate-pulse" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
