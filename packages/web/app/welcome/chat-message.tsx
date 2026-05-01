"use client";

import { useMemo, useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import type { ContentBlock } from "@/lib/engine";
import { BlockRenderer } from "@/components/blocks/block-registry";

/**
 * Single message bubble for the front-door conversation.
 * Alex messages left-aligned, user messages right-aligned.
 *
 * When `blocks` are provided, they render below the message text
 * via the standard BlockRenderer (Brief 137, Insight-107).
 *
 * Provenance: Brief 094, Brief 137, DESIGN.md conversation patterns.
 */

/**
 * Light inline formatting for conversational text.
 * Handles **bold**, *italic*, and newlines.
 */
function formatText(text: string): React.ReactNode[] {
  const paragraphs = text.split(/\n{2,}/);

  return paragraphs.map((para, pIdx) => {
    const lines = para.split(/\n/);
    const lineNodes: React.ReactNode[] = [];

    lines.forEach((line, lIdx) => {
      if (lIdx > 0) lineNodes.push(<br key={`br-${pIdx}-${lIdx}`} />);

      const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
      parts.forEach((part, partIdx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          lineNodes.push(
            <strong key={`b-${pIdx}-${lIdx}-${partIdx}`}>
              {part.slice(2, -2)}
            </strong>,
          );
        } else if (part.startsWith("*") && part.endsWith("*")) {
          lineNodes.push(
            <em key={`i-${pIdx}-${lIdx}-${partIdx}`}>
              {part.slice(1, -1)}
            </em>,
          );
        } else {
          lineNodes.push(part);
        }
      });
    });

    return (
      <p key={`p-${pIdx}`} className={pIdx > 0 ? "mt-3" : ""}>
        {lineNodes}
      </p>
    );
  });
}

export function ChatMessage({
  role,
  text,
  blocks,
  animate = false,
  variant = "body",
  onAction,
}: {
  role: "alex" | "user";
  text: string;
  blocks?: ContentBlock[];
  animate?: boolean;
  variant?: "hero-primary" | "hero-secondary" | "body";
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}) {
  const formatted = useMemo(() => {
    if (role !== "alex" || variant !== "body") return null;
    return formatText(text);
  }, [text, role, variant]);

  if (role === "alex") {
    // Hero variants used to display 24-30px headline-scale type, which
    // reads as shouty for any message longer than a single line. Cap them
    // to a slightly weighted body scale — the *first message* gets a
    // gentle emphasis bump (semibold) but never breaks the chat reading
    // rhythm. Long messages stay legible; short greetings still feel
    // welcoming via weight, not size.
    const styles = {
      "hero-primary":
        "text-base font-semibold leading-relaxed text-text-primary md:text-[17px]",
      "hero-secondary":
        "text-base font-medium leading-relaxed text-text-primary md:text-[17px]",
      body: "text-base font-medium leading-relaxed text-text-primary md:text-[17px]",
    };

    return (
      <div className={animate ? "animate-fade-in" : ""}>
        {variant === "body" ? (
          <div className={styles[variant]}>{formatted}</div>
        ) : (
          <p className={styles[variant]}>{text}</p>
        )}
        {/* Brief 137: render content blocks below message text */}
        {blocks && blocks.length > 0 && (
          <div className="mt-4 space-y-3 animate-fade-in">
            {blocks.map((block, idx) => (
              <BlockRenderer key={idx} block={block} onAction={onAction} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const lineCount = text.split("\n").length;
  const isLongPaste = lineCount > 5;

  if (isLongPaste) {
    return <UserPastedMessage text={text} animate={animate} />;
  }

  return (
    <div className={`flex justify-end ${animate ? "animate-fade-in" : ""}`}>
      <div className="max-w-[85%] rounded-2xl bg-surface-raised border border-border px-4 py-3">
        <p className="text-base text-text-primary whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

/** Collapsed attachment-style display for long pasted text */
function UserPastedMessage({ text, animate }: { text: string; animate: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const preview = lines.slice(0, 3).join("\n");

  return (
    <div className={`flex justify-end ${animate ? "animate-fade-in" : ""}`}>
      <div className="max-w-[85%] rounded-2xl bg-surface-raised border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          <FileText size={16} strokeWidth={1.6} className="shrink-0 text-text-secondary" />
          <span className="flex-1 text-sm font-medium text-text-primary">
            Pasted text — {lines.length} lines
          </span>
          {expanded ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
        </button>
        {expanded ? (
          <div className="border-t border-border/30 px-4 py-3">
            <p className="text-sm text-text-primary whitespace-pre-wrap">{text}</p>
          </div>
        ) : (
          <div className="border-t border-border/30 px-4 py-2">
            <p className="text-xs text-text-muted whitespace-pre-wrap line-clamp-3">{preview}</p>
          </div>
        )}
      </div>
    </div>
  );
}
