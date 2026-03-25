"use client";

import type { ImageBlock } from "@/lib/engine";

export function ImageBlockComponent({ block }: { block: ImageBlock }) {
  return (
    <div className="my-2">
      <img
        src={block.url}
        alt={block.alt}
        className="rounded-lg max-w-full max-h-96 object-contain"
      />
      {block.caption && (
        <p className="mt-1 text-xs text-text-secondary">{block.caption}</p>
      )}
    </div>
  );
}
