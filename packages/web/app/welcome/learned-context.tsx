"use client";

/**
 * "What I Know" card — shows key facts the persona has learned during the
 * conversation. Updates live as the chat progresses.
 *
 * Treatment: ink-on-white, no chrome accent color. Eyebrow label + dotted
 * 8-segment progress ticker + hairline-circle monochrome icons + hairline
 * dividers between rows. The panel is a column, not a sidebar — it should
 * read as a peer pane, not a tray.
 *
 * Provenance: Jace AI right-rail, Granola sidebar, ManyChat segmented
 * subnav (refero design research, May 2026).
 */

import { User, Building2, Briefcase, MapPin, Target, MessageSquare, Compass, Layers } from "lucide-react";

const FIELDS: { key: string; label: string; icon: React.ElementType }[] = [
  { key: "name", label: "Name", icon: User },
  { key: "business", label: "Business", icon: Building2 },
  { key: "role", label: "Role", icon: Briefcase },
  { key: "industry", label: "Industry", icon: Layers },
  { key: "location", label: "Location", icon: MapPin },
  { key: "target", label: "Audience", icon: Target },
  { key: "problem", label: "Goal", icon: Compass },
  { key: "channel", label: "Channel", icon: MessageSquare },
];

function getEntries(learned: Record<string, string | null>): { key: string; label: string; icon: React.ElementType; value: string }[] {
  return FIELDS
    .filter(({ key }) => learned[key])
    .map(({ key, label, icon }) => ({ key, label, icon, value: learned[key] as string }));
}

export function LearnedContext({ learned }: { learned: Record<string, string | null> | null }) {
  if (!learned) return null;
  const entries = getEntries(learned);
  if (entries.length === 0) return null;

  const filledCount = entries.length;
  const totalFields = FIELDS.length;

  return (
    <div className="animate-fade-in rounded-2xl border border-border bg-white shadow-subtle">
      {/* Header — eyebrow label + tabular counter */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
            What I know so far
          </p>
          <span className="text-[11px] tabular-nums text-text-muted/80">
            {filledCount} / {totalFields}
          </span>
        </div>
        {/* Dotted 8-segment progress ticker — ink dots fill from the left */}
        <div className="mt-3 flex items-center gap-1.5" role="progressbar" aria-valuenow={filledCount} aria-valuemax={totalFields}>
          {Array.from({ length: totalFields }).map((_, i) => (
            <div
              key={i}
              className={`h-1 w-1 rounded-full transition-colors duration-500 ${
                i < filledCount ? "bg-text-primary" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Fields — hairline circle icons + ink labels, divided by 1px dashed hairlines */}
      <div className="px-5 pb-5">
        <ul className="divide-y divide-border/70">
          {entries.map(({ key, label, icon: Icon, value }) => (
            <li
              key={key}
              className="flex items-start gap-3 py-3 first:pt-1 animate-fade-in"
            >
              <div className="mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-white">
                <Icon size={13} strokeWidth={1.6} className="text-text-secondary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                  {label}
                </p>
                <p className="mt-0.5 text-[14px] font-medium leading-snug text-text-primary">
                  {value}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function LearnedContextCompact({ learned }: { learned: Record<string, string | null> | null }) {
  if (!learned) return null;
  const entries = getEntries(learned);
  if (entries.length === 0) return null;

  const last = entries[entries.length - 1];
  const LastIcon = last.icon;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-white/95 px-3 py-1.5 text-xs shadow-subtle backdrop-blur-sm">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border">
        <LastIcon size={11} strokeWidth={1.6} className="text-text-secondary" />
      </div>
      <span className="font-semibold tabular-nums text-text-muted">
        {entries.length}/{FIELDS.length}
      </span>
      <span className="text-border">|</span>
      <span className="truncate text-text-secondary">
        <span className="font-medium text-text-primary">{last.label}:</span> {last.value}
      </span>
    </div>
  );
}
