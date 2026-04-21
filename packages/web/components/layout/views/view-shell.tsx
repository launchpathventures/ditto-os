"use client";

/**
 * Ditto — View Shell primitives
 *
 * Small shared pieces used across the redesigned views: greeting block,
 * zone header, row, primary card — the visual vocabulary the design
 * handoff codified. Each view imports these, reading data from hooks
 * rather than duplicating styles.
 */

import React from "react";

export function Greet({
  kicker,
  title,
  summary,
}: {
  kicker?: string;
  title: string;
  summary?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 32 }}>
      {kicker && (
        <div
          style={{
            color: "var(--color-text-muted)",
            fontSize: 12.5,
            letterSpacing: "0.04em",
            marginBottom: 6,
            fontWeight: 500,
          }}
        >
          {kicker}
        </div>
      )}
      <h2
        style={{
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          margin: "0 0 10px",
          color: "var(--color-text-primary)",
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {summary && (
        <p
          style={{
            fontSize: 15,
            color: "var(--color-text-secondary)",
            lineHeight: 1.55,
            margin: 0,
            maxWidth: "56ch",
          }}
        >
          {summary}
        </p>
      )}
    </div>
  );
}

export function Zone({
  title,
  count,
  meta,
  children,
}: {
  title: string;
  count?: string | number;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: "1px solid var(--color-border)",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {title}
          {count != null && (
            <span
              style={{
                color: "var(--color-text-muted)",
                fontWeight: 500,
                marginLeft: 6,
                letterSpacing: 0,
                textTransform: "none",
                fontSize: 13,
              }}
            >
              {count}
            </span>
          )}
        </div>
        {meta && (
          <div
            style={{
              fontSize: 12.5,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {meta}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

export type RowStatus = "ok" | "warn" | "info";

export function Row({
  status,
  title,
  desc,
  whisper,
  time,
  onClick,
}: {
  status?: RowStatus;
  title: string;
  desc?: string;
  whisper?: string;
  time?: string;
  onClick?: () => void;
}) {
  const statusColor: Record<RowStatus, string> = {
    ok: "var(--color-positive)",
    warn: "var(--color-caution)",
    info: "var(--color-info)",
  };
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "11px 2px",
        borderBottom: "1px solid var(--color-border)",
        cursor: onClick ? "pointer" : "default",
        background: "none",
        border: "none",
        borderBottomColor: "var(--color-border)",
        borderBottomStyle: "solid",
        borderBottomWidth: 1,
        width: "100%",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      {status && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: statusColor[status],
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{title}</div>
        {desc && (
          <div
            style={{
              fontSize: 12.5,
              color: "var(--color-text-muted)",
              marginTop: 2,
              lineHeight: 1.45,
            }}
          >
            {desc}
          </div>
        )}
        {whisper && (
          <div
            style={{
              fontSize: 12,
              color: "var(--color-vivid-deep)",
              fontStyle: "italic",
              marginTop: 3,
              lineHeight: 1.4,
            }}
          >
            — {whisper}
          </div>
        )}
      </div>
      {time && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11.5,
            color: "var(--color-text-muted)",
            flexShrink: 0,
            textAlign: "right",
            minWidth: 60,
          }}
        >
          {time}
        </div>
      )}
    </button>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "40px 24px",
        textAlign: "center",
        color: "var(--color-text-muted)",
        fontSize: 13,
        lineHeight: 1.5,
        background: "var(--color-surface-raised)",
        border: "1px dashed var(--color-border)",
        borderRadius: 10,
      }}
    >
      {children}
    </div>
  );
}

export function AlexLine({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        fontSize: 13.5,
        color: "var(--color-text-secondary)",
        lineHeight: 1.5,
        marginTop: 6,
      }}
    >
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "var(--color-vivid)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
          marginTop: -1,
        }}
      >
        A
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
