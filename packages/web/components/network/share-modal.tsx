"use client";

import * as React from "react";
import { Check, Clipboard, Download, Linkedin, RefreshCw, Share2, X } from "lucide-react";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { NetworkCardSilhouette } from "./card-silhouette";
import { WebsiteBadgeSnippet } from "./website-badge-snippet";
import { EmailSignatureSnippet } from "./email-signature-snippet";
import { InstagramStoryAsset } from "./instagram-story-asset";

export type ShareVoice = "quiet" | "loud" | "ask";
export interface ShareVariants { quiet: string; loud: string; ask: string }

/** Brief 290 — Studio channels. `website-badge` carries no LLM variant. */
export type ShareChannel =
  | "linkedin"
  | "x"
  | "instagram"
  | "email-signature"
  | "website-badge";

const VOICES: Array<{ id: ShareVoice; label: string; description: string }> = [
  { id: "quiet", label: "QUIET", description: "Specific, restrained, easy to forward." },
  { id: "loud", label: "LOUD", description: "Sharper hook for public posting." },
  { id: "ask", label: "ASK", description: "Invites people to point the right work your way." },
];

const CHANNELS: Array<{ id: ShareChannel; label: string }> = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "instagram", label: "Instagram" },
  { id: "email-signature", label: "Email signature" },
  { id: "website-badge", label: "Website badge" },
];

/**
 * Brief 290 AC 5 — normative channel × voice matrix (parent Q-set; AC 5
 * authoritative over the Designer spec where they differ). Empty array =
 * no voice selector (static text). First entry is the channel default.
 */
const CHANNEL_VOICES: Record<ShareChannel, ShareVoice[]> = {
  linkedin: ["loud", "quiet", "ask"],
  x: ["loud", "quiet"],
  instagram: ["quiet"],
  "email-signature": ["quiet"],
  "website-badge": [],
};

function defaultVoice(channel: ShareChannel): ShareVoice {
  return CHANNEL_VOICES[channel][0] ?? "quiet";
}

function canonicalShareUrl(card: NetworkProfileCardBlock): string {
  if (/^https?:\/\//i.test(card.shareUrl)) return card.shareUrl;
  return `https://ditto.partners${card.shareUrl.startsWith("/") ? "" : "/"}${card.shareUrl}`;
}

function refUrl(card: NetworkProfileCardBlock, ref: string): string {
  const base = canonicalShareUrl(card);
  return `${base}${base.includes("?") ? "&" : "?"}ref=${ref}`;
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

async function fetchVariants(
  card: NetworkProfileCardBlock,
  sessionId?: string | null,
  channel?: ShareChannel,
): Promise<ShareVariants> {
  if (!sessionId) return fallbackVariants(card);
  const response = await fetch(`/api/v1/network/people/${encodeURIComponent(card.handle)}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: sessionId ?? null, card, ...(channel ? { channel } : {}) }),
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
  mode = "compact",
}: {
  card: NetworkProfileCardBlock;
  sessionId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVariants?: ShareVariants | null;
  /** Brief 290 — `"studio"` opens the multi-channel authoring loop. */
  mode?: "compact" | "studio";
}) {
  if (mode === "studio") {
    return (
      <StudioShareModal card={card} sessionId={sessionId} open={open} onOpenChange={onOpenChange} />
    );
  }
  return (
    <CompactShareModal
      card={card}
      sessionId={sessionId}
      open={open}
      onOpenChange={onOpenChange}
      initialVariants={initialVariants}
    />
  );
}

function CompactShareModal({
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

type ChannelStatus = "idle" | "loading" | "error";

const STUDIO_PANEL_ID = "share-studio-panel";

function idleStatuses(): Record<ShareChannel, ChannelStatus> {
  return {
    linkedin: "idle",
    x: "idle",
    instagram: "idle",
    "email-signature": "idle",
    "website-badge": "idle",
  };
}

function StudioShareModal({
  card,
  sessionId,
  open,
  onOpenChange,
}: {
  card: NetworkProfileCardBlock;
  sessionId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeChannel, setActiveChannel] = React.useState<ShareChannel>("linkedin");
  const [cache, setCache] = React.useState<Partial<Record<ShareChannel, ShareVariants>>>({});
  const [statusByChannel, setStatusByChannel] = React.useState<Record<ShareChannel, ChannelStatus>>(idleStatuses);
  const [voiceByChannel, setVoiceByChannel] = React.useState<Record<ShareChannel, ShareVoice>>({
    linkedin: defaultVoice("linkedin"),
    x: defaultVoice("x"),
    instagram: defaultVoice("instagram"),
    "email-signature": defaultVoice("email-signature"),
    "website-badge": defaultVoice("website-badge"),
  });
  const [editedByChannel, setEditedByChannel] = React.useState<Partial<Record<ShareChannel, string>>>({});
  const [copied, setCopied] = React.useState(false);

  // One in-flight/owned POST per channel (parent Q7). Tracked in a ref so a
  // status-driven re-render never re-fires or cancels an outstanding fetch —
  // the fetch result is always applied, keyed by its own channel.
  const requestedRef = React.useRef<Set<ShareChannel>>(new Set());
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const loadChannel = React.useCallback(
    (channel: ShareChannel) => {
      if (channel === "website-badge") return;
      if (requestedRef.current.has(channel)) return;
      requestedRef.current.add(channel);
      setStatusByChannel((prev) => ({ ...prev, [channel]: "loading" }));
      fetchVariants(card, sessionId, channel)
        .then((next) => {
          setCache((prev) => ({ ...prev, [channel]: next }));
          setStatusByChannel((prev) => ({ ...prev, [channel]: "idle" }));
        })
        .catch(() => {
          requestedRef.current.delete(channel);
          setStatusByChannel((prev) => ({ ...prev, [channel]: "error" }));
        });
    },
    [card, sessionId],
  );

  // Active-channel-first POST; lazy POST on tab click; per-channel cache
  // (parent Q7). `website-badge` is static — never POSTs.
  React.useEffect(() => {
    if (open) loadChannel(activeChannel);
  }, [open, activeChannel, loadChannel]);

  // Reset the per-channel POST ledger AND the derived per-channel state when
  // the studio closes so a reopened studio re-fetches from a clean slate and
  // never shows a stale draft if the card was edited while it was mounted.
  React.useEffect(() => {
    if (open) return;
    requestedRef.current.clear();
    setCache({});
    setStatusByChannel(idleStatuses());
    setEditedByChannel({});
  }, [open]);

  if (!open) return null;

  const channelVoices = CHANNEL_VOICES[activeChannel];
  const selectedVoice = voiceByChannel[activeChannel];
  const variants = cache[activeChannel];
  const channelStatus = statusByChannel[activeChannel];
  const generatedText = variants?.[selectedVoice] ?? "";
  const editedText = editedByChannel[activeChannel];
  const selectedText = editedText ?? generatedText;
  const shareUrl = canonicalShareUrl(card);

  function pickVoice(voice: ShareVoice) {
    setVoiceByChannel((prev) => ({ ...prev, [activeChannel]: voice }));
    setEditedByChannel((prev) => ({ ...prev, [activeChannel]: undefined }));
  }

  function retryActive() {
    const channel = activeChannel;
    requestedRef.current.delete(channel);
    setCache((prev) => {
      const next = { ...prev };
      delete next[channel];
      return next;
    });
    setStatusByChannel((prev) => ({ ...prev, [channel]: "idle" }));
    loadChannel(channel);
  }

  async function copySelected() {
    if (!selectedText) return;
    await navigator.clipboard.writeText(selectedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function openOffsite(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // WAI-ARIA tabs keyboard pattern: roving focus across the channel strip.
  function onTabKeyDown(event: React.KeyboardEvent, index: number) {
    const last = CHANNELS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    setActiveChannel(CHANNELS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Share Studio" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md" data-testid="network-share-studio">
      <div className="relative grid max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-[#fafafa] shadow-large lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,1fr)]">
        <button type="button" onClick={() => onOpenChange(false)} className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-text-primary shadow-subtle transition-colors hover:bg-surface-raised" aria-label="Close share studio">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex min-h-[560px] flex-col justify-center bg-[#f1f1f1] p-5 sm:p-8">
          <div className="mx-auto w-full max-w-[520px]">
            <NetworkCardSilhouette
              card={card}
              shareTextOverlay={activeChannel === "website-badge" ? null : selectedText || null}
              className="sm:max-w-[520px]"
            />
            <p className="mt-5 text-sm font-medium text-text-secondary">
              {channelStatus === "loading" ? "Alex is drafting…" : "Live preview"}
            </p>
          </div>
        </div>
        <div className="flex min-h-[560px] flex-col overflow-y-auto p-5 sm:p-8">
          <div className="mb-5 flex items-start gap-3 pr-12">
            <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-text-primary">Share your signal</h2>
              <p className="mt-1 text-sm leading-5 text-text-secondary">One signal, every channel — written the way each one reads. Nothing posts for you.</p>
            </div>
          </div>

          <div role="tablist" aria-label="Share channels" className="mb-5 flex flex-wrap gap-2" data-testid="share-studio-channel-tabs">
            {CHANNELS.map((channel, index) => {
              const selected = activeChannel === channel.id;
              return (
                <button
                  key={channel.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  id={`share-studio-tab-${channel.id}`}
                  aria-selected={selected}
                  aria-controls={STUDIO_PANEL_ID}
                  tabIndex={selected ? 0 : -1}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  onClick={() => setActiveChannel(channel.id)}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    selected ? "border-text-primary bg-text-primary text-white" : "border-border bg-white text-text-secondary hover:bg-surface-raised",
                  )}
                >
                  {channel.label}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={STUDIO_PANEL_ID}
            aria-labelledby={`share-studio-tab-${activeChannel}`}
          >
          {activeChannel === "website-badge" ? (
            <WebsiteBadgeSnippet card={card} />
          ) : (
            <div className="grid gap-4">
              {channelVoices.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Voice">
                  {VOICES.filter((v) => channelVoices.includes(v.id)).map((voice) => {
                    const selected = selectedVoice === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => pickVoice(voice.id)}
                        className={cn(
                          "inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-xs font-bold tracking-[0.12em] transition-colors",
                          selected ? "border-text-primary bg-text-primary text-white" : "border-border bg-white text-text-secondary hover:bg-surface-raised",
                        )}
                      >
                        {voice.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {channelStatus === "loading" ? (
                <div className="h-40 animate-pulse rounded-2xl border border-border bg-white/80" aria-label="Drafting variant" />
              ) : null}

              {channelStatus === "error" ? (
                <div className="rounded-2xl bg-surface-raised p-4 text-sm text-text-secondary">
                  Alex couldn't draft this channel right now.{" "}
                  <button type="button" onClick={retryActive} className="inline-flex items-center gap-1 font-semibold text-text-primary underline-offset-4 hover:underline">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
                  </button>
                </div>
              ) : null}

              {variants && channelStatus !== "loading" ? (
                activeChannel === "instagram" ? (
                  <InstagramStoryAsset card={card} caption={selectedText} />
                ) : activeChannel === "email-signature" ? (
                  <EmailSignatureSnippet text={selectedText} />
                ) : (
                  <div className="grid gap-3">
                    <label className="block">
                      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-text-muted">Draft (editable)</span>
                      <textarea
                        value={selectedText}
                        onChange={(event) => setEditedByChannel((prev) => ({ ...prev, [activeChannel]: event.target.value }))}
                        className="min-h-36 w-full resize-none rounded-2xl border border-border bg-white px-4 py-3 text-sm leading-5 text-text-primary outline-none transition-colors focus:border-text-primary"
                      />
                    </label>
                    {activeChannel === "x" ? (
                      <p className={cn("text-xs font-medium", selectedText.length > 280 ? "text-accent" : "text-text-muted")}>
                        {selectedText.length}/280
                      </p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="button" disabled={!selectedText} onClick={() => void copySelected()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40">
                        {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />} {copied ? "Copied!" : "Copy text"}
                      </button>
                      {activeChannel === "linkedin" ? (
                        <button type="button" onClick={() => openOffsite(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(refUrl(card, "linkedin"))}`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90">
                          <Linkedin className="h-4 w-4" aria-hidden="true" /> Post to LinkedIn
                        </button>
                      ) : (
                        // No-autopost doctrine (parent AC 7): the X intent
                        // carries only the canonical URL. The drafted copy is
                        // hand-carried via the Copy button — Ditto never posts
                        // text on the member's behalf.
                        <button type="button" onClick={() => openOffsite(`https://twitter.com/intent/tweet?url=${encodeURIComponent(refUrl(card, "x"))}`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90">
                          Post to X
                        </button>
                      )}
                    </div>
                  </div>
                )
              ) : null}
            </div>
          )}
          </div>

          <p className="mt-auto pt-6 text-xs leading-5 text-text-muted">
            Ditto never posts for you. Copy or open the channel and post it yourself. <span className="break-all">{shareUrl}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
