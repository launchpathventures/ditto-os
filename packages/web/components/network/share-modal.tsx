"use client";

import * as React from "react";
import { Check, Clipboard, Download, Linkedin, RefreshCw, Share2, X } from "lucide-react";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { NetworkCardSilhouette } from "./card-silhouette";

export type ShareVoice = "quiet" | "loud" | "ask";
export interface ShareVariants { quiet: string; loud: string; ask: string }

const VOICES: Array<{ id: ShareVoice; label: string; description: string }> = [
  { id: "quiet", label: "QUIET", description: "Specific, restrained, easy to forward." },
  { id: "loud", label: "LOUD", description: "Sharper hook for public posting." },
  { id: "ask", label: "ASK", description: "Invites people to point the right work your way." },
];

function canonicalShareUrl(card: NetworkProfileCardBlock): string {
  if (/^https?:\/\//i.test(card.shareUrl)) return card.shareUrl;
  return `https://ditto.partners${card.shareUrl.startsWith("/") ? "" : "/"}${card.shareUrl}`;
}

function firstName(card: NetworkProfileCardBlock): string {
  return card.name.split(/\s+/)[0] || card.name;
}

function fallbackVariants(card: NetworkProfileCardBlock): ShareVariants {
  const url = canonicalShareUrl(card);
  const name = firstName(card);
  return {
    quiet: `${card.name} is ${card.oneLineRole}. Ask ${card.greeterCuratedBy === "mira" ? "Mira" : "Alex"} where ${name} fits. ${url}`,
    loud: `If you need ${card.oneLineRole.toLowerCase()}, start with ${card.name}. ${url}`,
    ask: `Who should meet ${card.name}? ${card.oneLineRole}. ${url}`,
  };
}

async function fetchVariants(card: NetworkProfileCardBlock, sessionId?: string | null): Promise<ShareVariants> {
  if (!sessionId) return fallbackVariants(card);
  const response = await fetch(`/api/v1/network/people/${encodeURIComponent(card.handle)}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: sessionId ?? null, card }),
  });
  if (!response.ok) throw new Error("share_variant_failed");
  return await response.json() as ShareVariants;
}

export function ShareModal({
  card,
  sessionId,
  open,
  onOpenChange,
  initialVariants,
}: {
  card: NetworkProfileCardBlock;
  sessionId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVariants?: ShareVariants | null;
}) {
  const [variants, setVariants] = React.useState<ShareVariants | null>(initialVariants ?? null);
  const [selectedVoice, setSelectedVoice] = React.useState<ShareVoice>("loud");
  const [editedText, setEditedText] = React.useState(initialVariants?.loud ?? "");
  const [status, setStatus] = React.useState<"idle" | "loading" | "error">(initialVariants ? "idle" : "loading");
  const [copied, setCopied] = React.useState(false);
  const [retryAttempt, setRetryAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!open || variants) return;
    let cancelled = false;
    setStatus("loading");
    fetchVariants(card, sessionId)
      .then((next) => {
        if (cancelled) return;
        setVariants(next);
        setEditedText(next.loud);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [card, open, retryAttempt, sessionId, variants]);

  React.useEffect(() => {
    if (variants) setEditedText(variants[selectedVoice]);
  }, [selectedVoice, variants]);

  if (!open) return null;

  const selectedText = editedText || variants?.[selectedVoice] || "";
  const shareUrl = canonicalShareUrl(card);
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;

  async function copySelected() {
    if (!selectedText) return;
    await navigator.clipboard.writeText(selectedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Share profile card" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md" data-testid="network-share-modal">
      <div className="relative grid max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-[#fafafa] shadow-large lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1fr)]">
        <button type="button" onClick={() => onOpenChange(false)} className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-text-primary shadow-subtle transition-colors hover:bg-surface-raised" aria-label="Close share modal">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex min-h-[520px] flex-col justify-center bg-[#f1f1f1] p-5 sm:p-8">
          <div className="mx-auto w-full max-w-[520px]">
            <NetworkCardSilhouette card={card} shareTextOverlay={selectedText || null} className="sm:max-w-[520px]" />
            <p className="mt-5 text-sm font-medium text-text-secondary">{status === "loading" ? "Alex is drafting..." : "Live preview"}</p>
          </div>
        </div>
        <div className="flex min-h-[520px] flex-col overflow-y-auto p-5 sm:p-8">
          <div className="mb-6 flex items-start gap-3 pr-12">
            <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Three ways to share</h2>
              <p className="mt-1 text-sm leading-5 text-text-secondary">Pick a voice, tighten the line, then copy, post, or download the card.</p>
            </div>
          </div>
          {status === "loading" ? (
            <div className="grid gap-3" aria-label="Drafting share variants">
              {VOICES.map((voice) => <div key={voice.id} className="h-28 animate-pulse rounded-2xl border border-border bg-white/80" />)}
            </div>
          ) : null}
          {status === "error" ? (
            <div className="rounded-2xl bg-surface-raised p-4 text-sm text-text-secondary">
              Alex couldn't draft variants right now.{" "}
              <button type="button" onClick={() => { setVariants(null); setStatus("loading"); setRetryAttempt((attempt) => attempt + 1); }} className="inline-flex items-center gap-1 font-semibold text-text-primary underline-offset-4 hover:underline">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
              </button>
            </div>
          ) : null}
          {variants ? (
            <div className="grid gap-3">
              {VOICES.map((voice) => {
                const selected = selectedVoice === voice.id;
                return (
                  <button key={voice.id} type="button" onClick={() => setSelectedVoice(voice.id)} className={cn("rounded-2xl border bg-white p-4 text-left transition-colors", selected ? "border-text-primary shadow-medium" : "border-border hover:bg-surface-raised")}>
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold tracking-[0.14em] text-text-primary">{voice.label}</span>
                      <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded-full border", selected ? "border-text-primary bg-text-primary" : "border-border bg-white")} aria-hidden="true">
                        {selected ? <Check className="h-3 w-3 text-white" /> : null}
                      </span>
                    </span>
                    <span className="mt-2 block text-xs font-medium text-text-muted">{voice.description}</span>
                    <span className="mt-3 line-clamp-3 block text-sm leading-5 text-text-secondary">{variants[voice.id]}</span>
                  </button>
                );
              })}
              <label className="mt-2 block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-text-muted">Remix</span>
                <textarea value={editedText} onChange={(event) => setEditedText(event.target.value)} className="min-h-32 w-full resize-none rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-5 text-text-primary outline-none transition-colors focus:border-text-primary" />
              </label>
            </div>
          ) : null}
          <div className="mt-auto grid gap-2 pt-6 sm:grid-cols-3">
            <button type="button" disabled={!selectedText} onClick={() => void copySelected()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40">
              {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />} {copied ? "Copied!" : "Copy"}
            </button>
            <a href={linkedInUrl} target="_blank" rel="noreferrer" className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised", !selectedText && "pointer-events-none opacity-40")}>
              <Linkedin className="h-4 w-4" aria-hidden="true" /> Post to LinkedIn
            </a>
            <a href={`/api/v1/network/people/${encodeURIComponent(card.handle)}/card-png`} download className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised">
              <Download className="h-4 w-4" aria-hidden="true" /> Download card PNG
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
