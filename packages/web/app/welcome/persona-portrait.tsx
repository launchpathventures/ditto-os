"use client";

/**
 * PersonaPortrait — animated brand-color orbs for Alex and Mira.
 *
 * Each persona maps to one of the two Ditto gradient brand colors:
 *   - Alex  → Phoenix Orange (warm orange → cream → lavender)
 *   - Mira  → Cyan Glow      (lavender core → pale aqua → bright cyan)
 *
 * Both gradients are the exact radial specs from the brand sheet (off-axis
 * centers preserved for the pearlescent quality). A soft white highlight
 * layer drifts on a slow 11s loop to give the orb a living, breathing
 * presence — light catching a pearl. Respects prefers-reduced-motion.
 *
 * No letter overlay — the orb itself carries the identity.
 */

import type { PersonaId } from "@/lib/persona";

// Exact brand-sheet radial gradients. Preserve the off-axis percentages —
// they're what makes the gradients feel atmospheric rather than centered.
const ORB: Record<PersonaId, string> = {
  alex:
    "radial-gradient(386.06% 162.79% at -13.1926% -17.1008%, rgb(232, 64, 13) 0%, rgb(255, 238, 216) 26.1559%, rgb(208, 178, 255) 84.1533%)",
  mira:
    "radial-gradient(80.17% 109.2% at 52.1169% 62.5363%, rgb(208, 178, 255) 0%, rgb(198, 236, 233) 35.282%, rgb(153, 255, 249) 96.5565%)",
};

// Pearl-highlight overlay. Sits above the base gradient and drifts to give
// the orb a living shimmer. Position-of-shine differs per persona to match
// where each gradient's natural "light" already lives.
const HIGHLIGHT: Record<PersonaId, string> = {
  alex:
    "radial-gradient(48% 38% at 26% 22%, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 70%)",
  mira:
    "radial-gradient(42% 36% at 32% 28%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 72%)",
};

interface PersonaPortraitProps {
  personaId: PersonaId;
  size?: "sm" | "md" | "lg";
}

export function PersonaPortrait({ personaId, size = "lg" }: PersonaPortraitProps) {
  const dim = size === "sm" ? 40 : size === "md" ? 56 : 80;
  return (
    <div
      aria-hidden
      className="ditto-orb relative shrink-0 overflow-hidden rounded-full"
      style={{
        width: dim,
        height: dim,
        background: ORB[personaId],
        boxShadow:
          "0 6px 18px -8px rgba(16, 5, 77, 0.28), inset 0 -2px 8px rgba(16, 5, 77, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.35)",
      }}
    >
      <div
        className="ditto-orb-highlight absolute inset-0"
        style={{ background: HIGHLIGHT[personaId] }}
      />
    </div>
  );
}
