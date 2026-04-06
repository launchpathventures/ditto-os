"use client";

/**
 * Verify Page — Anti-phishing trust bridge + acquisition channel (Brief 095)
 *
 * Recipients of Alex's outreach emails enter their email here to confirm
 * the message was genuine. The response is ALWAYS the same (anti-enumeration).
 * If found, a verification email is sent to the recipient's inbox.
 *
 * Provenance: Brief 095, docs/research/web-acquisition-funnel-ux.md Surface 2.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

type Phase = "form" | "submitting" | "result" | "rate-limited";

export default function VerifyPage() {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("form");

  // Fire funnel event helper
  function fireFunnelEvent(event: string) {
    fetch("/api/v1/network/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[${event}]`,
        sessionId: null,
        context: "front-door",
      }),
    }).catch(() => {});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    setPhase("submitting");
    fireFunnelEvent("verify_requested");

    try {
      const res = await fetch("/api/network/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.status === 429) {
        setPhase("rate-limited");
        return;
      }

      setPhase("result");
    } catch {
      // Even on error, show the uniform result (anti-enumeration)
      setPhase("result");
    }
  }

  function handleCtaClick() {
    fireFunnelEvent("verify_cta_clicked");
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Minimal nav */}
      <nav className="flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="text-xl font-bold text-vivid">
          ditto
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/about"
            className="hidden text-sm text-text-secondary hover:text-text-primary md:block"
          >
            About
          </Link>
          <Link
            href="/how-it-works"
            className="hidden text-sm text-text-secondary hover:text-text-primary md:block"
          >
            How It Works
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="flex flex-1 items-center justify-center px-6 md:px-10">
        <div className="w-full max-w-[480px]">
          {phase === "form" && (
            <div className="animate-fade-in space-y-6">
              <div className="space-y-3">
                <p className="text-2xl font-bold text-text-primary md:text-3xl">
                  Got an email from me?
                </p>
                <p className="text-lg text-text-secondary">
                  I don&apos;t blame you for checking. Enter the email address I
                  contacted you on and I&apos;ll confirm.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    placeholder="The email address Alex contacted you on"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    className="flex-1 rounded-2xl border-2 border-border bg-white px-5 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                  />
                  <button
                    type="submit"
                    disabled={!email}
                    aria-label="Verify"
                    className="inline-flex items-center rounded-2xl bg-vivid px-4 py-3 text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              </form>
            </div>
          )}

          {phase === "submitting" && (
            <div className="animate-fade-in space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-vivid-subtle flex items-center justify-center">
                  <Check size={14} className="text-vivid" />
                </div>
                <p className="text-lg font-semibold text-text-primary">
                  Checking...
                </p>
              </div>
            </div>
          )}

          {phase === "result" && (
            <div className="animate-fade-in space-y-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 rounded-full bg-vivid-subtle flex items-center justify-center">
                    <Check size={14} className="text-vivid" />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                    Checking
                  </p>
                </div>
                <p className="text-lg text-text-secondary leading-relaxed">
                  If that email&apos;s from me, I&apos;ve just sent you a verification to
                  that address. Check your inbox — it&apos;ll confirm what I reached
                  out about and give you a way to reply directly.
                </p>
                <p className="text-base text-text-muted">
                  Nothing in your inbox in the next few minutes? Then the email
                  probably wasn&apos;t from me. Trust your instincts.
                </p>
              </div>

              <div className="border-t border-border pt-6">
                <p className="mb-3 text-base font-medium text-text-primary">
                  Curious about what I do?
                </p>
                <p className="mb-4 text-base text-text-secondary">
                  Whether or not that email was mine, I&apos;m an AI advisor that
                  makes introductions people actually respond to. No spam, no
                  volume games — just thoughtful connections.
                </p>
                <Link
                  href="/welcome/referred"
                  onClick={handleCtaClick}
                  className="inline-flex items-center gap-2 text-base font-semibold text-vivid hover:underline"
                >
                  Tell me more <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          )}

          {phase === "rate-limited" && (
            <div className="animate-fade-in space-y-4">
              <p className="text-lg text-text-secondary">
                You&apos;ve checked a few times — if you&apos;re not getting a
                verification email, the original message probably wasn&apos;t from
                me.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-base font-semibold text-vivid hover:underline"
              >
                Talk to Alex <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex items-center justify-between px-6 py-5 text-xs text-text-muted md:px-10">
        <span>&copy; {new Date().getFullYear()} Ditto</span>
        <div className="flex gap-4">
          <Link href="/network" className="hover:text-text-secondary">
            Network
          </Link>
          <Link href="/about" className="hover:text-text-secondary">
            About
          </Link>
        </div>
      </footer>
    </div>
  );
}
