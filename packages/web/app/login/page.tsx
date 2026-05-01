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

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const redirect = searchParams.get("redirect");

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
      <div className="flex min-h-screen flex-col bg-white">
        <nav className="flex items-center px-6 py-5 md:px-10">
          <span className="text-xl font-bold" style={{ color: "#1c1c1c", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>ditto</span>
        </nav>
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "#fff1ec" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff4000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold" style={{ color: "#1c1c1c", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>Check your email</h1>
            <p className="mt-2 text-sm" style={{ color: "#6e6e6e" }}>
              We sent a login link to <strong>{email}</strong>.
              Click the link in the email to sign in.
            </p>
            <p className="mt-4 text-xs" style={{ color: "#6e6e6e" }}>
              The link expires in 24 hours and can only be used once.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="mt-6 text-sm underline transition-colors"
              style={{ color: "#6e6e6e" }}
            >
              Use a different email
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <nav className="flex items-center px-6 py-5 md:px-10">
        <span className="text-xl font-bold" style={{ color: "#1c1c1c", fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>ditto</span>
      </nav>
      <main className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-semibold" style={{ color: "#1c1c1c", fontFamily: "var(--font-display)", letterSpacing: "-0.03em", lineHeight: 1.05 }}>Sign in to your workspace</h1>
          <p className="mt-3 text-base" style={{ color: "#6e6e6e", letterSpacing: "-0.02em" }}>
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
              className="w-full rounded-full border bg-white px-5 py-3.5 text-[16px] placeholder:opacity-50 focus:outline-none transition-colors"
              style={{
                color: "#1c1c1c",
                borderColor: "#ecebe8",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#ff4000")}
              onBlur={(e) => (e.target.style.borderColor = "#ecebe8")}
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-base font-semibold transition-colors disabled:opacity-40"
              style={{ background: "#1c1c1c", color: "#fafafa" }}
            >
              {loading ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              )}
              {loading ? "Sending..." : "Send magic link"}
            </button>
            {errorMsg && <p className="text-sm text-red-500">{errorMsg}</p>}
          </form>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: "#ff4000" }} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
