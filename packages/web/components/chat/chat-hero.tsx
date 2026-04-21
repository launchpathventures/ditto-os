"use client";

/**
 * Ditto — Chat-full Hero
 *
 * Empty-state hero shown when a new thread opens on the full-page chat.
 * Time-aware greeting plus four template cards that seed structured-reply
 * starter flows, carrying the design thesis through the first keystroke:
 * Alex decomposes the question — you don't have to craft a prompt.
 */

import React from "react";

interface Template {
  title: string;
  desc: string;
  prompt: string;
}

const TEMPLATES: Template[] = [
  {
    title: "Help me think through a decision",
    desc: "I’ll break it into parts, weigh options, and tell you what I’d pick.",
    prompt: "Help me think through a decision I’m weighing.",
  },
  {
    title: "Plan something out",
    desc: "Tell me the goal. I’ll sketch steps, owners, and what could go wrong.",
    prompt: "Help me plan something out.",
  },
  {
    title: "Compare a few options",
    desc: "Drop them in. I’ll put them side by side and say what I’d choose.",
    prompt: "Help me compare a few options.",
  },
  {
    title: "Explain what happened",
    desc: "Ask about anything I’ve done for you — I’ll show receipts and reasoning.",
    prompt: "Tell me what you’ve been working on lately.",
  },
];

export function ChatHero({
  userName,
  onTemplate,
}: {
  userName?: string;
  onTemplate: (prompt: string) => void;
}) {
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Morning" : hr < 18 ? "Afternoon" : "Evening";
  const name = userName ? `, ${userName}` : "";

  return (
    <div
      style={{
        padding: "44px 40px 28px",
        maxWidth: 820,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <h2
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.015em",
          margin: "0 0 10px",
        }}
      >
        {greet}
        {name}. What&apos;s on your mind?
      </h2>
      <p
        style={{
          fontSize: 14.5,
          color: "var(--color-text-secondary)",
          lineHeight: 1.55,
          margin: "0 0 20px",
          maxWidth: "60ch",
        }}
      >
        I’ll structure things for you — break problems down, lay out options,
        show my reasoning. Skip the blank-page feeling; try a template:
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 10,
        }}
      >
        {TEMPLATES.map((t) => (
          <button
            key={t.title}
            onClick={() => onTemplate(t.prompt)}
            style={{
              padding: "14px 16px",
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              transition: "all 120ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-vivid)";
              e.currentTarget.style.background = "var(--color-vivid-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border)";
              e.currentTarget.style.background = "var(--color-surface-raised)";
            }}
          >
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: "var(--color-text-primary)",
                marginBottom: 3,
              }}
            >
              {t.title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                lineHeight: 1.4,
              }}
            >
              {t.desc}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
