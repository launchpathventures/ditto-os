import * as React from "react";
import type { CSSProperties, ReactNode } from "react";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { cn } from "@/lib/utils";

const DOT_COLORS: Record<string, string> = {
  petal: "#ffd7f0",
  mint: "#b7efb2",
  canary: "#ffef99",
  lavender: "#e2ddfd",
};

function firstName(card: NetworkProfileCardBlock): string {
  return card.name.split(/\s+/)[0] || "you";
}

function greeterName(card: NetworkProfileCardBlock): string {
  return card.greeterCuratedBy === "mira" ? "Mira" : "Alex";
}

function updatedLabel(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "Updated today";
  const days = Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated 1d ago";
  return `Updated ${days}d ago`;
}

export function renderItalicOnce(markdown: string, imageMode = false): ReactNode {
  const match = markdown.match(/\*([^*]+)\*/);
  if (!match || match.index == null) return markdown;
  const before = markdown.slice(0, match.index);
  const after = markdown.slice(match.index + match[0].length);
  return (
    <>
      {before}
      <span
        data-italic-verb="true"
        className={imageMode ? undefined : "font-instrument-serif italic"}
        style={imageMode ? { fontFamily: "Georgia, serif", fontStyle: "italic" } : undefined}
      >
        {match[1]}
      </span>
      {after}
    </>
  );
}

export function NetworkCardSilhouette({
  card,
  className,
  imageMode = false,
  shareTextOverlay,
  actionSlot,
}: {
  card: NetworkProfileCardBlock;
  className?: string;
  imageMode?: boolean;
  shareTextOverlay?: string | null;
  actionSlot?: ReactNode;
}) {
  const name = firstName(card);
  const greeter = greeterName(card);
  const dots = card.signalDots.length > 0 ? card.signalDots.slice(0, 6) : [];
  const badges = card.badges.slice(0, 3);
  const cardStyle: CSSProperties = imageMode
    ? {
        position: "relative",
        overflow: "hidden",
        width: 720,
        borderRadius: 34,
        border: "1px solid #ecebe8",
        background: "#fffdfa",
        color: "#1c1c1c",
        display: "flex",
        flexDirection: "column",
        padding: 42,
        fontFamily: "Geist, Arial, sans-serif",
        boxShadow: "0 20px 60px rgba(0,0,0,0.06)",
      }
    : {};

  return (
    <article
      data-testid="card-silhouette"
      className={cn(
        !imageMode &&
          "relative w-full max-w-full overflow-hidden rounded-[24px] border border-white/80 bg-white p-5 text-text-primary shadow-large sm:max-w-[480px]",
        className,
      )}
      style={cardStyle}
    >
      <div
        data-phoenix-gradient="orb"
        style={{
          position: "absolute",
          right: imageMode ? -110 : -80,
          top: imageMode ? -120 : -80,
          width: imageMode ? 310 : 210,
          height: imageMode ? 310 : 210,
          borderRadius: 999,
          background: "radial-gradient(circle, rgba(255,64,0,0.08), rgba(255,64,0,0) 64%)",
        }}
      />
      <div
        data-phoenix-gradient="wisp"
        style={{
          position: "absolute",
          left: imageMode ? -130 : -90,
          bottom: imageMode ? -120 : -80,
          width: imageMode ? 360 : 240,
          height: imageMode ? 220 : 150,
          background: "linear-gradient(22deg, rgba(255,64,0,0.08), rgba(255,64,0,0) 68%)",
        }}
      />
      <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", minWidth: 0, alignItems: "center", gap: 12 }}>
            <div
              style={{
                display: "flex",
                width: imageMode ? 62 : 40,
                height: imageMode ? 62 : 40,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                background: "#f1f1f1",
                fontSize: imageMode ? 24 : 14,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {name.slice(0, 1)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: imageMode ? 24 : 14,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {card.name}
              </h3>
              <p
                style={{
                  margin: imageMode ? "5px 0 0" : "2px 0 0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "#6e6e6e",
                  fontSize: imageMode ? 20 : 14,
                  lineHeight: 1.25,
                }}
              >
                {[card.cityLabel, card.oneLineRole].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <div aria-hidden="true" style={{ display: "flex", color: "#6e6e6e", fontSize: imageMode ? 24 : 16, letterSpacing: 2 }}>
            ...
          </div>
        </div>

        <div style={{ display: "flex", gap: imageMode ? 10 : 6, marginTop: imageMode ? 42 : 24 }}>
          {dots.map((dot, index) => (
            <span
              key={dot.id || index}
              title={dot.label}
              style={{
                width: imageMode ? 13 : 8,
                height: imageMode ? 13 : 8,
                borderRadius: 999,
                background: dot.filled ? DOT_COLORS[dot.color] ?? DOT_COLORS.lavender : "#ecebe8",
              }}
            />
          ))}
        </div>

        {badges.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: imageMode ? 30 : 20 }}>
            {badges.map((badge, index) => (
              <span
                key={`${badge.label}-${index}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 8,
                  border: "1px solid #ecebe8",
                  background: "rgba(255,255,255,0.72)",
                  padding: imageMode ? "9px 13px" : "4px 10px",
                  color: "#6e6e6e",
                  fontSize: imageMode ? 15 : 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: DOT_COLORS[badge.color ?? "lavender"] }} />
                {badge.label}
              </span>
            ))}
          </div>
        ) : null}

        <p
          style={{
            margin: imageMode ? "34px 0 0" : "20px 0 0",
            color: "#1c1c1c",
            fontSize: imageMode ? 44 : 24,
            lineHeight: 1.16,
            letterSpacing: 0,
          }}
        >
          {card.narrativeMd ? renderItalicOnce(card.narrativeMd, imageMode) : card.oneLineRole}
        </p>

        {shareTextOverlay ? (
          <div
            data-testid="card-silhouette-share-overlay"
            style={{
              marginTop: imageMode ? 32 : 18,
              borderRadius: imageMode ? 18 : 12,
              background: "rgba(28,28,28,0.94)",
              color: "#fafafa",
              padding: imageMode ? "20px 22px" : "12px 14px",
              fontSize: imageMode ? 22 : 13,
              lineHeight: 1.35,
              letterSpacing: 0,
            }}
          >
            {shareTextOverlay}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", marginTop: imageMode ? 32 : 20, borderRadius: 8, background: "#f1f1f1", padding: imageMode ? "18px 20px" : "10px 12px" }}>
            <p style={{ margin: 0, color: "#6e6e6e", fontSize: imageMode ? 20 : 14, lineHeight: 1.35 }}>
              Allergic to: <span style={{ color: "#1c1c1c", fontWeight: 600 }}>{card.antiPersonaMd ?? `...still asking ${name}`}</span>
            </p>
          </div>
        )}

          <div style={{ display: "flex", flexDirection: "column", marginTop: imageMode ? 38 : 24, borderTop: "1px solid #ecebe8", paddingTop: imageMode ? 28 : 20 }}>
          {actionSlot ?? (
            <a href={card.shareUrl} className={imageMode ? undefined : "inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"}>
              <span aria-hidden="true" style={{ marginRight: 8 }}>{">"}</span>
              Ask {greeter} about {name}
            </a>
          )}
          <p style={{ margin: imageMode ? "24px 0 0" : "16px 0 0", color: "#6e6e6e", fontSize: imageMode ? 16 : 12, fontWeight: 600, letterSpacing: 0 }}>
            Curated by <span>{greeter}</span> - {updatedLabel(card.lastUpdatedAt)}
          </p>
        </div>
      </div>
    </article>
  );
}

export function NetworkCardOgFrame({
  card,
  shareTextOverlay,
}: {
  card: NetworkProfileCardBlock;
  shareTextOverlay?: string | null;
}) {
  return (
    <div style={{ display: "flex", width: "1200px", height: "630px", alignItems: "center", justifyContent: "center", background: "#fafafa", fontFamily: "Geist, Arial, sans-serif" }}>
      <NetworkCardSilhouette card={card} imageMode shareTextOverlay={shareTextOverlay} />
    </div>
  );
}
