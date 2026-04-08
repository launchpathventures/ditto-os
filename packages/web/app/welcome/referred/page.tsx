"use client";

/**
 * Referred Page — Recipient-to-User Conversion (Brief 095)
 *
 * For people who experienced Alex's outreach quality and want their own advisor.
 * Contextual Alex greeting + conversational intake reusing Brief 094 components.
 *
 * Provenance: Brief 095, docs/research/web-acquisition-funnel-ux.md Surface 4.
 */

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChatMessage } from "../chat-message";
import { QuickReplyPills } from "../quick-reply-pills";
import { TypingIndicator } from "../typing-indicator";
import { PostSubmission } from "../post-submission";

interface Message {
  role: "alex" | "user";
  text: string;
}

type Phase = "greeting" | "conversing" | "email-capture" | "post-submission" | "error-fallback" | "returning" | "already-user";

const REFERRED_PILLS = [
  "I run a business",
  "I\u2019m a connector",
  "Just curious",
];

const SESSION_KEY = "ditto-chat-session";
const EMAIL_KEY = "ditto-email-captured";

export default function ReferredPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<Phase>("greeting");
  const [input, setInput] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestEmail, setRequestEmail] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  // Check for returning visitor
  useEffect(() => {
    const savedEmail = localStorage.getItem(EMAIL_KEY);
    if (savedEmail) {
      setPhase("returning");
      return;
    }

    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession) {
      setSessionId(savedSession);
    }

    // Record referred_landed funnel event (bracket-tagged, intercepted by handleChatTurn)
    fetch("/api/v1/network/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "[referred_landed]", sessionId: null, context: "referred" }),
    }).catch(() => {});

    // Record referred_click with referrer attribution (Brief 109)
    if (ref) {
      fetch("/api/v1/network/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "[referred_click]",
          sessionId: null,
          context: "referred",
          funnelMetadata: { referredBy: ref },
        }),
      }).catch(() => {});
    }

    // Set up greeting messages
    const timer = setTimeout(() => {
      setMessages([
        {
          role: "alex",
          text: "You\u2019ve seen how I work \u2014 an introduction that was actually worth your time. Imagine having an advisor like that working your own network.",
        },
        {
          role: "alex",
          text: "Tell me a bit about what you\u2019re working on, and I\u2019ll show you what I can do.",
        },
      ]);
      setPhase("conversing");
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (phase === "conversing" || phase === "email-capture") {
      inputRef.current?.focus();
    }
  }, [phase, requestEmail]);

  async function sendMessage(text: string) {
    const userMsg: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/network/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          context: "referred",
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json();
          setMessages((prev) => [...prev, { role: "alex", text: data.reply }]);
          setRequestEmail(true);
          setPhase("email-capture");
          setLoading(false);
          return;
        }
        throw new Error("API error");
      }

      const data = await res.json();

      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(SESSION_KEY, data.sessionId);
      }

      // Email detected — check if already a user
      if (data.done) {
        localStorage.setItem(EMAIL_KEY, text);

        // Check if the intake response indicates recognition
        if (data.reply && data.reply.includes("already know")) {
          setMessages((prev) => [...prev, { role: "alex", text: data.reply }]);
          setPhase("already-user");
        } else {
          setMessages((prev) => [...prev, { role: "alex", text: data.reply }]);
          setPhase("post-submission");
        }
        setLoading(false);
        return;
      }

      setMessages((prev) => [...prev, { role: "alex", text: data.reply }]);

      if (data.requestEmail) {
        setRequestEmail(true);
        setPhase("email-capture");
      }
    } catch {
      setPhase("error-fallback");
      setMessages((prev) => [
        ...prev,
        {
          role: "alex",
          text: "Something went wrong on my end. Drop your email and I\u2019ll reach out directly.",
        },
      ]);
    }

    setLoading(false);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    await sendMessage(email);
  }

  function handleConversationSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    if (phase === "email-capture" && !trimmed.includes("@")) {
      setPhase("conversing");
      setRequestEmail(false);
    }

    sendMessage(trimmed);
  }

  async function handleErrorEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;

    try {
      const res = await fetch("/api/network/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined }),
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      localStorage.setItem(EMAIL_KEY, email);

      if (data.recognised) {
        setMessages((prev) => [
          ...prev,
          {
            role: "alex",
            text: "Turns out we already know each other! Check your inbox \u2014 I\u2019ll pick up where we left off.",
          },
        ]);
        setPhase("already-user");
      } else {
        setPhase("post-submission");
      }
    } catch {
      // Show post-submission anyway
      setPhase("post-submission");
    }
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
      <main className="flex flex-1 flex-col px-4 md:px-10">
        <div className="mx-auto w-full max-w-[640px] flex-1 py-8 md:flex md:items-center md:py-0">
          <div className="w-full space-y-5">
            {/* Returning visitor */}
            {phase === "returning" && (
              <div className="animate-fade-in space-y-4">
                <p className="text-3xl font-bold tracking-tight text-text-primary md:text-5xl md:leading-[1.1]">
                  Hey — you&apos;re already in.
                </p>
                <p className="text-lg text-text-secondary md:text-xl">
                  Check your email for my latest.
                </p>
              </div>
            )}

            {/* Already a user */}
            {phase === "already-user" && (
              <div className="animate-fade-in space-y-4">
                {messages.map((msg, i) => (
                  <ChatMessage key={i} role={msg.role} text={msg.text} />
                ))}
              </div>
            )}

            {/* Greeting phase */}
            {phase === "greeting" && (
              <div className="space-y-4 animate-fade-in">
                <p className="text-3xl font-bold tracking-tight text-text-primary md:text-5xl md:leading-[1.1]">
                  You&apos;ve seen how I work.
                </p>
              </div>
            )}

            {/* Active conversation */}
            {(phase === "conversing" || phase === "email-capture" || phase === "error-fallback" || phase === "post-submission") && (
              <>
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <ChatMessage
                      key={i}
                      role={msg.role}
                      text={msg.text}
                      animate={i >= messages.length - 2}
                    />
                  ))}
                  {loading && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>

                {phase === "conversing" && !loading && (
                  <div className="space-y-3 animate-fade-in sticky bottom-4 bg-white pb-2 pt-3 md:static md:bottom-auto md:pb-0 md:pt-0">
                    <form onSubmit={handleConversationSubmit} className="flex gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder="What are you building or working on?"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="flex-1 rounded-2xl border-2 border-border bg-white px-5 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                      />
                      <button
                        type="submit"
                        disabled={!input.trim()}
                        aria-label="Send message"
                        className="inline-flex items-center rounded-2xl bg-vivid px-4 py-3 text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </form>
                    {messages.length <= 2 && (
                      <QuickReplyPills
                        pills={REFERRED_PILLS}
                        onSelect={(pill) => sendMessage(pill)}
                        disabled={loading}
                      />
                    )}
                  </div>
                )}

                {phase === "email-capture" && !loading && (
                  <div className="space-y-3 animate-fade-in sticky bottom-4 bg-white pb-2 pt-3 md:static md:bottom-auto md:pb-0 md:pt-0">
                    <form onSubmit={handleEmailSubmit} className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="email"
                          required
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="flex-1 rounded-2xl border-2 border-border bg-white px-5 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                        />
                        <button
                          type="submit"
                          disabled={!email}
                          aria-label="Submit email"
                          className="inline-flex items-center gap-1 rounded-2xl bg-vivid px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                        >
                          Go <ArrowRight size={16} />
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Your name (optional)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-2xl border-2 border-border bg-white px-5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                      />
                    </form>
                    <p className="text-xs text-text-muted">
                      Or keep chatting — just type a question instead.
                    </p>
                  </div>
                )}

                {phase === "error-fallback" && (
                  <form onSubmit={handleErrorEmailSubmit} className="space-y-3 animate-fade-in">
                    <div className="flex gap-2">
                      <input
                        type="email"
                        required
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoFocus
                        className="flex-1 rounded-2xl border-2 border-border bg-white px-5 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                      />
                      <button
                        type="submit"
                        aria-label="Submit email"
                        className="inline-flex items-center gap-1 rounded-2xl bg-vivid px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-hover"
                      >
                        Go <ArrowRight size={16} />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Your name (optional)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-2xl border-2 border-border bg-white px-5 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                    />
                  </form>
                )}

                {phase === "post-submission" && sessionId && (
                  <PostSubmission sessionId={sessionId} surface="referred" />
                )}
              </>
            )}
          </div>
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
