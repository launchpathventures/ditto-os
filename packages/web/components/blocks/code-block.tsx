"use client";

/**
 * CodeBlock Renderer (Brief 061 — Block Renderer Upgrade)
 *
 * Uses AI Elements CodeBlock component internally. Maps CodeBlock
 * ContentBlock fields to CodeBlock AI Element props.
 *
 * Two-layer architecture: ContentBlock type defines WHAT (engine),
 * AI Elements define HOW (React UI).
 */

import type { CodeBlock } from "@/lib/engine";
import { CodeBlock as AICodeBlock } from "@/components/ai-elements/code-block";

export function CodeBlockComponent({ block }: { block: CodeBlock }) {
  return (
    <div className="my-2">
      <AICodeBlock
        code={block.content}
        language={block.diff ? "diff" : block.language}
        filename={block.filename}
      />
    </div>
  );
}
