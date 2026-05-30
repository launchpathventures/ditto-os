"use client";

/**
 * Brief 290 (AC 8). Instagram story tab pane.
 *
 * The 1080×1920 card IS the post — the caption is a single quiet line.
 * Download fetches the story-card-png route; no autoposting. The
 * link-sticker instruction tells the member how to make the story tappable
 * on Instagram (where in-caption links are not clickable).
 */

import * as React from "react";
import { Check, Clipboard, Download } from "lucide-react";
import type { NetworkProfileCardBlock } from "@/lib/engine";

export function InstagramStoryAsset({
  card,
  caption,
}: {
  card: NetworkProfileCardBlock;
  caption: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const downloadUrl = `/api/v1/network/people/${encodeURIComponent(card.handle)}/story-card-png`;

  async function copyCaption() {
    if (!caption) return;
    await navigator.clipboard.writeText(caption);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-3" data-testid="instagram-story-asset">
      <p className="select-all rounded-2xl border border-border bg-white p-4 text-sm leading-5 text-text-primary">
        {caption}
      </p>
      <p className="rounded-2xl bg-surface-raised p-4 text-xs leading-5 text-text-secondary">
        Download the 9:16 card, post it as your story, then add a{" "}
        <strong className="font-semibold text-text-primary">link sticker</strong>{" "}
        pointing to your signal — Instagram captions aren&apos;t tappable, the
        sticker is.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={!caption}
          onClick={() => void copyCaption()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy caption"}
        </button>
        <a
          href={downloadUrl}
          download
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download story card
        </a>
      </div>
    </div>
  );
}
