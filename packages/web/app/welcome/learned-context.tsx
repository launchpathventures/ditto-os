"use client";

/**
 * "What I Know" card — shows key facts Alex has learned during the conversation.
 * Updates live as the chat progresses, giving the visitor confidence that
 * Alex is actually listening and building a picture.
 *
 * Two variants:
 * - Full (desktop sidebar): styled card with icons per field
 * - Compact (mobile sticky): single line showing the latest captured field
 *
 * Provenance: ProcessOS /get-started pattern.
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
  const progressPct = Math.round((filledCount / totalFields) * 100);

  return (
    <div className="animate-fade-in rounded-2xl border border-border bg-white shadow-sm">
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            What I know so far
          </p>
          <span className="text-xs tabular-nums text-text-muted">
            {filledCount}/{totalFields}
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-vivid transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Fields */}
      <div className="px-5 pb-4 pt-1">
        <div className="space-y-3">
          {entries.map(({ key, label, icon: Icon, value }) => (
            <div key={key} className="flex items-start gap-3 animate-fade-in">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-vivid/10">
                <Icon size={13} className="text-vivid" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  {label}
                </p>
                <p className="text-sm text-text-primary leading-snug">
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>
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
    <div className="flex items-center gap-2 rounded-xl border border-border bg-white/90 px-3 py-1.5 text-xs shadow-sm backdrop-blur-sm">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-vivid/10">
        <LastIcon size={11} className="text-vivid" />
      </div>
      <span className="font-semibold tabular-nums text-text-muted">
        {entries.length}/{FIELDS.length}
      </span>
      <span className="text-border">|</span>
      <span className="truncate text-text-secondary">
        {last.label}: {last.value}
      </span>
    </div>
  );
}
