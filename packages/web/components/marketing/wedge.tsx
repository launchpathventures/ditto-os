"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, RotateCcw, SkipForward } from "lucide-react";
import { BlockRenderer } from "@/components/blocks/block-registry";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import { cn } from "@/lib/utils";
import type {
  ContentBlock,
  ProgressBlock,
  TextBlock,
  ReviewCardBlock,
  SuggestionBlock,
} from "@/lib/engine";
import type { PersonaId } from "@/lib/persona";
import alexFixture from "./wedge-fixture-alex.json";
import miraFixture from "./wedge-fixture-mira.json";

type ReplayStatus = "idle" | "playing" | "paused" | "completed";

type WedgeStage =
  | { stage: 0; block: "idle"; ms: number }
  | { stage: 1; block: TextBlock; ms: number; streamMs?: number }
  | {
      stage: 2;
      block: ProgressBlock;
      ms: number;
      checkpoints: Array<{ ms: number; label: string }>;
    }
  | { stage: 3; block: ReviewCardBlock; ms: number }
  | { stage: 4; block: SuggestionBlock; ms: number };

interface WedgeFixture {
  totalMs: number;
  persona: PersonaId;
  stages: WedgeStage[];
}

interface WedgeProps {
  persona?: PersonaId;
  onComplete?: () => void;
  onSkip?: () => void;
}

const fixtures: Record<PersonaId, WedgeFixture> = {
  alex: alexFixture as WedgeFixture,
  mira: miraFixture as WedgeFixture,
};

const stageCopy: Record<1 | 2 | 3 | 4, string> = {
  1: "Intake",
  2: "Pricing",
  3: "Review",
  4: "Ready",
};

function viewportKind() {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

function useReplayClock({
  status,
  totalMs,
  speed,
  onComplete,
  onHidden,
  onVisible,
}: {
  status: ReplayStatus;
  totalMs: number;
  speed: number;
  onComplete: () => void;
  onHidden: () => void;
  onVisible: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const completedRef = useRef(false);

  const reset = useCallback(() => {
    completedRef.current = false;
    setElapsed(0);
  }, []);

  const jumpToEnd = useCallback(() => {
    completedRef.current = true;
    setElapsed(totalMs);
  }, [totalMs]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && status === "playing") {
        onHidden();
      }
      if (document.visibilityState === "visible" && status === "paused") {
        onVisible();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [onHidden, onVisible, status]);

  useEffect(() => {
    if (status !== "playing") return;

    let frame = 0;
    let last = performance.now();

    function tick(now: number) {
      const delta = Math.max(0, now - last);
      last = now;

      setElapsed((current) => {
        const next = Math.min(totalMs, current + delta * speed);
        if (next >= totalMs && !completedRef.current) {
          completedRef.current = true;
          queueMicrotask(onComplete);
        }
        return next;
      });

      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onComplete, speed, status, totalMs]);

  return { elapsed, reset, jumpToEnd };
}

function blockForStage(stage: WedgeStage, elapsed: number): ContentBlock | null {
  if (stage.stage === 0) return null;

  if (stage.stage === 1) {
    const stageElapsed = Math.max(0, elapsed - stage.ms);
    const streamMs = stage.streamMs ?? 1;
    const ratio = Math.min(1, stageElapsed / streamMs);
    const text = stage.block.text.slice(0, Math.ceil(stage.block.text.length * ratio));
    return { ...stage.block, text };
  }

  if (stage.stage === 2) {
    const stageElapsed = Math.max(0, elapsed - stage.ms);
    const completedIndex = stage.checkpoints.reduce((latest, checkpoint, index) => {
      return stageElapsed >= checkpoint.ms ? index : latest;
    }, -1);
    const completedSteps = Math.max(0, completedIndex + 1);
    const currentStep =
      completedIndex >= 0
        ? stage.checkpoints[Math.min(completedIndex, stage.checkpoints.length - 1)].label
        : stage.block.currentStep;
    return {
      ...stage.block,
      currentStep,
      completedSteps,
      status: completedSteps >= stage.block.totalSteps ? "complete" : "running",
    };
  }

  return stage.block;
}

export function Wedge({ persona = "alex", onComplete, onSkip }: WedgeProps) {
  const fixture = fixtures[persona] ?? fixtures.alex;
  const reducedMotion = usePrefersReducedMotion();
  const [status, setStatus] = useState<ReplayStatus>("idle");
  const [motionOverride, setMotionOverride] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const completionTrackedRef = useRef(false);
  const skipTrackedRef = useRef(false);
  const lastPersonaRef = useRef(persona);
  const elapsedRef = useRef(0);

  const track = useCallback((event: Parameters<typeof trackMarketingEvent>[0]) => {
    trackMarketingEvent(event, {
      persona,
      viewport: viewportKind(),
    });
  }, [persona]);

  const handleReplayComplete = useCallback(() => {
    setStatus("completed");
    if (!completionTrackedRef.current) {
      completionTrackedRef.current = true;
      track("wedge_completed");
    }
  }, [track]);

  const { elapsed, reset, jumpToEnd } = useReplayClock({
    status,
    totalMs: fixture.totalMs,
    speed: reducedMotion && motionOverride ? 0.5 : 1,
    onComplete: handleReplayComplete,
    onHidden: () => setStatus("paused"),
    onVisible: () => setStatus("playing"),
  });

  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  useEffect(() => {
    if (lastPersonaRef.current === persona) return;
    lastPersonaRef.current = persona;
    reset();
    completionTrackedRef.current = false;
    skipTrackedRef.current = false;
    setMotionOverride(false);
    setStatus("idle");
  }, [persona, reset]);

  useEffect(() => {
    if (status !== "playing" || !rootRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.intersectionRatio >= 0.3) return;
        if (elapsedRef.current < 1500 || skipTrackedRef.current) return;
        skipTrackedRef.current = true;
        track("wedge_skipped");
        onSkip?.();
      },
      { threshold: [0, 0.3, 1] },
    );

    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [onSkip, status, track]);

  const startReplay = useCallback((kind: "play" | "replay" | "reduced-play") => {
    reset();
    completionTrackedRef.current = false;
    skipTrackedRef.current = false;
    setMotionOverride(kind === "reduced-play");
    setStatus("playing");
    track(kind === "replay" ? "wedge_replayed" : "wedge_play_pressed");
  }, [reset, track]);

  const skipReplay = useCallback(() => {
    if (!skipTrackedRef.current) {
      skipTrackedRef.current = true;
      track("wedge_skipped");
    }
    onSkip?.();
    jumpToEnd();
    setStatus("completed");
  }, [jumpToEnd, onSkip, track]);

  const activeStage = useMemo(() => {
    if (status === "idle") return fixture.stages[0];
    return [...fixture.stages].reverse().find((stage) => elapsed >= stage.ms) ?? fixture.stages[0];
  }, [elapsed, fixture.stages, status]);

  const finalStage = fixture.stages.find((stage): stage is Extract<WedgeStage, { stage: 4 }> => stage.stage === 4);
  const reducedStatic = reducedMotion && !motionOverride && status === "idle";
  const activeBlock = reducedStatic
    ? finalStage?.block ?? null
    : activeStage
      ? blockForStage(activeStage, elapsed)
      : null;

  const activeStageNumber = reducedStatic ? 4 : activeStage?.stage ?? 0;
  const progressPct = reducedStatic
    ? 100
    : status === "idle"
      ? 0
      : Math.round(Math.min(100, (elapsed / fixture.totalMs) * 100));
  const stageAnnouncement = useMemo(() => {
    if (status === "idle" && !reducedStatic) return null;
    if (reducedStatic) return "Replay ready. Closing card is shown.";
    if (status === "paused") return "Replay paused until this tab is visible.";
    if (status === "completed") return "Replay complete. Closing card is ready.";
    if (activeStageNumber > 0) {
      return `Replay stage: ${stageCopy[activeStageNumber as 1 | 2 | 3 | 4]}.`;
    }
    return "Replay starting.";
  }, [activeStageNumber, reducedStatic, status]);

  function handleBlockAction(actionId: string) {
    if (actionId === "wedge-get-ditto") {
      onComplete?.();
    }
  }

  return (
    <section
      ref={rootRef}
      data-testid="wedge"
      className="w-full min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-surface/92 shadow-large backdrop-blur-md"
      aria-label={`${persona === "mira" ? "Mira" : "Alex"} quote demo`}
    >
      <div className="border-b border-border/70 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Process replay
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-text-primary sm:text-lg">
              Rob's bathroom quote
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {([1, 2, 3, 4] as const).map((stage) => (
              <span
                key={stage}
                className={cn(
                  "h-2 w-2 rounded-full transition-colors",
                  activeStageNumber >= stage ? "bg-text-primary" : "bg-border",
                )}
                aria-label={stageCopy[stage]}
              />
            ))}
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-raised">
          <div
            className="h-full rounded-full bg-vivid transition-[width] duration-150 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="relative min-h-[23rem] overflow-hidden px-4 py-4 sm:min-h-[24rem] sm:px-5">
        {status === "idle" && !reducedStatic ? (
          <div className="flex min-h-[19rem] flex-col justify-between">
            <div className="space-y-4">
              <p className="max-w-[30rem] text-2xl font-semibold leading-tight text-text-primary sm:text-3xl">
                Watch {persona === "mira" ? "Mira" : "Alex"} quote a bathroom reno.
              </p>
              <p className="max-w-[30rem] text-sm leading-relaxed text-text-secondary sm:text-base">
                One process, end to end: intake, pricing, margin check, and the quote
                Rob can approve from the truck.
              </p>
            </div>
            <button
              type="button"
              data-testid="wedge-play"
              onClick={() => startReplay("play")}
              className="mt-8 inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-accent px-5 py-4 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover active:translate-y-px sm:w-auto sm:min-w-[16rem]"
            >
              <Play className="h-5 w-5" aria-hidden />
              Watch the process
            </button>
          </div>
        ) : (
          <div className="flex min-h-[19rem] flex-col justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {activeStageNumber > 0
                    ? stageCopy[activeStageNumber as 1 | 2 | 3 | 4]
                    : "Starting"}
                </p>
                {status === "playing" && (
                  <button
                    type="button"
                    onClick={skipReplay}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
                  >
                    <SkipForward className="h-3.5 w-3.5" aria-hidden />
                    Skip
                  </button>
                )}
              </div>

              {stageAnnouncement && (
                <p className="sr-only" aria-live="polite" aria-atomic="true">
                  {stageAnnouncement}
                </p>
              )}

              <div
                className={cn(
                  "min-w-0 rounded-xl border border-border/70 bg-background/72 p-3 shadow-subtle sm:p-4",
                  activeStageNumber === 3 && "cursor-default",
                )}
                title={activeStageNumber === 3 ? "Demo only - buttons are not connected" : undefined}
              >
                {activeBlock ? (
                  <BlockRenderer block={activeBlock} onAction={handleBlockAction} />
                ) : (
                  <p className="text-sm text-text-secondary">Preparing the replay...</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {reducedStatic ? (
                <button
                  type="button"
                  data-testid="wedge-watch-reduced"
                  onClick={() => startReplay("reduced-play")}
                  className="text-sm font-semibold text-text-primary underline underline-offset-4"
                >
                  Watch the replay
                </button>
              ) : status === "completed" ? (
                <button
                  type="button"
                  data-testid="wedge-replay"
                  onClick={() => startReplay("replay")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-text-primary underline-offset-4 hover:underline"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Replay
                </button>
              ) : (
                <p className="text-xs text-text-muted">
                  {status === "paused" ? "Paused until this tab is visible." : "Scripted replay - no live AI call."}
                </p>
              )}
              <p className="text-xs text-text-muted">
                {Math.round(fixture.totalMs / 1000)} seconds
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
