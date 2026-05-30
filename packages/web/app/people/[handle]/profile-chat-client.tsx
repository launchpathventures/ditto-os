"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Loader2, Mic, Send, X } from "lucide-react";
import type { AuthorizationRequestBlock, NetworkProfileCardBlock } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { NetworkProfileCardRenderer } from "@/app/network/chat/network-profile-card-renderer";
import { QuickStartPills } from "./quick-start-pills";
import { VisitorCtaStrip, type IntentInference } from "./visitor-cta-strip";
import { VoiceMode } from "./voice-mode";

type TurnRole = "visitor" | "greeter";

interface VisitorChatTurn {
  role: TurnRole;
  content: string;
}

interface ChatMessage extends VisitorChatTurn {
  id: string;
}

interface PendingForwardNote {
  question: string;
}

interface PendingIntro {
  draft: string;
}

interface ChatApiResponse {
  reply: string;
  transcript?: VisitorChatTurn[];
  intentInference?: IntentInference;
  forwardedNoteOffer?: { factQuestionMd: string };
  introDraft?: string;
  rateLimited?: boolean;
  retryAfterSec?: number;
}

interface IntroApiResponse {
  message: string;
  block: AuthorizationRequestBlock;
}

const SESSION_KEY = "ditto-people-visitor-session";
const FINGERPRINT_KEY = "ditto-people-visitor-fingerprint";

function initialGreeting(greeterName: string, userFirst: string): string {
  return `Hi, I'm ${greeterName}, ${userFirst}'s representative. Ask me about ${userFirst}'s work, fit, or what you're trying to do.`;
}

function randomId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function sha256(value: string): Promise<string> {
  if (!crypto?.subtle) return value;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getVisitorIds(): Promise<{ sessionId: string; fingerprint: string }> {
  const existingSession = window.localStorage.getItem(SESSION_KEY);
  const sessionId = existingSession || randomId("visitor");
  if (!existingSession) window.localStorage.setItem(SESSION_KEY, sessionId);

  const existingFingerprint = window.localStorage.getItem(FINGERPRINT_KEY);
  if (existingFingerprint) return { sessionId, fingerprint: existingFingerprint };

  const coarseFingerprint = [
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    `${screen.width}x${screen.height}`,
    navigator.platform,
    navigator.userAgent.replace(/\d+(\.\d+)*/g, "x"),
    sessionId,
  ].join("|");
  const fingerprint = await sha256(coarseFingerprint);
  window.localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  return { sessionId, fingerprint };
}

function transcriptFromMessages(messages: ChatMessage[]): VisitorChatTurn[] {
  return messages.map(({ role, content }) => ({ role, content }));
}

function minutesLabel(seconds: number): string {
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}

export function ProfileChatClient({
  card,
  handle,
  userName,
  userFirst,
  greeterName,
  quickStartPills,
  referralChannel,
}: {
  card: NetworkProfileCardBlock;
  handle: string;
  userId: string;
  userName: string;
  userFirst: string;
  greeterName: string;
  quickStartPills: string[];
  referralChannel: string | null;
}) {
  const [visitorIds, setVisitorIds] = useState<{ sessionId: string; fingerprint: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: "opening",
      role: "greeter",
      content: initialGreeting(greeterName, userFirst),
    },
  ]);
  const [input, setInput] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorOrg, setVisitorOrg] = useState("");
  const [pendingForward, setPendingForward] = useState<PendingForwardNote | null>(null);
  const [pendingIntro, setPendingIntro] = useState<PendingIntro | null>(null);
  const [introExpanded, setIntroExpanded] = useState(false);
  const [intentInference, setIntentInference] = useState<IntentInference | null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disabledUntil, setDisabledUntil] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const transcript = useMemo(() => transcriptFromMessages(messages), [messages]);
  const disabled = loading || (disabledUntil != null && disabledUntil > Date.now());

  useEffect(() => {
    let cancelled = false;
    void getVisitorIds().then((ids) => {
      if (!cancelled) setVisitorIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pendingForward, pendingIntro]);

  useEffect(() => {
    if (!disabledUntil) return;
    const delay = Math.max(0, disabledUntil - Date.now());
    const timer = window.setTimeout(() => setDisabledUntil(null), delay);
    return () => window.clearTimeout(timer);
  }, [disabledUntil]);

  function appendMessage(role: TurnRole, content: string) {
    setMessages((current) => [
      ...current,
      { id: randomId(role), role, content },
    ]);
  }

  async function sendText(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message || disabled || !visitorIds) return;

    setInput("");
    setError(null);
    setPendingForward(null);
    setPendingIntro(null);
    const nextMessages = [
      ...messages,
      { id: randomId("visitor"), role: "visitor" as const, content: message },
    ];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const response = await fetch(`/api/v1/network/people/${encodeURIComponent(handle)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          transcript: transcriptFromMessages(nextMessages),
          sessionId: visitorIds.sessionId,
          fingerprint: visitorIds.fingerprint,
          visitorName: visitorName || null,
          visitorOrg: visitorOrg || null,
        }),
      });
      const data = (await response.json()) as ChatApiResponse;
      if (!response.ok && !data.rateLimited) {
        throw new Error("chat_failed");
      }

      appendMessage("greeter", data.reply);
      if (data.forwardedNoteOffer) {
        setPendingForward({ question: data.forwardedNoteOffer.factQuestionMd });
      }
      if (data.introDraft) {
        setPendingIntro({ draft: data.introDraft });
      }
      if (data.intentInference) {
        setIntentInference(data.intentInference);
      }
      if (data.rateLimited && data.retryAfterSec) {
        setDisabledUntil(Date.now() + data.retryAfterSec * 1000);
      }
    } catch {
      setError(`${greeterName} could not answer that just now. Try again in a moment.`);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    await sendText(input);
  }

  function focusChat() {
    inputRef.current?.focus();
  }

  function requestIntroFromCta() {
    void sendText("I'd like an intro.");
  }

  async function confirmForwardNote() {
    if (!pendingForward || !visitorIds) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/network/people/${encodeURIComponent(handle)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "forward_note",
          factQuestionMd: pendingForward.question,
          transcript,
          sessionId: visitorIds.sessionId,
          fingerprint: visitorIds.fingerprint,
          visitorName: visitorName || null,
          visitorOrg: visitorOrg || null,
        }),
      });
      if (!response.ok) throw new Error("forward_failed");
      const data = (await response.json()) as ChatApiResponse;
      setPendingForward(null);
      appendMessage("greeter", data.reply);
    } catch {
      setError("I couldn't send that note right now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  async function sendIntroRequest() {
    if (!pendingIntro || !visitorIds) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/network/people/${encodeURIComponent(handle)}/intro-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: pendingIntro.draft,
          transcript,
          sessionId: visitorIds.sessionId,
          fingerprint: visitorIds.fingerprint,
          visitorName: visitorName || null,
          visitorOrg: visitorOrg || null,
        }),
      });
      if (!response.ok) throw new Error("intro_failed");
      const data = (await response.json()) as IntroApiResponse;
      setPendingIntro(null);
      appendMessage("greeter", data.message);
    } catch {
      setError("I couldn't send that request right now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <div>
          <p className="text-sm font-semibold">⊙ {greeterName} · representing {userFirst}</p>
          <p className="text-xs text-text-secondary">{userFirst} sees notes you choose to send.</p>
        </div>
        <div className="flex max-w-[46vw] items-center gap-2 rounded-full bg-surface-raised px-2.5 py-1.5">
          {card.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.portraitUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-semibold">
              {userFirst.slice(0, 1)}
            </span>
          )}
          <span className="truncate text-xs font-medium">{userName}</span>
        </div>
      </div>

      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-6 md:grid-cols-[minmax(280px,440px)_minmax(0,1fr)] md:px-6 md:py-10 lg:gap-10">
        <aside className="hidden md:block">
          <div className="sticky top-10 space-y-4">
            <NetworkProfileCardRenderer card={card} className="max-w-none" />
            <VisitorCtaStrip
              handle={handle}
              userFirst={userFirst}
              referralChannel={referralChannel}
              intentInference={intentInference}
              sessionId={visitorIds?.sessionId ?? null}
              onAsk={focusChat}
              onIntro={requestIntroFromCta}
            />
          </div>
        </aside>

        <section className="flex min-h-[calc(100vh-96px)] flex-col rounded-[var(--radius-xl)] bg-white shadow-large md:min-h-[calc(100vh-80px)]">
          <header className="hidden border-b border-border px-5 py-4 md:block">
            <p className="text-sm font-semibold">⊙ {greeterName} · representing {userFirst}</p>
            <p className="mt-1 text-sm text-text-secondary">
              Ask about {userFirst}'s work. {userFirst} only sees notes or intro requests you choose to send.
            </p>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "visitor" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[86%] rounded-[var(--radius-lg)] px-4 py-3 text-base leading-relaxed",
                    message.role === "visitor"
                      ? "bg-[#111111] text-white"
                      : "bg-surface-raised text-text-primary",
                  )}
                >
                  {message.role === "greeter" && (
                    <p className="mb-1 text-xs font-medium text-text-secondary">
                      ⊙ {greeterName}
                    </p>
                  )}
                  <p>{message.content}</p>
                </div>
              </div>
            ))}

            {messages.length === 1 && (
              <QuickStartPills
                pills={quickStartPills}
                disabled={disabled}
                onSelect={setInput}
              />
            )}

            {pendingForward && (
              <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 shadow-subtle">
                <p className="text-sm font-semibold">Send this question to {userFirst}</p>
                <textarea
                  value={pendingForward.question}
                  onChange={(event) => setPendingForward({ question: event.target.value })}
                  className="mt-3 min-h-24 w-full resize-none rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2 text-sm outline-none focus:border-text-primary"
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input
                    value={visitorName}
                    onChange={(event) => setVisitorName(event.target.value)}
                    placeholder="Your name (optional)"
                    className="min-h-11 rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:border-text-primary"
                  />
                  <input
                    value={visitorOrg}
                    onChange={(event) => setVisitorOrg(event.target.value)}
                    placeholder="Your org (optional)"
                    className="min-h-11 rounded-[var(--radius-md)] border border-border px-3 text-sm outline-none focus:border-text-primary"
                  />
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {userFirst} sees this with your name if you share it.
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingForward(null)}
                    className="min-h-10 rounded-[var(--radius-md)] px-3 text-sm text-text-secondary hover:text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={confirmForwardNote}
                    className="inline-flex min-h-10 items-center rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    Send note to {userFirst}
                  </button>
                </div>
              </div>
            )}

            {pendingIntro && (
              <div className="rounded-[var(--radius-lg)] border border-border bg-white p-4 shadow-subtle">
                <p className="text-sm font-semibold">Request an intro through {userFirst}</p>
                <textarea
                  value={pendingIntro.draft}
                  onChange={(event) => setPendingIntro({ draft: event.target.value })}
                  className="mt-3 min-h-36 w-full resize-none rounded-[var(--radius-lg)] border border-border bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-text-primary"
                />
                <button
                  type="button"
                  onClick={() => setIntroExpanded((value) => !value)}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary"
                >
                  <ChevronDown className={cn("h-4 w-4 transition", introExpanded && "rotate-180")} />
                  What {userFirst} will review
                </button>
                {introExpanded && (
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-[var(--radius-md)] bg-surface-raised p-3">
                    {transcript.map((turn, index) => (
                      <p key={index} className="text-xs leading-relaxed text-text-secondary">
                        <span className="font-semibold text-text-primary">
                          {turn.role === "visitor" ? "Visitor" : greeterName}:
                        </span>{" "}
                        {turn.content}
                      </p>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingIntro(null)}
                    className="min-h-10 rounded-[var(--radius-md)] px-3 text-sm text-text-secondary hover:text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={sendIntroRequest}
                    className="inline-flex min-h-10 items-center rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    Send request
                  </button>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                {greeterName} is checking the profile...
              </div>
            )}
            {error && (
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-surface-raised px-3 py-2 text-sm text-text-secondary">
                <span>{error}</span>
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border p-4 md:p-5">
            {voiceOpen && (
              <div className="mb-4">
                <VoiceMode
                  active={voiceOpen}
                  disabled={disabled || !visitorIds}
                  greeterName={greeterName}
                  userFirst={userFirst}
                  onToggle={() => setVoiceOpen(false)}
                  onTranscript={sendText}
                />
              </div>
            )}
            <form onSubmit={sendMessage} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                disabled={disabled}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  disabledUntil
                    ? `Resting - back in ${minutesLabel(Math.max(0, Math.ceil((disabledUntil - Date.now()) / 1000)))}`
                    : `Ask ${greeterName}...`
                }
                rows={1}
                className="max-h-32 min-h-12 flex-1 resize-none rounded-[var(--radius-lg)] border border-border bg-white px-4 py-3 text-base outline-none transition focus:border-text-primary disabled:bg-surface-raised"
              />
              <button
                type="submit"
                disabled={!input.trim() || disabled || !visitorIds}
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent text-accent-foreground transition hover:opacity-90 disabled:opacity-40"
                aria-label="Send message"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setVoiceOpen((value) => !value)}
              className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-md)] px-2 text-sm font-medium text-text-secondary hover:bg-surface-raised hover:text-text-primary"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              Talk to {greeterName} (voice)
            </button>
          </div>
        </section>

        <div className="md:hidden">
          <VisitorCtaStrip
            handle={handle}
            userFirst={userFirst}
            referralChannel={referralChannel}
            intentInference={intentInference}
            sessionId={visitorIds?.sessionId ?? null}
            onAsk={focusChat}
            onIntro={requestIntroFromCta}
          />
        </div>
      </div>
    </main>
  );
}
