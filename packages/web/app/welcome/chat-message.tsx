"use client";

import { useMemo, useState } from "react";
import { Lightbulb, FileText, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Single message bubble for the front-door conversation.
 * Alex messages left-aligned, user messages right-aligned.
 *
 * When a `plan` prop is provided, Alex's reply text is split: any text
 * matching the plan renders in a distinct card, the rest renders as
 * normal conversation. The plan text comes from the LLM's tool call —
 * no heuristic detection needed.
 *
 * Provenance: Brief 094, DESIGN.md conversation patterns.
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

/**
 * Split reply text around the plan. Returns the conversational text
 * before and after the plan, if any.
 */
function splitAroundPlan(reply: string, plan: string): { before: string; after: string } {
  const idx = reply.indexOf(plan);
  if (idx === -1) return { before: reply, after: "" };
  return {
    before: reply.slice(0, idx).trim(),
    after: reply.slice(idx + plan.length).trim(),
  };
}

export function ChatMessage({
  role,
  text,
  plan = null,
  animate = false,
  variant = "body",
}: {
  role: "alex" | "user";
  text: string;
  plan?: string | null;
  animate?: boolean;
  variant?: "hero-primary" | "hero-secondary" | "body";
}) {
  const formatted = useMemo(() => {
    if (role !== "alex" || variant !== "body") return null;
    return formatText(text);
  }, [text, role, variant]);

  if (role === "alex") {
    const styles = {
      "hero-primary":
        "text-2xl font-bold tracking-tight text-text-primary md:text-3xl md:leading-[1.15]",
      "hero-secondary":
        "text-xl font-semibold tracking-tight text-text-primary md:text-2xl md:leading-[1.2]",
      body: "text-base font-medium leading-relaxed text-text-primary md:text-[17px]",
    };

    // Message with plan: split into before / plan card / after
    if (plan && variant === "body") {
      const { before, after } = splitAroundPlan(text, plan);
      return (
        <div className={`space-y-4 ${animate ? "animate-fade-in" : ""}`}>
          {before && (
            <div className={styles.body}>{formatText(before)}</div>
          )}
          <div className="rounded-2xl border border-vivid/20 bg-gradient-to-br from-vivid/[0.04] to-transparent px-5 py-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-vivid/10">
                <Lightbulb size={14} className="text-vivid" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-vivid">
                Proposed approach
              </span>
            </div>
            <div className={styles.body}>{formatText(plan)}</div>
          </div>
          {after && (
            <div className={styles.body}>{formatText(after)}</div>
          )}
        </div>
      );
    }

    return (
      <div className={animate ? "animate-fade-in" : ""}>
        {variant === "body" ? (
          <div className={styles[variant]}>{formatted}</div>
        ) : (
          <p className={styles[variant]}>{text}</p>
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
      <div className="max-w-[85%] rounded-2xl bg-vivid-subtle px-4 py-3">
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
      <div className="max-w-[85%] rounded-2xl bg-vivid-subtle overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          <FileText size={16} className="shrink-0 text-vivid" />
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
