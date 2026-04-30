"use client";

/**
 * MemoryScopePill — at-a-glance scope label for a memory (Brief 227)
 *
 * Four variants per Designer spec + Architect's Q1 resolution:
 *   - `Project · <slug>`    — process-scope memory with non-null projectId
 *   - `All projects`        — self-scope memory with appliedProjectIds=null
 *   - `Just for you`        — self-scope user-model / preference memories
 *   - `<N> projects`        — self-scope memory with appliedProjectIds=[a,b,...]
 *
 * Visual identity: vivid-subtle bg + #D1F4E1 border (Anthropic Claude Design
 * handoff bundle id `iK3gPHe3rGAErdm4ua2V-A`). Folder/globe/person/layers
 * glyphs from lucide-react per pill variant.
 */

import { Folder, Globe, User, Layers } from "lucide-react";
import {
  classifyScope,
  type ScopePillSource,
  type ScopePillVariant,
} from "./memory-scope";

export { classifyScope };
export type { ScopePillSource, ScopePillVariant };

export function MemoryScopePill({
  source,
  className = "",
}: {
  source: ScopePillSource;
  className?: string;
}) {
  const variant = classifyScope(source);
  if (!variant) return null;

  const baseClass =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium " +
    "bg-vivid-subtle border border-[#D1F4E1] text-vivid-deep " +
    className;

  if (variant.kind === "project") {
    return (
      <span className={baseClass} data-scope-pill="project">
        <Folder size={11} aria-hidden="true" />
        <span>Project · {variant.label}</span>
      </span>
    );
  }
  if (variant.kind === "all") {
    return (
      <span className={baseClass} data-scope-pill="all">
        <Globe size={11} aria-hidden="true" />
        <span>All projects</span>
      </span>
    );
  }
  if (variant.kind === "personal") {
    return (
      <span className={baseClass} data-scope-pill="personal">
        <User size={11} aria-hidden="true" />
        <span>Just for you</span>
      </span>
    );
  }
  // variant.kind === "multi"
  return (
    <span className={baseClass} data-scope-pill="multi">
      <Layers size={11} aria-hidden="true" />
      <span>
        {variant.count} project{variant.count === 1 ? "" : "s"}
      </span>
    </span>
  );
}
