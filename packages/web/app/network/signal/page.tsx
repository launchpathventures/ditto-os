"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleDashed } from "lucide-react";
import { MemberSignalSourceIntake, type MemberSignalResearchResponse } from "@/components/network/member-signal-source-intake";
import { MemberSignalReview, type MemberSignalClaimRow } from "@/components/network/member-signal-review";
import { cn } from "@/lib/utils";

const SESSION_KEY = "ditto-network-lane-session";
const FRONT_DOOR_SESSION_KEY = "ditto-chat-session";

type DraftStatus = "idle" | "drafting" | "ready" | "error";

export default function NetworkSignalPage() {
  const searchParams = useSearchParams();
  const initialProfileHint = searchParams?.get("seed")?.trim().slice(0, 700) || undefined;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [memberSignalId, setMemberSignalId] = useState<string | null>(null);
  const [calibrationQuestions, setCalibrationQuestions] = useState<string[]>([]);
  const [claims, setClaims] = useState<MemberSignalClaimRow[]>([]);
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function openLane() {
      const storedSessionId = window.localStorage.getItem(`${SESSION_KEY}:expert`);
      try {
        const response = await fetch("/api/v1/network/chat/lane", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            mode: "expert",
            sessionId: storedSessionId,
            sourceSessionId: window.localStorage.getItem(FRONT_DOOR_SESSION_KEY),
          }),
        });
        if (!response.ok) throw new Error("lane_open_failed");
        const data = await response.json() as { sessionId: string };
        if (cancelled) return;
        window.localStorage.setItem(`${SESSION_KEY}:expert`, data.sessionId);
        setSessionId(data.sessionId);
      } catch {
        if (cancelled) return;
        const fallback = storedSessionId || `expert-${crypto.randomUUID()}`;
        window.localStorage.setItem(`${SESSION_KEY}:expert`, fallback);
        setSessionId(fallback);
        setMessage("Signal review can start once the Network lane is available.");
      }
    }
    void openLane();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleResearchComplete(response: MemberSignalResearchResponse) {
    setMemberSignalId(response.memberSignal.id);
    setCalibrationQuestions(
      Array.isArray(response.memberSignal.calibrationQuestions)
        ? response.memberSignal.calibrationQuestions.filter((item): item is string => typeof item === "string")
        : [],
    );
    setClaims([]);
    setDraftStatus("idle");
    setMessage(response.memberSignal.sourceSummary ?? null);
  }

  async function draftSignal() {
    if (!memberSignalId) {
      setMessage("Add sources first.");
      return;
    }
    setDraftStatus("drafting");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/network/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "draft",
          sessionId,
          memberSignalId,
        }),
      });
      const payload = await response.json() as { claims?: MemberSignalClaimRow[]; error?: string };
      if (!response.ok || !payload.claims) throw new Error(payload.error || "draft_failed");
      setClaims(payload.claims);
      setDraftStatus("ready");
    } catch (error) {
      setDraftStatus("error");
      setMessage(error instanceof Error ? error.message : "Draft failed.");
    }
  }

  return (
    <main className="min-h-dvh bg-background px-5 py-5 text-text-primary sm:px-8">
      <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-4">
        <Link href="/network" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Network
        </Link>
        <Link href="/network/request" className="text-sm font-semibold text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
          Research people
        </Link>
      </div>

      <section className="mx-auto grid w-full max-w-[1240px] gap-7 pb-12 pt-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">Profile setup</p>
          <h1 className="mt-4 max-w-3xl text-[42px] font-semibold leading-[1] text-text-primary sm:text-[56px]">
            Create a profile people can find.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary">
            Add a short bio, LinkedIn, website, or proof of work. Ditto drafts from sources it can cite and waits for your approval before anything becomes public.
          </p>

          <div className="mt-7">
            <MemberSignalSourceIntake
              sessionId={sessionId}
              initialPastedText={initialProfileHint}
              autoResearchInitial={Boolean(initialProfileHint)}
              onResearchComplete={handleResearchComplete}
            />
          </div>

          <div className="mt-4 rounded-2xl bg-surface-raised p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full",
                  draftStatus === "ready" ? "bg-[#eff8f0] text-positive" : "bg-white text-text-secondary",
                )}>
                  <CircleDashed className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {draftStatus === "ready" ? "Profile draft ready" : "Draft profile"}
                  </p>
                  <p className="text-xs leading-5 text-text-muted">
                    Every drafted detail carries source, confidence, visibility, and approval state.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={!memberSignalId || draftStatus === "drafting"}
                onClick={() => void draftSignal()}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                    {draftStatus === "drafting" ? "Drafting profile" : "Draft profile"}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
            </div>
            {message ? (
              <p className="mt-3 text-sm leading-5 text-text-secondary">{message}</p>
            ) : null}
            {calibrationQuestions.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {calibrationQuestions.map((question) => (
                  <div key={question} className="rounded-md border border-border bg-white px-3 py-2 text-sm leading-5 text-text-secondary">
                    {question}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="lg:sticky lg:top-5 lg:self-start">
          <MemberSignalReview
            sessionId={sessionId}
            memberSignalId={memberSignalId}
            claims={claims}
            onClaimsChange={setClaims}
          />
          <div className="mt-4 grid gap-2 rounded-2xl bg-white p-4 text-sm leading-5 text-text-secondary shadow-medium">
            <Link href="/network/request" className="font-semibold text-text-primary underline-offset-4 hover:underline">
              Research people and companies
            </Link>
            <Link href="/network" className="font-semibold text-text-primary underline-offset-4 hover:underline">
              Back to Network
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
