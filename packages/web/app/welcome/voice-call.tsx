"use client";

/**
 * Voice Call Component — ElevenLabs Conversational AI (Brief 142b)
 *
 * Uses the ElevenLabs React SDK for sub-second voice conversations.
 * Server tools handle our harness intelligence; ElevenLabs handles voice.
 *
 * Provenance: @elevenlabs/react (depend level), Brief 142b
 */

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react";
import { useConversation } from "@elevenlabs/react";

// ============================================================
// Types
// ============================================================

interface VoiceCallProps {
  sessionId: string;
  voiceToken: string;
  learned?: Record<string, string | null> | null;
  visitorName?: string;
  recentMessages?: Array<{ role: string; text: string }>;
  /** Brief 152: controls the button label ("Talk to Alex" / "Talk to Mira"). */
  personaName?: string;
  onCallStart?: () => void;
  onCallEnd?: () => void;
  onCallError?: (error: string) => void;
  onMessage?: (role: "user" | "alex", text: string) => void;
}

export interface VoiceCallHandle {
  sendUserMessage: (text: string) => void;
  sendContextualUpdate: (text: string) => void;
  /**
   * Trigger a guidance fetch from outside the component (Brief 180).
   * Used by the safety-net poll so it goes through the same push path
   * as user-final/agent-turn-end triggers (ETag-aware, dedup-aware).
   */
  refreshGuidance: (trigger?: "poll") => void;
  /** Current call lifecycle state, for polling guards. */
  getCallState: () => "idle" | "connecting" | "active" | "ended";
}

// ============================================================
// Helpers
// ============================================================

function buildSessionContext(
  learned: Record<string, string | null> | null | undefined,
  visitorName?: string,
  recentMessages?: Array<{ role: string; text: string }>,
): string {
  const name = learned?.name || visitorName || "unknown";
  const parts = [`Visitor: ${name}`];
  if (learned?.business) parts.push(`Business: ${learned.business}`);
  if (learned?.target) parts.push(`Target: ${learned.target}`);
  if (learned?.problem) parts.push(`Problem: ${learned.problem}`);
  if (learned?.location) parts.push(`Location: ${learned.location}`);
  if (learned?.industry) parts.push(`Industry: ${learned.industry}`);

  // Include recent conversation so the voice agent knows the context
  if (recentMessages && recentMessages.length > 0) {
    const transcript = recentMessages
      .slice(-6)
      .map((m) => `${m.role === "user" ? "VISITOR" : "ALEX"}: ${m.text}`)
      .join("\n");
    parts.push(`\nRecent conversation:\n${transcript}`);
  }

  // The harness will push specific guidance via SYSTEM INSTRUCTION.
  // Here we just provide context — no hardcoded next steps.
  parts.push("The system will send you SYSTEM INSTRUCTION messages telling you what to do next. Follow them.");

  return parts.join(". ");
}

// ============================================================
// Component
// ============================================================

export const VoiceCall = forwardRef<VoiceCallHandle, VoiceCallProps>(function VoiceCall({
  sessionId,
  voiceToken,
  learned,
  visitorName,
  recentMessages,
  personaName,
  onCallStart,
  onCallEnd,
  onCallError,
  onMessage,
}, ref) {
  const [callState, setCallState] = useState<"idle" | "connecting" | "active" | "ended">("idle");
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authRef = useRef<{ signedUrl?: string; agentId?: string } | null>(null);
  const messageCountRef = useRef(0); // Track messages to skip first greeting

  // Harness guidance cache — populated eagerly on user speech, consumed by client tool
  const pendingGuidanceRef = useRef<{ guidance: string; stage: string } | null>(null);
  const guidanceAbortRef = useRef<AbortController | null>(null); // Cancel in-flight guidance fetches
  // Track the last guidance string we actually pushed to the agent. Multiple
  // triggers (user_final, agent_turn_end, poll, ElevenLabs tool calls) can fan
  // out into parallel /voice/guidance requests that all return the same text.
  // Without this, each caller fires its own sendContextualUpdate and the agent
  // re-delivers the same line that many times.
  const lastPushedGuidanceRef = useRef<string | null>(null);
  const lastPushedAtRef = useRef<number>(0);
  // Brief 180 AC 4 + 15: remember the most recent ETag so polling + push can
  // ask the server "changed?" with If-None-Match and skip work on 304.
  const lastGuidanceEtagRef = useRef<string | null>(null);

  // Transcript persistence buffer — debounced batch sends (Brief 150 AC 1)
  const transcriptBufferRef = useRef<Array<{ role: "user" | "alex"; text: string }>>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false); // Guard against double-flush

  const flushTranscript = useCallback(() => {
    const turns = transcriptBufferRef.current;
    if (turns.length === 0 || flushingRef.current) return;
    flushingRef.current = true;
    transcriptBufferRef.current = [];
    fetch("/api/v1/voice/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, voiceToken, turns }),
    })
      .catch((err) => console.warn("[voice-call] Transcript flush failed:", err))
      .finally(() => { flushingRef.current = false; });
  }, [sessionId, voiceToken]);

  const bufferTranscriptTurn = useCallback((role: "user" | "alex", text: string) => {
    transcriptBufferRef.current.push({ role, text });
    // Debounce: flush after 3 seconds of quiet, or immediately if buffer is large
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    if (transcriptBufferRef.current.length >= 6) {
      flushTranscript();
    } else {
      flushTimerRef.current = setTimeout(flushTranscript, 3000);
    }
  }, [flushTranscript]);

  // Brief 180 AC 19-21: emit client-side telemetry events so push/pull behaviour
  // is observable server-side. Best-effort — failures must not break the call.
  const emitTelemetry = useCallback((event: string, metadata?: Record<string, unknown>) => {
    try {
      fetch("/api/v1/voice/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, voiceToken, event, metadata }),
        keepalive: true,
      }).catch(() => { /* non-fatal */ });
    } catch { /* non-fatal */ }
  }, [sessionId, voiceToken]);

  // Refs used by both useConversation callbacks below and triggerGuidanceFetch.
  // Declared up-front so the reading flow is top-down.
  const prevModeRef = useRef<string>("");
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(null);

  const triggerGuidanceFetch = useCallback((trigger: "user_final" | "agent_turn_end" | "poll") => {
    guidanceAbortRef.current?.abort();
    const controller = new AbortController();
    guidanceAbortRef.current = controller;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (lastGuidanceEtagRef.current) headers["If-None-Match"] = lastGuidanceEtagRef.current;

    fetch("/api/v1/voice/guidance", {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, voiceToken }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 304) {
          // Server-side records push_304 in guidance/route.ts — don't double-log.
          return null;
        }
        if (!res.ok) return null;
        const etag = res.headers.get("etag");
        if (etag) lastGuidanceEtagRef.current = etag;
        const data = await res.json();
        return data;
      })
      .then((data) => {
        if (!data?.guidance) return;
        // Dedup: if this guidance is textually identical to what we just
        // pushed, skip. The server-level runOrJoin dedups the LLM call but
        // still returns the same guidance to every concurrent caller; that's
        // how the agent ended up hearing "ask for name" 4x in a row.
        if (data.guidance === lastPushedGuidanceRef.current) {
          emitTelemetry("push_deduped", { trigger, stage: data.stage });
          return;
        }
        // Throttle: low-priority triggers (agent_turn_end, poll) that fire
        // within 1.5s of a recent push get dropped. user_final always wins —
        // a new user utterance is real state movement and must push.
        // Without this, agent_turn_end (which fires right after the agent
        // finishes speaking) keeps pushing near-identical-but-not-identical
        // LLM-generated guidance, making the agent rephrase / re-ask.
        const now = Date.now();
        const MIN_PUSH_INTERVAL_MS = 1500;
        if (trigger !== "user_final" && now - lastPushedAtRef.current < MIN_PUSH_INTERVAL_MS) {
          emitTelemetry("push_deduped", { trigger, stage: data.stage, throttled: true });
          return;
        }
        lastPushedGuidanceRef.current = data.guidance;
        lastPushedAtRef.current = now;
        pendingGuidanceRef.current = data;
        conversationRef.current?.sendContextualUpdate(`SYSTEM INSTRUCTION: ${data.guidance}`);
        emitTelemetry("push_fired", {
          trigger,
          stage: data.stage,
          validateRewrote: !!data.validateRewrote,
        });
        console.log(`[voice-call] Pushed guidance (${trigger}): ${data.guidance.slice(0, 80)}...`);
      })
      .catch(() => { /* aborted or network error */ });
  }, [sessionId, voiceToken, emitTelemetry]);

  const conversation = useConversation({
    onConnect: () => {
      setCallState("active");
      emitTelemetry("session_start", { persona: personaName || "alex" });
      onCallStart?.();
    },
    onDisconnect: (details: unknown) => {
      console.log("[voice-call] Disconnected:", JSON.stringify(details));
      setCallState("ended");
      if (timerRef.current) clearInterval(timerRef.current);
      // Flush any remaining transcript before notifying server
      flushTranscript();
      authRef.current = null; // Clear cached signed URL (may have TTL)
      onCallEnd?.();
      // Notify server
      fetch("/api/v1/voice/call-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, voiceToken }),
      }).catch(() => {});
    },
    onError: (error: unknown) => {
      console.warn("[voice-call] ElevenLabs error:", error);
      setCallState("ended");
      if (timerRef.current) clearInterval(timerRef.current);
      // Flush partial transcript even on error (Brief 150: partial > none)
      flushTranscript();
      onCallError?.("Call connection failed. Let's keep chatting here.");
    },
    onMessage: (event: { source: string; message: string }) => {
      if (event.message) {
        messageCountRef.current += 1;
        // Skip the first agent message (greeting — user already heard it)
        if (messageCountRef.current === 1 && event.source !== "user") return;
        const role = event.source === "user" ? "user" : "alex";
        onMessage?.(role, event.message);
        // Buffer for transcript persistence (Brief 150 AC 1)
        bufferTranscriptTurn(role, event.message);

        // Brief 180 AC 1-3: on user-final, flush transcript and fire a fresh
        // guidance compute. Client throttle is removed — server-side dedup in
        // /voice/guidance deduplicates on transcript-hash. AbortController
        // cancels any in-flight fetch so only the latest pushes.
        if (event.source === "user") {
          if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
          flushTranscript();
          triggerGuidanceFetch("user_final");
        }
      }
    },
    // Brief 180 AC 2: when the agent finishes its turn (mode transitions from
    // speaking → listening), recompute guidance so the next user utterance
    // starts with fresh context rather than stale state.
    onModeChange: (evt: { mode: string } | string | unknown) => {
      const prev = prevModeRef.current;
      const mode = typeof evt === "string" ? evt : ((evt as { mode?: string })?.mode ?? "");
      prevModeRef.current = mode;
      if (prev === "speaking" && mode === "listening") {
        triggerGuidanceFetch("agent_turn_end");
      }
    },
  });

  // Keep the ref in sync with the live conversation handle so
  // triggerGuidanceFetch (declared above useConversation) can reach it.
  useEffect(() => { conversationRef.current = conversation; }, [conversation]);

  // Expose sendUserMessage and sendContextualUpdate to parent
  useImperativeHandle(ref, () => ({
    sendUserMessage: (text: string) => conversation.sendUserMessage(text),
    sendContextualUpdate: (text: string) => conversation.sendContextualUpdate(text),
    refreshGuidance: (trigger = "poll") => triggerGuidanceFetch(trigger),
    getCallState: () => callState,
  }), [conversation, callState, triggerGuidanceFetch]);

  // Cleanup: flush remaining transcript on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      // Final flush — use sendBeacon for reliability during unmount
      const turns = transcriptBufferRef.current;
      if (turns.length > 0) {
        transcriptBufferRef.current = [];
        const body = JSON.stringify({ sessionId, voiceToken, turns });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/v1/voice/transcript", new Blob([body], { type: "application/json" }));
        } else {
          fetch("/api/v1/voice/transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      }
    };
  }, [sessionId, voiceToken]);

  // Duration timer
  useEffect(() => {
    if (callState === "active") {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Reset to idle after call ends
  useEffect(() => {
    if (callState === "ended") {
      const timeout = setTimeout(() => setCallState("idle"), 1500);
      return () => clearTimeout(timeout);
    }
  }, [callState]);

  const handleStartCall = useCallback(async () => {
    setCallState("connecting");
    messageCountRef.current = 0;

    try {
      // Get auth + initial harness evaluation from server
      // The harness evaluates the conversation BEFORE the call starts
      const res = await fetch("/api/v1/voice/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, voiceToken }),
      });
      if (!res.ok) throw new Error("Auth failed");
      const auth = await res.json();
      authRef.current = auth;

      // Use harness evaluation for the initial context
      const harnessGuidance = auth.evaluation?.guidance || "";
      const sessionContext = buildSessionContext(learned, visitorName, recentMessages);

      // First message: the harness reply IS what Alex would say in text mode
      // Use it directly as the first voice message context
      let firstMessageContext: string;
      const bakedIntoFirstMessage = !!(harnessGuidance && harnessGuidance.length > 20);
      if (bakedIntoFirstMessage) {
        // The harness knows exactly what to say — use it
        firstMessageContext = `good to switch to voice. You can also type in the chat to add context. ${harnessGuidance}`;
      } else {
        firstMessageContext = `good to switch to voice. I've got the context from our chat. You can also type in the chat to add context while we talk.`;
      }

      // Include harness guidance in session context so the agent follows it from turn 1
      const fullContext = harnessGuidance
        ? `${sessionContext}\n\nSYSTEM INSTRUCTION: ${harnessGuidance}`
        : sessionContext;

      // Seed the guidance cache so the first get_context tool call returns
      // instantly. If the guidance was already baked into the spoken first
      // message, the agent must NOT re-deliver it — prime with a post-greeting
      // directive instead. Otherwise the agent speaks the opener, immediately
      // calls get_context, gets the same text back, and repeats itself.
      if (bakedIntoFirstMessage) {
        pendingGuidanceRef.current = {
          guidance:
            "You just delivered the opening — including any ask or question in it. Do NOT repeat it. Wait for the user's reply, then react with substance to what they said and ask ONE natural follow-up question.",
          stage: auth.evaluation?.stage || "gathering",
        };
      } else if (harnessGuidance) {
        pendingGuidanceRef.current = {
          guidance: harnessGuidance,
          stage: auth.evaluation?.stage || "gathering",
        };
      }

      const sessionConfig: Record<string, unknown> = {
        dynamicVariables: {
          session_context: fullContext,
          first_message_context: firstMessageContext,
          user_name: learned?.name || visitorName || "there",
          business: learned?.business || "",
          target: learned?.target || "",
          session_id: sessionId,
          voice_token: voiceToken,
        },
        // Client tool: get_context — synchronous guidance gate.
        // The ElevenLabs LLM calls this and BLOCKS until guidance returns.
        // Fast path: returns pre-computed guidance from pendingGuidanceRef (<10ms).
        // Slow path: fetches from /voice/guidance endpoint (rule-based ~500ms, LLM ~6s).
        clientTools: {
          get_context: async () => {
            emitTelemetry("get_context_called");
            // Fast path: return pre-computed guidance from cache
            if (pendingGuidanceRef.current) {
              const cached = pendingGuidanceRef.current;
              pendingGuidanceRef.current = null;
              emitTelemetry("get_context_cache_hit");
              console.log("[voice-call] get_context: returning cached guidance");
              return `SYSTEM INSTRUCTION: ${cached.guidance}`;
            }
            emitTelemetry("get_context_cache_miss");
            // Slow path: fetch synchronously (blocks agent until guidance arrives)
            try {
              const res = await fetch("/api/v1/voice/guidance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId, voiceToken }),
              });
              if (!res.ok) throw new Error("Guidance fetch failed");
              const etag = res.headers.get("etag");
              if (etag) lastGuidanceEtagRef.current = etag;
              const data = await res.json();
              console.log("[voice-call] get_context: fetched fresh guidance");
              return `SYSTEM INSTRUCTION: ${data.guidance}`;
            } catch {
              console.warn("[voice-call] get_context: fallback — no guidance available");
              return "SYSTEM INSTRUCTION: React with substance to what they said, then ask one natural follow-up question.";
            }
          },
        },
      };

      if (auth.signedUrl) {
        (sessionConfig as any).signedUrl = auth.signedUrl;
        (sessionConfig as any).connectionType = "websocket";
      } else if (auth.agentId) {
        (sessionConfig as any).agentId = auth.agentId;
      }

      console.log("[voice-call] Starting session with config:", JSON.stringify(sessionConfig).slice(0, 300));
      await conversation.startSession(sessionConfig as any);
      console.log("[voice-call] Session started, status:", conversation.status);
    } catch (err) {
      console.error("[voice-call] Failed to start:", err);
      setCallState("idle");
      onCallError?.("Couldn't start the call. Let's keep chatting here.");
    }
  }, [sessionId, voiceToken, learned, visitorName, recentMessages, conversation, onCallError]);

  const handleEndCall = useCallback(() => {
    conversation.endSession();
  }, [conversation]);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Idle: "Talk to Alex" CTA ──
  if (callState === "idle") {
    return (
      <button
        onClick={handleStartCall}
        className="flex items-center gap-2 rounded-full bg-vivid px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-vivid/90 hover:shadow-md active:scale-95"
      >
        <Phone className="h-4 w-4" />
        Talk to {personaName || "Alex"}
      </button>
    );
  }

  // ── Connecting ──
  if (callState === "connecting") {
    return (
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 animate-pulse rounded-full bg-vivid" />
        <span className="text-sm text-text-secondary">Connecting...</span>
      </div>
    );
  }

  // ── Active Call ──
  if (callState === "active") {
    return (
      <div className="flex items-center gap-3">
        <div className="relative flex h-6 w-6 items-center justify-center">
          <div
            className={`absolute inset-0 rounded-full bg-vivid/20 ${
              conversation.isSpeaking ? "animate-ping" : "animate-pulse"
            }`}
          />
          <div className="relative h-2 w-2 rounded-full bg-vivid" />
        </div>

        <span className="text-xs text-text-muted">{formatDuration(duration)}</span>

        <button
          onClick={() => conversation.setMuted(!conversation.isMuted)}
          className={`rounded-full p-1.5 transition-colors ${
            conversation.isMuted
              ? "bg-red-100 text-red-600 hover:bg-red-200"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
          title={conversation.isMuted ? "Unmute" : "Mute"}
        >
          {conversation.isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        </button>

        <button
          onClick={handleEndCall}
          className="rounded-full bg-red-500 p-1.5 text-white transition-colors hover:bg-red-600"
          title="End call"
        >
          <PhoneOff className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Ended ──
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <Phone className="h-4 w-4" />
      Call ended
    </div>
  );
});
