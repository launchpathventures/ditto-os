/**
 * HeroBackdrop — atmospheric brand image, anchored top / bottom / cover.
 *
 * The image lives behind chrome at z-0 and fades to canvas in the
 * direction opposite its anchor:
 *   - anchor="top"    → image at top, fades downward (decorative header)
 *   - anchor="bottom" → image at bottom, fades upward (decorative floor)
 *   - anchor="cover"  → fills the parent, no fade (atmospheric backdrop)
 *
 * Decorative only; aria-hidden, pointer-events-none, sits at z-0.
 */

import Image from "next/image";

type HeroVariant = "atmosphere" | "workspace" | "architecture" | "home" | "network";
type HeroAnchor = "top" | "bottom" | "cover";

const SOURCES: Record<HeroVariant, { src: string; alt: string }> = {
  atmosphere: { src: "/hero-atmosphere.png", alt: "" },
  workspace: { src: "/hero-workspace.png", alt: "" },
  architecture: { src: "/hero-architecture.png", alt: "" },
  home: { src: "/hero-home.png", alt: "" },
  network: { src: "/hero-network.png", alt: "" },
};

interface HeroBackdropProps {
  variant: HeroVariant;
  /** Where the image sits in the parent. Defaults to "top". */
  anchor?: HeroAnchor;
  /** Visible image strip height in px when anchor is "top" or "bottom".
   *  Ignored when anchor="cover" (image fills the parent). */
  height?: number;
  /** 0–1 multiplier on the image opacity. Lower = more transparent /
   *  watermark-like; higher = more present. Defaults to 0.85. */
  intensity?: number;
  /** Object-position for the inner Image. Defaults map by anchor:
   *  top → "center top", bottom → "center bottom", cover → "center center". */
  position?: string;
  className?: string;
  /** Set true on the first/primary hero (priority) for LCP. */
  priority?: boolean;
}

export function HeroBackdrop({
  variant,
  anchor = "top",
  height = 480,
  intensity = 0.85,
  position,
  className,
  priority = false,
}: HeroBackdropProps) {
  const source = SOURCES[variant];
  const objectPosition =
    position ??
    (anchor === "top"
      ? "center top"
      : anchor === "bottom"
      ? "center bottom"
      : "center center");

  // Wrapper anchors and sizing per mode.
  const wrapperPosClasses =
    anchor === "cover"
      ? "inset-0"
      : anchor === "bottom"
      ? "inset-x-0 bottom-0"
      : "inset-x-0 top-0";
  const wrapperStyle =
    anchor === "cover" ? undefined : { height };

  // Fade-to-canvas overlay direction per anchor. "cover" gets none.
  const fadeBackground =
    anchor === "top"
      ? `linear-gradient(to bottom,
          transparent 0%,
          transparent 50%,
          color-mix(in srgb, var(--color-background) 55%, transparent) 78%,
          var(--color-background) 100%)`
      : anchor === "bottom"
      ? `linear-gradient(to top,
          transparent 0%,
          transparent 35%,
          color-mix(in srgb, var(--color-background) 55%, transparent) 70%,
          var(--color-background) 100%)`
      : null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute z-0 overflow-hidden ${wrapperPosClasses} ${className ?? ""}`}
      style={wrapperStyle}
    >
      <Image
        src={source.src}
        alt={source.alt}
        fill
        priority={priority}
        sizes="100vw"
        style={{
          objectFit: "cover",
          objectPosition,
          opacity: intensity,
        }}
      />
      {fadeBackground && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: fadeBackground }}
        />
      )}
    </div>
  );
}
