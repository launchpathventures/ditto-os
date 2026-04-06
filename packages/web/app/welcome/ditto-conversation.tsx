"use client";

/**
 * Ditto Front Door — Conversational Interface (Brief 094)
 *
 * The LLM drives the conversation process. The frontend is a chat renderer
 * that responds to signals from the backend:
 * - requestEmail: swap text input for email input
 * - emailCaptured: show "what happens next" timeline
 * - done: conversation is complete, hide input
 *
 * No hardcoded phases. No separate post-submission component.
 *
 * Provenance: Formless.ai (conversational form), Drift (quick-reply pills), Brief 094.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { QuickReplyPills } from "./quick-reply-pills";
import { TypingIndicator } from "./typing-indicator";
import { ValueCards } from "./value-cards";
import { TrustRow } from "./trust-row";

// ============================================================
// Types
// ============================================================

interface Message {
  role: "alex" | "user";
  text: string;
}

const INTRO_MESSAGES: Message[] = [
  { role: "alex", text: "Hey, I\u2019m Alex." },
  { role: "alex", text: "I\u2019m an AI advisor — think of me as the person in your corner who knows everyone. What are you working on?" },
];

const FRONT_DOOR_PILLS = [
  "I need more clients",
  "I\u2019m stuck on a problem",
  "I need to meet the right people",
];

const SESSION_KEY = "ditto-chat-session";
const EMAIL_KEY = "ditto-email-captured";

// ============================================================
// Component
// ============================================================

export function DittoConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [introCount, setIntroCount] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // LLM-controlled flags
  const [requestEmail, setRequestEmail] = useState(false);
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [done, setDone] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Error state
  const [errorFallback, setErrorFallback] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Returning visitor — instant greeting, no API call. LLM kicks in when they type.
  useEffect(() => {
    const savedEmail = localStorage.getItem(EMAIL_KEY);
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedEmail) {
      setEmailCaptured(true);
      setShowIntro(false);
      if (savedSession) setSessionId(savedSession);
      setMessages([
        { role: "alex", text: "Hey again." },
        { role: "alex", text: "Check your inbox \u2014 that\u2019s where I work. Need anything else? I\u2019m here." },
      ]);
      return;
    }
    if (savedSession) {
      setSessionId(savedSession);
    }
  }, []);

  // Stagger intro messages
  useEffect(() => {
    if (!showIntro) return;
    const timers = [
      setTimeout(() => setIntroCount(1), 0),
      setTimeout(() => setIntroCount(2), 1200),
      setTimeout(() => {
        setMessages(INTRO_MESSAGES);
        setShowIntro(false);
      }, 2800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [showIntro]);

  // Scroll to bottom on new messages — scroll the messages container, not the page
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when state changes
  useEffect(() => {
    if (!showIntro && !done) {
      inputRef.current?.focus();
    }
  }, [showIntro, done, requestEmail, loading]);

  // ============================================================
  // Chat API — single function, LLM controls the flow
  // ============================================================

  async function sendMessage(text: string) {
    const userMsg: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Pass returning user's email so backend knows context
      const savedEmail = emailCaptured ? localStorage.getItem(EMAIL_KEY) : null;
      const res = await fetch("/api/v1/network/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          context: "front-door",
          ...(savedEmail ? { returningEmail: savedEmail } : {}),
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json();
          setMessages((prev) => [...prev, { role: "alex", text: data.reply }]);
          setRequestEmail(true);
          setLoading(false);
          return;
        }
        throw new Error("API error");
      }

      const data = await res.json();

      // Store sessionId
      if (data.sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem(SESSION_KEY, data.sessionId);
      }

      // Add Alex's response
      setMessages((prev) => [...prev, { role: "alex", text: data.reply }]);

      // Dynamic suggestions from LLM
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);

      // Respond to LLM signals
      if (data.emailCaptured) {
        setEmailCaptured(true);
        localStorage.setItem(EMAIL_KEY, text);
        // Clear requestEmail since email was just given
        setRequestEmail(false);
      }
      if (data.requestEmail) {
        setRequestEmail(true);
      }
      if (data.done) {
        setDone(true);
      }
    } catch {
      setErrorFallback(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "alex",
          text: "Sorry \u2014 something went wrong on my end. Drop your email and I\u2019ll reach out directly.",
        },
      ]);
    }

    setLoading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
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
      localStorage.setItem(EMAIL_KEY, email);
      setErrorFallback(false);
      setEmailCaptured(true);
      setDone(true);
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  // ============================================================
  // Derived state
  // ============================================================

  const showInput = !showIntro && !done && !errorFallback;
  const showInitialPills = showInput && messages.length <= 2 && !requestEmail && !loading;
  const showSuggestions = showInput && !loading && suggestions.length > 0 && !requestEmail;
  const inputPlaceholder = requestEmail
    ? "you@company.com"
    : "Ask me anything, or tell me what you need";
  const inputType = requestEmail ? "email" : "text";

  // ============================================================
  // Render
  // ============================================================

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

      {/* Conversation area — flex column, messages scroll, input anchored on mobile */}
      <main className="flex flex-1 flex-col overflow-hidden px-4 md:px-10">
        <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col overflow-hidden py-8 md:justify-center md:py-0">
          {/* Intro phase — staggered messages */}
          {showIntro && (
            <div className="space-y-5 md:space-y-6">
              {introCount >= 1 && (
                <p className="animate-fade-in text-3xl font-bold tracking-tight text-text-primary md:text-5xl md:leading-[1.1]">
                  {INTRO_MESSAGES[0].text}
                </p>
              )}
              {introCount >= 2 && (
                <p className="animate-fade-in text-2xl font-semibold tracking-tight text-text-primary md:text-4xl md:leading-[1.15]">
                  {INTRO_MESSAGES[1].text}
                </p>
              )}
            </div>
          )}

          {/* Conversation — messages scroll, input stays anchored */}
          {!showIntro && (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Scrollable messages area */}
              <div
                ref={messagesContainerRef}
                className="flex-1 space-y-4 overflow-y-auto pb-4"
              >
                {messages.map((msg, i) => (
                  <ChatMessage
                    key={i}
                    role={msg.role}
                    text={msg.text}
                    animate={i >= messages.length - 2}
                    variant={
                      msg.role === "alex" && i === 0
                        ? "hero-primary"
                        : msg.role === "alex" && i === 1
                          ? "hero-secondary"
                          : "body"
                    }
                  />
                ))}
                {loading && <TypingIndicator />}
                <div ref={messagesEndRef} />

                {/* Timeline — shown after email is captured (scrolls with messages) */}
                {emailCaptured && (
                  <div className="mt-6 animate-fade-in rounded-xl border border-border bg-white p-6">
                    <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
                      What happens next
                    </p>
                    <div className="space-y-4">
                      {[
                        "Alex emails you (within the hour)",
                        "You reply when you're ready",
                        "Alex starts working your network",
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vivid-subtle text-xs font-semibold text-vivid">
                            {i + 1}
                          </div>
                          <p className="text-base text-text-secondary">{step}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-sm text-text-muted">
                      No account needed. No app to download. It all happens in your inbox.
                    </p>
                  </div>
                )}
              </div>

              {/* Input — anchored at bottom, never scrolls away */}
              {showInput && !loading && (
                <div className="shrink-0 space-y-3 animate-fade-in bg-white pb-4 pt-3">
                  <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                      ref={inputRef}
                      type={inputType}
                      placeholder={inputPlaceholder}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      className="flex-1 rounded-2xl border-2 border-border bg-white px-5 py-3 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
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
                  {showInitialPills && (
                    <QuickReplyPills
                      pills={FRONT_DOOR_PILLS}
                      onSelect={(pill) => sendMessage(pill)}
                      disabled={loading}
                    />
                  )}
                  {showSuggestions && (
                    <QuickReplyPills
                      pills={suggestions}
                      onSelect={(pill) => { setSuggestions([]); sendMessage(pill); }}
                      disabled={loading}
                    />
                  )}
                  {requestEmail && (
                    <p className="text-xs text-text-muted">
                      Or keep chatting — just type a question instead.
                    </p>
                  )}
                </div>
              )}

              {/* Error fallback — direct email capture */}
              {errorFallback && (
                <form onSubmit={handleErrorEmailSubmit} className="shrink-0 space-y-3 animate-fade-in bg-white pb-4 pt-3">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                      className="flex-1 rounded-2xl border-2 border-border bg-white px-5 py-3 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
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
                    className="w-full rounded-2xl border-2 border-border bg-white px-5 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                  />
                  {errorMsg && (
                    <p className="text-sm text-negative">{errorMsg}</p>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {/* Below the fold — value cards + trust row */}
        {(
          <div className="mx-auto w-full max-w-[640px] space-y-10 pb-16 pt-8">
            <ValueCards />
            <TrustRow />
          </div>
        )}
      </main>

      {/* Minimal footer */}
      <footer className="flex items-center justify-between px-6 py-5 text-xs text-text-muted md:px-10">
        <span>&copy; {new Date().getFullYear()} Ditto</span>
        <div className="flex gap-4">
          <Link href="/network" className="hover:text-text-secondary">
            Network
          </Link>
          <Link href="/chief-of-staff" className="hover:text-text-secondary">
            Chief of Staff
          </Link>
          <Link href="/about" className="hover:text-text-secondary">
            About
          </Link>
        </div>
      </footer>
    </div>
  );
}
