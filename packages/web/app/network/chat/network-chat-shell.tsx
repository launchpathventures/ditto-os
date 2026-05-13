"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, Check } from "lucide-react";

import { Conversation } from "@/components/ai-elements/conversation";
import {
  EXPERT_LANE_QUESTIONS,
  NETWORK_ANTI_PERSONA_OPTIONS,
  buildNetworkProfileCard,
  isVagueNetworkAntiPersona,
  simpleNetworkHandle,
  wantsNetworkVisibility,
  type ExpertIntakeAnswers,
} from "@/lib/network-expert-intake";
import {
  CLIENT_LANE_QUESTIONS,
  buildJobRequestCard,
  type ClientIntakeAnswers,
} from "@/lib/network-client-intake";
import type { JobRequestCardBlock, ReviewCardBlock, SuggestedCandidate } from "@/lib/engine";
import { ReviewCardBlockComponent } from "@/components/blocks/review-card-block";

import {
  ClientCardActions,
  scanOffNetwork,
  type ScoutResponsePayload,
} from "./client-card-actions";
import { ExpertCardActions } from "./expert-card-actions";
import {
  JobRequestCardRenderer,
  type JobRequestEditableField,
} from "./job-request-card-renderer";
import { ModeToggle } from "./mode-toggle";
import { NetworkKbShelf } from "./network-kb-shelf";
import { NetworkProfileCardRenderer } from "./network-profile-card-renderer";
import { PreviewPane, type NetworkChatMode } from "./preview-pane";
import { SuggestedCandidatesPanel } from "./suggested-candidates-panel";
import { emitWorkspaceUpsell } from "./workspace-upsell";

const SESSION_KEY = "ditto-network-lane-session";
const FRONT_DOOR_SESSION_KEY = "ditto-chat-session";

interface LaneMessage {
  role: "user" | "assistant";
  content: string;
  block?: JobRequestCardBlock | ReviewCardBlock;
}

interface LaneResponse {
  sessionId: string;
  context: NetworkChatMode;
  personaId: string;
  greeterName: string;
  userName?: string | null;
  opener: string;
  messages: LaneMessage[];
}

export function clientPreviewProgress(clientStep: number, matchReturned = false): number {
  if (matchReturned) return CLIENT_LANE_QUESTIONS.length + 1;
  return Math.min(clientStep + 1, CLIENT_LANE_QUESTIONS.length);
}

const CLIENT_EDIT_FIELD_KEYS: Record<JobRequestEditableField, keyof ClientIntakeAnswers> = {
  outcome: "jtbd",
  reference: "referenceShape",
  "bad fit": "antiPersonaMd",
  "success criteria": "successCriteria",
  budget: "budgetShape",
  "scout preference": "scoutOptIn",
};

export function clientEditAnswerKey(field: JobRequestEditableField): keyof ClientIntakeAnswers {
  return CLIENT_EDIT_FIELD_KEYS[field];
}

export function NetworkChatShell({ initialMode }: { initialMode: NetworkChatMode }) {
  const [currentMode, setCurrentMode] = useState<NetworkChatMode>(initialMode);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LaneMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [expertStep, setExpertStep] = useState(0);
  const [expertAnswers, setExpertAnswers] = useState<ExpertIntakeAnswers>({});
  const [clientStep, setClientStep] = useState(0);
  const [clientAnswers, setClientAnswers] = useState<ClientIntakeAnswers>({});
  const [pendingClientEditField, setPendingClientEditField] = useState<JobRequestEditableField | null>(null);
  const [clientMatchCard, setClientMatchCard] = useState<JobRequestCardBlock | null>(null);
  const [clientCandidates, setClientCandidates] = useState<SuggestedCandidate[]>([]);
  const [selectedCandidateHandle, setSelectedCandidateHandle] = useState<string | null>(null);
  const [clientMatchPending, setClientMatchPending] = useState(false);
  const [clientMatchError, setClientMatchError] = useState<string | null>(null);
  const [clientRefreshInFlight, setClientRefreshInFlight] = useState(false);
  const [antiFallbackOpen, setAntiFallbackOpen] = useState(false);
  const [displayName, setDisplayName] = useState("You");
  const [handleInput, setHandleInput] = useState("you");
  const [greeterName, setGreeterName] = useState("Alex");
  const [claimedHandle, setClaimedHandle] = useState<string | null>(null);
  const [handleAlternatives, setHandleAlternatives] = useState<string[]>([]);
  const [wantsVisible, setWantsVisible] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [upsellShown, setUpsellShown] = useState(false);
  const [tweakMode, setTweakMode] = useState(false);

  useEffect(() => {
    const nextMode = initialMode;
    setCurrentMode(nextMode);
    setMessages([]);
    setError(null);
    setIsLoading(true);
    setInput("");
    setExpertStep(0);
    setExpertAnswers({});
    setClientStep(0);
    setClientAnswers({});
    setPendingClientEditField(null);
    setClientMatchCard(null);
    setClientCandidates([]);
    setSelectedCandidateHandle(null);
    setClientMatchPending(false);
    setClientMatchError(null);
    setClientRefreshInFlight(false);
    setAntiFallbackOpen(false);
    setGreeterName(nextMode === "client" ? "Mira" : "Alex");
    setClaimedHandle(null);
    setHandleAlternatives([]);
    setUpsellShown(false);
    setTweakMode(false);

    let cancelled = false;

    async function openLane() {
      try {
        const sourceSessionId = window.localStorage.getItem(FRONT_DOOR_SESSION_KEY);
        const storedSessionId = window.localStorage.getItem(`${SESSION_KEY}:${nextMode}`);
        const response = await fetch("/api/v1/network/chat/lane", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            context: nextMode,
            sessionId: storedSessionId,
            sourceSessionId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Lane open failed: ${response.status}`);
        }

        const data = (await response.json()) as LaneResponse;
        if (cancelled) return;

        window.localStorage.setItem(`${SESSION_KEY}:${nextMode}`, data.sessionId);
        setSessionId(data.sessionId);
        setGreeterName(data.greeterName || (data.personaId === "mira" ? "Mira" : "Alex"));
        if (data.userName) {
          setDisplayName(data.userName);
          setHandleInput(simpleNetworkHandle(data.userName));
        }

        const laneMessages =
          data.messages.length > 0 ? data.messages : [{ role: "assistant" as const, content: data.opener }];
        setMessages(
          nextMode === "expert" && !laneMessages.some((message) => message.content === EXPERT_LANE_QUESTIONS[0])
            ? [...laneMessages, { role: "assistant", content: EXPERT_LANE_QUESTIONS[0] }]
            : nextMode === "client" && !laneMessages.some((message) => message.content === CLIENT_LANE_QUESTIONS[0])
              ? [...laneMessages, { role: "assistant", content: CLIENT_LANE_QUESTIONS[0] }]
            : laneMessages,
        );
      } catch {
        if (cancelled) return;
        const fallbackSessionId =
          window.localStorage.getItem(`${SESSION_KEY}:${nextMode}`) ||
          `${nextMode}-${crypto.randomUUID()}`;
        window.localStorage.setItem(`${SESSION_KEY}:${nextMode}`, fallbackSessionId);
        setSessionId(fallbackSessionId);
        setError("I couldn't reopen the full lane, so this preview is running locally for now.");
        setMessages(
          nextMode === "expert"
            ? [
                {
                  role: "assistant",
                  content:
                    "Good. I'm Alex. I'll ask the awkward-but-useful questions and turn the answers into a card people can actually use.",
                },
                { role: "assistant", content: EXPERT_LANE_QUESTIONS[0] },
              ]
            : [
                {
                  role: "assistant",
                  content:
                    "Good. I'm Mira. I'll help you turn the person you're looking for into a shape I can go hunt for.",
                },
                { role: "assistant", content: CLIENT_LANE_QUESTIONS[0] },
              ],
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void openLane();

    return () => {
      cancelled = true;
    };
  }, [initialMode]);

  const intakeComplete = expertStep >= EXPERT_LANE_QUESTIONS.length;
  const previewCard = useMemo(
    () =>
      currentMode === "expert"
        ? buildNetworkProfileCard({
            answers: expertAnswers,
            displayName,
            greeterName,
            handle: claimedHandle || handleInput,
            visible: wantsVisible,
          })
        : null,
    [claimedHandle, currentMode, displayName, expertAnswers, greeterName, handleInput, wantsVisible],
  );
  const clientPreviewCard = useMemo(
    () =>
      currentMode === "client"
        ? buildJobRequestCard({
            answers: clientAnswers,
            greeter: greeterName.toLowerCase() === "mira" ? "mira" : "alex",
          })
        : null,
    [clientAnswers, currentMode, greeterName],
  );
  const selectedCandidate = useMemo(
    () => clientCandidates.find((candidate) => candidate.handle === selectedCandidateHandle) ?? null,
    [clientCandidates, selectedCandidateHandle],
  );

  function appendMessage(message: LaneMessage) {
    setMessages((current) => [...current, message]);
  }

  function replaceLatestJobRequestCard(card: JobRequestCardBlock) {
    setMessages((current) => {
      let index = -1;
      for (let cursor = current.length - 1; cursor >= 0; cursor -= 1) {
        if (current[cursor].block?.type === "job-request-card") {
          index = cursor;
          break;
        }
      }
      if (index === -1) {
        return [...current, { role: "assistant", content: "I updated the opportunity brief.", block: card }];
      }
      const next = current.slice();
      next[index] = { ...next[index], block: card };
      return next;
    });
  }

  function mergeScoutedCandidates(payload: ScoutResponsePayload) {
    appendMessage({
      role: "assistant",
      content: payload.review.outputText,
      block: payload.review,
    });
    if (payload.candidates.length === 0) return;

    const merged = new Map(clientCandidates.map((candidate) => [candidate.handle, candidate]));
    for (const candidate of payload.candidates) {
      merged.set(candidate.handle, candidate);
    }
    const nextCandidates = Array.from(merged.values()).slice(0, 10);
    setClientCandidates(nextCandidates);
    setClientMatchCard((currentCard) =>
      currentCard
        ? {
            ...currentCard,
            suggestedCandidates: nextCandidates,
          }
        : currentCard,
    );
  }

  async function scoutMoreLike(candidate: SuggestedCandidate) {
    if (!clientMatchCard) return;
    appendMessage({
      role: "assistant",
      content: `I'll use ${candidate.name} as a loose pattern only and scan public sources.`,
    });
    try {
      const payload = await scanOffNetwork({
        jobRequestCard: clientMatchCard,
        seedCandidate: candidate,
        sessionId,
      });
      mergeScoutedCandidates(payload);
    } catch {
      appendMessage({
        role: "assistant",
        content: "I couldn't complete that off-network scan. Try again in a moment.",
      });
    }
  }

  function nextQuestion(step: number) {
    const question = EXPERT_LANE_QUESTIONS[step];
    if (question) {
      appendMessage({ role: "assistant", content: question });
    }
  }

  function showUpsell(handle: string) {
    if (upsellShown) return;
    setUpsellShown(true);
    appendMessage({
      role: "assistant",
      content: emitWorkspaceUpsell("expert", { sessionId, handle }),
    });
  }

  async function persistCard({
    visible,
    triggerUpsell,
  }: {
    visible: boolean;
    triggerUpsell: boolean;
  }): Promise<{ ok: boolean; handle?: string; upsell?: boolean }> {
    if (!previewCard) return { ok: false };

    setPersisting(true);
    setHandleAlternatives([]);
    try {
      const response = await fetch("/api/v1/network/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          name: displayName,
          handle: handleInput,
          card: previewCard,
          wantsVisibility: visible,
          triggerUpsell,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        handle?: string;
        upsell?: boolean;
        alternatives?: string[];
        reason?: string;
      };

      if (!response.ok || !result.ok || !result.handle) {
        setHandleAlternatives(response.status === 409 ? result.alternatives ?? [] : []);
        const failureCopy =
          response.status === 409
            ? result.reason === "reserved"
              ? "That handle is reserved. Pick one of these or try another."
              : "That handle is already taken. Pick one of these or try another."
            : response.status === 503 || result.error === "network_db_unavailable"
              ? "I couldn't reach the network database. Try saving again in a moment."
              : response.status === 403
                ? "I need the live lane connected before I can save this card. Refresh and try again."
                : "I couldn't save that card. Try again in a moment.";
        appendMessage({
          role: "assistant",
          content: failureCopy,
        });
        return { ok: false };
      }

      setClaimedHandle(result.handle);
      setHandleInput(result.handle);
      setWantsVisible(visible);
      return { ok: true, handle: result.handle, upsell: result.upsell };
    } finally {
      setPersisting(false);
    }
  }

  async function claimCard(triggerUpsell = wantsVisible) {
    const result = await persistCard({ visible: wantsVisible, triggerUpsell });
    if (!result.ok || !result.handle) return;

    appendMessage({
      role: "assistant",
      content: `Handle's yours: /people/${result.handle}. This is still editable.`,
    });
    if (result.upsell) {
      showUpsell(result.handle);
    }
  }

  function handleExpertSubmit(value: string) {
    const answer = value.trim();
    if (!answer) return;

    appendMessage({ role: "user", content: answer });
    setInput("");

    if (tweakMode) {
      setExpertAnswers((current) => ({ ...current, hook: answer }));
      setTweakMode(false);
      appendMessage({ role: "assistant", content: "Good. I tightened the card around that line." });
      return;
    }

    if (antiFallbackOpen) {
      const antiPersona = isVagueNetworkAntiPersona(answer) ? null : answer;
      setExpertAnswers((current) => ({ ...current, antiPersona }));
      setAntiFallbackOpen(false);
      setExpertStep(2);
      nextQuestion(2);
      return;
    }

    if (expertStep === 1 && isVagueNetworkAntiPersona(answer)) {
      setAntiFallbackOpen(true);
      appendMessage({
        role: "assistant",
        content: `Don't worry, I'll keep this soft. Pick one or rewrite it: ${NETWORK_ANTI_PERSONA_OPTIONS.join(
          " / ",
        )}.`,
      });
      return;
    }

    const answerKey = ["uvp", "antiPersona", "idealClient", "skills", "hook", "visibility"][
      expertStep
    ] as keyof ExpertIntakeAnswers;
    setExpertAnswers((current) => ({ ...current, [answerKey]: answer }));

    if (expertStep === 5) {
      const visible = wantsNetworkVisibility(answer);
      setWantsVisible(visible);
      setExpertStep(6);
      appendMessage({
        role: "assistant",
        content: visible
          ? "I'll keep you surfaceable, but I'll check with you before reaching out."
          : "Got it. I'll keep this on request and won't promote you.",
      });
      return;
    }

    const nextStep = expertStep + 1;
    setExpertStep(nextStep);
    nextQuestion(nextStep);
  }

  function nextClientQuestion(step: number) {
    const question = CLIENT_LANE_QUESTIONS[step];
    if (question) {
      appendMessage({ role: "assistant", content: question });
    }
  }

  async function requestClientMatches(card: JobRequestCardBlock) {
    setClientMatchPending(true);
    setClientMatchError(null);
    setClientCandidates([]);
    setSelectedCandidateHandle(null);
    appendMessage({
      role: "assistant",
      content: "thinking about who'd be a fit...",
    });

    try {
      const response = await fetch("/api/v1/network/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobRequestCard: card,
          sessionId,
        }),
      });
      if (!response.ok) {
        throw new Error(`Match failed: ${response.status}`);
      }
      const candidates = (await response.json()) as SuggestedCandidate[];
      const cardWithCandidates = { ...card, suggestedCandidates: candidates };
      setClientMatchCard(cardWithCandidates);
      setClientCandidates(candidates);
      appendMessage({
        role: "assistant",
        content:
          candidates.length > 0
            ? "Three I'd put forward — they each map back to the shape you described."
            : "Nobody on-network matches your shape yet. Want me to scan further?",
      });
    } catch {
      setClientMatchError("I tripped looking for matches. Give me a sec — try again, or ask me to widen the net.");
      appendMessage({
        role: "assistant",
        content: "I tripped looking for matches. Give me a sec — try again, or ask me to widen the net.",
      });
    } finally {
      setClientMatchPending(false);
    }
  }

  function handleClientSubmit(value: string) {
    const answer = value.trim();
    if (!answer) return;

    appendMessage({ role: "user", content: answer });
    setInput("");

    if (pendingClientEditField) {
      const answerKey = clientEditAnswerKey(pendingClientEditField);
      const nextAnswers = { ...clientAnswers, [answerKey]: answer };
      const card = buildJobRequestCard({
        answers: nextAnswers,
        greeter: greeterName.toLowerCase() === "mira" ? "mira" : "alex",
      });
      setPendingClientEditField(null);
      setClientAnswers(nextAnswers);
      replaceLatestJobRequestCard(card);
      setClientMatchCard(card);
      appendMessage({
        role: "assistant",
        content: `Good. I updated the ${pendingClientEditField}. I'll refresh the match list around that.`,
      });
      void requestClientMatches(card);
      return;
    }

    const answerKey = [
      "jtbd",
      "referenceShape",
      "antiPersonaMd",
      "successCriteria",
      "budgetShape",
      "scoutOptIn",
    ][clientStep] as keyof ClientIntakeAnswers;
    const nextAnswers = { ...clientAnswers, [answerKey]: answer };
    setClientAnswers(nextAnswers);

    if (clientStep >= CLIENT_LANE_QUESTIONS.length - 1) {
      setClientStep(CLIENT_LANE_QUESTIONS.length);
      const card = buildJobRequestCard({
        answers: nextAnswers,
        greeter: greeterName.toLowerCase() === "mira" ? "mira" : "alex",
      });
      appendMessage({
        role: "assistant",
        content: "I wrote that into an opportunity brief.",
        block: card,
      });
      setClientMatchCard(card);
      void requestClientMatches(card);
      return;
    }

    const nextStep = clientStep + 1;
    setClientStep(nextStep);
    nextClientQuestion(nextStep);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentMode === "expert") {
      handleExpertSubmit(input);
      return;
    }
    handleClientSubmit(input);
  }

  async function handleOpenForOpportunities() {
    setWantsVisible(true);
    const result = await persistCard({ visible: true, triggerUpsell: true });
    if (!result.ok || !result.handle) return;

    appendMessage({
      role: "assistant",
      content: "You're now surfaceable in candidate-match results. I'll always check with you before reaching out.",
    });
    if (result.upsell) {
      showUpsell(result.handle);
    }
  }

  async function handleFindClients() {
    const result = await persistCard({ visible: wantsVisible, triggerUpsell: true });
    if (!result.ok || !result.handle) return;

    if (result.upsell) {
      showUpsell(result.handle);
    }
    appendMessage({
      role: "assistant",
      content: "I'll open the seeker lane next. That keeps the client hunt separate from this card.",
    });
    window.setTimeout(() => {
      window.location.href = `/network/chat?mode=client${sessionId ? `&sourceSessionId=${sessionId}` : ""}`;
    }, 350);
  }

  function renderCardControls() {
    return (
      <>
        <ExpertCardActions
          className="w-full max-w-full"
          wantsVisibility={wantsVisible}
          onTweak={() => {
            setTweakMode(true);
            appendMessage({
              role: "assistant",
              content: "Send me the line you want this card to orbit around.",
            });
          }}
          onOpenForOpportunities={() => void handleOpenForOpportunities()}
          onFindClients={() => void handleFindClients()}
        />
        <div className="grid w-full max-w-full gap-3 rounded-[24px] border border-[#201a17]/10 bg-white/85 p-4 shadow-[0_12px_30px_rgba(32,26,23,0.06)] sm:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#786a63]">
            Name
            <input
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                if (!claimedHandle) setHandleInput(simpleNetworkHandle(event.target.value));
              }}
              className="h-11 rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 text-sm font-medium normal-case tracking-normal text-[#201a17] outline-none transition focus:border-[#201a17]/30"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#786a63]">
            Handle
            <input
              value={handleInput}
              onChange={(event) => {
                setHandleInput(simpleNetworkHandle(event.target.value));
                setClaimedHandle(null);
              }}
              className="h-11 rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 text-sm font-medium normal-case tracking-normal text-[#201a17] outline-none transition focus:border-[#201a17]/30"
            />
          </label>
          <button
            type="button"
            disabled={persisting}
            onClick={() => void claimCard()}
            className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-2xl bg-[#201a17] px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Check className="h-4 w-4" />
            {claimedHandle ? "Saved" : "Claim"}
          </button>
          {handleAlternatives.length > 0 ? (
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              {handleAlternatives.map((alternative) => (
                <button
                  key={alternative}
                  type="button"
                  onClick={() => setHandleInput(alternative)}
                  className="rounded-full border border-[#201a17]/10 bg-[#f8efe4] px-3 py-1.5 text-xs font-semibold text-[#4a3f39] transition hover:border-[#201a17]/25"
                >
                  {alternative}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[#fffaf4] text-[#201a17]">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <section className="flex min-h-screen flex-1 flex-col border-r border-[#201a17]/10">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#201a17]/10 px-4 py-3 sm:px-6">
            <Link
              href="/network"
              className="inline-flex items-center gap-2 text-sm font-medium text-[#5e514b] transition hover:text-[#201a17]"
            >
              <ArrowLeft className="h-4 w-4" />
              Network
            </Link>
            <ModeToggle mode={currentMode} />
          </header>

          <Conversation className="flex-1 px-4 py-5 sm:px-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              {isLoading ? (
                <div className="rounded-3xl border border-[#201a17]/10 bg-white/70 p-4 text-sm text-[#6f625c]">
                  Opening the lane...
                </div>
              ) : null}
              {error ? (
                <div className="rounded-3xl border border-[#d27b5d]/30 bg-[#fff0e8] p-4 text-sm text-[#8d3f25]">
                  {error}
                </div>
              ) : null}
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={
                    message.role === "assistant"
                      ? "max-w-[84%] rounded-[24px] border border-[#201a17]/10 bg-white/85 px-4 py-3 text-[15px] leading-6 shadow-[0_12px_30px_rgba(32,26,23,0.06)]"
                      : "ml-auto max-w-[84%] rounded-[24px] bg-[#201a17] px-4 py-3 text-[15px] leading-6 text-white shadow-[0_12px_30px_rgba(32,26,23,0.12)]"
                  }
                >
                  {message.content}
                  {message.block?.type === "job-request-card" ? (
                    <div className="mt-4 max-w-full">
                      <JobRequestCardRenderer card={message.block} />
                    </div>
                  ) : null}
                  {message.block?.type === "review_card" ? (
                    <div className="mt-4 max-w-full">
                      <ReviewCardBlockComponent block={message.block} />
                    </div>
                  ) : null}
                </div>
              ))}

              {currentMode === "client" && clientMatchCard ? (
                <div className="grid w-full max-w-full gap-3">
                  {clientMatchPending ? (
                    <div
                      aria-label="Loading suggested candidates"
                      className="grid gap-3 md:grid-cols-2"
                    >
                      {[0, 1, 2].map((index) => (
                        <div
                          key={index}
                          className="min-h-[148px] rounded-2xl bg-surface-raised p-3 shadow-subtle"
                        >
                          <div className="h-8 w-8 rounded-full bg-white/70" />
                          <div className="mt-4 h-3 w-2/3 rounded-full bg-white/70" />
                          <div className="mt-2 h-3 w-4/5 rounded-full bg-white/70" />
                          <div className="mt-6 h-9 rounded-md bg-white/70" />
                        </div>
                      ))}
                    </div>
                  ) : clientCandidates.length > 0 ? (
                    <SuggestedCandidatesPanel
                      candidates={clientCandidates}
                      jobRequestCard={clientMatchCard}
                      selectedCandidateHandle={selectedCandidateHandle}
                      setSelectedCandidateHandle={setSelectedCandidateHandle}
                      sessionId={sessionId}
                      onScoutLike={(candidate) => void scoutMoreLike(candidate)}
                      onRefreshInFlightChange={setClientRefreshInFlight}
                      onCandidatesRefresh={(nextCandidates) => {
                        setClientCandidates(nextCandidates);
                        setClientMatchCard({
                          ...clientMatchCard,
                          suggestedCandidates: nextCandidates,
                        });
                        if (
                          selectedCandidateHandle &&
                          !nextCandidates.some(
                            (candidate) => candidate.handle === selectedCandidateHandle,
                          )
                        ) {
                          setSelectedCandidateHandle(null);
                        }
                      }}
                    />
                  ) : null}

                  {clientMatchError ? (
                    <div className="rounded-2xl bg-surface-raised px-4 py-3 text-sm text-text-secondary">
                      {clientMatchError}{" "}
                      <button
                        type="button"
                        onClick={() => void requestClientMatches(clientMatchCard)}
                        className="font-semibold text-text-primary underline-offset-4 hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  ) : null}

                  {!clientMatchPending ? (
                    <ClientCardActions
                      selectedCandidate={selectedCandidate}
                      isRefreshInFlight={clientRefreshInFlight}
                      sessionId={sessionId}
                      jobRequestCard={clientMatchCard}
                      onScoutComplete={mergeScoutedCandidates}
                    />
                  ) : null}
                </div>
              ) : null}

              {currentMode === "expert" && intakeComplete && previewCard ? (
                <div className="grid max-w-full gap-3 overflow-hidden">
                  <div className="w-full max-w-[520px]">
                    <NetworkProfileCardRenderer card={previewCard} sessionId={sessionId} />
                  </div>
                  {renderCardControls()}
                  {claimedHandle ? <NetworkKbShelf sessionId={sessionId} /> : null}
                </div>
              ) : null}
            </div>
          </Conversation>

          <form
            onSubmit={handleSubmit}
            className="border-t border-[#201a17]/10 bg-[#fffaf4]/90 px-4 py-4 backdrop-blur sm:px-6"
          >
            <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-[26px] border border-[#201a17]/10 bg-white px-3 py-2 shadow-[0_18px_45px_rgba(32,26,23,0.08)]">
              <textarea
                value={input}
                disabled={currentMode !== "expert" && currentMode !== "client"}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  currentMode === "expert"
                    ? `Answer ${greeterName} here...`
                    : `Answer ${greeterName} here...`
                }
                rows={1}
                className="min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-[15px] leading-5 text-[#201a17] outline-none placeholder:text-[#a4958d] disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={(currentMode !== "expert" && currentMode !== "client") || input.trim().length === 0}
                aria-label="Send"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#201a17] text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>

        <PreviewPane
          mode={currentMode}
          profileCard={previewCard}
          jobRequestCard={clientPreviewCard}
          profileProgress={
            currentMode === "expert"
              ? Math.min(expertStep + 1, EXPERT_LANE_QUESTIONS.length)
              : clientPreviewProgress(
                  clientStep,
                  Boolean(clientMatchCard && !clientMatchPending && !clientMatchError),
                )
          }
          mobileControls={currentMode === "expert" && intakeComplete && previewCard ? renderCardControls() : null}
          onMobileEditRequest={(message, field) => {
            setPendingClientEditField(field);
            appendMessage({ role: "assistant", content: message });
          }}
        />
      </div>
    </main>
  );
}
