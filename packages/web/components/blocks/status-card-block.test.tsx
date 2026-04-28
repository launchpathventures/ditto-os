/**
 * StatusCardBlock renderer — Brief 221 AC #1 (dispatch-table fork).
 *
 * Verifies:
 *  1. With `metadata.cardKind = "runnerDispatch"`, the renderer routes to
 *     the runner template (kind label + mode chip + external links).
 *  2. With unknown / missing `metadata.cardKind`, falls through to the
 *     generic template.
 *  3. The renderer SOURCE uses a discriminator-keyed dispatch table
 *     (`Record<string, RendererFn>`), NOT cascading-if. We grep the source
 *     and assert at most ONE `if (metadata.X)`-style branch outside the
 *     dispatch lookup.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusCardBlockComponent } from "./status-card-block";
import type { StatusCardBlock } from "@/lib/engine";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function renderHtml(block: StatusCardBlock): string {
  return renderToStaticMarkup(
    React.createElement(StatusCardBlockComponent, { block }),
  );
}

function runnerCard(): StatusCardBlock {
  return {
    type: "status_card",
    entityType: "work_item",
    entityId: "wi-1",
    title: "Routine started",
    status: "running",
    details: {
      runnerKind: "claude-code-routine",
      runnerMode: "cloud",
      status: "running",
      attemptIndex: "0",
    },
    metadata: {
      cardKind: "runnerDispatch",
      runnerKind: "claude-code-routine",
      runnerMode: "cloud",
      status: "running",
      attemptIndex: 0,
      externalUrl: "https://anthropic.example/session/abc",
      prUrl: "https://github.com/o/r/pull/1",
    },
  };
}

function genericCard(): StatusCardBlock {
  return {
    type: "status_card",
    entityType: "process_run",
    entityId: "run-1",
    title: "Process running",
    status: "running",
    details: { steps: "3/5" },
    // No metadata — falls through to generic.
  };
}

function unknownSubtypeCard(): StatusCardBlock {
  return {
    ...genericCard(),
    metadata: { cardKind: "futureSubtypeNotYetRegistered" },
  };
}

describe("StatusCardBlockComponent — runnerDispatch subtype", () => {
  it("renders runner kind + mode chip when metadata.cardKind = 'runnerDispatch'", () => {
    const html = renderHtml(runnerCard());
    expect(html).toContain("Routine");
    expect(html).toContain("Cloud");
    expect(html).toContain("running");
    expect(html).toContain("Routine started");
  });

  it("renders deep links from metadata when present", () => {
    const html = renderHtml(runnerCard());
    expect(html).toContain('href="https://github.com/o/r/pull/1"');
    expect(html).toContain('href="https://anthropic.example/session/abc"');
    expect(html).toContain("data-testid=\"runner-card-pr-link\"");
    expect(html).toContain("data-testid=\"runner-card-external-link\"");
  });

  it("user-facing label only — no internal slug leak", () => {
    const html = renderHtml(runnerCard());
    // The kind slug appears in href URLs (allowed), but NOT as visible text.
    // Strip href attributes, then check.
    const visibleText = html
      .replace(/href="[^"]*"/g, "")
      .replace(/<[^>]+>/g, " ");
    expect(visibleText).not.toContain("claude-code-routine");
    expect(visibleText).not.toContain("runnerKind");
    expect(visibleText).not.toContain("attemptIndex");
  });
});

describe("StatusCardBlockComponent — generic fallback", () => {
  it("renders the generic template when metadata is absent", () => {
    const html = renderHtml(genericCard());
    expect(html).toContain("Process running");
    expect(html).toContain("process_run");
    expect(html).toContain("steps");
    expect(html).toContain("3/5");
  });

  it("falls through to generic when metadata.cardKind is unknown", () => {
    const html = renderHtml(unknownSubtypeCard());
    expect(html).toContain("Process running");
    expect(html).toContain("process_run");
  });
});

describe("StatusCardBlockComponent — discriminator-keyed dispatch (AC #1 source check)", () => {
  it("uses a Record<string, RendererFn> dispatch table, not cascading-if", () => {
    const sourcePath = join(__dirname, "status-card-block.tsx");
    const src = readFileSync(sourcePath, "utf-8");
    // The dispatch table must be present.
    expect(src).toMatch(
      /SUBTYPE_RENDERERS\s*:\s*Record<string,\s*RendererFn>/,
    );
    // No cascading `else if (metadata?.X)` chains outside the table — the
    // brief allows ONE explicit `if` (the discriminator lookup) but not a
    // chain of subtype-specific if-checks. We strip comments/strings then
    // count occurrences of `metadata?.<word>` access in conditional position.
    const stripped = src
      // strip block comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // strip line comments
      .replace(/\/\/[^\n]*/g, "");
    const conditionalMetaAccesses =
      stripped.match(/\bif\s*\(\s*metadata\??\./g)?.length ?? 0;
    expect(conditionalMetaAccesses).toBeLessThanOrEqual(1);
  });
});
