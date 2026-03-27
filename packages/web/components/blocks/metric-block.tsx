"use client";

import { cn } from "@/lib/utils";
import type { MetricBlock } from "@/lib/engine";

export function MetricBlockComponent({ block }: { block: MetricBlock }) {
  const trendStyles = {
    up: { arrow: "↑", color: "text-positive" },
    down: { arrow: "↓", color: "text-negative" },
    flat: { arrow: "→", color: "text-text-muted" },
  };

  return (
    <div className={cn(
      "my-2 flex flex-wrap gap-4",
      block.metrics.length === 1 && "gap-0",
    )}>
      {block.metrics.map((m, i) => (
        <div key={i} className="flex items-baseline gap-1.5">
          <span className="text-xl font-semibold text-text-primary">{m.value}</span>
          <span className="text-xs text-text-muted">{m.label}</span>
          {m.trend && (
            <span className={cn("text-xs", trendStyles[m.trend].color)}>
              {trendStyles[m.trend].arrow}
            </span>
          )}
          {m.sparkline && m.sparkline.length > 1 && (
            <InlineSparkline values={m.sparkline} trend={m.trend} />
          )}
        </div>
      ))}
    </div>
  );
}

function InlineSparkline({ values, trend }: { values: number[]; trend?: "up" | "down" | "flat" }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 32;
  const height = 12;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const strokeClass =
    trend === "up" ? "stroke-positive" :
    trend === "down" ? "stroke-negative" : "stroke-text-muted";

  return (
    <svg width={width} height={height} className="ml-1 flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        className={cn("stroke-[1.5]", strokeClass)}
      />
    </svg>
  );
}
