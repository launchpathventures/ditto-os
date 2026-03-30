"use client";

/**
 * Ditto — TextBlock Component
 *
 * Renders markdown content via react-markdown + remark-gfm.
 * Styled with design system typography tokens.
 *
 * Supports: headings, paragraphs, lists, code blocks, tables,
 * bold/italic/strikethrough, links, blockquotes.
 *
 * Brief 050, ADR-021.
 * Provenance: react-markdown (MIT, SSR-compatible).
 */

import type { TextBlock } from "@/lib/engine";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold text-text-primary mt-6 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-text-primary mt-5 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-semibold text-text-primary mt-4 mb-2 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold text-text-primary mt-3 mb-1 first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="text-sm font-medium text-text-primary mt-3 mb-1 first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="text-xs font-medium text-text-muted mt-3 mb-1 first:mt-0">{children}</h6>
  ),
  p: ({ children }) => (
    <p className="text-base leading-relaxed text-text-primary mb-3 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-base text-text-primary mb-3 space-y-1 pl-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-base text-text-primary mb-3 space-y-1 pl-1">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/30 pl-4 my-3 text-text-secondary italic">{children}</blockquote>
  ),
  code: ({ children, className }) => {
    // Inline code vs fenced code block
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code className="text-sm">{children}</code>
      );
    }
    return (
      <code className="text-sm bg-surface px-1.5 py-0.5 rounded font-mono text-text-primary">{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-surface rounded-lg p-4 overflow-x-auto text-sm font-mono text-text-primary mb-3 border border-border">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left text-xs font-medium text-text-muted uppercase tracking-wide px-3 py-2">{children}</th>
  ),
  td: ({ children }) => (
    <td className="text-sm text-text-primary px-3 py-2 border-b border-border/50">{children}</td>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:text-accent/80 underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children}</em>
  ),
  del: ({ children }) => (
    <del className="line-through text-text-muted">{children}</del>
  ),
  hr: () => (
    <hr className="border-border my-4" />
  ),
};

export function TextBlockComponent({ block }: { block: TextBlock }) {
  return (
    <div data-testid="text-block" className="text-base leading-relaxed text-text-primary">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {block.text}
      </Markdown>
    </div>
  );
}
