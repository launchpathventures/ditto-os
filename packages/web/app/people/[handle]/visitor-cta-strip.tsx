"use client";

import { MessageCircle, RadioTower, Search, UserPlus } from "lucide-react";
import type { ActionDef, SuggestionBlock } from "@/lib/engine";
import { cn } from "@/lib/utils";

type IntentShape = "curious" | "similar-expertise" | "helper-seeker" | "intro-seeker";

export interface IntentInference {
  highlighted: IntentShape[] | null;
  whisper: string | null;
  scores: Record<IntentShape, number>;
}

type VisitorCtaTarget = "ask" | "intro" | "build-signal" | "create-request";

const CTA_ITEMS: Array<{
  id: VisitorCtaTarget;
  intent: IntentShape;
  label: string;
  Icon: typeof MessageCircle;
}> = [
  { id: "ask", intent: "curious", label: "Ask Ditto about me", Icon: MessageCircle },
  { id: "intro", intent: "intro-seeker", label: "Request an intro", Icon: UserPlus },
  { id: "build-signal", intent: "similar-expertise", label: "Build your own signal", Icon: RadioTower },
  { id: "create-request", intent: "helper-seeker", label: "Create a request", Icon: Search },
];

function channelLabel(channel: string | null): string {
  if (!channel) return "";
  return channel
    .replace("email-signature", "email")
    .replace("website-badge", "badge")
    .replace(/-/g, " ");
}

function workspaceUrl(handle: string, target: VisitorCtaTarget, dittoRef?: string): string {
  const path = target === "create-request" ? "/network/request" : "/welcome";
  const url = new URL(path, `https://${handle}.ditto.you`);
  if (dittoRef) url.searchParams.set("ditto_ref", dittoRef);
  return url.toString();
}

async function recordAttribution({
  handle,
  channel,
  target,
  sessionId,
}: {
  handle: string;
  channel: string | null;
  target: VisitorCtaTarget;
  sessionId: string | null;
}): Promise<string | null> {
  if (!channel) return null;
  const response = await fetch("/api/v1/network/share-attribution", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "convert",
      channel,
      ph: handle,
      ctaTarget: target,
      sessionId,
      visitorSid: sessionId,
    }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { dittoRef?: unknown };
  return typeof data.dittoRef === "string" ? data.dittoRef : null;
}

export function VisitorCtaStrip({
  handle,
  userFirst,
  referralChannel,
  intentInference,
  sessionId,
  onAsk,
  onIntro,
}: {
  handle: string;
  userFirst: string;
  referralChannel: string | null;
  intentInference: IntentInference | null;
  sessionId: string | null;
  onAsk: () => void;
  onIntro: () => void;
}) {
  const highlighted = new Set(intentInference?.highlighted ?? []);
  const hasHighlight = highlighted.size > 0;
  const whisper = intentInference?.whisper
    ?? (referralChannel ? `${userFirst} shared this on ${channelLabel(referralChannel)}.` : null);
  const suggestionBlock: SuggestionBlock = {
    type: "suggestion",
    content: "What next?",
    reasoning: whisper ?? undefined,
    actions: CTA_ITEMS.map<ActionDef>((item) => ({
      id: item.id,
      label: item.label,
      payload: {
        intentShape: item.intent,
        referralContext: referralChannel
          ? { channel: referralChannel, sourceHandle: handle }
          : undefined,
      },
    })),
  };

  async function handleClick(target: VisitorCtaTarget) {
    if (target === "ask") {
      void recordAttribution({ handle, channel: referralChannel, target, sessionId });
      onAsk();
      return;
    }
    if (target === "intro") {
      void recordAttribution({ handle, channel: referralChannel, target, sessionId });
      onIntro();
      return;
    }

    let dittoRef: string | null = null;
    try {
      dittoRef = await recordAttribution({ handle, channel: referralChannel, target, sessionId });
    } catch {
      dittoRef = null;
    }
    window.location.assign(workspaceUrl(handle, target, dittoRef ?? undefined));
  }

  return (
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-white p-4 shadow-subtle">
      <div>
        <p className="text-sm font-semibold text-text-primary">{suggestionBlock.content}</p>
        {suggestionBlock.reasoning && (
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{suggestionBlock.reasoning}</p>
        )}
      </div>
      <div className="grid gap-2">
        {CTA_ITEMS.map(({ id, intent, label, Icon }, index) => {
          const action = suggestionBlock.actions?.[index];
          const active = hasHighlight && highlighted.has(intent);
          return (
            <button
              key={id}
              type="button"
              onClick={() => void handleClick(id)}
              data-action-id={action?.id}
              data-intent-shape={action?.payload?.intentShape as string}
              data-referral-channel={referralChannel ?? undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border px-3 text-left text-sm font-medium transition",
                active
                  ? "border-text-primary bg-[#fff7d7] text-text-primary"
                  : "border-border bg-surface-raised text-text-secondary hover:border-text-primary hover:text-text-primary",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
