"use client";

/**
 * Ditto — Inbox view
 *
 * Review queue — one primary card featured, the rest waiting. Answers the
 * one question "what needs my decision?" instead of mixing statuses.
 */

import React from "react";
import { useFeed } from "@/lib/feed-query";
import type { ReviewItem } from "@/lib/feed-types";
import { Greet, Zone, Row, AlexLine, EmptyHint } from "./view-shell";

interface InboxViewProps {
  onAskAbout: (subject: string) => void;
}

export function InboxView({ onAskAbout }: InboxViewProps) {
  const { data } = useFeed();
  const reviews = ((data?.items ?? []).filter(
    (i) => i.itemType === "review",
  ) as ReviewItem[]);
  const featured = reviews[0];
  const queue = reviews.slice(1);

  return (
    <div>
      <Greet
        title="Review queue"
        summary={
          reviews.length > 0
            ? `${reviews.length} thing${reviews.length === 1 ? "" : "s"} need${reviews.length === 1 ? "s" : ""} your decision. I hold each one here until you’ve seen it.`
            : "Nothing to review right now. I’ll queue things here as they need your call."
        }
      />

      {featured && <ReviewPrimary review={featured} onAskAbout={onAskAbout} />}

      {queue.length > 0 && (
        <Zone title="Next in queue" count={queue.length}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {queue.map((r) => (
              <Row
                key={r.id}
                status="warn"
                title={r.data.processName}
                desc={r.data.stepName}
                whisper={r.data.confidence ? `Confidence: ${r.data.confidence}` : undefined}
                time={new Date(r.timestamp).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                onClick={() => onAskAbout(r.data.processName)}
              />
            ))}
          </div>
        </Zone>
      )}

      {reviews.length === 0 && <EmptyHint>All clear. Nothing waiting on you.</EmptyHint>}
    </div>
  );
}

function ReviewPrimary({
  review,
  onAskAbout,
}: {
  review: ReviewItem;
  onAskAbout: (subject: string) => void;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: "24px 26px",
        boxShadow: "var(--shadow-subtle)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-caution)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--color-caution)",
            boxShadow: "0 0 0 3px rgba(212,150,10,0.15)",
          }}
        />
        Review before I send
      </div>
      <h3
        style={{
          fontSize: 20,
          fontWeight: 600,
          margin: "0 0 8px",
          letterSpacing: "-0.015em",
          lineHeight: 1.3,
        }}
      >
        {review.data.processName}
      </h3>
      {review.data.outputText && (
        <div
          style={{
            fontSize: 14,
            color: "var(--color-text-primary)",
            lineHeight: 1.6,
            padding: "12px 14px",
            background: "var(--color-background)",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            marginBottom: 16,
            fontStyle: "italic",
            maxHeight: 160,
            overflow: "hidden",
          }}
        >
          {review.data.outputText.slice(0, 240)}
          {review.data.outputText.length > 240 ? "…" : ""}
        </div>
      )}
      <AlexLine>
        <b style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
          {review.data.stepName}
        </b>{" "}
        — read it carefully. I won’t send until you say go.
      </AlexLine>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
        <button
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid var(--color-vivid)",
            background: "var(--color-vivid)",
            color: "#fff",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Approve &amp; send
        </button>
        <button
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid var(--color-border-strong)",
            background: "var(--color-surface-raised)",
            color: "var(--color-text-primary)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Edit
        </button>
        <button
          onClick={() => onAskAbout(`the ${review.data.processName}`)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            color: "var(--color-text-muted)",
            background: "none",
            border: "none",
            padding: "4px 8px",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Ask about this
        </button>
      </div>
    </div>
  );
}
