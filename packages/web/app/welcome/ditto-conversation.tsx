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

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, FileText, X, ArrowLeft, Check } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { QuickReplyPills } from "./quick-reply-pills";
import { TypingIndicator } from "./typing-indicator";
import { ValueCards } from "./value-cards";
import { TrustRow } from "./trust-row";
import type { ContentBlock } from "@/lib/engine";
import { LearnedContext, LearnedContextCompact } from "./learned-context";
import { VoiceCall, type VoiceCallHandle } from "./voice-call";
import { ConversationProvider } from "@elevenlabs/react";
import { PersonaPicker } from "./persona-picker";
import { PersonaPortrait } from "./persona-portrait";
import { PERSONAS, otherPersona, type PersonaId } from "@/lib/persona";

// ============================================================
// Types
// ============================================================

interface Message {
  role: "alex" | "user";
  text: string;
  blocks?: ContentBlock[];
}

/** Brief 152: persona-parameterised intro greeting used for returning visitors
 *  where the picker is skipped. The non-returning flow runs the picker which
 *  streams the real greeting from the backend in the persona's own voice. */
function introMessagesFor(personaId: PersonaId): Message[] {
  if (personaId === "mira") {
    return [
      { role: "alex", text: "Hello \u2014 Mira here." },
      { role: "alex", text: "Tell me what you\u2019re working on and I\u2019ll get moving \u2014 opening the right doors, selling on your behalf, or keeping the wheels turning. You approve everything until you trust me." },
    ];
  }
  return [
    { role: "alex", text: "Hey, I\u2019m Alex." },
    { role: "alex", text: "Tell me what you do and I\u2019ll get to work \u2014 finding clients, making introductions, running your operations, or all three. You approve everything until you trust me." },
  ];
}

const FRONT_DOOR_PILLS = [
  "I run a small business",
  "I\u2019m in sales",
  "I\u2019m a consultant",
  "I manage a team",
  "I\u2019m an entrepreneur",
];

const SESSION_KEY = "ditto-chat-session";
const EMAIL_KEY = "ditto-email-captured";
/** Brief 152: persistent persona selection across reloads. Cleared in test mode. */
const PERSONA_KEY = "ditto-persona-chosen";

type Phase = "preamble" | "picker" | "interview" | "main";

// ============================================================
// Component
// ============================================================

export function DittoConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [introCount, setIntroCount] = useState(1);
  const [showIntro, setShowIntro] = useState(true);
  // Brief 152: persona selection flow.
  const [phase, setPhase] = useState<Phase>("preamble");
  const [personaId, setPersonaId] = useState<PersonaId>("alex");
  const personaMeta = PERSONAS[personaId];
  const otherId = otherPersona(personaId);
  const otherMeta = PERSONAS[otherId];
  const [personaBusy, setPersonaBusy] = useState(false);
  // Preamble: pain-point lines before Alex intro
  // 0=cursor+dots, 1=line1, 2=line2, 3=line3, 4=fading out, 5=done (show Alex)
  const [preamble, setPreamble] = useState(0);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // LLM-controlled flags
  const [requestName, setRequestName] = useState(false);
  const [requestLocation, setRequestLocation] = useState(false);
  const [location, setLocation] = useState("");
  const [requestEmail, setRequestEmail] = useState(false);
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [done, setDone] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [detectedMode, setDetectedMode] = useState<"connector" | "sales" | "cos" | "both" | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [learned, setLearned] = useState<Record<string, string | null> | null>(null);
  // Multi-question structured input
  const [extraQuestions, setExtraQuestions] = useState<string[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
  // Brief 142b: Voice call state — persistent CTA once name is known
  const [voiceReady, setVoiceReady] = useState(false);
  const [voiceToken, setVoiceToken] = useState<string | null>(null);
  const [callActive, setCallActive] = useState(false);

  // Email verification flow
  const [verifyStep, setVerifyStep] = useState<"email" | "code" | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");

  // Error state
  const [errorFallback, setErrorFallback] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const voiceCallRef = useRef<VoiceCallHandle>(null);
  // Long text pasted into the input — shown as an attachment chip
  const [pastedText, setPastedText] = useState<string | null>(null);

  // Line count threshold for collapsing into an attachment
  const MAX_VISIBLE_LINES = 5;

  // Turnstile bot verification
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileToken = useRef<string | null>(null);

  const getTurnstileToken = useCallback((): string | null => {
    const token = turnstileToken.current;
    // Reset the widget after each use so a fresh token is generated
    if (turnstileWidgetId.current != null && typeof window !== "undefined" && (window as any).turnstile) {
      (window as any).turnstile.reset(turnstileWidgetId.current);
      turnstileToken.current = null;
    }
    return token;
  }, []);

  // Initialize Turnstile widget once the script loads
  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!siteKey || !turnstileRef.current) return;

    function renderWidget() {
      if (turnstileWidgetId.current != null || !turnstileRef.current) return;
      const turnstile = (window as any).turnstile;
      if (!turnstile) return;
      turnstileWidgetId.current = turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        size: "invisible",
        callback: (token: string) => { turnstileToken.current = token; },
        "error-callback": () => { turnstileToken.current = null; },
      });
    }

    // Script may already be loaded
    if ((window as any).turnstile) {
      renderWidget();
    } else {
      // Wait for the async script to load
      const interval = setInterval(() => {
        if ((window as any).turnstile) {
          renderWidget();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  // Test mode flag — when set, every page load is a fresh new user
  const [testMode, setTestMode] = useState(false);

  // Returning visitor — instant greeting, no API call. LLM kicks in when they type.
  useEffect(() => {
    // Check test mode — clear saved state so every visit is fresh
    fetch("/api/v1/network/chat/config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.testMode) {
          setTestMode(true);
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(EMAIL_KEY);
          localStorage.removeItem(PERSONA_KEY);
          return; // Fresh start — skip returning user flow
        }
        // Normal mode — restore returning user state
        const savedEmail = localStorage.getItem(EMAIL_KEY);
        const savedSession = localStorage.getItem(SESSION_KEY);
        const savedPersona = localStorage.getItem(PERSONA_KEY) as PersonaId | null;
        if (savedPersona === "alex" || savedPersona === "mira") {
          setPersonaId(savedPersona);
        }
        if (savedEmail) {
          setEmailCaptured(true);
          setShowIntro(false);
          setPhase("main");
          if (savedSession) setSessionId(savedSession);
          const persona = (savedPersona === "alex" || savedPersona === "mira") ? savedPersona : "alex";
          const returnerName = PERSONAS[persona].name;
          setMessages([
            { role: "alex", text: `Hey again \u2014 ${returnerName} here.` },
            { role: "alex", text: "I\u2019m still working for you \u2014 check your inbox for anything that needs your sign-off. Want to change anything?" },
          ]);
          return;
        }
        if (savedSession) {
          setSessionId(savedSession);
        }
      })
      .catch(() => {
        // Config endpoint unavailable — use normal flow
        const savedEmail = localStorage.getItem(EMAIL_KEY);
        const savedSession = localStorage.getItem(SESSION_KEY);
        const savedPersona = localStorage.getItem(PERSONA_KEY) as PersonaId | null;
        if (savedPersona === "alex" || savedPersona === "mira") {
          setPersonaId(savedPersona);
        }
        if (savedEmail) {
          setEmailCaptured(true);
          setShowIntro(false);
          setPhase("main");
          if (savedSession) setSessionId(savedSession);
          const persona = (savedPersona === "alex" || savedPersona === "mira") ? savedPersona : "alex";
          const returnerName = PERSONAS[persona].name;
          setMessages([
            { role: "alex", text: `Hey again \u2014 ${returnerName} here.` },
            { role: "alex", text: "I\u2019m still working for you \u2014 check your inbox for anything that needs your sign-off. Want to change anything?" },
          ]);
          return;
        }
        if (savedSession) {
          setSessionId(savedSession);
        }
      });
  }, []);

  // Staged intro: preamble pain points → persona picker.
  // Preamble: 0→1→2→3 (lines fade in) → 4 (fade out) → 5 (handoff to picker).
  // Brief 152: picker replaces the old hard-coded Alex "Hey I'm Alex…" intro.
  useEffect(() => {
    if (phase !== "preamble") return;
    if (!showIntro) return;
    const timers = [
      setTimeout(() => setPreamble(1), 1600),       // "AI can do more for you and your business than it currently does."
      setTimeout(() => setPreamble(2), 5200),       // "You know it. You just don't have time to figure it out."
      setTimeout(() => setPreamble(3), 8000),       // "What if AI just worked?"
      setTimeout(() => setPreamble(4), 11400),      // Fade out all
      setTimeout(() => {
        setPreamble(5);
        setShowIntro(false);
        setPhase("picker");
      }, 12200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [showIntro, phase]);

  // Scroll behaviour: keep messages scrolled to bottom.
  // The messages live in an overflow-y-auto container; we scroll THAT container,
  // not the page. This is the standard chat pattern (AI SDK, ChatGPT, etc.).
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      // Find the last message element and scroll it to the top of the viewport
      // so the user sees the start of the new message, not the end.
      const messageEls = container.querySelectorAll("[data-message]");
      const lastMsg = messageEls[messageEls.length - 1];
      if (lastMsg) {
        lastMsg.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [messages, loading, statusMessage]);

  // Focus input when state changes — use preventScroll to avoid
  // jumping the viewport to the input and cutting off Alex's response.
  useEffect(() => {
    if (!showIntro && !done) {
      // Focus textarea (chat) or input (email/code) depending on what's visible
      if (requestEmail) {
        inputRef.current?.focus({ preventScroll: true });
      } else {
        textareaRef.current?.focus({ preventScroll: true });
      }
    }
  }, [showIntro, done, requestEmail, loading]);

  // ============================================================
  // Voice call: poll for live session updates (learned context + safety-net guidance)
  // ============================================================
  // Primary guidance delivery is now in voice-call.tsx (client tool + eager pre-computation).
  // This poll is a safety net: updates the UI learned-context card and pushes guidance
  // via sendContextualUpdate as reinforcement (no dedup — always send, even if unchanged).

  // Fetch learned context + push guidance as safety-net reinforcement
  const pushGuidance = useCallback(async () => {
    if (!sessionId || !voiceToken || !voiceCallRef.current) return;
    try {
      const res = await fetch(
        `/api/v1/network/chat/session-updates?sessionId=${sessionId}&voiceToken=${voiceToken}`,
      );
      if (!res.ok) return;
      const data = await res.json();

      if (data.learned) setLearned(data.learned);

      // Always send guidance (no dedup) — the agent may have ignored it last time
      if (data.guidance) {
        voiceCallRef.current.sendContextualUpdate(
          `SYSTEM INSTRUCTION: ${data.guidance}`,
        );
      }
    } catch { /* non-fatal */ }
  }, [sessionId, voiceToken]);

  // Safety-net poll: 10s interval (primary delivery is eager pre-computation in voice-call.tsx)
  useEffect(() => {
    if (!callActive || !sessionId || !voiceToken) return;
    const interval = setInterval(pushGuidance, 10000);
    return () => clearInterval(interval);
  }, [callActive, sessionId, voiceToken, pushGuidance]);

  // ============================================================
  // Persona selection flow (Brief 152)
  // ============================================================

  type PersonaMessages = { alex: Message[]; mira: Message[] };
  const [personaTranscripts, setPersonaTranscripts] = useState<PersonaMessages>({ alex: [], mira: [] });

  /** Persist the chosen persona so a refresh mid-interview survives. */
  function persistPersonaChoice(next: PersonaId) {
    if (!testMode) {
      try { localStorage.setItem(PERSONA_KEY, next); } catch { /* ignore */ }
    }
  }

  /** Stash the current messages under the given persona's transcript slot. */
  function archiveMessagesFor(persona: PersonaId) {
    setPersonaTranscripts((prev) => ({ ...prev, [persona]: messages }));
  }

  /** Handle the picker → interview transition for a persona. */
  async function handlePersonaPicked(picked: PersonaId) {
    if (personaBusy) return;
    setPersonaBusy(true);
    // If we already have an interview in flight for the other persona,
    // stash those messages so switching back is non-destructive.
    archiveMessagesFor(personaId);
    setPersonaId(picked);
    persistPersonaChoice(picked);
    try {
      const res = await fetch("/api/v1/network/chat/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, personaId: picked, action: "interview-start" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessionId) {
          setSessionId(data.sessionId);
          if (!testMode) localStorage.setItem(SESSION_KEY, data.sessionId);
        }
      }
    } catch { /* non-fatal — the UI proceeds either way */ }
    // Restore any prior transcript we have for this persona (so revisiting resumes).
    const resumed = personaTranscripts[picked];
    setMessages(resumed);
    setPhase("interview");
    setPersonaBusy(false);
    // If there are no prior turns with this persona, prompt the agent to open
    // the conversation (interview mode, no user message).
    if (resumed.length === 0) {
      setTimeout(() => kickoffInterview(picked), 50);
    }
  }

  /** Switch from interview-with-X to interview-with-Y without committing. */
  async function handleSwitchPersona() {
    await handlePersonaPicked(otherId);
  }

  /** User pressed "Continue with <Persona>" — commit the session to this persona
   *  and fall through to the main front-door chat. */
  async function handleCommitPersona() {
    if (personaBusy) return;
    setPersonaBusy(true);
    try {
      await fetch("/api/v1/network/chat/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, personaId, action: "commit" }),
      });
    } catch { /* non-fatal */ }
    persistPersonaChoice(personaId);
    setPhase("main");
    setPersonaBusy(false);
    // Nudge the committed persona to acknowledge the handoff in their own voice
    // and move into the main front-door flow. Synthetic user message is silent
    // (not rendered) so the transcript reads as a natural agent continuation.
    setTimeout(() => {
      sendMessageInMode(
        "[PERSONA_COMMITTED] The visitor just chose you over the other advisor. Warmly acknowledge it in one sentence in your own voice, then continue gathering: ask one specific follow-up question about their business or what they're trying to do.",
        { personaId, promptMode: "main", silentUserMessage: true },
      );
    }, 50);
  }

  /** Fire the first interview turn — no user message; the agent opens. */
  async function kickoffInterview(persona: PersonaId) {
    // Send a synthetic prompt that tells the LLM to open the conversation
    // naturally. The `promptMode: "interview"` gate ensures it stays in
    // interview mode, no funnel flags.
    await sendMessageInMode(
      "[INTERVIEW_START] Say hi in your own voice and ask one light opening question.",
      { personaId: persona, promptMode: "interview", silentUserMessage: true },
    );
  }

  // ============================================================
  // Chat API — single function, LLM controls the flow
  // ============================================================

  interface SendMessageOptions {
    personaId?: PersonaId;
    promptMode?: "interview" | "main";
    /** Don't render the user message bubble — used for synthetic kickoff prompts
     *  ([INTERVIEW_START], [PERSONA_COMMITTED]). The server still sees it. */
    silentUserMessage?: boolean;
  }

  async function sendMessage(text: string) {
    return sendMessageInMode(text, {});
  }

  async function sendMessageInMode(text: string, opts: SendMessageOptions) {
    if (sendingRef.current) return; // Prevent concurrent sends
    sendingRef.current = true;

    // Resolve effective persona + mode for this turn.
    const turnPersonaId = opts.personaId ?? personaId;
    // If no explicit promptMode given, derive from phase: picker → interview, main → main.
    const turnPromptMode: "interview" | "main" = opts.promptMode
      ?? (phase === "interview" ? "interview" : "main");

    if (!opts.silentUserMessage) {
      const userMsg: Message = { role: "user", text };
      setMessages((prev) => [...prev, userMsg]);
    }
    setInput("");

    // During a voice call: send text directly to the ElevenLabs agent.
    // URLs go as contextual updates (no response triggered — agent picks it up naturally).
    // Other text goes as user messages (triggers agent response).
    if (callActive && voiceCallRef.current) {
      const isUrl = /^https?:\/\//.test(text.trim());
      if (isUrl) {
        voiceCallRef.current.sendContextualUpdate(`The user shared a link: ${text}`);
      } else {
        voiceCallRef.current.sendUserMessage(text);
      }
      // Also save to session for persistence
      if (sessionId && voiceToken) {
        fetch(`/api/v1/network/chat/session-updates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, voiceToken, message: text }),
        }).catch(() => {});
      }
      sendingRef.current = false;
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      // Pass returning user's email so backend knows context
      const savedEmail = emailCaptured ? localStorage.getItem(EMAIL_KEY) : null;
      const token = getTurnstileToken();
      const res = await fetch("/api/v1/network/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          context: "front-door",
          ...(savedEmail ? { returningEmail: savedEmail } : {}),
          ...(name.trim() ? { visitorName: name.trim() } : {}),
          ...(token ? { turnstileToken: token } : {}),
          // Brief 152: thread persona + mode so the server picks the right voice
          // and gates interview turns.
          personaId: turnPersonaId,
          promptMode: turnPromptMode,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          const data = await res.json();
          setMessages((prev) => [...prev, { role: "alex", text: data.reply || data.error }]);
          setRequestEmail(true);
          setLoading(false);
          return;
        }
        if (res.status === 403) {
          setMessages((prev) => [...prev, { role: "alex", text: "Something went wrong verifying your browser. Please refresh the page and try again." }]);
          setLoading(false);
          return;
        }
        throw new Error("API error");
      }

      // Stream SSE response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";
      let alexMsgAdded = false;

      while (true) {
        const { done: readerDone, value } = await reader.read();
        if (readerDone) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "session" && event.sessionId) {
              setSessionId(event.sessionId);
              if (!testMode) localStorage.setItem(SESSION_KEY, event.sessionId);
              if (event.testMode) setTestMode(true);
            }

            if (event.type === "status") {
              setStatusMessage(event.message);
            }


            if (event.type === "text-replace") {
              // Enrichment produced a refined response — replace the message
              setStatusMessage(null);
              streamedText = event.text;
              if (alexMsgAdded) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "alex", text: streamedText };
                  return updated;
                });
              } else {
                // No text-delta was sent yet — add a new message
                alexMsgAdded = true;
                setMessages((prev) => [...prev, { role: "alex", text: streamedText }]);
                setLoading(false);
              }
            }

            if (event.type === "text-delta") {
              setStatusMessage(null);
              streamedText += event.text;
              if (!alexMsgAdded) {
                // Add a new Alex message with streaming text
                alexMsgAdded = true;
                setMessages((prev) => [...prev, { role: "alex", text: streamedText }]);
                setLoading(false); // Hide typing indicator once text starts
              } else {
                // Update the last message in place
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "alex", text: streamedText };
                  return updated;
                });
              }
            }

            // Brief 137: content blocks arrive atomically after text, before metadata
            if (event.type === "content-block" && event.block) {
              setMessages((prev) => {
                if (prev.length === 0) return prev;
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "alex") {
                  updated[updated.length - 1] = {
                    ...last,
                    blocks: [...(last.blocks || []), event.block],
                  };
                }
                return updated;
              });
            }

            if (event.type === "metadata") {
              setSuggestions(Array.isArray(event.suggestions) ? event.suggestions : []);
              if (event.detectedMode) setDetectedMode(event.detectedMode);
              if (event.emailCaptured) {
                setEmailCaptured(true);
                if (!testMode) localStorage.setItem(EMAIL_KEY, text);
                setRequestEmail(false);
                setRequestName(false);
              }
              if (event.requestName && !name) {
                setRequestName(true);
              }
              // Clear requestName once we have a name from learned context
              if (event.learned?.name && requestName) {
                setRequestName(false);
              }
              if (event.requestLocation && !location) {
                setRequestLocation(true);
              }
              if (event.learned?.location && requestLocation) {
                setRequestLocation(false);
              }
              if (event.requestEmail && !emailCaptured) {
                setRequestEmail(true);
                if (!verifyStep) setVerifyStep("email");
              }
              // Defensive: ensure requestEmail is always false once email is captured
              if (emailCaptured) {
                setRequestEmail(false);
              }
              if (event.done) setDone(true);
              if (event.learned) {
                setLearned((prev) => ({
                  ...prev,
                  ...event.learned,
                }));
              }
              // Multi-question structured input
              if (event.extraQuestions?.length > 0) {
                setExtraQuestions(event.extraQuestions);
                setQuestionAnswers({});
              }
              // Brief 142b: Voice — persistent CTA (ElevenLabs)
              if (event.voiceReady && event.voiceToken) {
                setVoiceReady(true);
                setVoiceToken(event.voiceToken);
              }
            }

            if (event.type === "error") {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            // Skip malformed SSE lines
            if ((parseErr as Error).message !== "API error" &&
                !(parseErr as Error).message?.startsWith("Something went wrong")) {
              continue;
            }
            throw parseErr;
          }
        }
      }

      // If no text was streamed (e.g. funnel event), just finish
      if (!alexMsgAdded) {
        setLoading(false);
      }
      setStatusMessage(null);

      sendingRef.current = false;
    } catch {
      setErrorFallback(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "alex",
          text: "Sorry \u2014 something went wrong on my end. Drop your email and I\u2019ll reach out directly.",
        },
      ]);
      setLoading(false);
      setStatusMessage(null);

      sendingRef.current = false;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = pastedText ? pastedText : input.trim();
    if (!message) return;
    setPastedText(null);
    setInput("");
    // Reset textarea to single line
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    sendMessage(message);
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    setRequestName(false);
    sendMessage(trimmedName);
  }

  function handleLocationSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedLocation = location.trim();
    if (!trimmedLocation) return;
    setRequestLocation(false);
    sendMessage(trimmedLocation);
  }

  function handleExtraQuestionsSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Combine answers into a natural message
    const parts: string[] = [];
    extraQuestions.forEach((_, i) => {
      const answer = questionAnswers[i]?.trim();
      if (answer) parts.push(answer);
    });
    if (parts.length === 0) return;
    setExtraQuestions([]);
    setQuestionAnswers({});
    sendMessage(parts.join(". "));
  }

  /** Auto-resize textarea and detect overflow into attachment mode */
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const lineCount = value.split("\n").length;

    if (lineCount > MAX_VISIBLE_LINES) {
      // Collapse into attachment chip
      setPastedText(value);
      setInput("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } else {
      setInput(value);
      // Auto-resize textarea
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  async function handleEmailVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setVerifyError("");
    try {
      const res = await fetch("/api/v1/network/chat/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          sessionId,
          email,
          visitorName: name || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setVerifyError(data.error || "Could not send code. Try again.");
        return;
      }
      setVerifyStep("code");
    } catch {
      setVerifyError("Something went wrong. Please try again.");
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setVerifyError("");
    try {
      const res = await fetch("/api/v1/network/chat/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate",
          sessionId,
          email,
          code: verifyCode.trim(),
        }),
      });
      const data = await res.json();
      if (data.valid) {
        // Verified — send name + email as a natural message so Alex picks up
        setVerifyStep(null);
        setVerifyCode("");
        sendMessage(email);
      } else {
        setVerifyError(data.error || "Incorrect code.");
      }
    } catch {
      setVerifyError("Something went wrong. Please try again.");
    }
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

  const showInput = !showIntro && !errorFallback;
  const showInitialPills = showInput && !done && messages.length <= 2 && !requestEmail && !loading;
  const showSuggestions = showInput && !done && !loading && suggestions.length > 0 && !requestEmail;

  // ============================================================
  // Render
  // ============================================================

  return (
    <ConversationProvider>
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* Turnstile invisible widget container */}
      <div ref={turnstileRef} style={{ display: "none" }} />
      {/* Minimal nav */}
      <nav className="shrink-0 z-20 flex items-center justify-between bg-white px-6 py-5 md:px-10">
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

      {/* Three-column layout: 25% blank | 50% chat | 25% context cards */}
      <main className="flex min-h-0 flex-1 px-4 md:px-0">
        {/* Left spacer — blank on desktop */}
        <div className="hidden md:block md:w-1/4" />

        {/* Center chat column — 50% on desktop, full width on mobile */}
        <div className="flex min-h-0 w-full flex-1 flex-col py-4 md:w-1/2 md:flex-none md:py-0">
          {/* Intro phase — preamble pain points → Alex intro */}
          {showIntro && (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hidden">
              {/* Blinking cursor + thinking dots before preamble */}
              {preamble === 0 && (
                <div className="flex flex-1 flex-col justify-center">
                  <div className="flex items-end gap-3">
                    <span className="inline-block h-8 w-[3px] animate-cursor-blink bg-text-primary md:h-10" />
                    <div className="flex items-end gap-1.5 pb-1">
                      <span className="h-2 w-2 rounded-full bg-vivid animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 rounded-full bg-vivid animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 rounded-full bg-vivid animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Preamble — pain point lines that fade in then out */}
              {preamble >= 1 && preamble <= 4 && (
                <div className={`flex flex-1 flex-col justify-center space-y-4 md:space-y-5 ${preamble === 4 ? "animate-fade-out" : ""}`}>
                  {preamble >= 1 && (
                    <p className="animate-reveal-ltr text-xl font-medium text-text-muted md:text-2xl">
                      AI can do <strong className="font-semibold text-text-primary">more for you and your business</strong> than it currently does.
                    </p>
                  )}
                  {preamble >= 2 && (
                    <p className="animate-reveal-ltr text-xl font-medium text-text-muted md:text-2xl">
                      You know it. You just don&apos;t have <strong className="font-semibold text-text-primary">time to figure it out</strong>.
                    </p>
                  )}
                  {preamble >= 3 && (
                    <p className="animate-reveal-ltr text-xl font-semibold text-text-primary md:text-2xl">
                      What if AI <strong className="font-bold">just worked</strong>?
                    </p>
                  )}
                </div>
              )}

            </div>
          )}

          {/* Brief 152: Persona picker phase — replaces the old Alex-hardcoded intro. */}
          {phase === "picker" && (
            <PersonaPicker
              sessionId={sessionId}
              onSessionId={(id) => {
                setSessionId(id);
                if (!testMode) localStorage.setItem(SESSION_KEY, id);
              }}
              onSelect={(picked) => handlePersonaPicked(picked)}
              turnstileToken={getTurnstileToken()}
            />
          )}

          {/* Conversation — flex column: scrollable messages + fixed input at bottom */}
          {(phase === "interview" || phase === "main") && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Brief 152: Interview strip — visible only during the pre-commit interview.
                  Tells the visitor who they're with and gives Pick / Switch actions. */}
              {phase === "interview" && (
                <div className="shrink-0 mb-3 flex items-center justify-between gap-3 rounded-2xl border-2 border-vivid/20 bg-vivid-subtle/30 px-3 py-2.5 md:px-4 md:py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PersonaPortrait personaId={personaId} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs text-text-muted">You&apos;re with</p>
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {personaMeta.name} <span className="font-normal text-text-muted">· {personaMeta.tagline.split(".")[0].toLowerCase()}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSwitchPersona}
                      disabled={personaBusy}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-vivid/40 hover:text-text-primary disabled:opacity-40 md:text-sm"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Try {otherMeta.name}
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitPersona}
                      disabled={personaBusy}
                      className="inline-flex items-center gap-1.5 rounded-full bg-vivid px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40 md:text-sm"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Continue with {personaMeta.name}
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile sticky memory bar — appears after a few exchanges (main only) */}
              {learned && messages.length >= 4 && phase === "main" && (
                <div className="shrink-0 pb-2 md:hidden">
                  <LearnedContextCompact learned={learned} />
                </div>
              )}

              {/* Scrollable messages area — this is the scroll container */}
              <div
                ref={messagesContainerRef}
                className="min-h-0 flex-1 overflow-y-auto scrollbar-hidden space-y-5 pb-4"
              >
                {messages.map((msg, i) => (
                  <div key={i} data-message data-role={msg.role}>
                  <ChatMessage
                    role={msg.role}
                    text={msg.text}
                    blocks={msg.blocks}
                    animate={i >= messages.length - 2}
                    variant={
                      msg.role === "alex" && i === 0
                        ? "hero-primary"
                        : msg.role === "alex" && i === 1
                          ? "hero-secondary"
                          : "body"
                    }
                    onAction={(actionId) => {
                      if (actionId === "proposal-approve") {
                        sendMessage("Looks good — let's try it");
                      } else if (actionId === "proposal-adjust") {
                        sendMessage("I'd like to change something");
                      }
                    }}
                  />
                  </div>
                ))}
                {(loading || statusMessage) && <TypingIndicator status={statusMessage} />}
                <div ref={messagesEndRef} />

                {/* Timeline — shown after conversation is complete, but not while a proposal is pending */}
                {done && emailCaptured && !messages.some((m) => m.blocks?.some((b) => b.type === "process_proposal")) && (
                  <div className="mt-6 animate-fade-in rounded-xl border border-border bg-white p-6">
                    <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
                      What happens next
                    </p>
                    <div className="space-y-4">
                      {[
                        "Check your inbox \u2014 Alex is already getting started",
                        "You\u2019ll hear from Alex a few times a week with updates and things that need your sign-off",
                        "Want more? Set up a workspace to see everything Alex is doing and manage it yourself",
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
                      Nothing goes out without your approval.
                    </p>
                  </div>
                )}
              </div>

              {/* Name collection card — styled input, Alex's text provides the conversational context */}
              {showInput && requestName && !requestEmail && (
                <div className="shrink-0 bg-white pb-4 pt-3">
                  <form onSubmit={handleNameSubmit} className="rounded-2xl border-2 border-vivid/20 bg-vivid-subtle/30 p-4 space-y-3">
                    <div className="flex gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        required
                        placeholder="First name is fine"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleNameSubmit(e); } }}
                        className="flex-1 rounded-xl border-2 border-border bg-white px-4 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                      />
                      <button
                        type="submit"
                        disabled={!name.trim()}
                        aria-label="Submit name"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-vivid px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        Go <ArrowRight size={16} />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Location collection card */}
              {showInput && !requestName && requestLocation && !requestEmail && (
                <div className="shrink-0 bg-white pb-4 pt-3">
                  <form onSubmit={handleLocationSubmit} className="rounded-2xl border-2 border-vivid/20 bg-vivid-subtle/30 p-4 space-y-3">
                    <div className="flex gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        required
                        placeholder="City, country"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLocationSubmit(e); } }}
                        className="flex-1 rounded-xl border-2 border-border bg-white px-4 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                      />
                      <button
                        type="submit"
                        disabled={!location.trim()}
                        aria-label="Submit location"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-vivid px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        Go <ArrowRight size={16} />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Extra questions card — structured input for multi-question responses */}
              {showInput && !requestName && !requestLocation && !requestEmail && extraQuestions.length > 0 && (
                <div className="shrink-0 bg-white pb-4 pt-3">
                  <form onSubmit={handleExtraQuestionsSubmit} className="rounded-2xl border-2 border-vivid/20 bg-vivid-subtle/30 p-4 space-y-4">
                    {extraQuestions.map((q, i) => (
                      <div key={i} className="space-y-1.5">
                        <label className="text-sm font-medium text-text-primary">{q}</label>
                        <input
                          type="text"
                          value={questionAnswers[i] || ""}
                          onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                          placeholder="Your answer"
                          className="w-full rounded-xl border-2 border-border bg-white px-4 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                        />
                      </div>
                    ))}
                    <button
                      type="submit"
                      disabled={!Object.values(questionAnswers).some((v) => v?.trim())}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-vivid px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      Send <ArrowRight size={16} />
                    </button>
                  </form>
                </div>
              )}

              {/* Input area — always visible so the user can always talk to Alex */}
              {showInput && (
                <div className="shrink-0 bg-white pb-2 pt-2 md:pb-4 md:pt-3 space-y-2 md:space-y-3">
                  {/* Pasted text attachment chip */}
                  {pastedText && (
                    <div className="flex items-center gap-2 rounded-xl bg-vivid-subtle/50 px-4 py-2.5">
                      <FileText size={16} className="shrink-0 text-vivid" />
                      <span className="flex-1 truncate text-sm text-text-secondary">
                        Pasted text — {pastedText.split("\n").length} lines
                      </span>
                      <button
                        type="button"
                        onClick={() => { setInput(pastedText); setPastedText(null); }}
                        className="text-xs text-text-muted hover:text-text-secondary"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPastedText(null)}
                        aria-label="Remove pasted text"
                        className="text-text-muted hover:text-text-secondary"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  {/* Brief 142b: Voice call card — hide when email verification is showing (unless call active) */}
                  {voiceReady && !done && sessionId && voiceToken && (!requestEmail || callActive) && (
                    <div className="shrink-0 bg-white pb-1 pt-2 md:pb-2 md:pt-3">
                      <div className={`rounded-xl md:rounded-2xl border-2 px-3 py-2.5 md:p-4 flex items-center justify-between ${
                        callActive
                          ? "border-vivid/40 bg-vivid/5"
                          : "border-vivid/20 bg-vivid-subtle/30"
                      }`}>
                        <div className="flex-1">
                          <p className="text-xs md:text-sm font-medium text-text-primary">
                            {callActive ? `Talking with ${personaMeta.name}` : "Prefer to talk?"}
                          </p>
                          {!callActive && (
                            <p className="hidden md:block text-xs text-text-muted mt-0.5">
                              Switch to a live voice conversation
                            </p>
                          )}
                        </div>
                        <VoiceCall
                          ref={voiceCallRef}
                          sessionId={sessionId}
                          voiceToken={voiceToken}
                          learned={learned}
                          visitorName={name}
                          personaName={personaMeta.name}
                          recentMessages={messages.slice(-6).map((m) => ({ role: m.role, text: m.text }))}
                          onCallStart={() => setCallActive(true)}
                          onCallEnd={() => setCallActive(false)}
                          onCallError={(error) => {
                            setCallActive(false);
                            setMessages((prev) => [...prev, { role: "alex", text: error }]);
                          }}
                          onMessage={(role, text) => {
                            setMessages((prev) => [...prev, { role: role === "alex" ? "alex" : "user", text }]);
                            // Save ALL messages (user + agent) to session so harness sees full conversation
                            if (sessionId && voiceToken) {
                              fetch("/api/v1/network/chat/session-updates", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  sessionId,
                                  voiceToken,
                                  message: text,
                                  role: role === "alex" ? "assistant" : "user",
                                }),
                              }).catch(() => {});
                            }
                            // Guidance delivery is now handled by voice-call.tsx
                            // (client tool + eager pre-computation on user speech).
                            // The 10s polling safety net handles reinforcement.
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="relative flex items-end">
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      placeholder={
                        callActive
                          ? "Type while talking..."
                          : done
                            ? "Ask a question or share a link"
                            : "Tell me what you do..."
                      }
                      value={input}
                      onChange={handleTextareaChange}
                      onKeyDown={handleTextareaKeyDown}
                      disabled={loading || !!statusMessage}
                      className={`w-full resize-none rounded-xl md:rounded-2xl border-2 bg-white pl-4 pr-11 py-2 md:pl-5 md:pr-14 md:py-3 text-sm md:text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0 disabled:opacity-50 ${
                        callActive ? "border-vivid/20" : "border-border"
                      }`}
                      style={{ maxHeight: "8rem" }}
                    />
                    <button
                      type="submit"
                      disabled={(!input.trim() && !pastedText) || loading || !!statusMessage}
                      aria-label="Send message"
                      className="absolute right-2.5 bottom-2 md:right-3 md:bottom-auto md:top-1/2 md:-translate-y-1/2 inline-flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-vivid text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      <ArrowRight size={14} className="md:hidden" />
                      <ArrowRight size={16} className="hidden md:block" />
                    </button>
                  </form>
                  {/* Pills — only when no structured card is showing */}
                  <div className={showInitialPills || showSuggestions ? "min-h-[2rem] md:min-h-[2.5rem]" : ""}>
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
                  </div>
                </div>
              )}

              {/* Identity + email verification card */}
              {showInput && requestEmail && verifyStep && (
                <div className="shrink-0 bg-white pb-4 pt-3">
                  {verifyStep === "email" && (
                    <form onSubmit={handleEmailVerify} className="rounded-2xl border-2 border-vivid/20 bg-vivid-subtle/30 p-4 space-y-3">
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="email"
                          required
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="flex-1 rounded-xl border-2 border-border bg-white px-4 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-vivid focus:outline-none focus:ring-0"
                        />
                        <button
                          type="submit"
                          disabled={!email.trim()}
                          aria-label="Send verification code"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-vivid px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                        >
                          Verify <ArrowRight size={16} />
                        </button>
                      </div>
                      <p className="text-xs text-text-muted">
                        I&apos;ll send a quick code to verify your email &mdash; I&apos;ll be reaching out on your behalf, so I need to make sure it&apos;s really you.
                      </p>
                      {verifyError && <p className="text-xs text-negative">{verifyError}</p>}
                    </form>
                  )}

                  {verifyStep === "code" && (
                    <form onSubmit={handleCodeSubmit} className="rounded-2xl border-2 border-vivid/20 bg-vivid-subtle/30 p-4 space-y-3">
                      <p className="text-sm font-medium text-text-primary">
                        Check your inbox — I just sent a 6-digit code to <span className="font-semibold">{email}</span>
                      </p>
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          required
                          placeholder="Enter 6-digit code"
                          value={verifyCode}
                          onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          className="flex-1 rounded-xl border-2 border-border bg-white px-4 py-2.5 text-center text-lg font-semibold tracking-[0.3em] text-text-primary placeholder:text-text-muted placeholder:tracking-normal placeholder:text-sm placeholder:font-normal focus:border-vivid focus:outline-none focus:ring-0"
                        />
                        <button
                          type="submit"
                          disabled={verifyCode.length !== 6}
                          aria-label="Confirm code"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-vivid px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                        >
                          Confirm
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => { setVerifyStep("email"); setVerifyCode(""); setVerifyError(""); }}
                          className="text-xs text-text-muted hover:text-text-secondary"
                        >
                          Wrong email? Go back
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { setVerifyError(""); handleEmailVerify(e as unknown as React.FormEvent); }}
                          className="text-xs text-vivid hover:underline"
                        >
                          Resend code
                        </button>
                      </div>
                      {verifyError && <p className="text-xs text-negative">{verifyError}</p>}
                    </form>
                  )}

                  {/* Skip link to bypass verification */}
                  <button
                    type="button"
                    onClick={() => { setVerifyStep(null); setRequestEmail(false); }}
                    className="mt-1 text-xs text-text-muted hover:text-text-secondary"
                  >
                    Skip for now — I&apos;ll verify later
                  </button>
                </div>
              )}

              {/* Error fallback — direct email capture */}
              {errorFallback && (
                <form onSubmit={handleErrorEmailSubmit} className="shrink-0 space-y-3 bg-white pb-4 pt-3">
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

        {/* Right column — floating context cards, desktop only */}
        {/* Only shows after 4+ messages (past the intro/first exchange) */}
        <div className="hidden self-stretch md:block md:w-1/4">
          <div className="sticky top-24 space-y-4 px-4">
            {learned && !showIntro && (
              <LearnedContext learned={learned} />
            )}
          </div>
        </div>
      </main>

      {/* Minimal footer — hidden during conversation to maximize chat space */}
      <footer className={`flex items-center justify-between px-6 py-5 text-xs text-text-muted md:px-10 ${!showIntro ? "hidden" : ""}`}>
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
          <Link href="/admin" className="hover:text-text-secondary">
            Admin
          </Link>
        </div>
      </footer>
    </div>
    </ConversationProvider>
  );
}
