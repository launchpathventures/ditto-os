"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUp, Check } from "lucide-react";

import { Conversation } from "@/components/ai-elements/conversation";
import type { NetworkProfileCardBlock } from "@/lib/engine";

import { ExpertCardActions } from "./expert-card-actions";
import { ModeToggle } from "./mode-toggle";
import { NetworkProfileCardRenderer } from "./network-profile-card-renderer";
import { PreviewPane, type NetworkChatMode } from "./preview-pane";

const SESSION_KEY = "ditto-network-lane-session";
const FRONT_DOOR_SESSION_KEY = "ditto-network-chat-session";

const EXPERT_QUESTIONS = [
  "When somebody hires you, what's the actual thing they're paying you for?",
  "Who's the worst fit for you? I'd rather know that first.",
  "Tell me about a client you'd want more of. What were they like before they hired you?",
  "Three things you're better at than most people in your field. Just three.",
  "What's the line about you that would make somebody say 'oh, I should talk to them'?",
  "Are you actually open for new work right now? It's fine to say no — I won't promote you if you're not.",
] as const;

const UPSELL_COPY =
  "Card's ready. I'll save this and you can chat with me at `ditto.partners/people/{handle}` — share that link with anyone curious about you. One more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**";

const ANTI_PERSONA_OPTIONS = [
  "people who want a slide deck, not a pipeline",
  "teams shopping for free advice",
  "leaders who want strategy without implementation",
];

const SIGNAL_COLORS: NetworkProfileCardBlock["signalDots"][number]["color"][] = [
  "petal",
  "mint",
  "canary",
  "lavender",
];

interface LaneMessage {
  role: "user" | "assistant";
  content: string;
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

interface ExpertAnswers {
  uvp?: string;
  antiPersona?: string | null;
  idealClient?: string;
  skills?: string;
  hook?: string;
  visibility?: string;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "you";
}

function simpleHandle(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "expert"
  );
}

function isVagueAntiPersona(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length < 16 ||
    /^(not sure|idk|i don't know|dont know|anyone|everyone|no idea|skip|none|no one)$/i.test(normalized)
  );
}

function wantsVisibility(value: string): boolean {
  return /\b(yes|yeah|yep|open|available|sure|new work|taking)\b/i.test(value);
}

function skillsFrom(answer?: string): string[] {
  if (!answer) return ["positioning", "introductions", "follow-through"];

  const parts = answer
    .split(/[,;\n]|\b\d[.)]\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts.length > 0 ? parts : [answer]).slice(0, 3);
}

function buildCard({
  answers,
  displayName,
  greeterName,
  handle,
  visible,
}: {
  answers: ExpertAnswers;
  displayName: string;
  greeterName: string;
  handle: string;
  visible: boolean;
}): NetworkProfileCardBlock {
  const name = displayName.trim() || "Expert";
  const handleSlug = simpleHandle(handle || name);
  const signals = [
    { id: "uvp", label: "Value", filled: Boolean(answers.uvp) },
    { id: "fit", label: "Fit", filled: typeof answers.antiPersona !== "undefined" },
    { id: "client", label: "Client", filled: Boolean(answers.idealClient) },
    { id: "edge", label: "Edge", filled: Boolean(answers.skills) },
    { id: "hook", label: "Hook", filled: Boolean(answers.hook) },
    { id: "open", label: "Open", filled: Boolean(answers.visibility) },
  ];
  const skillBadges = skillsFrom(answers.skills).map((label, index) => ({
    label,
    color: SIGNAL_COLORS[index % SIGNAL_COLORS.length],
  }));
  const oneLineRole =
    answers.hook?.trim() ||
    answers.uvp?.trim() ||
    "I help good work find the right people.";

  return {
    type: "network-profile-card",
    handle: handleSlug,
    name,
    portraitUrl: null,
    cityLabel: null,
    oneLineRole,
    signalDots: signals.map((signal, index) => ({
      ...signal,
      color: SIGNAL_COLORS[index % SIGNAL_COLORS.length],
    })),
    badges: skillBadges,
    narrativeMd: answers.uvp?.trim() || null,
    antiPersonaMd: answers.antiPersona === undefined ? null : answers.antiPersona,
    greeterCuratedBy: greeterName.toLowerCase() === "mira" ? "mira" : "alex",
    lastUpdatedAt: new Date().toISOString(),
    visibility: visible ? "public" : "on-request",
    shareUrl: `/people/${handleSlug}`,
    ogImageUrl: `/api/v1/network/og/${handleSlug}`,
  };
}

export function NetworkChatShell({ initialMode }: { initialMode: NetworkChatMode }) {
  const [currentMode, setCurrentMode] = useState<NetworkChatMode>(initialMode);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LaneMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [expertStep, setExpertStep] = useState(0);
  const [expertAnswers, setExpertAnswers] = useState<ExpertAnswers>({});
  const [antiFallbackOpen, setAntiFallbackOpen] = useState(false);
  const [displayName, setDisplayName] = useState("You");
  const [handleInput, setHandleInput] = useState("you");
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
    setAntiFallbackOpen(false);
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
        if (data.userName) {
          setDisplayName(data.userName);
          setHandleInput(simpleHandle(data.userName));
        }

        const laneMessages =
          data.messages.length > 0 ? data.messages : [{ role: "assistant" as const, content: data.opener }];
        setMessages(
          nextMode === "expert" && !laneMessages.some((message) => message.content === EXPERT_QUESTIONS[0])
            ? [...laneMessages, { role: "assistant", content: EXPERT_QUESTIONS[0] }]
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
                { role: "assistant", content: EXPERT_QUESTIONS[0] },
              ]
            : [
                {
                  role: "assistant",
                  content:
                    "Good. I'm Mira. I'll help you turn the person you're looking for into a shape I can go hunt for.",
                },
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

  const intakeComplete = expertStep >= EXPERT_QUESTIONS.length;
  const previewCard = useMemo(
    () =>
      currentMode === "expert"
        ? buildCard({
            answers: expertAnswers,
            displayName,
            greeterName: "Alex",
            handle: claimedHandle || handleInput,
            visible: wantsVisible,
          })
        : null,
    [claimedHandle, currentMode, displayName, expertAnswers, handleInput, wantsVisible],
  );

  function appendMessage(message: LaneMessage) {
    setMessages((current) => [...current, message]);
  }

  function nextQuestion(step: number) {
    const question = EXPERT_QUESTIONS[step];
    if (question) {
      appendMessage({ role: "assistant", content: question });
    }
  }

  function showUpsell(handle: string) {
    if (upsellShown) return;
    setUpsellShown(true);
    appendMessage({
      role: "assistant",
      content: UPSELL_COPY.replace("{handle}", handle),
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
        handle?: string;
        upsell?: boolean;
        alternatives?: string[];
        reason?: string;
      };

      if (!response.ok || !result.ok || !result.handle) {
        setHandleAlternatives(result.alternatives ?? []);
        appendMessage({
          role: "assistant",
          content:
            result.reason === "reserved"
              ? "That handle is reserved. Pick one of these or try another."
              : "That handle is already taken. Pick one of these or try another.",
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
      const antiPersona = isVagueAntiPersona(answer) ? null : answer;
      setExpertAnswers((current) => ({ ...current, antiPersona }));
      setAntiFallbackOpen(false);
      setExpertStep(2);
      nextQuestion(2);
      return;
    }

    if (expertStep === 1 && isVagueAntiPersona(answer)) {
      setAntiFallbackOpen(true);
      appendMessage({
        role: "assistant",
        content: `Don't worry, I'll keep this soft. Pick one or rewrite it: ${ANTI_PERSONA_OPTIONS.join(
          " / ",
        )}.`,
      });
      return;
    }

    const answerKey = ["uvp", "antiPersona", "idealClient", "skills", "hook", "visibility"][
      expertStep
    ] as keyof ExpertAnswers;
    setExpertAnswers((current) => ({ ...current, [answerKey]: answer }));

    if (expertStep === 5) {
      const visible = wantsVisibility(answer);
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentMode !== "expert") return;
    handleExpertSubmit(input);
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
            <ModeToggle currentMode={currentMode} />
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
                </div>
              ))}

              {currentMode === "expert" && intakeComplete && previewCard ? (
                <div className="grid gap-3">
                  <div className="max-w-[520px]">
                    <NetworkProfileCardRenderer card={previewCard} />
                  </div>
                  <ExpertCardActions
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
                  <div className="grid gap-3 rounded-[24px] border border-[#201a17]/10 bg-white/85 p-4 shadow-[0_12px_30px_rgba(32,26,23,0.06)] sm:grid-cols-[1fr_1fr_auto]">
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#786a63]">
                      Name
                      <input
                        value={displayName}
                        onChange={(event) => {
                          setDisplayName(event.target.value);
                          if (!claimedHandle) setHandleInput(simpleHandle(event.target.value));
                        }}
                        className="h-11 rounded-2xl border border-[#201a17]/10 bg-[#fffaf4] px-3 text-sm font-medium normal-case tracking-normal text-[#201a17] outline-none transition focus:border-[#201a17]/30"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#786a63]">
                      Handle
                      <input
                        value={handleInput}
                        onChange={(event) => {
                          setHandleInput(simpleHandle(event.target.value));
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
                disabled={currentMode !== "expert"}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  currentMode === "expert"
                    ? "Answer Alex here..."
                    : "The client lane transcript is next in the queue."
                }
                rows={1}
                className="min-h-11 flex-1 resize-none bg-transparent px-2 py-3 text-[15px] leading-5 text-[#201a17] outline-none placeholder:text-[#a4958d] disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={currentMode !== "expert" || input.trim().length === 0}
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
          profileProgress={currentMode === "expert" ? Math.min(expertStep + 1, EXPERT_QUESTIONS.length) : 1}
        />
      </div>
    </main>
  );
}
