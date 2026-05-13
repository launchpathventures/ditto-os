"use client";

import { useEffect, useRef, useState } from "react";
import { AudioWaveform, Loader2, Mic, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function VoiceMode({
  greeterName,
  userFirst,
  active,
  disabled,
  onToggle,
  onTranscript,
}: {
  greeterName: string;
  userFirst: string;
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onTranscript: (text: string) => void | Promise<void>;
}) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (active) return;
    recognitionRef.current?.stop();
    setListening(false);
  }, [active]);

  function startListening() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("Voice input is not supported in this browser.");
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        parts.push(event.results[index]?.[0]?.transcript ?? "");
      }
      const text = parts.join(" ").trim();
      if (text) setTranscript(text);
    };
    recognition.onerror = () => {
      setError("Voice input stopped. You can type the note below.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function submitTranscript() {
    const text = transcript.trim();
    if (!text || disabled || sending) return;
    setSending(true);
    setError(null);
    stopListening();
    try {
      await onTranscript(text);
      setTranscript("");
    } catch {
      setError("Couldn't send that voice note.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] bg-[#111111] p-4 text-white shadow-large transition",
        active ? "opacity-100" : "opacity-95",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/55">
            Voice
          </p>
          <p className="mt-1 text-base font-semibold">
            {greeterName} · representing {userFirst}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-white/10 text-white transition hover:bg-white/15"
          aria-label={active ? "Close voice mode" : `Talk to ${greeterName}`}
        >
          {active ? <X className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-5 flex h-20 items-center gap-1.5 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 32 }).map((_, index) => (
          <span
            key={index}
            className={cn(
              "w-1 rounded-full bg-white/70",
              listening && "animate-pulse",
            )}
            style={{
              height: `${18 + ((index * 17) % 48)}px`,
              animationDelay: `${index * 40}ms`,
            }}
          />
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <AudioWaveform className="h-4 w-4" aria-hidden="true" />
          <span>
            {listening
              ? `${greeterName} is listening.`
              : supported
                ? `Talk to ${greeterName} by voice.`
                : "Type or paste a voice note."}
          </span>
        </div>
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          placeholder={`Say or type what you want ${greeterName} to know.`}
          className="min-h-20 w-full resize-none rounded-[var(--radius-md)] border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/45 focus:border-white/40"
        />
        {error && <p className="text-xs text-white/60">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={!supported || disabled || sending}
            onClick={listening ? stopListening : startListening}
            className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] bg-white/10 px-3 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-45"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            {listening ? "Stop" : "Record"}
          </button>
          <button
            type="button"
            disabled={!transcript.trim() || disabled || sending}
            onClick={submitTranscript}
            className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] bg-white px-3 text-sm font-semibold text-[#111111] transition hover:bg-white/90 disabled:opacity-45"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
