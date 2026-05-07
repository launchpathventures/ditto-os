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
import { HeroBackdrop } from "@/components/hero-backdrop";
import { PersonaPortrait } from "./persona-portrait";
import { Wedge } from "@/components/marketing/wedge";
import { PERSONAS, otherPersona, greeterOpenerMessages, type PersonaId } from "@/lib/persona";

// ============================================================
// Types
// ============================================================

interface Message {
  role: "alex" | "user";
  text: string;
  blocks?: ContentBlock[];
}

/** Brief 241: canned greeter opener rendered the moment phase flips to
 *  interview \u2014 no streaming wait, no LLM round-trip. Single source of
 *  truth lives in `lib/persona.ts` and is imported by the server-side
 *  persona route so seeded session history matches what visitors see. */
function openerMessagesFor(personaId: PersonaId): Message[] {
  return greeterOpenerMessages(personaId).map((m) => ({ role: "alex", text: m.text }));
}

const FRONT_DOOR_PILLS = [
  "I run a small business",
  "I\u2019m in sales",
  "I manage a team",
  "I\u2019m a consultant",
];

const SESSION_KEY = "ditto-chat-session";
const EMAIL_KEY = "ditto-email-captured";
/** Brief 152: persistent persona selection across reloads. Cleared in test mode. */
const PERSONA_KEY = "ditto-persona-chosen";
/** Session marker retained for funnel continuity when the hero hands off to
 *  the picker. It no longer auto-skips the landing hero. */
const PREAMBLE_COOKIE = "ditto-preamble-seen";
/** Brief 253: first-vs-returning visitor flag. Absent on first visit; set to
 *  "1" after the staged preamble plays (or is skipped) so subsequent loads go
 *  directly to the Tripoli v2 hero. Cleared cookies → preamble plays again. */
const VISITED_KEY = "ditto-visited";

function setPreambleCookie(): void {
  if (process.env.NODE_ENV !== "production") return;
  // Session cookie — no max-age/expires so it clears when the browser closes
  document.cookie = `${PREAMBLE_COOKIE}=1; path=/; SameSite=Lax`;
}

type Phase = "preamble" | "picker" | "interview" | "main";

// ============================================================
// Component
// ============================================================

export function DittoConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showIntro, setShowIntro] = useState(true);
  // Brief 253: first-time visitor staged preamble (lifted from commit 1b6b63e).
  // 0=cursor+dots, 1=line1, 2=line2, 3=line3, 4=fading out, 5=done (Tripoli v2 hero shown).
  // `firstTime` is set on mount when localStorage[VISITED_KEY] is absent and the
  // visitor isn't already converted (no email captured). Once the preamble runs
  // through (or is skipped), VISITED_KEY is set so subsequent loads bypass it.
  const [firstTime, setFirstTime] = useState(false);
  const [preamble, setPreamble] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  // Brief 253 follow-up: returning desktop visitors auto-start the wedge replay.
  // Decided once on mount from localStorage[VISITED_KEY] + viewport. Mobile keeps
  // user-initiated play (smaller viewport, autoplay is more jarring there).
  const [autoStartWedge, setAutoStartWedge] = useState(false);
  // Brief 152: persona selection flow.
  const [phase, setPhase] = useState<Phase>("preamble");
  const [personaId, setPersonaId] = useState<PersonaId>("alex");
  const personaMeta = PERSONAS[personaId];
  const otherId = otherPersona(personaId);
  const otherMeta = PERSONAS[otherId];
  const [personaBusy, setPersonaBusy] = useState(false);
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
  const frontDoorConfigCheckedRef = useRef(false);
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

  const syncFrontDoorConfig = useCallback(() => {
    if (frontDoorConfigCheckedRef.current) return;
    frontDoorConfigCheckedRef.current = true;

    fetch("/api/v1/network/chat/config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.testMode) return;
        setTestMode(true);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(EMAIL_KEY);
        localStorage.removeItem(PERSONA_KEY);
        setSessionId(null);
        setEmailCaptured(false);
        setMessages([]);
      })
      .catch(() => {
        /* config is best-effort */
      });
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

  // Returning visitor — instant local restore, no API call. LLM kicks in when
  // they type; config/test-mode sync is deferred until the picker/chat path so
  // the wedge remains backend-free.
  useEffect(() => {
    const savedEmail = localStorage.getItem(EMAIL_KEY);
    const savedSession = localStorage.getItem(SESSION_KEY);
    const savedPersona = localStorage.getItem(PERSONA_KEY) as PersonaId | null;
    const visited = localStorage.getItem(VISITED_KEY) === "1";
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
    // Brief 253: first-time visitor \u2192 staged preamble. Returning visitors who
    // never converted skip straight to the Tripoli v2 hero.
    if (!visited) setFirstTime(true);
    // Brief 253 follow-up: returning desktop visitors auto-start the wedge.
    if (visited && !savedEmail && window.matchMedia("(min-width: 768px)").matches) {
      setAutoStartWedge(true);
    }
  }, []);

  // Brief 253: staged preamble timing \u2014 exact cadence from commit 1b6b63e.
  // Cursor+dots (0) \u2192 line1 (1.6s) \u2192 line2 (5.2s) \u2192 line3 (8s) \u2192 fade (11.4s)
  // \u2192 done at 12.2s. On completion we set VISITED_KEY so subsequent loads
  // bypass the preamble. Skip handler short-circuits the same path.
  // Functional setState guards against the narrow Skip race window where a
  // queued macrotask might dispatch after handleSkipPreamble has cleared the
  // timer \u2014 `(p) => (p >= 5 ? p : N)` refuses to roll back from a completed/
  // skipped state to an earlier line.
  const preambleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!firstTime) return;
    if (!showIntro) return;
    const advance = (n: 1 | 2 | 3 | 4 | 5) =>
      setPreamble((p) => (p >= 5 ? p : n));
    preambleTimersRef.current = [
      setTimeout(() => advance(1), 1600),
      setTimeout(() => advance(2), 5200),
      setTimeout(() => advance(3), 8000),
      setTimeout(() => advance(4), 11400),
      setTimeout(() => {
        advance(5);
        try { localStorage.setItem(VISITED_KEY, "1"); } catch { /* ignore */ }
      }, 12200),
    ];
    return () => {
      preambleTimersRef.current.forEach(clearTimeout);
      preambleTimersRef.current = [];
    };
  }, [firstTime, showIntro]);

  const handleSkipPreamble = useCallback(() => {
    preambleTimersRef.current.forEach(clearTimeout);
    preambleTimersRef.current = [];
    try { localStorage.setItem(VISITED_KEY, "1"); } catch { /* ignore */ }
    setPreamble(5);
  }, []);

  // Brief 253: Escape key skips the preamble. Only bound while the preamble
  // is on screen so we don't capture the Esc key in the picker/interview.
  useEffect(() => {
    if (!firstTime) return;
    if (preamble >= 5) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleSkipPreamble();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [firstTime, preamble, handleSkipPreamble]);

  const openPersonaPicker = useCallback(() => {
    syncFrontDoorConfig();
    setPreambleCookie();
    setShowIntro(false);
    setPhase("picker");
  }, [syncFrontDoorConfig]);

  // Marketing CTAs link to /#get-started from other pages. The landing page
  // resolves that hash into the same in-place picker transition as the hero
  // CTA and wedge closing action.
  useEffect(() => {
    function handleHash() {
      if (window.location.hash === "#get-started") {
        openPersonaPicker();
      }
    }

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [openPersonaPicker]);

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
  // Voice call: poll for live session updates (Brief 180)
  // ============================================================
  // Primary guidance delivery is voice-call.tsx (user-final + agent-turn-end push).
  // This poll is the safety net so backend state changes (e.g. a chat-during-call
  // message) reach the live agent within ~2s instead of only on the next user turn.
  //
  // Brief 180 AC 4 + 15: delegate to voiceCallRef.refreshGuidance() so polling
  // uses the same ETag-aware, dedup-aware code path as the push triggers. The
  // server returns 304 when state is unchanged → no sendContextualUpdate fires.
  // Separately, we still hit session-updates to refresh the learned-context UI.

  const refreshLearnedCard = useCallback(async () => {
    if (!sessionId || !voiceToken) return;
    try {
      const res = await fetch(
        `/api/v1/network/chat/session-updates?sessionId=${sessionId}&voiceToken=${voiceToken}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      // Truthy-only merge — the server's snapshot may include nulls for fields
      // the LLM hasn't captured this poll; a wholesale replace would wipe what
      // the stream handler already accumulated locally.
      if (data.learned) {
        setLearned((prev) => {
          const out: Record<string, string | null> = { ...(prev ?? {}) };
          for (const [k, v] of Object.entries(data.learned as Record<string, string | null>)) {
            if (v != null && v !== "") out[k] = v;
          }
          return out;
        });
      }
    } catch { /* non-fatal */ }
  }, [sessionId, voiceToken]);

  // Safety-net poll: 2s interval (Brief 180 AC 4). Guarded against pushing
  // before the call is connected or after it has ended.
  useEffect(() => {
    if (!callActive || !sessionId || !voiceToken) return;
    const interval = setInterval(() => {
      const handle = voiceCallRef.current;
      if (!handle) return;
      if (handle.getCallState && handle.getCallState() !== "active") return;
      handle.refreshGuidance?.("poll");
      refreshLearnedCard();
    }, 2000);
    return () => clearInterval(interval);
  }, [callActive, sessionId, voiceToken, refreshLearnedCard]);

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

    // Optimistic UI — flip to the interview screen immediately so the picker
    // doesn't linger during the /persona round-trip. Brief 241: render the
    // canned UX-spec §5.1 opener locally the instant phase flips so the
    // visitor sees the greeter "speak" with no streaming wait. The /persona
    // call seeds the same opener into server-side session history so the
    // visitor's first reply lands at TURN 2 of the interview cadence.
    const resumed = personaTranscripts[picked];
    const isFreshInterview = resumed.length === 0;
    const initialMessages = isFreshInterview ? openerMessagesFor(picked) : resumed;
    setMessages(initialMessages);
    setPhase("interview");
    // No spinner — the canned opener is on screen instantly. The LLM is
    // only invoked when the visitor sends their first real reply.
    setLoading(false);

    let freshSessionId: string | null | undefined = undefined;
    try {
      // Include turnstileToken on the first interview-start when no session
      // exists yet — the server gates lazy session creation on it. Harmless
      // to send when a session already exists (server ignores it then).
      const tsToken = sessionId ? null : getTurnstileToken();
      const res = await fetch("/api/v1/network/chat/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          personaId: picked,
          action: "interview-start",
          ...(tsToken ? { turnstileToken: tsToken } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.sessionId) {
          freshSessionId = data.sessionId;
          setSessionId(data.sessionId);
          if (!testMode) localStorage.setItem(SESSION_KEY, data.sessionId);
        }
      }
    } catch { /* non-fatal — the UI proceeds either way */ }
    setPersonaBusy(false);
    // Brief 241: no kickoff LLM call. The canned opener is already on
    // screen and the /persona interview-start action has seeded the same
    // opener into server session history (when this is a fresh interview
    // with this persona). The next LLM turn fires only when the visitor
    // sends their first real reply.

    // Fire-and-forget cache priming: while the visitor reads the opener
    // and types their first reply, kick a server-side LLM probe that
    // populates Anthropic's prompt cache with the static prefix the real
    // first-reply call will reuse. Cuts ~1.5–2s off the user-visible
    // latency on the first /stream turn. Only fires for fresh interviews
    // (no resumed transcript) — that's the only path where the cache miss
    // hurts the most.
    const primeSessionId = freshSessionId ?? sessionId;
    if (isFreshInterview && primeSessionId) {
      fetch("/api/v1/network/chat/prime-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: primeSessionId }),
        keepalive: true,
      }).catch(() => { /* priming is best-effort */ });
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
        "[PERSONA_COMMITTED] The visitor just chose you over the other Greeter. Warmly acknowledge it in one sentence in your own voice, then continue gathering: ask one specific follow-up question about their business or what they're trying to do.",
        { personaId, promptMode: "main", silentUserMessage: true },
      );
    }, 50);
  }

  // ============================================================
  // Chat API — single function, LLM controls the flow
  // ============================================================

  interface SendMessageOptions {
    personaId?: PersonaId;
    promptMode?: "interview" | "main";
    /** Don't render the user message bubble — used for synthetic kickoff prompts
     *  (e.g. [PERSONA_COMMITTED]). The server still sees it. */
    silentUserMessage?: boolean;
    /** Override the sessionId from state — used to send a turn against a fresh
     *  session id without waiting for React to flush setSessionId. */
    overrideSessionId?: string | null;
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
      const effectiveSessionId =
        opts.overrideSessionId !== undefined ? opts.overrideSessionId : sessionId;
      // Only consume a fresh Turnstile token if there's no session yet —
      // /stream skips bot verification when a trusted sessionId is presented,
      // so consuming the token (which forces a widget re-verify) on every
      // chat turn is wasted cost and was making sends feel slow.
      const token = effectiveSessionId ? null : getTurnstileToken();
      const res = await fetch("/api/v1/network/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId: effectiveSessionId,
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
                // Truthy-only merge: the LLM occasionally emits nulls for
                // fields it didn't capture this turn. A naive spread would
                // wipe prior non-null values — the "appears then disappears"
                // flicker the user saw.
                setLearned((prev) => {
                  const out: Record<string, string | null> = { ...(prev ?? {}) };
                  for (const [k, v] of Object.entries(event.learned as Record<string, string | null>)) {
                    if (v != null && v !== "") out[k] = v;
                  }
                  return out;
                });
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
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      {/* Phase-aware bottom-anchored hero. Landing shows the morning
          workspace floor; picker + conversation phases share a soft pastel
          sky (atmosphere) anchored to the bottom of the viewport so the
          chat composer sits gorgeously on top of it. The image is
          decorative-only and sits at z-0 behind chrome. */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700 ease-in-out"
        style={{ opacity: phase === "preamble" ? 1 : 0 }}
      >
        <HeroBackdrop
          variant="workspace"
          anchor="bottom"
          height={420}
          intensity={0.32}
          priority
        />
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700 ease-in-out"
        style={{ opacity: phase === "preamble" ? 0 : 1 }}
      >
        <HeroBackdrop
          variant="atmosphere"
          anchor="bottom"
          height={560}
          intensity={phase === "picker" ? 0.6 : 0.5}
          priority
        />
      </div>
      {/* Turnstile invisible widget container */}
      <div ref={turnstileRef} style={{ display: "none" }} />
      {/* Minimal nav */}
      <nav className="relative z-20 shrink-0 flex items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="text-xl font-bold tracking-tight text-text-primary">
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
          {showIntro && (
            <button
              type="button"
              onClick={openPersonaPicker}
              className="hidden rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover md:inline-flex"
            >
              Get your Ditto
            </button>
          )}
        </div>
      </nav>

      {/* Three-column conversation layout; the landing hero temporarily uses
          the full width so the wedge can sit beside the positioning copy. */}
      <main className={`relative z-10 flex min-h-0 flex-1 px-4 md:px-0 ${showIntro ? "overflow-y-auto scrollbar-hidden" : ""}`}>
        {/* Left spacer — blank on desktop */}
        <div className={showIntro ? "hidden" : "hidden md:block md:w-1/4"} />

        {/* Center chat column — 50% on desktop, full width on mobile.
            md:pt-8 keeps a small breathing gap below the top nav while
            reclaiming screen real estate for the conversation. The right
            rail's pt-8 mirrors this so they stay aligned. */}
        <div className={showIntro
          ? "mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 flex-col py-3 md:px-8 md:py-6"
          : "flex min-h-0 w-full flex-1 flex-col py-4 md:w-1/2 md:flex-none md:py-0 md:pt-8"
        }>
          {/* Brief 253: First-time visitor staged preamble — verbatim cadence
              from commit 1b6b63e. Cursor+dots → 3 fade-in lines → fade →
              Tripoli v2 hero. Subtle Skip control bottom-right escapes early. */}
          {showIntro && firstTime && preamble < 5 && (
            <div className="relative flex min-h-0 flex-1 flex-col justify-center py-2">
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
              <button
                type="button"
                onClick={handleSkipPreamble}
                className="absolute bottom-4 right-4 text-xs font-medium text-text-muted/70 transition-colors hover:text-text-primary md:bottom-6 md:right-6 md:text-sm"
              >
                Skip →
              </button>
            </div>
          )}

          {/* Intro phase — static hero + wedge demo (Tripoli v2). Shown for
              returning visitors immediately and for first-timers after the
              staged preamble completes. */}
          {showIntro && (!firstTime || preamble >= 5) && (
            <div id="get-started" className="flex min-h-0 flex-1 flex-col justify-center py-2">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(380px,1fr)] lg:items-center lg:gap-10">
                <header className="order-1 space-y-5 animate-fade-in-slow">
                  <h1 className="max-w-[34rem] text-4xl font-bold leading-none text-text-primary md:text-[3.4rem]">
                    AI that works for business people.
                    <br />
                    <span>Not the other way around.</span>
                  </h1>
                  <p className="max-w-[34rem] text-base leading-relaxed text-text-secondary md:text-lg">
                    Tell Ditto what you need off your plate. It runs the work,
                    learns from your corrections, and shows you everything before
                    it goes out. No prompts. No setup. No checking the same
                    things twice.
                  </p>
                </header>

                <div className="order-2 min-w-0 animate-fade-in-slow lg:row-span-2">
                  <Wedge
                    persona={personaId}
                    autoStart={autoStartWedge}
                    onComplete={openPersonaPicker}
                  />
                </div>

                <div className="order-3 space-y-5 animate-fade-in-slow lg:col-start-1">
                  <button
                    type="button"
                    onClick={openPersonaPicker}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover active:translate-y-px sm:w-auto"
                  >
                    Get your Ditto
                    <ArrowRight size={16} />
                  </button>

                  <div className="grid gap-2 text-sm font-medium text-text-muted sm:grid-cols-3 lg:max-w-[34rem]">
                    <p>Earns your trust, doesn&apos;t ask for it</p>
                    <p>You see everything before it ships</p>
                    <p>Gets better every week</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Brief 152: Persona picker phase — replaces the old Alex-hardcoded intro. */}
          {phase === "picker" && (
            <PersonaPicker onSelect={(picked) => handlePersonaPicked(picked)} />
          )}

          {/* Conversation — flex column: scrollable messages + fixed input at bottom */}
          {(phase === "interview" || phase === "main") && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Brief 152: Interview strip — visible only during the pre-commit interview.
                  Tells the visitor who they're with and gives Pick / Switch actions. */}
              {phase === "interview" && (
                <div className="shrink-0 mb-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-3 py-2.5 md:px-4 md:py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PersonaPortrait personaId={personaId} size="sm" />
                    <div className="min-w-0">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">You&apos;re with</p>
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {personaMeta.name} <span className="font-normal text-text-muted">· {personaMeta.tagline.split(".")[0].toLowerCase()}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSwitchPersona}
                      disabled={personaBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface hover:text-text-primary disabled:opacity-40 md:text-sm"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Try {otherMeta.name}
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitPersona}
                      disabled={personaBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40 md:text-sm"
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
                  <div className="mt-6 animate-fade-in rounded-xl border border-border bg-surface p-6">
                    <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
                      What happens next
                    </p>
                    <div className="space-y-4">
                      {[
                        "Alex follows up by email \u2014 within the hour",
                        "You meet your Ditto in your workspace",
                        "Your Ditto runs your first process; you approve it from your phone",
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-subtle-lavender text-xs font-semibold text-deep-indigo">
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
                <div className="shrink-0 bg-surface pb-4 pt-3">
                  <form onSubmit={handleNameSubmit} className="rounded-2xl border border-border bg-surface/80 backdrop-blur-sm p-4 space-y-3">
                    <div className="flex gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        required
                        placeholder="First name is fine"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleNameSubmit(e); } }}
                        className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-text-primary/10"
                      />
                      <button
                        type="submit"
                        disabled={!name.trim()}
                        aria-label="Submit name"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        Go <ArrowRight size={16} />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Location collection card */}
              {showInput && !requestName && requestLocation && !requestEmail && (
                <div className="shrink-0 bg-surface pb-4 pt-3">
                  <form onSubmit={handleLocationSubmit} className="rounded-2xl border border-border bg-surface/80 backdrop-blur-sm p-4 space-y-3">
                    <div className="flex gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        required
                        placeholder="City, country"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLocationSubmit(e); } }}
                        className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-text-primary/10"
                      />
                      <button
                        type="submit"
                        disabled={!location.trim()}
                        aria-label="Submit location"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        Go <ArrowRight size={16} />
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Extra questions card — structured input for multi-question responses */}
              {showInput && !requestName && !requestLocation && !requestEmail && extraQuestions.length > 0 && (
                <div className="shrink-0 bg-surface pb-4 pt-3">
                  <form onSubmit={handleExtraQuestionsSubmit} className="rounded-2xl border border-border bg-surface/80 backdrop-blur-sm p-4 space-y-4">
                    {extraQuestions.map((q, i) => (
                      <div key={i} className="space-y-1.5">
                        <label className="text-sm font-medium text-text-primary">{q}</label>
                        <input
                          type="text"
                          value={questionAnswers[i] || ""}
                          onChange={(e) => setQuestionAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                          placeholder="Your answer"
                          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-text-primary/10"
                        />
                      </div>
                    ))}
                    <button
                      type="submit"
                      disabled={!Object.values(questionAnswers).some((v) => v?.trim())}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
                    >
                      Send <ArrowRight size={16} />
                    </button>
                  </form>
                </div>
              )}

              {/* Input area — always visible so the user can always talk to Alex.
                  No opaque white background here — the pastel atmosphere
                  backdrop is allowed to bleed through behind the composer
                  pill so the input "sits gorgeously on top of" the gradient. */}
              {showInput && (
                <div className="shrink-0 pb-2 pt-2 md:pb-4 md:pt-3 space-y-2 md:space-y-3">
                  {/* Pasted text attachment chip */}
                  {pastedText && (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/85 backdrop-blur-md px-4 py-2.5">
                      <FileText size={16} strokeWidth={1.6} className="shrink-0 text-text-secondary" />
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
                    <div className="shrink-0 pb-1 pt-2 md:pb-2 md:pt-3">
                      <div className={`rounded-xl md:rounded-2xl border px-3 py-2.5 md:p-4 flex items-center justify-between shadow-[0_8px_24px_-12px_rgba(17,17,17,0.18)] ${
                        callActive
                          ? "border-text-primary/30 bg-surface/90 backdrop-blur-md"
                          : "border-border bg-surface/85 backdrop-blur-md"
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
                      className={`w-full resize-none rounded-xl md:rounded-2xl border bg-surface/90 backdrop-blur-md pl-4 pr-11 py-2.5 md:pl-5 md:pr-14 md:py-3.5 text-sm md:text-[16px] text-text-primary placeholder:text-text-muted shadow-[0_10px_28px_-12px_rgba(17,17,17,0.22)] focus:border-text-primary/40 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-text-primary/10 disabled:opacity-50 transition-colors ${
                        callActive ? "border-text-primary/20" : "border-border"
                      }`}
                      style={{ maxHeight: "8rem" }}
                    />
                    <button
                      type="submit"
                      disabled={(!input.trim() && !pastedText) || loading || !!statusMessage}
                      aria-label="Send message"
                      className="absolute right-2.5 bottom-2 md:right-3 md:bottom-auto md:top-1/2 md:-translate-y-1/2 inline-flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
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
                <div className="shrink-0 bg-surface pb-4 pt-3">
                  {verifyStep === "email" && (
                    <form onSubmit={handleEmailVerify} className="rounded-2xl border border-border bg-surface/80 backdrop-blur-sm p-4 space-y-3">
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="email"
                          required
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-text-primary/10"
                        />
                        <button
                          type="submit"
                          disabled={!email.trim()}
                          aria-label="Send verification code"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
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
                    <form onSubmit={handleCodeSubmit} className="rounded-2xl border border-border bg-surface/80 backdrop-blur-sm p-4 space-y-3">
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
                          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-center text-lg font-semibold tracking-[0.3em] text-text-primary placeholder:text-text-muted placeholder:tracking-normal placeholder:text-sm placeholder:font-normal focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-text-primary/10"
                        />
                        <button
                          type="submit"
                          disabled={verifyCode.length !== 6}
                          aria-label="Confirm code"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
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
                          className="text-xs font-medium text-text-primary underline-offset-4 hover:underline"
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
                <form onSubmit={handleErrorEmailSubmit} className="shrink-0 space-y-3 bg-surface pb-4 pt-3">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoFocus
                      className="flex-1 rounded-2xl border border-border bg-surface px-5 py-3 text-[16px] text-text-primary placeholder:text-text-muted focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-text-primary/10"
                    />
                    <button
                      type="submit"
                      aria-label="Submit email"
                      className="inline-flex items-center gap-1 rounded-lg bg-accent px-5 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
                    >
                      Go <ArrowRight size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Your name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-2xl border border-border bg-surface px-5 py-2.5 text-[16px] text-text-primary placeholder:text-text-muted focus:border-text-primary/40 focus:outline-none focus:ring-2 focus:ring-text-primary/10"
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
        <div className={showIntro ? "hidden" : "hidden self-stretch md:block md:w-1/4"}>
          <div className="sticky top-0 space-y-4 pt-8 pl-10 pr-4 lg:pl-14 xl:pl-16">
            {learned && !showIntro && (
              <LearnedContext learned={learned} />
            )}
          </div>
        </div>
      </main>

      {/* Minimal footer — visible on intro + picker (the brand-presenting
          phases). Hidden once the visitor enters the conversation so the
          chat surface gets full vertical room. The bar floats on a
          frosted-glass backdrop so it stays legible over the bottom-
          anchored hero image without drowning it. */}
      <footer className={`relative z-10 flex items-center justify-between border-t border-border/60 bg-background/85 backdrop-blur-md px-6 py-4 text-xs text-text-secondary md:px-10 ${(showIntro || phase === "picker") ? "" : "hidden"}`}>
        <span className="font-medium text-text-primary">&copy; {new Date().getFullYear()} Ditto</span>
        <div className="flex gap-5">
          <Link href="/network" className="hover:text-text-primary transition-colors">
            Network
          </Link>
          <Link href="/your-ditto" className="hover:text-text-primary transition-colors">
            Your Ditto
          </Link>
          <Link href="/about" className="hover:text-text-primary transition-colors">
            About
          </Link>
          <Link href="/admin" className="hover:text-text-primary transition-colors">
            Admin
          </Link>
        </div>
      </footer>
    </div>
    </ConversationProvider>
  );
}
