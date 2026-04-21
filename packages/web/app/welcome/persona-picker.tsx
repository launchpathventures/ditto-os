"use client";

/**
 * PersonaPicker — Brief 152 persona selection screen.
 *
 * Two cards side by side (Alex, Mira). Each card reveals a canned
 * self-introduction with a simulated typewriter effect so both sides feel
 * alive instantly (no backend round-trip). The visitor taps a card to enter
 * that persona's interview stage; the parent handles the state transition.
 *
 * Intros are matched in length so the two cards stay visually balanced while
 * typing and settle at the same final height.
 */

import { useEffect, useState } from "react";
import { ArrowRight, Mic } from "lucide-react";
import { PersonaPortrait } from "./persona-portrait";
import { PERSONAS, type PersonaId, PERSONA_IDS } from "@/lib/persona";

interface PersonaPickerProps {
  onSelect: (personaId: PersonaId) => void;
}

interface CardStreamState {
  text: string;
  status: "idle" | "streaming" | "complete";
}

// Both strings are the same character length so the two cards grow in lockstep
// and settle at the same final height. If you edit one, re-balance the other.
// Positioning: capability-led, no title, real-advisor posture. The opener
// hints at the two pathways — door-opening (connector) and staying on to run
// the AI work (embedded sales/marketing/CoS). Don't name "Ditto" here — the
// product is in the chrome around this card.
const INTROS: Record<PersonaId, string> = {
  alex:
    "G'day, I'm Alex. I open doors — the right clients, the right partners, the right conversations. If it suits you, I stay on and run the AI side so your business actually gets the outcome. Say something — see if we click.",
  mira:
    "Hello, I'm Mira. I cut through the noise — sharper strategy, better openings, an angle most people miss. If it suits you, I stay on and run the AI side so your business gets the outcome. Say something — see if we click.",
};

// Simulated stream pacing. ~130 chars/sec — fast enough to finish the whole
// intro in well under two seconds, slow enough to still feel like typing.
const TYPE_INTERVAL_MS = 15;
const CHARS_PER_TICK = 2;
// Pre-seed the first N chars of each intro into the initial state so the
// greeting is on screen the instant the cards paint — no skeleton flash,
// no wait-for-first-timer-tick delay. 16 chars covers "G'day, I'm Alex." and
// "Hello, I'm Mira." so the visitor immediately sees who they're meeting.
const INITIAL_SEED_CHARS = 16;

export function PersonaPicker({ onSelect }: PersonaPickerProps) {
  const [streams, setStreams] = useState<Record<PersonaId, CardStreamState>>(() => {
    // Lazy initializer so the seed is computed once, before the first paint.
    const out: Record<PersonaId, CardStreamState> = {
      alex: { text: "", status: "streaming" },
      mira: { text: "", status: "streaming" },
    };
    for (const personaId of PERSONA_IDS) {
      const full = INTROS[personaId];
      out[personaId] = {
        text: full.slice(0, Math.min(INITIAL_SEED_CHARS, full.length)),
        status: "streaming",
      };
    }
    return out;
  });
  useEffect(() => {
    // In React strict mode this effect runs twice; each pass starts fresh
    // timers and cleans up its own. Safe because the typewriter is idempotent —
    // each pass resumes from the seeded starting point.
    const timers: ReturnType<typeof setInterval>[] = [];
    for (const personaId of PERSONA_IDS) {
      const full = INTROS[personaId];
      let idx = Math.min(INITIAL_SEED_CHARS, full.length);
      if (idx >= full.length) {
        // Edge case: intro is shorter than the seed — nothing to stream.
        setStreams((prev) => ({ ...prev, [personaId]: { text: full, status: "complete" } }));
        continue;
      }
      const timer = setInterval(() => {
        idx = Math.min(idx + CHARS_PER_TICK, full.length);
        const done = idx >= full.length;
        setStreams((prev) => ({
          ...prev,
          [personaId]: { text: full.slice(0, idx), status: done ? "complete" : "streaming" },
        }));
        if (done) clearInterval(timer);
      }, TYPE_INTERVAL_MS);
      timers.push(timer);
    }
    return () => {
      for (const t of timers) clearInterval(t);
    };
  }, []);

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
