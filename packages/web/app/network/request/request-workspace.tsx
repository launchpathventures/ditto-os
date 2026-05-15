"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RequestIntake } from "@/components/network/request-intake";
import { RequestCanvas } from "@/components/network/request-canvas";
import { RequestChatRail, type RequestChatMessage } from "@/components/network/request-chat-rail";
import { NetworkSceneBackground } from "@/components/network/network-scene-background";
import {
  draftActiveRequest,
  getOrCreateVisitorSessionId,
} from "@/components/network/request-intake";
import type { ActiveRequestDraft, ActiveRequestMode } from "@/components/network/request-review";
import type { RequestIdentity } from "@/components/network/request-identity-card";
import { RequestBriefFocus } from "@/components/network/request-analysis";
import { fieldLabel, type TrackedField } from "@/components/network/request-diff";
import { extractIdentityFromMessage } from "@/components/network/request-identity-extract";
import {
  deriveCurrentStep,
  type ConversationStep,
} from "@/components/network/request-step-engine";

const IDENTITY_LABEL: Record<keyof RequestIdentity, string> = {
  name: "name",
  email: "email",
  orgSite: "org or site",
  credibility: "credibility",
};

const MODE_FROM_TEXT: Array<{ pattern: RegExp; mode: ActiveRequestMode }> = [
  { pattern: /\b(do both|both)\b/i, mode: "both" },
  { pattern: /\b(keep watch|background|watch|later|wait)\b/i, mode: "background-watch" },
  { pattern: /\b(search now|now|go|find them|find people)\b/i, mode: "manual-search" },
];

const RESEARCH_SCENES = [
  "/hero-research.png",
  "/hero-network-cafe.png",
  "/hero-network-event.png",
  "/hero-network-ipo.png",
  "/hero-network-park.png",
] as const;

function detectMode(message: string): ActiveRequestMode | null {
  for (const { pattern, mode } of MODE_FROM_TEXT) {
    if (pattern.test(message)) return mode;
  }
  return null;
}

function formatIdentityLabels(keys: Array<keyof RequestIdentity>): string[] {
  return keys.map((key) => IDENTITY_LABEL[key]);
}

function buildAssistantTurn(step: ConversationStep, withLead: boolean): string {
  if (step.kind === "ready") return step.question;
  if (withLead) return `${step.lead} ${step.question}`;
  return step.question;
}

function cleanSentence(value: string, fallback: string): string {
  const clean = value.replace(/\s+/g, " ").trim() || fallback;
  return clean.charAt(0).toLowerCase() + clean.slice(1);
}

function buildInitialAssistantTurn(draft: ActiveRequestDraft, step: ConversationStep): string {
  const target = cleanSentence(draft.idealPerson, "the right person");
  const outcome = cleanSentence(draft.outcomeNeeded, draft.rawNeed);
  if (step.kind === "need") {
    return `I read this as: find ${target} to ${outcome}. The useful gap is ${step.label.toLowerCase()}. ${step.question}`;
  }
  if (step.kind === "identity") {
    return `I read this as: find ${target} to ${outcome}. The search brief is usable; I just need your intro details before any outreach. ${step.question}`;
  }
  if (step.kind === "mode") {
    return `I read this as: find ${target} to ${outcome}. The brief is usable; choose how active I should be. ${step.question}`;
  }
  return `I read this as: find ${target} to ${outcome}. ${step.question}`;
}

export function RequestWorkspace({ initialNeed }: { initialNeed?: string }) {
  const [draft, setDraft] = useState<ActiveRequestDraft | null>(null);
  const [visitorSessionId, setVisitorSessionId] = useState<string | null>(null);
  const [originalNeed, setOriginalNeed] = useState<string | null>(null);
  const [composedNeed, setComposedNeed] = useState<string | null>(null);
  const [messages, setMessages] = useState<RequestChatMessage[]>([]);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<RequestIdentity>({
    name: "",
    email: "",
    orgSite: "",
    credibility: "",
  });
  const [highlightedFields, setHighlightedFields] = useState<TrackedField[]>([]);
  const [modeConfirmed, setModeConfirmed] = useState(false);
  const [showFullBrief, setShowFullBrief] = useState(false);

  const greetingShownRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const lastQuestionedStepRef = useRef<string | null>(null);

  const handleDraft = useCallback(
    (nextDraft: ActiveRequestDraft, nextVisitorSessionId: string) => {
      setDraft(nextDraft);
      setVisitorSessionId(nextVisitorSessionId);
      if (!originalNeed) setOriginalNeed(nextDraft.rawNeed);
      setComposedNeed(nextDraft.rawNeed);
    },
    [originalNeed],
  );

  const currentStep = useMemo<ConversationStep | null>(() => {
    if (!draft) return null;
    return deriveCurrentStep(draft, identity, {
      mode: draft.mode,
      modeConfirmed,
    });
  }, [draft, identity, modeConfirmed]);

  // Mira opener — runs once when the first draft arrives.
  useEffect(() => {
    if (!draft || !currentStep || greetingShownRef.current) return;
    greetingShownRef.current = true;
    const firstQuestion: RequestChatMessage = {
      id: `mira-q-${Date.now() + 1}`,
      role: "assistant",
      content: buildInitialAssistantTurn(draft, currentStep),
    };
    lastQuestionedStepRef.current = `${currentStep.kind}:${currentStep.field ?? ""}:${currentStep.index}`;
    setMessages([firstQuestion]);
  }, [draft, currentStep]);

  // Briefly highlight changed fields, then clear after 2.5s.
  useEffect(() => {
    if (highlightedFields.length === 0) return;
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedFields([]);
    }, 2500);
    return () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, [highlightedFields]);

  // Whenever the step changes (after a successful refinement), Mira asks the next question.
  useEffect(() => {
    if (!currentStep || !greetingShownRef.current || refining) return;
    const stepKey = `${currentStep.kind}:${currentStep.field ?? ""}:${currentStep.index}`;
    if (lastQuestionedStepRef.current === stepKey) return;
    lastQuestionedStepRef.current = stepKey;
    setMessages((current) => [
      ...current,
      {
        id: `mira-q-${Date.now()}`,
        role: "assistant",
        content: buildAssistantTurn(currentStep, true),
      },
    ]);
  }, [currentStep, refining]);

  const sendRefinement = useCallback(
    async (userMessage: string) => {
      if (!draft || !visitorSessionId || !composedNeed || !currentStep) return;
      const trimmed = userMessage.trim();
      if (!trimmed || refining) return;

      const userMsg: RequestChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed,
      };
      setMessages((current) => [...current, userMsg]);

      // Identity pickup — gated to identity step or messages with strong identity signals.
      const identityResult = extractIdentityFromMessage(trimmed, identity, {
        inIdentityStep: currentStep.kind === "identity",
      });
      if (identityResult.changed.length > 0) {
        setIdentity(identityResult.identity);
        setMessages((current) => [
          ...current,
          {
            id: `mira-identity-${Date.now()}`,
            role: "system",
            content: "Got your details for the card.",
            changedLabels: formatIdentityLabels(identityResult.changed),
          },
        ]);
      }

      // Mode pickup — only when on the mode step.
      if (currentStep.kind === "mode") {
        const detected = detectMode(trimmed);
        if (detected) {
          setDraft((current) => (current ? { ...current, mode: detected } : current));
          setModeConfirmed(true);
          setMessages((current) => [
            ...current,
            {
              id: `mira-mode-${Date.now()}`,
              role: "system",
              content: `Mode set — ${detected === "manual-search" ? "Search now" : detected === "background-watch" ? "Keep watch" : "Do both"}.`,
              changedLabels: [],
            },
          ]);
        }
        return;
      }

      // Identity step is fully handled by the local extractor above.
      if (currentStep.kind === "identity") return;

      // Need-step answers — assign directly to the target field so the step
      // advances deterministically. Background refine then enriches summaries.
      if (currentStep.kind === "need" && currentStep.field) {
        const field = currentStep.field as TrackedField;
        const remainingMissingFields = draft.missingFields.filter((f) => f !== field);
        const localDraft: ActiveRequestDraft = {
          ...draft,
          [field]: trimmed,
          missingFields: remainingMissingFields,
          quickAnswerField: remainingMissingFields[0] ?? null,
          quickAnswers: [],
        };
        setDraft(localDraft);
        setHighlightedFields([field]);
        setMessages((current) => [
          ...current,
          {
            id: `mira-diff-${Date.now()}`,
            role: "system",
            content: `Locked — ${fieldLabel(field)}.`,
            changedLabels: [fieldLabel(field)],
          },
        ]);

        const updatedRawNeed = `${composedNeed}\n\n${fieldLabel(field)}: ${trimmed}`;
        setComposedNeed(updatedRawNeed);
        setRefining(true);
        setRefineError(null);
        try {
          const refined = await draftActiveRequest({
            rawNeed: updatedRawNeed,
            visitorSessionId,
          });
          // Keep user's verbatim answer in the target field; merge other derived
          // fields the LLM may have improved.
          setDraft((current) => {
            if (!current) return current;
            return {
              ...refined,
              [field]: current[field],
              missingFields: current.missingFields,
            };
          });
        } catch {
          // Silent — the user's direct answer already lives in the draft.
        } finally {
          setRefining(false);
        }
      }
    },
    [composedNeed, draft, refining, visitorSessionId, identity, currentStep],
  );

  const handleSkip = useCallback(() => {
    if (!currentStep || !draft) return;
    if (currentStep.kind === "identity") {
      // Mark identity as effectively "skipped" by setting a placeholder credibility hint so the
      // step engine moves on. Keep fields empty — Canvas still asks them visibly.
      setIdentity((current) =>
        isIdentitySkipped(current)
          ? current
          : { ...current, credibility: current.credibility || "Search-only — identity to follow" },
      );
      setMessages((current) => [
        ...current,
        {
          id: `mira-skip-${Date.now()}`,
          role: "system",
          content: "Skipped identity for now — you can fill it before any outreach.",
        },
      ]);
      return;
    }
    if (currentStep.kind === "mode") {
      setDraft((current) => (current ? { ...current, mode: "background-watch" } : current));
      setModeConfirmed(true);
      setMessages((current) => [
        ...current,
        {
          id: `mira-skip-${Date.now()}`,
          role: "system",
          content: "Defaulted to Keep watch — change anytime below.",
        },
      ]);
      return;
    }
    if (currentStep.kind === "need" && currentStep.field) {
      const field = currentStep.field as TrackedField;
      setDraft((current) =>
        current
          ? (() => {
              const remainingMissingFields = current.missingFields.filter((f) => f !== field);
              return {
                ...current,
                [field]: current[field] || "Open — no preference",
                missingFields: remainingMissingFields,
                quickAnswerField: remainingMissingFields[0] ?? null,
                quickAnswers: [],
              };
            })()
          : current,
      );
      setMessages((current) => [
        ...current,
        {
          id: `mira-skip-${Date.now()}`,
          role: "system",
          content: `Skipped ${fieldLabel(field)} — I'll figure it out from context.`,
        },
      ]);
    }
  }, [currentStep, draft]);

  useEffect(() => {
    if (!draft) return;
    if (!visitorSessionId) {
      setVisitorSessionId(getOrCreateVisitorSessionId());
    }
  }, [draft, visitorSessionId]);

  if (!draft || !visitorSessionId || !currentStep) {
    return (
      <main className="relative isolate h-dvh overflow-hidden bg-[#050912]">
        <NetworkSceneBackground images={RESEARCH_SCENES} />
        <div className="relative z-10 h-dvh">
          <header className="absolute inset-x-0 top-0 z-20 px-5 pt-5 sm:px-8">
            <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 pb-3">
              <Link
                href="/network"
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-white/78 transition hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Network
              </Link>
            </div>
          </header>
          <div className="mx-auto flex h-full w-full max-w-[1180px] px-5 pb-6 pt-24 sm:px-8">
            <RequestIntake
              initialNeed={initialNeed}
              onDraft={handleDraft}
              className="w-full"
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate min-h-dvh bg-[#050912] lg:h-dvh lg:overflow-hidden">
      <NetworkSceneBackground images={RESEARCH_SCENES} />
      <div className="relative z-10 flex min-h-dvh flex-col lg:h-dvh">
        <header className="sticky top-0 z-20 shrink-0 px-5 pt-5 sm:px-8 lg:px-10">
          <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 pb-3">
            <Link
              href="/network"
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-white/78 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Network
            </Link>
            <div className="hidden rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/72 sm:block">
              Draft request - no contact without approval
            </div>
          </div>
        </header>

        <div className="mx-auto grid min-h-0 w-full max-w-[1480px] flex-1 gap-5 px-5 pb-5 pt-2 sm:px-8 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] lg:gap-7 lg:px-10">
          <RequestChatRail
            messages={messages}
            originalNeed={originalNeed ?? draft.rawNeed}
            step={currentStep}
            onSend={sendRefinement}
            onSkip={handleSkip}
            refining={refining}
            error={refineError}
            className="min-h-[460px] lg:h-full lg:max-h-none"
          />
          <section
            aria-label="Request brief and research process"
            className="min-h-0 overflow-y-auto overscroll-contain pr-1 lg:pr-2"
          >
            <div className="flex flex-col gap-4 pb-8">
              <RequestBriefFocus draft={draft} onOpenEditor={() => setShowFullBrief(true)} />
              {showFullBrief ? (
                <RequestCanvas
                  draft={draft}
                  onDraftChange={setDraft}
                  visitorSessionId={visitorSessionId}
                  identity={identity}
                  onIdentityChange={setIdentity}
                  highlightedFields={highlightedFields}
                  currentStepField={
                    currentStep.kind === "need" ? (currentStep.field as TrackedField) : null
                  }
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function isIdentitySkipped(identity: RequestIdentity): boolean {
  return (
    identity.credibility.includes("Search-only") ||
    (identity.name.trim().length > 0 && identity.email.trim().length > 0)
  );
}
