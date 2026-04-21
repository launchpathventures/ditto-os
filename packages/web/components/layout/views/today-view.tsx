"use client";

/**
 * Ditto — Today view
 *
 * The briefing-style home. Three zones: "For you" (the one thing that needs
 * the user's eyes), "Handled while you were away" (what Alex ran clean), and
 * "Ahead of you" (what's coming).
 *
 * Reads from useFeed() for shift-report / handled items and useProcessList()
 * for reviews needing approval. When there's nothing yet (Day Zero, empty
 * feed), falls back to a small empty hint — the point of this view is
 * calm; we don't manufacture content.
 */

import React from "react";
import { useProcessList, type WorkItemSummary } from "@/lib/process-query";
import { useFeed } from "@/lib/feed-query";
import type { ReviewItem, ShiftReportItem } from "@/lib/feed-types";
import { Greet, Zone, Row, AlexLine, EmptyHint } from "./view-shell";

interface TodayViewProps {
  userName?: string;
  onAskAbout: (subject: string) => void;
  onApprove?: (itemId: string) => void;
}

export function TodayView({ userName, onAskAbout, onApprove }: TodayViewProps) {
  const { data: feedData } = useFeed();
  const { data: processData } = useProcessList();

  const feedItems = feedData?.items ?? [];
  const workItems = processData?.workItems ?? [];

  const review = feedItems.find((i) => i.itemType === "review") as ReviewItem | undefined;
  const shiftReport = feedItems.find((i) => i.itemType === "shift-report") as ShiftReportItem | undefined;
  const handled = feedItems
    .filter((i) => i.itemType === "work-update" || i.itemType === "process-output")
    .slice(0, 4);
  const ahead = workItems
    .filter((w) => w.status !== "completed" && w.status !== "cancelled")
    .slice(0, 3);

  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeLabel = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const hr = now.getHours();
  const greet = hr < 12 ? "Morning" : hr < 18 ? "Afternoon" : "Evening";
  const name = userName ? `, ${userName}` : "";

  const summary = review
    ? `${greet === "Morning" ? "Quiet night — " : ""}everything ran clean. `
    : "";
  const needsDecision = review ? 1 : 0;
  const handledCount = handled.length;

  return (
    <div>
      <Greet
        kicker={`${dateLabel} · ${timeLabel}`}
        title={`${greet}${name}.`}
        summary={
          handledCount > 0 || needsDecision > 0 ? (
            <>
              {summary}
              {needsDecision > 0 ? (
                <>
                  <b>One thing needs your eyes</b> before I send it.{" "}
                </>
              ) : null}
              {handledCount > 0 ? `${handledCount} things happened while you were away, all fine.` : null}
            </>
          ) : (
            "Nothing pressing. I’ll surface what matters when it shows up."
          )
        }
      />

      {review && (
        <Zone title="For you" count="1 thing" meta="Needs decision">
          <ReviewCard review={review} onAskAbout={onAskAbout} onApprove={onApprove} />
        </Zone>
      )}

      {handled.length > 0 && (
        <Zone title="Handled while you were away" count={`${handled.length} things`} meta="Recent">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {handled.map((item) => (
              <Row
                key={item.id}
                status="ok"
                title={item.entityLabel ?? "Run complete"}
                desc={summariseFeedItem(item)}
                time={formatTime(item.timestamp)}
                onClick={() => onAskAbout(item.entityLabel ?? "that run")}
              />
            ))}
          </div>
        </Zone>
      )}

      {shiftReport && handled.length === 0 && (
        <Zone title="While you were away" meta="Last shift">
          <div
            style={{
              padding: "16px 14px",
              fontSize: 13.5,
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 10,
            }}
          >
            {shiftReport.data.summary}
          </div>
        </Zone>
      )}

      {ahead.length > 0 && (
        <Zone title="Ahead of you" count="today">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ahead.map((w) => (
              <Row
                key={w.id}
                status={w.status === "in_progress" ? "info" : "warn"}
                title={w.content.slice(0, 80)}
                desc={w.processName ? `From ${w.processName}` : undefined}
                time={formatRelative(w.createdAt)}
                onClick={() => onAskAbout(w.content)}
              />
            ))}
          </div>
        </Zone>
      )}

      {!review && handled.length === 0 && ahead.length === 0 && (
        <EmptyHint>
          Nothing on your plate yet. Set up an agent or a project and I’ll
          start filling this in.
        </EmptyHint>
      )}
    </div>
  );
}

/* =========================================================================
   Primary "review" card
   ========================================================================= */

function ReviewCard({
  review,
  onAskAbout,
  onApprove,
}: {
  review: ReviewItem;
  onAskAbout: (subject: string) => void;
  onApprove?: (id: string) => void;
}) {
  const subject = review.entityLabel ?? review.data.processName ?? "this";
  const [sent, setSent] = React.useState(false);

  return (
    <div
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: "24px 26px",
        position: "relative",
        boxShadow: "var(--shadow-subtle)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: sent ? "var(--color-positive)" : "var(--color-caution)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 6,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: sent ? "var(--color-positive)" : "var(--color-caution)",
            boxShadow: sent
              ? "0 0 0 3px rgba(22,163,74,0.15)"
              : "0 0 0 3px rgba(212,150,10,0.15)",
          }}
        />
        {sent ? "Sent" : "Review before I send"}
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
        {!sent ? (
          <>
            <button
              onClick={() => {
                setSent(true);
                onApprove?.(review.id);
              }}
              style={primaryBtnLg}
            >
              Approve &amp; send
            </button>
            <button style={ghostBtn}>Edit draft</button>
            <button
              onClick={() => onAskAbout(`the ${subject}`)}
              style={askCardBtn}
            >
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Ask about this
            </button>
          </>
        ) : (
          <span style={{ color: "var(--color-positive)", fontSize: 14, fontWeight: 600 }}>
            Sent · just now
          </span>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   Helpers
   ========================================================================= */

const primaryBtnLg: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 18px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  border: "1px solid var(--color-vivid)",
  background: "var(--color-vivid)",
  color: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtn: React.CSSProperties = {
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
};

const askCardBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  color: "var(--color-text-muted)",
  background: "none",
  border: "none",
  padding: "4px 8px 4px 6px",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
};

function summariseFeedItem(item: { itemType: string; data: Record<string, unknown> }): string {
  const d = item.data as {
    processName?: string;
    outputText?: string;
    summary?: string;
  };
  return (d.summary ?? d.outputText ?? d.processName ?? "").toString().slice(0, 120);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  } catch {
    return "";
  }
}

export type { WorkItemSummary };
