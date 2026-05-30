"use client";

import * as React from "react";
import { CircleDashed, Share2 } from "lucide-react";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { NetworkCardSilhouette } from "@/components/network/card-silhouette";
import { ShareModal } from "@/components/network/share-modal";

function greeterName(card: NetworkProfileCardBlock): string {
  return card.greeterCuratedBy === "mira" ? "Mira" : "Alex";
}

function firstName(card: NetworkProfileCardBlock): string {
  return card.name.split(/\s+/)[0] || "you";
}

export function NetworkProfileCardRenderer({
  card,
  className,
  sessionId,
  preview = false,
  shareMode = "compact",
}: {
  card: NetworkProfileCardBlock;
  className?: string;
  sessionId?: string | null;
  preview?: boolean;
  /** Brief 290 — `"studio"` opens the multi-channel Share Studio. */
  shareMode?: "compact" | "studio";
}) {
  const greeter = greeterName(card);
  const name = firstName(card);
  const [shareOpen, setShareOpen] = React.useState(false);
  const displayCard = preview ? card : { ...card, antiPersonaMd: null };

  return (
    <>
      <NetworkCardSilhouette
        card={displayCard}
        className={cn("text-text-primary", className)}
        actionSlot={preview ? (
          <div className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-text-secondary">
            <CircleDashed className="h-4 w-4" aria-hidden="true" />
            Draft card
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <a href={card.shareUrl} className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90">
              <span aria-hidden="true" className="mr-2">▸</span>
              Ask {greeter} about {name}
            </a>
            <button type="button" onClick={() => setShareOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised" aria-label={`Share ${card.name}'s card`}>
              <Share2 className="h-4 w-4" aria-hidden="true" />
              Share
            </button>
          </div>
        )}
      />
      <ShareModal card={displayCard} sessionId={sessionId} open={shareOpen} onOpenChange={setShareOpen} mode={shareMode} />
    </>
  );
}
