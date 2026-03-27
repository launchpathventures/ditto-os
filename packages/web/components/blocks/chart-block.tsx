"use client";

import { cn } from "@/lib/utils";
import type { ChartBlock } from "@/lib/engine";

/** Size presets for each chart type */
const SIZES = {
  sparkline: {
    inline: { width: 40, height: 16 },
    small: { width: 80, height: 24 },
    medium: { width: 160, height: 48 },
    large: { width: 0, height: 64 }, // width 0 = use 100%
  },
  donut: {
    inline: 48,
    small: 64,
    medium: 96,
    large: 128,
  },
} as const;

export function ChartBlockComponent({ block }: { block: ChartBlock }) {
  switch (block.chartType) {
    case "sparkline":
      return <Sparkline block={block} />;
    case "donut":
      return <Donut block={block} />;
    case "bar":
      return <Bar block={block} />;
    default:
      return null;
  }
}

function Sparkline({ block }: { block: ChartBlock }) {
  const values = block.data.values ?? [];
  if (values.length === 0) return null;

  const sizeKey = block.size ?? "inline";
  const dims = SIZES.sparkline[sizeKey];
  const isFullWidth = dims.width === 0;
  const width = isFullWidth ? 100 : dims.width;
  const height = dims.height;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  const trendColor = {
    up: "stroke-positive",
    down: "stroke-negative",
    flat: "stroke-text-muted",
  };

  const trendArrow = {
    up: "↑",
    down: "↓",
    flat: "→",
  };

  return (
    <div className={cn(
      "items-center gap-1.5",
      isFullWidth ? "flex w-full" : "inline-flex",
    )}>
      {block.data.label && (
        <span className="text-xs text-text-muted">{block.data.label}</span>
      )}
      <svg
        width={isFullWidth ? "100%" : width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio={isFullWidth ? "none" : undefined}
        className={cn("flex-shrink-0", isFullWidth && "flex-1")}
      >
        <polyline
          points={points}
          fill="none"
          className={cn("stroke-[1.5]", trendColor[block.data.trend ?? "flat"])}
        />
      </svg>
      {block.data.trend && (
        <span className={cn(
          "text-xs",
          block.data.trend === "up" ? "text-positive" :
          block.data.trend === "down" ? "text-negative" : "text-text-muted",
        )}>
          {trendArrow[block.data.trend]}
        </span>
      )}
    </div>
  );
}

function Donut({ block }: { block: ChartBlock }) {
  const segments = block.data.segments ?? [];
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const sizeKey = block.size ?? "inline";
  const size = SIZES.donut[sizeKey];
  const radius = size * 0.375;
  const strokeWidth = Math.max(4, size * 0.125);
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className="my-2">
      {block.title && (
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
          {block.title}
        </p>
      )}
      <div className="flex items-center gap-3">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
          {segments.map((seg, i) => {
            const dashLength = (seg.value / total) * circumference;
            const dashOffset = -offset;
            offset += dashLength;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                stroke={seg.color ?? `hsl(${(i * 120) % 360}, 50%, 50%)`}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
          })}
        </svg>
        <div className="space-y-0.5">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: seg.color ?? `hsl(${(i * 120) % 360}, 50%, 50%)` }}
              />
              <span className="text-text-secondary">{seg.label}</span>
              <span className="text-text-muted">{seg.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ block }: { block: ChartBlock }) {
  const segments = block.data.segments ?? [];
  const max = Math.max(...segments.map((s) => s.value), 1);

  return (
    <div className="my-2 space-y-1">
      {block.title && (
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
          {block.title}
        </p>
      )}
      {segments.map((seg, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-text-muted w-16 text-right truncate">{seg.label}</span>
          <div className="flex-1 h-3 bg-surface-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(seg.value / max) * 100}%`,
                backgroundColor: seg.color ?? "var(--color-accent)",
              }}
            />
          </div>
          <span className="text-xs text-text-muted w-8">{seg.value}</span>
        </div>
      ))}
    </div>
  );
}
