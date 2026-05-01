"use client";

/**
 * Workspace Lite — Persistent Chat Page (Brief 123)
 *
 * Authenticated users land here via magic link. Shows full conversation
 * history with rich message rendering (ai-elements/message.tsx + BlockRegistry).
 * Unauthenticated users see an "enter email" form to request a magic link.
 *
 * Layout: single-column centered (640px max), no sidebar, warm conversational feel.
 * Same layout DNA as /welcome but with upgraded message rendering.
 *
 * Provenance: Slack magic link pattern (auth flow), /welcome (layout), /review (token-based access)
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { StatusStrip } from "./components/status-strip";
import { ChatConversation } from "./components/chat-conversation";

interface SessionData {
  authenticated: boolean;
  email?: string;
  sessionId?: string;
  messages?: Array<{ role: string; content: string }>;
  messageCount?: number;
  status?: {
    contacted: number;
    replied: number;
    meetings: number;
    nextAction: string | null;
  };
}

export default function ChatPage() {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check URL params for error from auth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("error");
    if (authError === "invalid_or_expired") {
      setError("This link has expired. Enter your email for a new one.");
    } else if (authError === "missing_token") {
      setError("Invalid link. Enter your email to continue.");
    }
  }, []);

  // Load session
  useEffect(() => {
    fetch("/api/v1/chat/session")
      .then((r) => r.json())
      .then((data: SessionData) => {
        setSessionData(data);
        setLoading(false);
      })
      .catch(() => {
        setSessionData({ authenticated: false });
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-text-primary animate-pulse" />
      </div>
    );
  }

  // Unauthenticated — show "enter email" form
  if (!sessionData?.authenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        <ChatNav />
        <div className="flex-1 flex items-center justify-center px-4">
          <EmailRequestForm initialError={error} />
        </div>
      </div>
    );
  }

  // Authenticated — show persistent chat
  return (
    <div className="min-h-screen flex flex-col">
      <ChatNav />
      {sessionData.status && (
        <StatusStrip
          contacted={sessionData.status.contacted}
          replied={sessionData.status.replied}
          meetings={sessionData.status.meetings}
          nextAction={sessionData.status.nextAction}
        />
      )}
      <div className="flex-1 flex flex-col min-h-0">
        <ChatConversation
          initialMessages={sessionData.messages || []}
          sessionId={sessionData.sessionId!}
          authenticatedEmail={sessionData.email!}
        />
      </div>
    </div>
  );
}

/** Minimal top nav — matches homepage sparse feel */
function ChatNav() {
  return (
    <nav className="border-b border-border/40">
      <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-text-primary hover:text-text-secondary transition-colors">
          ditto
        </Link>
      </div>
    </nav>
  );
}

/** Email form for unauthenticated users (AC7, AC15) */
function EmailRequestForm({ initialError }: { initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/chat/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      // AC15: Always show the same success message regardless of whether email exists
      setSubmitted(true);
    } catch {
      setSubmitted(true); // Still show success to prevent enumeration
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-sm text-center space-y-4">
        <div className="w-3 h-3 rounded-full bg-text-primary mx-auto" />
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary">Check your email</h2>
        <p className="text-sm text-text-muted leading-relaxed">
          If you have an account, you'll receive a magic link shortly. Click it to continue our conversation.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-sm w-full space-y-6">
      <div className="text-center space-y-2">
        <div className="w-3 h-3 rounded-full bg-text-primary mx-auto" />
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary">Continue your conversation</h2>
        <p className="text-sm text-text-muted">
          Enter your email and we'll send you a link to pick up where you left off.
        </p>
      </div>

      {error && (
        <p className="text-sm text-center text-amber-600 dark:text-amber-400">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          autoFocus
          className="w-full px-5 py-3 rounded-lg border border-border bg-background text-text-primary placeholder:text-text-muted text-base outline-none transition-colors focus:border-text-primary/40"
        />
        <button
          type="submit"
          disabled={!email.trim() || submitting}
          className="w-full py-3 px-6 rounded-lg bg-accent text-accent-foreground text-base font-semibold transition-all hover:bg-accent-hover active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed"
        >
          {submitting ? "Sending..." : "Send magic link"}
        </button>
      </form>

      <p className="text-xs text-center text-text-muted">
        New here?{" "}
        <Link href="/welcome" className="text-text-primary hover:underline">
          Start a conversation with Alex
        </Link>
      </p>
    </div>
  );
}
