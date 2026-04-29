/**
 * cloud-runner-prompt composer tests — Brief 216 AC #9 + Brief 217 §D14 (kind-agnostic).
 */

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  composePrompt,
  DEV_REVIEW_INLINE_CAP_BYTES,
} from "./cloud-runner-prompt";

const SAMPLE_INPUT = {
  workItemBody: "Add a /healthz endpoint.",
  statusWebhookUrl: "https://ditto.example/api/v1/work-items/wi_01/status",
  ephemeralToken: "tok_abc123",
  stepRunId: "sr_01abc",
};

describe("composePrompt — catalyst harness", () => {
  it("includes the work-item body and the /dev-review reference, no inlined skill", () => {
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "catalyst",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain(SAMPLE_INPUT.workItemBody);
    expect(r.prompt).toContain("run /dev-review");
    expect(r.prompt).not.toContain("<dev-review-skill>");
    expect(r.skillTruncated).toBe(false);
  });

  it("includes the callback section with token + webhook URL + stepRunId", () => {
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "catalyst",
    });
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain(SAMPLE_INPUT.statusWebhookUrl);
    expect(r.prompt).toContain(`Bearer ${SAMPLE_INPUT.ephemeralToken}`);
    expect(r.prompt).toContain(`"stepRunId": "${SAMPLE_INPUT.stepRunId}"`);
    expect(r.prompt).toContain("INTERNAL DIRECTIVE");
    expect(r.prompt).toContain('"runnerKind": "claude-code-routine"');
  });
});

describe("composePrompt — Brief 232 responseBody wire instruction (AC #11)", () => {
  it("INTERNAL callback stanza names responseBody as an optional field in the curl -d body", () => {
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "catalyst",
    });
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain("responseBody");
    expect(r.prompt).toMatch(/"responseBody":\s*\{/);
  });

  it("includes the OPTIONAL guidance preamble explaining when to populate responseBody", () => {
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "catalyst",
    });
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toMatch(/Include `responseBody`/i);
    expect(r.prompt).toMatch(/structured output/i);
    expect(r.prompt).toMatch(/Omit the field/i);
  });

  it("polling-only mode (no ephemeralToken) does NOT emit responseBody guidance", () => {
    // The INTERNAL callback section is only emitted when ephemeralToken is set.
    // responseBody guidance lives inside that section, so it must follow the
    // same gate.
    const r = composePrompt({
      workItemBody: "Add /healthz",
      harnessType: "catalyst",
      runnerKind: "claude-managed-agent",
    });
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).not.toContain("responseBody");
  });
});

describe("composePrompt — kind-agnostic INTERNAL section (Brief 217 §D14)", () => {
  it("emits runner_kind literal matching the runnerKind input (managed-agent)", () => {
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "catalyst",
      runnerKind: "claude-managed-agent",
    });
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain('"runnerKind": "claude-managed-agent"');
    expect(r.prompt).not.toContain('"runnerKind": "claude-code-routine"');
  });

  it("defaults runnerKind to claude-code-routine for Brief 216 backwards-compat", () => {
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "catalyst",
    });
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain('"runnerKind": "claude-code-routine"');
  });
});

describe("composePrompt — polling-only mode (Brief 217 §D3)", () => {
  it("does NOT emit INTERNAL callback section when ephemeralToken is omitted", () => {
    const r = composePrompt({
      workItemBody: "Add /healthz",
      harnessType: "catalyst",
      runnerKind: "claude-managed-agent",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain("Add /healthz");
    expect(r.prompt).toContain("/dev-review");
    expect(r.prompt).not.toContain("INTERNAL DIRECTIVE");
    expect(r.prompt).not.toContain("Bearer");
  });

  it("rejects ephemeralToken without statusWebhookUrl + stepRunId (defensive)", () => {
    const r = composePrompt({
      workItemBody: "Add /healthz",
      harnessType: "catalyst",
      ephemeralToken: "tok_x",
    });
    expect(r.ok).toBe(false);
  });
});

describe("composePrompt — native harness", () => {
  let tmpDir: string;
  let skillFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "routine-prompt-test-"));
    skillFile = path.join(tmpDir, "SKILL.md");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inlines the skill text below 4 KB cap", () => {
    fs.writeFileSync(skillFile, "# dev-review\nSmall skill body.");
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "native",
      dittoSkillsPath: skillFile,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain("<dev-review-skill>");
    expect(r.prompt).toContain("Small skill body");
    expect(r.prompt).toContain("</dev-review-skill>");
    expect(r.skillTruncated).toBe(false);
  });

  it("truncates skill text above 4 KB and surfaces a marker", () => {
    const big = "x".repeat(DEV_REVIEW_INLINE_CAP_BYTES + 100);
    fs.writeFileSync(skillFile, big);
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "native",
      dittoSkillsPath: skillFile,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain("[ditto: dev-review skill truncated at 4 KB]");
    expect(r.skillTruncated).toBe(true);
  });

  it("returns ok:false with skill-missing reason when file does not exist", () => {
    const missingPath = path.join(tmpDir, "definitely-missing.md");
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "native",
      dittoSkillsPath: missingPath,
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("dev-review-skill-missing-from-deployment");
  });

  it("treats `none` harness like native (also inlines)", () => {
    fs.writeFileSync(skillFile, "# dev-review\nSmall skill.");
    const r = composePrompt({
      ...SAMPLE_INPUT,
      harnessType: "none",
      dittoSkillsPath: skillFile,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.prompt).toContain("<dev-review-skill>");
  });
});
