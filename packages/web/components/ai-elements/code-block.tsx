"use client";

/**
 * CodeBlock — Adopted from AI Elements
 *
 * Syntax-highlighted code display with Shiki, copy-to-clipboard,
 * filename badge, language badge, and conditional line numbers.
 *
 * Provenance: vercel/ai-elements code-block.tsx, adapted for Ditto design tokens.
 */

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Check, Copy, FileCode } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language, filename, showLineNumbers }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  const lines = code.split("\n");
  const shouldShowLineNumbers = showLineNumbers || lines.length > 5;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { codeToHtml } = await import("shiki/bundle/web");
        const html = await codeToHtml(code, {
          lang: language || "text",
          themes: {
            light: "github-light",
            dark: "github-dark",
          },
          defaultColor: false,
        });
        if (!cancelled) setHighlightedHtml(html);
      } catch {
        // Shiki may not support the language — fall back to plain text
        if (!cancelled) setHighlightedHtml(null);
      }
    })();
    return () => { cancelled = true; };
  }, [code, language]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const isDiff = language === "diff";

  return (
    <div className="group/codeblock relative rounded-[var(--radius-md)] border border-border bg-surface overflow-hidden">
      {/* Header: filename + language + copy button */}
      <div className="flex items-center justify-between px-[var(--spacing-4)] py-[var(--spacing-2)]">
        {filename ? (
          <span className="flex items-center gap-1 text-xs text-text-muted">
            <FileCode size={12} />
            {filename}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {/* Language badge — hidden when copy button shows */}
          <span className="text-xs text-text-muted uppercase group-hover/codeblock:hidden">
            {language}
          </span>
          {/* Copy button — visible on hover */}
          <button
            onClick={handleCopy}
            className={cn(
              "hidden group-hover/codeblock:flex items-center gap-1",
              "px-2 py-0.5 rounded-[var(--radius-full)] text-xs text-text-muted",
              "hover:text-text-primary hover:bg-surface-raised transition-colors duration-150",
            )}
            aria-label="Copy code"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Code content */}
      <div className="px-[var(--spacing-4)] pb-[var(--spacing-4)] overflow-x-auto">
        {highlightedHtml ? (
          <div className="flex gap-[var(--spacing-3)]">
            {shouldShowLineNumbers && (
              <div className="flex-shrink-0 border-r border-border pr-[var(--spacing-3)] select-none" aria-hidden="true">
                {lines.map((_, i) => (
                  <div key={i} className="text-xs text-text-muted text-right leading-[1.6]">
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <div
              className="flex-1 text-sm font-mono leading-[1.6] [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0 [&_code]:!bg-transparent"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </div>
        ) : (
          <div className="flex gap-[var(--spacing-3)]">
            {shouldShowLineNumbers && (
              <div className="flex-shrink-0 border-r border-border pr-[var(--spacing-3)] select-none" aria-hidden="true">
                {lines.map((_, i) => (
                  <div key={i} className="text-xs text-text-muted text-right leading-[1.6]">
                    {i + 1}
                  </div>
                ))}
              </div>
            )}
            <pre className="flex-1 text-sm font-mono leading-[1.6] whitespace-pre-wrap" role="code">
              {isDiff ? (
                lines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      line.startsWith("+") && "bg-positive/10 text-positive",
                      line.startsWith("-") && "bg-negative/10 text-negative",
                    )}
                  >
                    {line}
                  </div>
                ))
              ) : (
                <code>{code}</code>
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
