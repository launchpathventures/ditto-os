/**
 * routine-prompt composer tests — Brief 216 AC #9.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  composePrompt,
  DEV_REVIEW_INLINE_CAP_BYTES,
} from "./routine-prompt";

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
