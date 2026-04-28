/**
 * Tests for mintRunnerDispatchPause — Brief 221 AC #2.
 *
 * Verifies:
 *  1. Ditto-flavoured invocation returns the expected ContentBlock[]:
 *     TextBlock + WorkItemFormBlock (kind selector + force-cloud toggle)
 *     + ActionBlock (Approve + Reject).
 *  2. Different formId / actionNamespace / copy produces a payload with
 *     those values — the helper hardcodes nothing Ditto-specific.
 *  3. The helper's imports do not reference any `src/engine/`, `src/db/`,
 *     or Ditto-specific symbol — verified by reading the source file and
 *     grepping for forbidden import patterns.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mintRunnerDispatchPause,
  parseKindOption,
  type MintRunnerDispatchPauseInput,
} from "./mint-pause-payload.js";
import type {
  ActionBlock,
  TextBlock,
  WorkItemFormBlock,
} from "../content-blocks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function dittoInvocation(): MintRunnerDispatchPauseInput {
  return {
    workItem: {
      id: "wi-1",
      title: "Add /healthz endpoint",
      summary: "Add a /healthz endpoint to agent-crm app router.",
    },
    project: { id: "p-1", slug: "agent-crm", name: "Agent CRM" },
    eligibleRunners: [
      { kind: "claude-code-routine", mode: "cloud", label: "Routine" },
      { kind: "claude-managed-agent", mode: "cloud", label: "Managed Agent" },
      {
        kind: "local-mac-mini",
        mode: "local",
        label: "Mac mini",
        degradedReason: "offline",
      },
    ],
    modeRequired: null,
    formId: "runner-dispatch-approval",
    actionNamespace: "runner-dispatch-approval",
    copy: {
      header: "Approve dispatch",
      runnerLabel: "This work will run on:",
      forceCloudLabel: "Force cloud for this approval",
      approveLabel: "Approve & dispatch",
      rejectLabel: "Reject",
    },
  };
}

describe("mintRunnerDispatchPause — Ditto-flavoured invocation", () => {
  it("returns three blocks in order: TextBlock, WorkItemFormBlock, ActionBlock", () => {
    const blocks = mintRunnerDispatchPause(dittoInvocation());
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe("text");
    expect(blocks[1].type).toBe("work_item_form");
    expect(blocks[2].type).toBe("actions");
  });

  it("summary TextBlock contains work-item title and project name", () => {
    const blocks = mintRunnerDispatchPause(dittoInvocation());
    const summary = blocks[0] as TextBlock;
    expect(summary.text).toContain("Add /healthz endpoint");
    expect(summary.text).toContain("Agent CRM");
    expect(summary.text).toContain("Approve dispatch");
  });

  it("form has the injected formId", () => {
    const blocks = mintRunnerDispatchPause(dittoInvocation());
    const form = blocks[1] as WorkItemFormBlock;
    expect(form.formId).toBe("runner-dispatch-approval");
  });

  it("form has selectedKind select with eligible-only options", () => {
    const blocks = mintRunnerDispatchPause(dittoInvocation());
    const form = blocks[1] as WorkItemFormBlock;
    const selectField = form.fields.find((f) => f.name === "selectedKind");
    expect(selectField).toBeDefined();
    expect(selectField!.type).toBe("select");
    expect(selectField!.required).toBe(true);
    expect(selectField!.options).toHaveLength(3);
    // Each option encodes the kind|label format from formatKindOption.
    expect(selectField!.options).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^claude-code-routine\|/),
        expect.stringMatching(/^claude-managed-agent\|/),
        expect.stringMatching(/^local-mac-mini\|.*offline/),
      ]),
    );
    // Default to chain head.
    expect(selectField!.value).toBe("claude-code-routine");
  });

  it("form has forceCloud toggle defaulting to false (no modeRequired set)", () => {
    const blocks = mintRunnerDispatchPause(dittoInvocation());
    const form = blocks[1] as WorkItemFormBlock;
    const toggleField = form.fields.find((f) => f.name === "forceCloud");
    expect(toggleField).toBeDefined();
    expect(toggleField!.type).toBe("toggle");
    expect(toggleField!.value).toBe(false);
  });

  it("forceCloud toggle pre-set to true when modeRequired = cloud", () => {
    const input = dittoInvocation();
    input.modeRequired = "cloud";
    const blocks = mintRunnerDispatchPause(input);
    const form = blocks[1] as WorkItemFormBlock;
    const toggleField = form.fields.find((f) => f.name === "forceCloud");
    expect(toggleField!.value).toBe(true);
  });

  it("ActionBlock has Approve + Reject with the namespaced action IDs", () => {
    const blocks = mintRunnerDispatchPause(dittoInvocation());
    const actions = blocks[2] as ActionBlock;
    expect(actions.actions).toHaveLength(2);
    const approve = actions.actions.find(
      (a) => a.id === "runner-dispatch-approval:approve",
    );
    const reject = actions.actions.find(
      (a) => a.id === "runner-dispatch-approval:reject",
    );
    expect(approve).toBeDefined();
    expect(approve!.label).toBe("Approve & dispatch");
    expect(approve!.style).toBe("primary");
    expect(reject).toBeDefined();
    expect(reject!.label).toBe("Reject");
    expect(reject!.style).toBe("danger");
  });
});

describe("mintRunnerDispatchPause — generic / parameterised", () => {
  it("uses the injected formId (not hardcoded)", () => {
    const input = dittoInvocation();
    input.formId = "processos-runner-pause";
    const blocks = mintRunnerDispatchPause(input);
    const form = blocks[1] as WorkItemFormBlock;
    expect(form.formId).toBe("processos-runner-pause");
  });

  it("uses the injected actionNamespace for action IDs (not hardcoded)", () => {
    const input = dittoInvocation();
    input.actionNamespace = "processos-runner-pause";
    const blocks = mintRunnerDispatchPause(input);
    const actions = blocks[2] as ActionBlock;
    expect(
      actions.actions.find((a) => a.id === "processos-runner-pause:approve"),
    ).toBeDefined();
    expect(
      actions.actions.find((a) => a.id === "processos-runner-pause:reject"),
    ).toBeDefined();
    // No Ditto strings.
    expect(
      actions.actions.find((a) => a.id.includes("runner-dispatch-approval")),
    ).toBeUndefined();
  });

  it("uses injected copy strings (not hardcoded English)", () => {
    const input = dittoInvocation();
    input.copy = {
      header: "Aprobar despacho",
      runnerLabel: "Este trabajo se ejecutará en:",
      forceCloudLabel: "Forzar nube",
      approveLabel: "Aprobar",
      rejectLabel: "Rechazar",
    };
    const blocks = mintRunnerDispatchPause(input);
    const summary = blocks[0] as TextBlock;
    expect(summary.text).toContain("Aprobar despacho");
    const form = blocks[1] as WorkItemFormBlock;
    expect(form.fields.find((f) => f.name === "selectedKind")!.label).toBe(
      "Este trabajo se ejecutará en:",
    );
    expect(form.fields.find((f) => f.name === "forceCloud")!.label).toBe(
      "Forzar nube",
    );
    const actions = blocks[2] as ActionBlock;
    expect(actions.actions[0].label).toBe("Aprobar");
    expect(actions.actions[1].label).toBe("Rechazar");
  });
});

describe("mintRunnerDispatchPause — engine-core boundary discipline", () => {
  it("source file imports nothing Ditto-specific", () => {
    const sourcePath = join(__dirname, "mint-pause-payload.ts");
    const source = readFileSync(sourcePath, "utf-8");
    const importLines = source
      .split("\n")
      .filter((l) => /^\s*(import|export)\s.*from\s/.test(l));
    // Forbidden: any import that references src/engine, src/db, src/adapters,
    // or any Ditto-specific concept. Allowed: relative imports within
    // packages/core (./* paths) and node: stdlib.
    const forbiddenPatterns = [
      /from\s+["']src\//,
      /from\s+["'].*src\/engine/,
      /from\s+["'].*src\/db/,
      /from\s+["'].*src\/adapters/,
      /from\s+["'].*\.\.\/\.\.\/src/,
      /from\s+["']@ditto\/(?!core)/,
      /Self|persona|network|workspace|Telegram/i,
    ];
    for (const line of importLines) {
      for (const pat of forbiddenPatterns) {
        expect(line, `forbidden import in: ${line.trim()}`).not.toMatch(pat);
      }
    }
  });
});

describe("parseKindOption — symmetric with formatKindOption", () => {
  it("recovers kind from the canonical kind|label format", () => {
    const out = parseKindOption("claude-code-routine|Routine · Cloud");
    expect(out.kind).toBe("claude-code-routine");
    expect(out.label).toBe("Routine · Cloud");
  });

  it("returns the input as kind when no separator is present (defensive)", () => {
    const out = parseKindOption("legacy-string");
    expect(out.kind).toBe("legacy-string");
    expect(out.label).toBe("legacy-string");
  });
});
