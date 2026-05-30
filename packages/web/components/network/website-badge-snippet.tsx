"use client";

/**
 * Brief 290 (Q8 / AC 9). Pure `<a> + <img>` website badge.
 *
 * The snippet is constructed from the handle ONLY — URL-encoded into the
 * path segment and into the badge image URL. The `alt` is a fixed,
 * server-safe string. No member free-text (`name`, `oneLineRole`,
 * `narrativeMd`) ever reaches the snippet, so it is byte-identical
 * regardless of card content. No `<script>`, `<iframe>`, or inline event
 * handlers — XSS-free by construction (pattern: buymeacoffee.com/brand).
 */

import * as React from "react";
import { Check, Clipboard } from "lucide-react";
import type { NetworkProfileCardBlock } from "@/lib/engine";

const BADGE_ALT = "Available through Ditto";
const BADGE_ORIGIN = "https://ditto.partners";

export function buildWebsiteBadgeSnippet(handle: string): string {
  const enc = encodeURIComponent(handle);
  const href = `${BADGE_ORIGIN}/people/${enc}?ref=badge`;
  const img = `${BADGE_ORIGIN}/api/v1/network/people/${enc}/badge.png`;
  return `<a href="${href}" target="_blank" rel="noopener"><img src="${img}" width="200" height="40" alt="${BADGE_ALT}" /></a>`;
}

export function WebsiteBadgeSnippet({ card }: { card: NetworkProfileCardBlock }) {
  const snippet = buildWebsiteBadgeSnippet(card.handle);
  const [copied, setCopied] = React.useState(false);

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-3" data-testid="website-badge-snippet">
      <p className="text-sm leading-5 text-text-secondary">
        Paste this anywhere you can add HTML — a site footer, a profile bio, an
        email-platform template. It renders a small badge linking back to your
        signal.
      </p>
      <pre className="overflow-x-auto rounded-2xl border border-border bg-white p-4 text-xs leading-5 text-text-primary">
        <code>{snippet}</code>
      </pre>
      <button
        type="button"
        onClick={() => void copySnippet()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
      >
        {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
        {copied ? "Copied!" : "Copy snippet"}
      </button>
    </div>
  );
}
