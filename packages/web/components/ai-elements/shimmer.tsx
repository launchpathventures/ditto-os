/**
 * Shimmer — Adopted from AI Elements
 *
 * Animated gradient text for streaming loading states.
 * Uses CSS animation (not Framer Motion) per Brief 058 constraint.
 *
 * Provenance: vercel/ai-elements shimmer.tsx, adapted for Ditto design tokens.
 */

import { cn } from "@/lib/utils";

interface ShimmerProps {
  children: React.ReactNode;
  className?: string;
}

export function Shimmer({ children, className }: ShimmerProps) {
  return (
    <span className={cn("reasoning-shimmer", className)}>
      {children}
    </span>
  );
}
