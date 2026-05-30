"use client";

/**
 * Brief 290 (AC 10 / AC 12). Email-signature snippet.
 *
 * Plain text is the default and satisfies AC 12 alone. The HTML variant is
 * OPTIONAL per parent §Open for Sub-Brief Builders and is deferred here:
 * a safe cross-client HTML signature requires a server-rendered,
 * server-escaped inline-styled `<table>` fragment, and the parent brief
 * explicitly permits deferring it when effort outpaces value. Plain text —
 * one quiet line ending with the canonical share URL — is the shipped
 * surface. Tracked as a follow-up in docs/state.md.
 */

import * as React from "react";
import { Check, Clipboard } from "lucide-react";

export function EmailSignatureSnippet({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copyText() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid gap-3" data-testid="email-signature-snippet">
      <p className="text-sm leading-5 text-text-secondary">
        One quiet line for the bottom of your emails. Plain text pastes cleanly
        into any mail client.
      </p>
      <p className="select-all rounded-2xl border border-border bg-white p-4 text-sm leading-5 text-text-primary">
        {text}
      </p>
      <button
        type="button"
        disabled={!text}
        onClick={() => void copyText()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
        {copied ? "Copied!" : "Copy plain text"}
      </button>
    </div>
  );
}
