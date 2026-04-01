"use client";

/**
 * ConfidenceCard — Trust signal for AI responses (Brief 068)
 *
 * Shows the user how confident the AI is in its response and what
 * they should watch out for. Uncertainty-first, evidence-second.
 *
 * Three states:
 * - Collapsed (high confidence): quiet green dot + summary
 * - Auto-expanded (medium/low): hero moment with uncertainties prominent
 * - User-expanded (high, tapped): typographic border-left, no surface container
 *
 * Provenance: Brief 068, Insight-127/128/129.
 */

import { useState, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ConfidenceData } from "@/lib/data-part-schemas";

interface ConfidenceCardProps {
  assessment: ConfidenceData;
  /** Whether the message is still streaming */
  isStreaming?: boolean;
  /** Activity trace content to render behind "View activity trace" */
  activityTrace?: ReactNode;
  className?: string;
}

/** Max items before truncation on mobile (AC14) */
const MOBILE_TRUNCATE_THRESHOLD = 5;

/**
 * Confidence dot — 8px filled circle using semantic color tokens.
 */
function ConfidenceDot({ level }: { level: ConfidenceData["level"] }) {
  const colorClass =
    level === "high"
      ? "bg-positive"
      : level === "medium"
        ? "bg-caution"
        : "bg-negative";

  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", colorClass)}
      aria-hidden="true"
    />
  );
}

/**
 * Chevron icon for expand/collapse.
 */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "text-text-muted transition-transform duration-150 flex-shrink-0",
        open && "rotate-90",
      )}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function ConfidenceCard({
  assessment,
  isStreaming,
  activityTrace,
  className,
}: ConfidenceCardProps) {
  const { level, summary, checks, uncertainties } = assessment;

  // Auto-expand for medium/low (AC8), collapsed for high
  const shouldAutoExpand = level === "medium" || level === "low";
  const [open, setOpen] = useState(shouldAutoExpand);
  const userToggledRef = useRef(false);
  const [traceOpen, setTraceOpen] = useState(false);

  // Track whether items should be truncated (mobile, AC14)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleToggle = () => {
    userToggledRef.current = true;
    setOpen((prev) => !prev);
  };

  // Auto-expand when assessment arrives after streaming (AC8)
  useEffect(() => {
    if (!userToggledRef.current && shouldAutoExpand) {
      setOpen(true);
    }
  }, [shouldAutoExpand]);

  const totalItems = uncertainties.length + checks.length;
  const shouldTruncate = isMobile && totalItems > MOBILE_TRUNCATE_THRESHOLD;

  // Determine visual treatment: hero-moment for auto-expand, typographic for user-expand (AC15)
  const isHeroMoment = shouldAutoExpand && open;
  const isUserExpanded = !shouldAutoExpand && open;

  const levelLabel =
    level === "high"
      ? "High confidence"
      : level === "medium"
        ? "Medium confidence"
        : "Low confidence";

  // Collapsed summary: level + summary or uncertainty count
  const collapsedSuffix =
    uncertainties.length > 0
      ? `${uncertainties.length} caveat${uncertainties.length !== 1 ? "s" : ""}`
      : summary;

  return (
    <div
      className={cn(
        "my-1.5",
        // Hero moment: surface-raised + rounded-xl + vivid-deep border (AC15)
        isHeroMoment &&
          "bg-surface-raised rounded-xl border-l-2 border-vivid-deep p-3",
        // User-expanded: typographic border-left only (AC15)
        isUserExpanded && "border-l-2 border-vivid-deep pl-3",
        className,
      )}
      data-testid="confidence-card"
    >
      {/* Collapsed header — always visible (AC7) */}
      <button
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-2 w-full text-left min-h-[44px]",
          "text-sm text-text-muted hover:text-text-secondary transition-colors",
        )}
        aria-expanded={open}
      >
        <Chevron open={open} />
        <ConfidenceDot level={level} />
        <span>
          {levelLabel}
          {!open && collapsedSuffix && (
            <span className="ml-1">· {collapsedSuffix}</span>
          )}
        </span>
      </button>

      {/* Expanded content (AC9) */}
      {open && (
        <div className="mt-2 space-y-1.5">
          {/* Uncertainties first — caution icon (AC9, Insight-128) */}
          {uncertainties.map((u, i) => (
            <div key={`u-${i}`} className="flex items-start gap-2 text-sm">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-caution flex-shrink-0 mt-0.5"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <div>
                <span className="text-text-secondary">{u.label}</span>
                {u.detail && (
                  <span className="text-text-muted ml-1">— {u.detail}</span>
                )}
              </div>
            </div>
          ))}

          {/* Checks — positive icon (AC9) */}
          {(() => {
            const visibleChecks =
              shouldTruncate
                ? checks.slice(0, Math.max(0, MOBILE_TRUNCATE_THRESHOLD - uncertainties.length))
                : checks;
            const hiddenCount = checks.length - visibleChecks.length;

            return (
              <>
                {visibleChecks.map((c, i) => (
                  <div key={`c-${i}`} className="flex items-start gap-2 text-sm">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-positive flex-shrink-0 mt-0.5"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <div>
                      <span className="text-text-muted">{c.label}</span>
                      {c.detail && (
                        <span className="text-text-muted ml-1">· {c.detail}</span>
                      )}
                    </div>
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <div className="text-xs text-text-muted pl-[22px]">
                    + {hiddenCount} verified check{hiddenCount !== 1 ? "s" : ""}
                  </div>
                )}
              </>
            );
          })()}

          {/* Activity trace gateway (AC10) */}
          {activityTrace && (
            <div className="pt-1">
              <button
                onClick={() => setTraceOpen((prev) => !prev)}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {traceOpen ? "Hide" : "View"} activity trace
              </button>
              {traceOpen && (
                <div className="mt-1.5 pl-1 border-l border-border/30">
                  {activityTrace}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
