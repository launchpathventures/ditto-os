"use client";

/**
 * Ditto — Work view
 *
 * Plain list: what's on your plate today, what Alex is handling. One
 * question answered ("what am I doing today?") rather than a metric wall.
 */

import React, { useState } from "react";
import { useProcessList, type WorkItemSummary } from "@/lib/process-query";
import { Greet, EmptyHint } from "./view-shell";

interface WorkViewProps {
  onAskAbout: (subject: string) => void;
}

export function WorkView({ onAskAbout }: WorkViewProps) {
  const { data } = useProcessList();
  const items = data?.workItems ?? [];
  const userItems = items.filter(
    (w) => w.status !== "in_progress" && w.status !== "completed" && w.status !== "cancelled",
  );
  const alexItems = items.filter((w) => w.status === "in_progress");
  const doneItems = items.filter((w) => w.status === "completed").slice(0, 3);

  return (
    <div>
      <Greet
        title="Work"
        summary="Concrete things in flight today. Yours on top, mine below."
      />

      {userItems.length > 0 && (
        <Group title="For you today" count={`${userItems.length} remaining`}>
          {userItems.map((w) => (
            <WorkRow key={w.id} item={w} onAskAbout={onAskAbout} />
          ))}
        </Group>
      )}

      {doneItems.length > 0 && (
        <Group title="Done" count={doneItems.length}>
          {doneItems.map((w) => (
            <WorkRow key={w.id} item={w} onAskAbout={onAskAbout} />
          ))}
        </Group>
      )}

      {alexItems.length > 0 && (
        <Group title="I'm handling" count={`${alexItems.length} in flight`}>
          {alexItems.map((w) => (
            <WorkRow key={w.id} item={w} onAskAbout={onAskAbout} />
          ))}
        </Group>
      )}

      {items.length === 0 && (
        <EmptyHint>
          Nothing on the board. Tell me a goal and I’ll break it down into work.
        </EmptyHint>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count?: string | number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "10px 0",
          borderBottom: "1px solid var(--color-border-strong)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span>{title}</span>
        {count != null && (
          <span
            style={{
              color: "var(--color-text-muted)",
              fontWeight: 500,
              letterSpacing: 0,
              textTransform: "none",
              fontSize: 13,
            }}
          >
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function WorkRow({
  item,
  onAskAbout,
}: {
  item: WorkItemSummary;
  onAskAbout: (subject: string) => void;
}) {
  const [done, setDone] = useState(item.status === "completed");
  const inFlight = item.status === "in_progress";

  return (
    <button
      onClick={() => {
        if (inFlight) return onAskAbout(item.content);
        setDone((d) => !d);
      }}
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 2px",
        borderBottom: "1px solid var(--color-border)",
        cursor: "pointer",
        alignItems: "flex-start",
        width: "100%",
        fontFamily: "inherit",
        textAlign: "left",
        background: "none",
        border: "none",
        borderBottomStyle: "solid",
        borderBottomColor: "var(--color-border)",
        borderBottomWidth: 1,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          border: `1.5px solid ${done || inFlight ? "var(--color-vivid)" : "var(--color-border-strong)"}`,
          borderRadius: 5,
          flexShrink: 0,
          marginTop: 2,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: done
            ? "var(--color-vivid)"
            : inFlight
              ? "var(--color-vivid-subtle)"
              : "transparent",
        }}
      >
        {done && (
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {inFlight && !done && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-vivid)" }} />
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: done ? "var(--color-text-muted)" : "var(--color-text-primary)",
            lineHeight: 1.4,
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {item.content}
        </div>
        {item.processName && (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              marginTop: 4,
              lineHeight: 1.45,
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--color-vivid)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                fontWeight: 700,
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              A
            </span>
            {inFlight ? "I’m working on this now." : `From ${item.processName}.`}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: inFlight ? "var(--color-vivid-deep)" : "var(--color-text-muted)",
          flexShrink: 0,
          marginTop: 3,
        }}
      >
        {done ? "done" : inFlight ? "in progress" : item.type}
      </div>
    </button>
  );
}
