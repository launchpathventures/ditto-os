"use client";

import { cn } from "@/lib/utils";
import { AlertTriangle, XCircle, Info } from "lucide-react";
import type { AlertBlock } from "@/lib/engine";

interface Props {
  block: AlertBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

const SEVERITY_ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
} as const;

const SEVERITY_STYLES = {
  info: { icon: "text-info", bg: "bg-info/5", border: "border-info/20" },
  warning: { icon: "text-caution", bg: "bg-caution/5", border: "border-caution/20" },
  error: { icon: "text-negative", bg: "bg-negative/5", border: "border-negative/20" },
} as const;

export function AlertBlockComponent({ block, onAction }: Props) {
  const style = SEVERITY_STYLES[block.severity];
  const IconComponent = SEVERITY_ICONS[block.severity];

  return (
    <div className={cn("my-2 rounded-lg border p-2.5 px-3.5", style.bg, style.border)}>
      <div className="flex items-start gap-2">
        <IconComponent size={18} className={cn("mt-0.5 flex-shrink-0", style.icon)} />
        <div className="flex-1">
          <div className="text-sm font-semibold text-text-primary">{block.title}</div>
          <p className="text-sm text-text-secondary mt-0.5">{block.content}</p>
          {block.actions && block.actions.length > 0 && (
            <div className="flex gap-2 mt-2">
              {block.actions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => onAction?.(action.id, action.payload)}
                  className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
