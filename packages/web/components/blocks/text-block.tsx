"use client";

import type { TextBlock } from "@/lib/engine";

export function TextBlockComponent({ block }: { block: TextBlock }) {
  return (
    <div className="text-base leading-relaxed whitespace-pre-wrap text-text-primary">
      {block.text}
    </div>
  );
}
