"use client";

import { useState } from "react";
import type { CodeBlock } from "@/lib/engine";

export function CodeBlockComponent({ block }: { block: CodeBlock }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(block.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-secondary text-xs">
        <span className="text-text-secondary">
          {block.filename ?? block.language}
          {block.diff && " (diff)"}
        </span>
        <button
          onClick={handleCopy}
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-sm bg-surface-primary">
        <code>{block.content}</code>
      </pre>
    </div>
  );
}
