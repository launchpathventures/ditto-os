"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationStep } from "./request-step-engine";

export interface RequestChatMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  changedLabels?: string[];
}

export function RequestChatRail({
  messages,
  originalNeed,
  step,
  onSend,
  onSkip,
  refining,
  error,
  className,
}: {
  messages: RequestChatMessage[];
  originalNeed: string;
  step: ConversationStep;
  onSend: (message: string) => void | Promise<void>;
  onSkip?: () => void;
  refining: boolean;
  error: string | null;
  className?: string;
}) {
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const isReady = step.kind === "ready";

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages.length, refining]);

  function submit() {
    const value = input.trim();
    if (!value || refining) return;
    setInput("");
    void onSend(value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function applyExample(example: string) {
    if (refining) return;
    setInput("");
    void onSend(example);
  }

  const progressPct = Math.min(100, Math.round((step.index / step.total) * 100));
  void originalNeed;

  return (
    <aside
      aria-label="Refine your request with Mira"
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised",
        "shadow-subtle",
        className,
      )}
    >
      <header className="flex items-start gap-3 border-b border-border bg-background px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-text-primary text-[13px] font-semibold text-accent-foreground">
          M
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold leading-snug text-text-primary">
            Mira
          </p>
          <p className="mt-1 text-[12px] leading-4 text-text-secondary">
            I'll tighten the brief, then search with sources. You approve every move.
          </p>
        </div>
      </header>

      <div className="border-b border-border bg-background px-5 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            {isReady ? "Locked" : `Step ${step.index} of ${step.total}`}
          </p>
          <p className="text-[12px] font-semibold text-text-primary">
            {isReady ? (
              <span className="inline-flex items-center gap-1 text-positive">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Brief is ready
              </span>
            ) : (
              step.label
            )}
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-subtle">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div
        ref={logRef}
        className="flex-1 space-y-3 overflow-y-auto bg-background px-5 py-4"
      >
        {messages.map((message) => {
          if (message.role === "system") {
            return (
              <div
                key={message.id}
                className="flex animate-in fade-in-0 slide-in-from-bottom-1 items-start gap-2 rounded-xl border border-border bg-surface-raised px-3 py-2 duration-200"
              >
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-tight text-text-primary">
                    {message.content}
                  </p>
                  {message.changedLabels && message.changedLabels.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {message.changedLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-secondary"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }
          if (message.role === "assistant") {
            return (
              <div
                key={message.id}
                className="flex gap-2.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-text-primary"
                />
                <p className="flex-1 text-[14px] leading-relaxed text-text-primary">
                  {message.content}
                </p>
              </div>
            );
          }
          return (
            <div
              key={message.id}
              className="flex animate-in fade-in-0 slide-in-from-right-1 justify-end duration-200"
            >
              <p className="max-w-[88%] rounded-2xl bg-accent px-3 py-2 text-[14px] leading-relaxed text-accent-foreground">
                {message.content}
              </p>
            </div>
          );
        })}
        {refining ? (
          <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>Mira is thinking...</span>
          </div>
        ) : null}
        {error ? <p className="text-xs font-medium text-negative">{error}</p> : null}
      </div>

      {!isReady && step.examples.length > 0 ? (
        <div className="border-t border-border bg-background px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            Suggested from analysis
          </p>
          <div className="mt-1.5 flex flex-col items-start gap-0.5">
            {step.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => applyExample(example)}
                disabled={refining}
                className="group inline-flex max-w-full items-baseline gap-2 rounded px-0 py-1 text-left text-xs font-medium leading-5 text-text-secondary transition hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-text-muted transition group-hover:text-text-primary">→</span>
                <span className="truncate underline decoration-border decoration-1 underline-offset-4 transition group-hover:decoration-text-primary">
                  {example}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-background p-3"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 transition focus-within:border-text-primary">
          <textarea
            ref={composerRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isReady ? "Ask Mira anything about this brief..." : "Answer Mira, or just say more..."}
            rows={1}
            className="max-h-32 flex-1 resize-none bg-transparent py-1 text-sm leading-6 text-text-primary outline-none placeholder:text-text-muted"
            disabled={refining}
          />
          <button
            type="submit"
            disabled={!input.trim() || refining}
            aria-label="Send to Mira"
            className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-full bg-accent text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {refining ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
          <p className="text-[11px] leading-4 text-text-muted">
            Enter to send · Shift+Enter for a new line
          </p>
          {!isReady && step.skipLabel && onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={refining}
              className="text-[11px] font-semibold text-text-secondary underline-offset-2 transition hover:text-text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {step.skipLabel}
            </button>
          ) : null}
        </div>
      </form>
    </aside>
  );
}
