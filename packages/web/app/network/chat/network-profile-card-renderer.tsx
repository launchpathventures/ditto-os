"use client";

import { ArrowUpRight, MoreHorizontal } from "lucide-react";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { cn } from "@/lib/utils";

const DOT_COLORS: Record<string, string> = {
  petal: "#ffd7f0",
  mint: "#b7efb2",
  canary: "#ffef99",
  lavender: "#e2ddfd",
};

function greeterName(card: NetworkProfileCardBlock): string {
  return card.greeterCuratedBy === "mira" ? "Mira" : "Alex";
}

function firstName(card: NetworkProfileCardBlock): string {
  return card.name.split(/\s+/)[0] || "you";
}

function updatedLabel(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "Updated today";
  const days = Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated 1d ago";
  return `Updated ${days}d ago`;
}

function renderItalicOnce(markdown: string) {
  const match = markdown.match(/\*([^*]+)\*/);
  if (!match || match.index == null) return markdown;
  const before = markdown.slice(0, match.index);
  const after = markdown.slice(match.index + match[0].length);
  return (
    <>
      {before}
      <span className="font-instrument-serif italic">{match[1]}</span>
      {after}
    </>
  );
}

export function NetworkProfileCardRenderer({
  card,
  className,
}: {
  card: NetworkProfileCardBlock;
  className?: string;
}) {
  const filledDots = card.signalDots.filter((dot) => dot.filled).length;
  const allDots = card.signalDots.length > 0
    ? card.signalDots.slice(0, 6)
    : Array.from({ length: 6 }, (_, index) => ({
        id: `dot-${index}`,
        label: "Profile depth",
        filled: index < 1,
        color: "lavender" as const,
      }));
  const badges = card.badges.slice(0, 3);
  const greeter = greeterName(card);
  const name = firstName(card);

  return (
    <article
      data-testid="network-profile-card"
      className={cn(
        "w-full max-w-full rounded-[24px] bg-white p-5 text-text-primary shadow-large sm:max-w-[480px]",
        "border border-white/80",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {card.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.portraitUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-semibold uppercase text-text-primary">
              {name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold uppercase tracking-[0.04em]">
              {card.name}
            </h3>
            <p className="mt-0.5 truncate text-sm leading-tight text-text-secondary">
              {[card.cityLabel, card.oneLineRole].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-text-muted">
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-1.5" aria-label={`${filledDots} of ${allDots.length} profile signals filled`}>
        {allDots.map((dot, index) => (
          <span
            key={dot.id || index}
            title={dot.label}
            className={cn("h-2 w-2 rounded-full", dot.filled ? "" : "bg-surface-subtle")}
            style={dot.filled ? { backgroundColor: DOT_COLORS[dot.color] ?? DOT_COLORS.lavender } : undefined}
          />
        ))}
      </div>

      {badges.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {badges.map((badge, index) => (
            <span
              key={`${badge.label}-${index}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-text-secondary"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: DOT_COLORS[badge.color ?? "lavender"] }}
              />
              <span className="truncate">{badge.label}</span>
            </span>
          ))}
        </div>
      )}

      <p className="mt-5 text-[24px] leading-[1.18] text-text-primary">
        {card.narrativeMd ? renderItalicOnce(card.narrativeMd) : card.oneLineRole}
      </p>

      <div className="mt-5 rounded-lg bg-surface-raised px-3 py-2.5">
        <p className="text-sm leading-snug text-text-secondary">
          Allergic to:{" "}
          <span className="font-medium text-text-primary">
            {card.antiPersonaMd ?? `...still asking ${name}`}
          </span>
        </p>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <a
          href={card.shareUrl}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          <span aria-hidden="true" className="mr-2">▸</span>
          Ask {greeter} about {name}
        </a>
        <p className="mt-4 text-xs font-medium text-text-muted">
          Curated by <span className="font-instrument-serif italic">{greeter}</span> · {updatedLabel(card.lastUpdatedAt)}
        </p>
      </div>
    </article>
  );
}
