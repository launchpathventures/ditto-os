"use client";

/**
 * PersonaPortrait — typographic initial badge for Alex/Mira.
 *
 * Placeholder art until real illustrations land. The colour accents distinguish
 * the two personas without leaning on stereotypes — Alex is a warm sand tone
 * that echoes the Australian light; Mira is a cool slate that reads as London
 * weather.
 */

import type { PersonaId } from "@/lib/persona";

const STYLES: Record<PersonaId, { bg: string; text: string; ring: string }> = {
  alex: {
    bg: "bg-gradient-to-br from-amber-100 via-orange-100 to-amber-200",
    text: "text-amber-900",
    ring: "ring-amber-300/60",
  },
  mira: {
    bg: "bg-gradient-to-br from-slate-100 via-indigo-100 to-slate-200",
    text: "text-slate-900",
    ring: "ring-slate-300/60",
  },
};

export function PersonaPortrait({
  personaId,
  size = "lg",
  initial,
}: {
  personaId: PersonaId;
  size?: "sm" | "md" | "lg";
  initial?: string;
}) {
  const letter = initial ?? (personaId === "alex" ? "A" : "M");
  const style = STYLES[personaId];
  const dims =
    size === "sm" ? "h-10 w-10 text-lg"
    : size === "md" ? "h-14 w-14 text-2xl"
    : "h-20 w-20 text-4xl";

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight shadow-sm ring-2 ring-inset ${dims} ${style.bg} ${style.text} ${style.ring}`}
      aria-hidden="true"
    >
      {letter}
    </div>
  );
}
