"use client";

/**
 * Ditto — Day Zero Welcome
 *
 * Shown once after setup. Green dot, "Hi. I'm Ditto." heading,
 * intro paragraph, 4-point difference callout (typographic flow,
 * left border, no card), "Let's get started" pill CTA.
 * Staggered fade-in animations per P08.
 *
 * Brief 057 AC10-AC11.
 * Provenance: P08 prototype (docs/prototypes/08-day-zero.html).
 */

const DAY_ZERO_KEY = "ditto-day-zero-seen";

export function isDayZeroSeen(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DAY_ZERO_KEY) === "true";
}

export function markDayZeroSeen(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DAY_ZERO_KEY, "true");
}

const DIFFERENCES = [
  {
    bold: "I remember everything.",
    text: "Our conversations build knowledge that compounds. I never start from scratch.",
  },
  {
    bold: "I do the work, not just answer questions.",
    text: "I write your content, run your routines, and learn from your corrections.",
  },
  {
    bold: "I earn your trust.",
    text: "You start by checking everything. Over time, as I prove reliable, I handle more on my own.",
  },
  {
    bold: "I explain my thinking.",
    text: "Every output shows what I used and why. You can always see under the hood.",
  },
];

interface DayZeroProps {
  onComplete: () => void;
}

export function DayZero({ onComplete }: DayZeroProps) {
  function handleStart() {
    markDayZeroSeen();
    onComplete();
  }

  return (
    <main className="min-h-screen flex items-start justify-center bg-background px-6" style={{ paddingTop: "120px", paddingBottom: "80px" }}>
      <div className="w-full max-w-[600px]">
        {/* Self dot */}
        <div
          className="w-2.5 h-2.5 rounded-full bg-vivid mb-5"
          aria-hidden="true"
          style={{ opacity: 0, animation: "day-zero-fade 0.6s ease-out 0.2s forwards" }}
        />

        {/* Greeting */}
        <h1
          className="text-2xl font-semibold text-text-primary tracking-[-0.02em] mb-2"
          style={{ opacity: 0, animation: "day-zero-fade 0.5s ease-out 0.5s forwards" }}
        >
          Hi. I&apos;m Ditto.
        </h1>

        {/* Intro text */}
        <p
          className="text-base text-text-secondary leading-relaxed mb-9 max-w-[540px]"
          style={{ opacity: 0, animation: "day-zero-fade 0.5s ease-out 0.7s forwards" }}
        >
          I&apos;m not a chatbot. I&apos;m a working partner that learns your business,
          remembers everything, and gets better over time. Let me show you how I&apos;m
          different — and get to know you.
        </p>

        {/* Difference callout — typographic flow, left border, no card */}
        <div
          className="pl-5 border-l-2 border-vivid-deep mb-9"
          style={{ opacity: 0, animation: "day-zero-fade 0.5s ease-out 0.9s forwards" }}
        >
          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.06em] mb-3">
            What makes this different from ChatGPT or Claude
          </div>
          <ul className="flex flex-col gap-2 list-none">
            {DIFFERENCES.map((d, i) => (
              <li key={i} className="text-[15px] text-text-secondary leading-relaxed">
                <strong className="text-text-primary">{d.bold}</strong> {d.text}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <button
          onClick={handleStart}
          className="inline-flex items-center gap-2.5 py-3.5 px-8 rounded-full bg-vivid text-white text-base font-semibold transition-all hover:bg-vivid-deep focus-visible:outline-2 focus-visible:outline-vivid-deep focus-visible:outline-offset-2"
          style={{ opacity: 0, animation: "day-zero-fade 0.5s ease-out 1.1s forwards" }}
        >
          Let&apos;s get started
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
        </button>

        {/* Time note */}
        <div
          className="text-[13px] text-text-muted mt-3"
          style={{ opacity: 0, animation: "day-zero-fade 0.5s ease-out 1.3s forwards" }}
        >
          Takes about 10 minutes. I&apos;ll learn who you are, what you do, and how I can help.
        </div>
      </div>

    </main>
  );
}
