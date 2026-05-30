"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, Check, ShieldCheck } from "lucide-react";

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
import type {
  JobRequestCardBlock,
  NetworkManualSearchResult,
  NetworkProfileCardBlock,
  ReviewCardBlock,
  SuggestedCandidate,
} from "@/lib/engine";
import { ReviewCardBlockComponent } from "@/components/blocks/review-card-block";
import { WorkspaceUpsellCta } from "@/components/network/workspace-upsell-cta";

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
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import type { NetworkEntryIntent } from "@/lib/network-entry-intent";
import { ModeToggle } from "./mode-toggle";
import { NetworkKbShelf } from "./network-kb-shelf";
import { NetworkProfileCardRenderer } from "./network-profile-card-renderer";
import { PreviewPane, type NetworkChatMode } from "./preview-pane";
import { SuggestedCandidatesPanel } from "./suggested-candidates-panel";
import { SearchBox, type ManualSearchSubmit } from "@/components/network/search-box";
import { SearchResultsPanel } from "@/components/network/search-results-panel";
import type { PossibleConnectionFeedbackKind } from "@/components/network/possible-connection-card";

const SESSION_KEY = "ditto-network-lane-session";
const FRONT_DOOR_SESSION_KEY = "ditto-chat-session";
const EXPERT_STAGE_LABELS = [
  "Value",
  "Bad fit",
  "Best-fit client",
  "Edge",
  "Hook",
  "Visibility",
  "Ready",
] as const;
const CLIENT_STAGE_LABELS = [
  "Outcome",
  "Reference",
  "Bad fit",
  "Success",
  "Budget",
  "Search range",
  "Matches",
] as const;

interface LaneMessage {
  role: "user" | "assistant";
  content: string;
  block?: JobRequestCardBlock | ReviewCardBlock;
  upsell?: {
    copy: string;
    declineLabel: string;
  };
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

function laneStage({
  mode,
  expertStep,
  clientStep,
  clientMatched,
}: {
  mode: NetworkChatMode;
  expertStep: number;
  clientStep: number;
  clientMatched: boolean;
}) {
  if (mode === "expert") {
    const index = Math.min(expertStep, EXPERT_STAGE_LABELS.length - 1);
    return {
      label: EXPERT_STAGE_LABELS[index],
      current: Math.min(index + 1, EXPERT_LANE_QUESTIONS.length),
      total: EXPERT_LANE_QUESTIONS.length,
      note: "We are building a public card. You choose visibility; outreach still needs approval.",
    };
  }

  const index = clientMatched
    ? CLIENT_STAGE_LABELS.length - 1
    : Math.min(clientStep, CLIENT_LANE_QUESTIONS.length - 1);
  return {
    label: CLIENT_STAGE_LABELS[index],
    current: clientMatched ? CLIENT_STAGE_LABELS.length : Math.min(index + 1, CLIENT_LANE_QUESTIONS.length),
    total: CLIENT_STAGE_LABELS.length,
    note: "We are building a private brief. Budget and bad-fit filters stay out of candidate-facing copy.",
  };
}

function laneBrief(mode: NetworkChatMode) {
  if (mode === "client") {
    return {
      kicker: "Client lane",
      title: "Write the brief before asking for intros.",
      summary:
        "Mira turns a rough need into a candidate-safe brief, checks who fits, and keeps sensitive filters private.",
      points: [
        { label: "Why", copy: "Specific briefs make warm introductions easier to trust." },
        { label: "What", copy: "An opportunity brief, matched candidates, and intro requests for review." },
        { label: "How", copy: "Answer the current prompt; the live brief updates as you go." },
      ],
    };
  }

  return {
    kicker: "Expert lane",
    title: "Build the card before anyone asks.",
    summary:
      "Alex asks for the sharp edges of your work, then turns them into a public card people can ask about.",
    points: [
      { label: "Why", copy: "The right opportunities need signal before they need your time." },
      { label: "What", copy: "A profile card with your value, fit, edge, and visibility setting." },
      { label: "How", copy: "Answer the prompt; approve the card before it becomes surfaceable." },
    ],
  };
}

export type NetworkChatEntryIntent = NetworkEntryIntent;

export function NetworkChatShell({
  initialMode,
  initialIntent,
  initialAnswer,
}: {
  initialMode: NetworkChatMode;
  initialIntent?: NetworkEntryIntent;
  initialAnswer?: string;
}) {
  // page.tsx only forwards `initialIntent` when the URL carried an explicit,
  // canonical intent value. Mode-toggle navigations drop the param, so this
  // effect never fires on mode switches — it tracks only deliberate entry
  // selections from /network.
  useEffect(() => {
    if (!initialIntent) return;
    trackMarketingEvent(
      "network_entry_selected",
      { intent: initialIntent, mode: initialMode },
      "network-chat",
    );
    // initialMode intentionally omitted from deps: an explicit-intent URL is
    // a one-shot signal on mount, and initialMode does not change for the
    // lifetime of a given page render (mode toggle navigates, remounting).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIntent]);
  const [currentMode, setCurrentMode] = useState<NetworkChatMode>(initialMode);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LaneMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState(initialAnswer ?? "");
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
  // Brief 274 — manual search grounded in the Active Request brief.
  const [manualSearchResult, setManualSearchResult] =
    useState<NetworkManualSearchResult | null>(null);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [manualSearchError, setManualSearchError] = useState<string | null>(null);
  const [connectionActionBusy, setConnectionActionBusy] = useState<{
    connectionId: string;
    kind: PossibleConnectionFeedbackKind;
  } | null>(null);
  const landingAnswerConsumedRef = useRef(false);

  useEffect(() => {
    const nextMode = initialMode;
    setCurrentMode(nextMode);
    setMessages([]);
    setError(null);
    setIsLoading(true);
    setInput(initialAnswer ?? "");
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
    setManualSearchResult(null);
    setManualSearchLoading(false);
    setManualSearchError(null);
    setConnectionActionBusy(null);
    landingAnswerConsumedRef.current = false;

    let cancelled = false;

    async function openLane() {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const sourceSessionId = window.localStorage.getItem(FRONT_DOOR_SESSION_KEY);
        const storedSessionId = window.localStorage.getItem(`${SESSION_KEY}:${nextMode}`);
        const response = await fetch("/api/v1/network/chat/lane", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
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
        window.clearTimeout(timeout);
        if (!cancelled) setIsLoading(false);
      }
    }

    void openLane();

    return () => {
      cancelled = true;
    };
  }, [initialMode, initialAnswer]);

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

  function showUpsell(copy: string, declineLabel: string) {
    if (upsellShown) return;
    setUpsellShown(true);
    appendMessage({
      role: "assistant",
      content: "",
      upsell: { copy, declineLabel },
    });
  }

  async function persistCard({
    visible,
    triggerUpsell,
    card = previewCard,
  }: {
    visible: boolean;
    triggerUpsell: boolean;
    card?: NetworkProfileCardBlock | null;
  }): Promise<{
    ok: boolean;
    handle?: string;
    upsell?: boolean;
    upsellCopy?: string | null;
    upsellDeclineLabel?: string | null;
  }> {
    if (!card) return { ok: false };

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
          card,
          wantsVisibility: visible,
          triggerUpsell,
        }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        handle?: string;
        upsell?: boolean;
        upsellCopy?: string | null;
        upsellDeclineLabel?: string | null;
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
      return {
        ok: true,
        handle: result.handle,
        upsell: result.upsell,
        upsellCopy: result.upsellCopy,
        upsellDeclineLabel: result.upsellDeclineLabel,
      };
    } finally {
      setPersisting(false);
    }
  }

  async function maybeShowClientUpsell() {
    if (upsellShown || !sessionId) return;
    try {
      const response = await fetch("/api/v1/network/workspace-upsell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          trigger: "client-q6",
        }),
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        fired?: boolean;
        copy?: string | null;
        declineLabel?: string | null;
      };
      if (payload.fired && payload.copy) {
        showUpsell(payload.copy, payload.declineLabel || "Not now, just my brief");
      }
    } catch {
      // The upsell is non-blocking; losing it must not break the completed card.
    }
  }

  async function claimCard(triggerUpsell = wantsVisible) {
    const result = await persistCard({ visible: wantsVisible, triggerUpsell });
    if (!result.ok || !result.handle) return;

    appendMessage({
      role: "assistant",
      content: `Saved. Your public link is /people/${result.handle}; you can still edit this.`,
    });
    if (result.upsell && result.upsellCopy) {
      showUpsell(result.upsellCopy, result.upsellDeclineLabel || "Not now, just my card");
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
    const nextAnswers = { ...expertAnswers, [answerKey]: answer };
    setExpertAnswers(nextAnswers);

    if (expertStep === 5) {
      const visible = wantsNetworkVisibility(answer);
      const completedCard = buildNetworkProfileCard({
        answers: nextAnswers,
        displayName,
        greeterName,
        handle: claimedHandle || handleInput,
        visible,
      });
      setWantsVisible(visible);
      setExpertStep(6);
      appendMessage({
        role: "assistant",
        content: visible
          ? "I'll keep you surfaceable, but I'll check with you before reaching out."
          : "Got it. I'll keep this on request and won't promote you.",
      });
      void persistCard({ visible, triggerUpsell: true, card: completedCard }).then((result) => {
        if (result.upsell && result.upsellCopy) {
          showUpsell(result.upsellCopy, result.upsellDeclineLabel || "Not now, just my card");
        }
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
      content: "Checking on-network candidates against the brief...",
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
            ? "I found candidates that map back to the brief."
            : "Nobody on-network matches your shape yet. Want me to scan further?",
      });
    } catch {
      setClientMatchError("I couldn't finish the match search. Try again, or ask me to widen the brief.");
      appendMessage({
        role: "assistant",
        content: "I couldn't finish the match search. Try again, or ask me to widen the brief.",
      });
    } finally {
      setClientMatchPending(false);
    }
  }

  async function runManualSearch(submit: ManualSearchSubmit) {
    setManualSearchLoading(true);
    setManualSearchError(null);
    setManualSearchResult(null);
    appendMessage({
      role: "user",
      content: `Find me: ${submit.query}`,
    });
    try {
      const response = await fetch("/api/v1/network/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          query: submit.query,
          mode: submit.mode,
          sourcesAllowed: submit.sourcesAllowed,
          // Grounding the search in the brief is what lets the engine
          // scrub the seeker's private budget/anti-persona from the copy.
          jobRequestCard: clientMatchCard ?? undefined,
          sessionId,
          visitorSessionId: sessionId,
        }),
      });
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        result: NetworkManualSearchResult;
      };
      setManualSearchResult(data.result);
      appendMessage({
        role: "assistant",
        content:
          data.result.connections.length > 0
            ? "Here are the possible connections I'd put forward — with why, the evidence, and the risks. Nothing happens to them until you say so."
            : "Nothing strong enough to put forward yet. Tell me what to change and I'll run it again.",
      });
    } catch {
      setManualSearchError(
        "I couldn't finish that search. Try again, or narrow what you're looking for.",
      );
    } finally {
      setManualSearchLoading(false);
    }
  }

  async function recordConnectionAction(
    kind: PossibleConnectionFeedbackKind,
    connectionId: string,
  ) {
    if (!manualSearchResult) return;
    setConnectionActionBusy({ connectionId, kind });
    try {
      const response = await fetch("/api/v1/network/search", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          searchRunId: manualSearchResult.searchRunId,
          kind,
          possibleConnectionId: connectionId,
          sessionId,
          visitorSessionId: sessionId,
        }),
      });
      if (!response.ok) {
        throw new Error(`Feedback failed: ${response.status}`);
      }
      const data = (await response.json()) as {
        result: { notice?: string | null };
      };
      // Hidden / not-a-fit drop out of the visible set immediately so the
      // seeker isn't shown what they just dismissed (AC #12).
      if (kind === "hide" || kind === "not-a-fit") {
        setManualSearchResult((prev) =>
          prev
            ? {
                ...prev,
                connections: prev.connections.filter(
                  (connection) => connection.id !== connectionId,
                ),
              }
            : prev,
        );
      }
      if (data.result?.notice) {
        appendMessage({ role: "assistant", content: data.result.notice });
      }
    } catch {
      appendMessage({
        role: "assistant",
        content:
          "I couldn't record that just now — nothing was sent. Try that action again.",
      });
    } finally {
      setConnectionActionBusy(null);
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
      void maybeShowClientUpsell();
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

  useEffect(() => {
    const answer = initialAnswer?.trim();
    if (isLoading || landingAnswerConsumedRef.current || !answer) return;

    landingAnswerConsumedRef.current = true;
    if (currentMode === "expert") {
      handleExpertSubmit(answer);
      return;
    }
    handleClientSubmit(answer);
    // `initialAnswer` is a one-shot seed from `/network`, consumed after the
    // lane opens. The submit handlers intentionally use the current first-step
    // state from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, initialAnswer, isLoading]);

  async function handleOpenForOpportunities() {
    setWantsVisible(true);
    const result = await persistCard({ visible: true, triggerUpsell: true });
    if (!result.ok || !result.handle) return;

    appendMessage({
      role: "assistant",
      content: "You're now surfaceable in candidate-match results. I'll always check with you before reaching out.",
    });
    if (result.upsell && result.upsellCopy) {
      showUpsell(result.upsellCopy, result.upsellDeclineLabel || "Not now, just my card");
    }
  }

  async function handleFindClients() {
    const result = await persistCard({ visible: wantsVisible, triggerUpsell: true });
    if (!result.ok || !result.handle) return;

    if (result.upsell && result.upsellCopy) {
      showUpsell(result.upsellCopy, result.upsellDeclineLabel || "Not now, just my card");
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
              content: "Send the line you want this card to be built around.",
            });
          }}
          onOpenForOpportunities={() => void handleOpenForOpportunities()}
          onFindClients={() => void handleFindClients()}
        />
        <div className="grid w-full max-w-full gap-3 rounded-2xl border border-border bg-white p-4 shadow-subtle sm:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
            Name
            <input
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                if (!claimedHandle) setHandleInput(simpleNetworkHandle(event.target.value));
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm font-medium normal-case tracking-normal text-text-primary outline-none transition focus:border-text-primary"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
            Handle
            <input
              value={handleInput}
              onChange={(event) => {
                setHandleInput(simpleNetworkHandle(event.target.value));
                setClaimedHandle(null);
              }}
              className="h-11 rounded-md border border-border bg-background px-3 text-sm font-medium normal-case tracking-normal text-text-primary outline-none transition focus:border-text-primary"
            />
          </label>
          <button
            type="button"
            disabled={persisting}
            onClick={() => void claimCard()}
            className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
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
                  className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-text-primary/25 hover:text-text-primary"
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

  const stage = laneStage({
    mode: currentMode,
    expertStep,
    clientStep,
    clientMatched: Boolean(clientMatchCard && !clientMatchPending && !clientMatchError),
  });
  const brief = laneBrief(currentMode);

  return (
    <main className="min-h-screen bg-background text-text-primary">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <section className="flex min-h-screen flex-1 flex-col border-r border-border bg-background">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
            <Link
              href="/network"
              className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Network
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="hidden items-center gap-3 text-sm text-text-secondary sm:flex">
                <span className="font-semibold text-text-primary">{stage.label}</span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span>{stage.current}/{stage.total}</span>
              </div>
              <Link
                href={
                  sessionId
                    ? `/network/privacy?sessionId=${encodeURIComponent(sessionId)}&context=${currentMode}`
                    : "/network/privacy"
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Privacy & your data
              </Link>
              <ModeToggle mode={currentMode} />
            </div>
            <div className="basis-full sm:hidden">
              <div className="flex items-center justify-between gap-3 text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">{stage.label}</span>
                <span>{stage.current}/{stage.total}</span>
              </div>
            </div>
          </header>

          <Conversation className="flex-1 px-4 py-5 sm:px-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              <div className="rounded-[var(--radius-xl)] border border-border bg-white p-4 shadow-subtle">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-[520px]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                      {brief.kicker}
                    </p>
                    <h1 className="mt-1 text-xl font-semibold leading-tight text-text-primary">
                      {brief.title}
                    </h1>
                    <p className="mt-2 text-sm leading-5 text-text-secondary">
                      {brief.summary}
                    </p>
                  </div>
                  <div className="rounded-md bg-surface-raised px-3 py-2 text-sm font-semibold text-text-primary">
                    {stage.current}/{stage.total} · {stage.label}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {brief.points.map((point) => (
                    <div key={point.label} className="border-l border-border pl-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-primary">
                        {point.label}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-text-secondary">
                        {point.copy}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-5 text-text-secondary">
                  {stage.note}
                </p>
              </div>
              {isLoading ? (
                <div className="rounded-2xl border border-border bg-white p-4 text-sm text-text-secondary">
                  Opening the {currentMode === "client" ? "client" : "expert"} lane...
                </div>
              ) : null}
              {error ? (
                <div className="rounded-2xl border border-vivid-subtle-border bg-vivid-subtle p-4 text-sm text-vivid-deep">
                  {error}
                </div>
              ) : null}
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={
                    message.upsell
                      ? "max-w-[88%]"
                      : message.role === "assistant"
                      ? "max-w-[88%] border-l-2 border-vivid/70 py-2 pl-4 text-base leading-6 text-text-primary"
                      : "ml-auto max-w-[78%] rounded-2xl bg-accent px-4 py-3 text-base leading-6 text-accent-foreground shadow-medium"
                  }
                >
                  {message.upsell ? (
                    <WorkspaceUpsellCta
                      copy={message.upsell.copy}
                      declineLabel={message.upsell.declineLabel}
                      sessionId={sessionId}
                      context={currentMode === "client" ? "client" : "expert"}
                      className="mt-0"
                    />
                  ) : (
                    message.content
                  )}
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
                    <div className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-text-secondary shadow-subtle">
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

                  {/* Manual Search (Brief 274) — grounded in the brief that
                      gates this same block, so it shares the one gate. */}
                  <SearchBox
                    onSubmit={(submit) => void runManualSearch(submit)}
                    loading={manualSearchLoading}
                    groundedMode="from-request"
                    showSaveToRequest={false}
                  />
                  {manualSearchLoading ||
                  manualSearchResult ||
                  manualSearchError ? (
                    <SearchResultsPanel
                      result={manualSearchResult}
                      loading={manualSearchLoading}
                      error={manualSearchError}
                      busy={connectionActionBusy}
                      onAction={(kind, connectionId) =>
                        void recordConnectionAction(kind, connectionId)
                      }
                    />
                  ) : null}
                </div>
              ) : null}

              {currentMode === "expert" && intakeComplete && previewCard ? (
                <div className="grid max-w-full gap-3 overflow-hidden">
                  <div className="w-full max-w-[520px]">
                    <NetworkProfileCardRenderer card={previewCard} sessionId={sessionId} shareMode="studio" />
                  </div>
                  {renderCardControls()}
                  {claimedHandle ? <NetworkKbShelf sessionId={sessionId} /> : null}
                </div>
              ) : null}
            </div>
          </Conversation>

          <form
            onSubmit={handleSubmit}
            className="border-t border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-6"
          >
            <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-border bg-white px-3 py-2 shadow-medium">
              <textarea
                value={input}
                disabled={currentMode !== "expert" && currentMode !== "client"}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  currentMode === "expert"
                    ? "Answer the card prompt..."
                    : "Answer the brief prompt..."
                }
                rows={1}
                className="min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-base leading-5 text-text-primary outline-none placeholder:text-text-muted disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={(currentMode !== "expert" && currentMode !== "client") || input.trim().length === 0}
                aria-label="Send"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
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
