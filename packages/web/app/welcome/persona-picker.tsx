"use client";

/**
 * PersonaPicker — Brief 152 persona selection screen.
 *
 * Two cards side by side (Alex, Mira). Each card streams a self-introduction
 * from the backend in parallel. The visitor taps a card to enter that persona's
 * interview stage; the parent handles the actual state transition.
 *
 * The intro stream uses the existing `/api/v1/network/chat/stream` endpoint
 * with `promptMode: "intro"`. The server gates intro mode so the LLM only
 * produces a greeting (no name/email asks, no tool flags).
 */

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Mic } from "lucide-react";
import { PersonaPortrait } from "./persona-portrait";
import { PERSONAS, type PersonaId, PERSONA_IDS } from "@/lib/persona";

interface PersonaPickerProps {
  sessionId: string | null;
  onSessionId: (id: string) => void;
  onSelect: (personaId: PersonaId) => void;
  turnstileToken: string | null;
}

interface CardStreamState {
  text: string;
  status: "idle" | "streaming" | "complete" | "error";
}

export function PersonaPicker({ sessionId, onSessionId, onSelect, turnstileToken }: PersonaPickerProps) {
  const [streams, setStreams] = useState<Record<PersonaId, CardStreamState>>({
    alex: { text: "", status: "idle" },
    mira: { text: "", status: "idle" },
  });
  // Guard against double-fire in React 18 strict mode development.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Both personas share ONE session (the picker is session-scoped — the eventual
    // `commit` call resolves which persona to lock in on this session).
    // To avoid racing two parallel session-creations, we fire Alex first; the
    // Mira stream kicks off as soon as Alex's stream yields a session id.
    (async () => {
      const id = await streamIntro("alex", sessionId);
      if (id) {
        void streamIntro("mira", id);
      } else {
        // Fallback: Alex failed to return a session. Start Mira with whatever we had.
        void streamIntro("mira", sessionId);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Stream an intro for the given persona. Returns the sessionId observed on the
   * stream (null if none surfaced). Safe to call concurrently for different personas
   * once a sessionId is known.
   */
  async function streamIntro(personaId: PersonaId, currentSessionId: string | null): Promise<string | null> {
    setStreams((prev) => ({ ...prev, [personaId]: { text: "", status: "streaming" } }));
    let observedSessionId: string | null = currentSessionId;
    try {
      const res = await fetch("/api/v1/network/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Intro mode uses a synthetic user prompt on the server; we pass
          // an empty string to signal the route should generate its own.
          message: "",
          sessionId: currentSessionId,
          context: "front-door",
          personaId,
          promptMode: "intro",
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        setStreams((prev) => ({ ...prev, [personaId]: { text: prev[personaId].text, status: "error" } }));
        return observedSessionId;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          if (!json) continue;
          try {
            const event = JSON.parse(json);
            if (event.type === "session" && event.sessionId) {
              observedSessionId = event.sessionId;
              onSessionId(event.sessionId);
            }
            if (event.type === "text-delta" && event.text) {
              setStreams((prev) => ({
                ...prev,
                [personaId]: { text: prev[personaId].text + event.text, status: "streaming" },
              }));
            }
            if (event.type === "done") {
              setStreams((prev) => ({
                ...prev,
                [personaId]: { text: prev[personaId].text, status: "complete" },
              }));
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      setStreams((prev) => ({
        ...prev,
        [personaId]: { text: prev[personaId].text, status: "error" },
      }));
    }
    return observedSessionId;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hidden">
      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:py-10">
        <header className="space-y-2 text-center animate-fade-in-slow">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
            Say hello
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
            Two advisors. Pick whoever fits.
          </h1>
          <p className="mx-auto max-w-xl text-base text-text-secondary md:text-[17px]">
            Try a short chat with either one — text or voice. When you&apos;re ready, pick the one you click with.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {PERSONA_IDS.map((personaId) => (
            <PersonaCard
              key={personaId}
              personaId={personaId}
              stream={streams[personaId]}
              onSelect={() => onSelect(personaId)}
            />
          ))}
        </div>

        <p className="text-center text-xs text-text-muted">
          You can switch between them at any time before committing.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// PersonaCard
// ============================================================

function PersonaCard({
  personaId,
  stream,
  onSelect,
}: {
  personaId: PersonaId;
  stream: CardStreamState;
  onSelect: () => void;
}) {
  const meta = PERSONAS[personaId];
  const isStreaming = stream.status === "streaming";
  const hasStarted = stream.text.length > 0;
  const ready = stream.status === "complete";

  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border-2 border-border bg-white p-5 shadow-sm transition-all hover:border-vivid/40 hover:shadow-md md:p-6">
      <div className="flex items-start gap-4">
        <PersonaPortrait personaId={personaId} size="lg" />
        <div className="flex-1 space-y-1">
          <p className="text-lg font-bold text-text-primary md:text-xl">{meta.name}</p>
          <p className="text-sm text-text-muted">{meta.tagline}</p>
          <p className="text-xs text-text-muted/80">{meta.accent}</p>
        </div>
      </div>

      <div className="mt-5 min-h-[5.5rem] text-[15px] leading-relaxed text-text-primary md:text-base">
        {hasStarted ? (
          <p className="whitespace-pre-wrap">
            {stream.text}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-cursor-blink bg-text-primary" />
            )}
          </p>
        ) : (
          <SkeletonLines />
        )}
        {stream.status === "error" && !hasStarted && (
          <p className="text-sm text-text-muted">
            Couldn&apos;t load {meta.name}&apos;s intro — give it a click anyway, we&apos;ll catch up in the chat.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          {ready ? "Tap to start chatting" : isStreaming ? "Writing…" : ""}
        </p>
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex items-center gap-2 rounded-full bg-vivid px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent-hover hover:shadow-md active:scale-95"
        >
          <Mic className="h-3.5 w-3.5 opacity-80" />
          Try {meta.name}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="space-y-2.5 opacity-60">
      <div className="h-3.5 w-[90%] animate-pulse rounded-full bg-border/60" />
      <div className="h-3.5 w-[75%] animate-pulse rounded-full bg-border/60" />
      <div className="h-3.5 w-[60%] animate-pulse rounded-full bg-border/60" />
    </div>
  );
}
