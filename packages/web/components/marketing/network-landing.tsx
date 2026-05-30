"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, Compass, Search } from "lucide-react";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import type { NetworkEntryIntent } from "@/lib/network-entry-intent";
import { cn } from "@/lib/utils";

export type { NetworkEntryIntent };

type LandingMode = "client" | "expert";

interface ModeDefinition {
  mode: LandingMode;
  intent: NetworkEntryIntent;
  laneMode: "client" | "expert";
  href: "/network/request" | "/network/signal";
  tab: string;
  eyebrow: string;
  title: string;
  question: string;
  placeholder: string;
  promptIdeas: string[];
  cta: string;
  icon: typeof Search;
}

const MODES: Record<LandingMode, ModeDefinition> = {
  client: {
    mode: "client",
    intent: "manual-search",
    laneMode: "client",
    href: "/network/request",
    tab: "Research",
    eyebrow: "Research",
    title: "Research people and companies.",
    question: "Who are you trying to find, or what problem are you trying to solve?",
    placeholder: "Find marketplace operators who rebuilt trust after a supply-quality problem.",
    promptIdeas: [
      "Find marketplace operators who rebuilt trust after a supply-quality problem.",
      "Research AI infrastructure companies hiring their first partnerships lead.",
      "Who has scaled expert marketplaces from seed to Series B?",
      "Find operators who have sold into UK construction firms.",
    ],
    cta: "Research",
    icon: Search,
  },
  expert: {
    mode: "expert",
    intent: "member-signal",
    laneMode: "expert",
    href: "/network/signal",
    tab: "Be found",
    eyebrow: "Profile",
    title: "Be found for what you actually know.",
    question: "What should people come to you for?",
    placeholder: "I help B2B founders turn messy customer data into sales calls.",
    promptIdeas: [
      "I help B2B founders turn messy customer data into sales calls.",
      "I advise marketplaces on supply quality, trust, and liquidity.",
      "I know early-stage finance ops for AI companies.",
      "I can help founders make outbound sales repeatable.",
    ],
    cta: "Create profile",
    icon: Compass,
  },
};

const MIN_LANDING_ANSWER_CHARS = 12;

function buildOnboardingHref(definition: ModeDefinition, answer: string): string {
  const params = new URLSearchParams({
    mode: definition.laneMode,
    intent: definition.intent,
  });
  const seed = answer.trim();
  if (seed) {
    params.set("seed", seed.slice(0, 700));
  }
  return `${definition.href}?${params.toString()}`;
}

function readAnswerFromForm(form: HTMLFormElement, fallback: string): string {
  const seedField = form.elements.namedItem("seed");
  return seedField instanceof HTMLTextAreaElement ? seedField.value : fallback;
}

function useTypedPrompt(ideas: string[]): string {
  const [typedPrompt, setTypedPrompt] = useState(ideas[0] ?? "");

  useEffect(() => {
    if (ideas.length === 0) return;
    let cancelled = false;
    let timeoutId: number | undefined;
    let intervalId: number | undefined;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      let index = 0;
      setTypedPrompt(ideas[index]);
      intervalId = window.setInterval(() => {
        index = (index + 1) % ideas.length;
        setTypedPrompt(ideas[index]);
      }, 3600);
      return () => {
        if (intervalId) window.clearInterval(intervalId);
      };
    }

    function typeIdea(index: number) {
      const fullText = ideas[index];
      let characterCount = 0;
      setTypedPrompt("");

      function tick() {
        if (cancelled) return;
        characterCount += 1;
        setTypedPrompt(fullText.slice(0, characterCount));
        if (characterCount < fullText.length) {
          timeoutId = window.setTimeout(tick, 24);
          return;
        }
        timeoutId = window.setTimeout(() => typeIdea((index + 1) % ideas.length), 2300);
      }

      tick();
    }

    typeIdea(0);
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [ideas]);

  return typedPrompt;
}

export function NetworkLanding() {
  const answerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<LandingMode>("client");
  const [answer, setAnswer] = useState("");
  const active = MODES[mode];
  const Icon = active.icon;
  const typedPrompt = useTypedPrompt(active.promptIdeas);
  const trimmedAnswer = answer.trim();
  const answerCharacterCount = trimmedAnswer.length;
  const canSubmit = answerCharacterCount >= MIN_LANDING_ANSWER_CHARS;
  const remainingCharacters = Math.max(0, MIN_LANDING_ANSWER_CHARS - answerCharacterCount);

  function syncAnswerFromTextarea() {
    const restoredAnswer = answerTextareaRef.current?.value ?? "";
    setAnswer((current) => (current === restoredAnswer ? current : restoredAnswer));
  }

  useEffect(() => {
    let animationFrame = 0;
    const scheduleSync = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(syncAnswerFromTextarea);
    };

    scheduleSync();
    window.addEventListener("pageshow", scheduleSync);
    window.addEventListener("focus", scheduleSync);
    document.addEventListener("visibilitychange", scheduleSync);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("pageshow", scheduleSync);
      window.removeEventListener("focus", scheduleSync);
      document.removeEventListener("visibilitychange", scheduleSync);
    };
  }, [mode]);

  function submit(event: FormEvent<HTMLFormElement>) {
    const submittedAnswer = readAnswerFromForm(event.currentTarget, answer);
    const submittedAnswerLength = submittedAnswer.trim().length;
    setAnswer((current) => (current === submittedAnswer ? current : submittedAnswer));

    if (submittedAnswerLength < MIN_LANDING_ANSWER_CHARS) {
      event.preventDefault();
      const seedField = event.currentTarget.elements.namedItem("seed");
      if (seedField instanceof HTMLTextAreaElement) {
        seedField.setCustomValidity(`Enter at least ${MIN_LANDING_ANSWER_CHARS} characters to start.`);
        seedField.reportValidity();
        seedField.setCustomValidity("");
      }
      return;
    }

    event.preventDefault();
    trackMarketingEvent("network_entry_selected", {
      intent: active.intent,
      mode: active.laneMode,
      seeded: submittedAnswerLength > 0,
    });
    window.location.assign(buildOnboardingHref(active, submittedAnswer));
  }

  function switchMode(nextMode: LandingMode) {
    setMode(nextMode);
    setAnswer("");
    if (answerTextareaRef.current) {
      answerTextareaRef.current.value = "";
    }
  }

  return (
    <section className="relative min-h-dvh overflow-hidden bg-[#070b16] px-5 pb-12 pt-[88px] text-white sm:px-8 sm:pt-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover"
        style={{
          backgroundImage: "url('/hero-network.png')",
          backgroundPosition: "right center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "auto 120%",
          filter: "brightness(1.16) contrast(1.18) saturate(1.08)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: [
            "linear-gradient(90deg, rgba(5, 9, 18, 0.88) 0%, rgba(5, 9, 18, 0.64) 34%, rgba(5, 9, 18, 0.24) 72%, rgba(5, 9, 18, 0.12) 100%)",
            "linear-gradient(180deg, rgba(5, 9, 18, 0.04) 0%, rgba(5, 9, 18, 0.12) 54%, rgba(5, 9, 18, 0.62) 100%)",
          ].join(", "),
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-112px)] w-full max-w-[1160px] flex-col justify-center py-6">
        <div className="grid items-center gap-8 lg:grid-cols-[0.86fr_1.14fr]">
          <div>
            <h1 className="max-w-[650px] text-[42px] font-semibold leading-none tracking-normal text-white sm:text-[64px]">
              The right people{" "}
              <span className="font-instrument-serif font-normal">find you</span>.
            </h1>
            <p className="mt-5 max-w-[610px] text-base leading-7 text-white/78 sm:text-lg">
              A personal superconnector for work, hires, funding, and advice. It builds the context
              and asks before any intro.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[540px]">
            <form
              onSubmit={submit}
              action={active.href}
              method="get"
              data-intent={active.intent}
              className="relative z-10 rounded-md border border-border bg-white p-4 shadow-large sm:p-5"
            >
              <input type="hidden" name="mode" value={active.laneMode} />
              <input type="hidden" name="intent" value={active.intent} />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-text-muted">{active.eyebrow}</p>
                  <h2 className="mt-2 max-w-[420px] text-xl font-semibold leading-tight text-text-primary sm:text-2xl">
                    {active.title}
                  </h2>
                </div>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-raised text-text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>

              <label className="mt-5 grid gap-2">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold leading-5 text-text-primary">{active.question}</span>
                  <span className="shrink-0 text-xs font-semibold text-text-muted">
                    {answerCharacterCount}/{MIN_LANDING_ANSWER_CHARS}
                  </span>
                </span>
                <textarea
                  ref={answerTextareaRef}
                  name="seed"
                  defaultValue=""
                  onChange={(event) => setAnswer(event.target.value)}
                  onFocus={syncAnswerFromTextarea}
                  placeholder={typedPrompt || active.placeholder}
                  required
                  minLength={MIN_LANDING_ANSWER_CHARS}
                  aria-describedby="network-landing-answer-help"
                  rows={3}
                  className="min-h-[64px] resize-none rounded-md border border-border bg-surface px-4 py-3 text-base leading-6 text-text-primary outline-none transition placeholder:text-text-muted focus:border-text-primary sm:min-h-[104px] sm:py-4"
                />
                <span id="network-landing-answer-help" className="text-xs leading-5 text-text-muted">
                  {canSubmit
                    ? "Ready to start a focused brief."
                    : remainingCharacters === MIN_LANDING_ANSWER_CHARS
                      ? `Enter at least ${MIN_LANDING_ANSWER_CHARS} characters to start.`
                      : `${remainingCharacters} more character${remainingCharacters === 1 ? "" : "s"} needed.`}
                </span>
              </label>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="hidden text-sm leading-5 text-text-secondary sm:block">
                  Source-backed. Private until approved. No cold intros.
                </p>
                <button
                  type="submit"
                  data-ready={canSubmit ? "true" : "false"}
                  onPointerDown={syncAnswerFromTextarea}
                  onFocus={syncAnswerFromTextarea}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary/25",
                    canSubmit
                      ? "bg-accent text-accent-foreground hover:opacity-90"
                      : "bg-surface-raised text-text-muted",
                  )}
                >
                  {active.cta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </form>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Choose Network side"
          className="relative z-20 mx-auto mt-14 grid w-full max-w-[320px] grid-cols-2 rounded-full border border-border bg-white p-1 shadow-medium sm:mt-16"
        >
          {(["client", "expert"] as const).map((option) => {
            const selected = mode === option;
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => switchMode(option)}
                className={cn(
                  "min-h-10 rounded-full px-4 text-xs font-semibold uppercase text-text-secondary transition",
                  selected ? "bg-accent text-accent-foreground" : "hover:bg-surface-raised hover:text-text-primary",
                )}
              >
                {MODES[option].tab}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
