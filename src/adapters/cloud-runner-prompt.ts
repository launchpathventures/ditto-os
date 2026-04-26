/**
 * Cloud Runner Prompt Composer — Brief 216 §D2 + Brief 217 §D4 (kind-agnostic).
 *
 * Pure function. Composes the prompt body sent to a cloud runner (currently
 * `claude-code-routine` and `claude-managed-agent`). Sections:
 *  - The work-item body (always).
 *  - A `/dev-review` directive (always; for native projects the skill text is inlined).
 *  - Optionally an INTERNAL callback section (when an `ephemeralToken` is supplied).
 *    Brief 217 §D3 — managed-agent is polling-primary by default; the INTERNAL
 *    section is only emitted when the caller sets `callback_mode='in-prompt'`.
 *
 * Brief 217 §D14 — kind-agnostic. The `runnerKind` parameter is the only
 * kind-specific bit (it appears in the INTERNAL section's body shape so the
 * receiving session sends the correct kind label back).
 *
 * Skill loading (Brief 216 §D7 / Brief 217 §D5):
 *  - `harnessType='catalyst'` — repo carries `.catalyst/skills/dev-review/SKILL.md`;
 *    Claude Code's slash-command mechanism reads it from the cloned working tree.
 *    The prompt does NOT inline the skill text.
 *  - `harnessType='native'` (or `'none'`) — Ditto inlines the skill text from
 *    its own deployed binary at runtime, capped at 4 KB. If the file is missing,
 *    `composePrompt()` returns a structured error result and the dispatcher
 *    rejects the dispatch before HTTP fire.
 *
 * Brief drift flagged for Architect (Insight-043, carried from Brief 216): the
 * brief's literal prompt body uses runner-state values for the `state` field,
 * but the route schema (`workItemStatusUpdateSchema` in @ditto/core) accepts
 * only brief states. This composer instructs the runner session to send brief
 * states (`review`/`blocked`/`archived`) mapped from outcome, preserving
 * Brief 223's existing schema.
 */

import fs from "fs";
import path from "path";
import type { RunnerKind } from "@ditto/core";

/**
 * Default location of the canonical `dev-review` SKILL.md inside Ditto's
 * deployed binary. Resolved relative to the repo / deployed root, NOT the
 * cloned project's tree.
 */
const DEFAULT_SKILL_PATH = ".catalyst/skills/dev-review/SKILL.md";

/** Cap at 4 KB per Brief 216 §D7 safety margin. */
export const DEV_REVIEW_INLINE_CAP_BYTES = 4 * 1024;

const TRUNCATE_MARKER = "\n\n[ditto: dev-review skill truncated at 4 KB]";

export interface ComposePromptInput {
  /** Work item body — the prompt's first section. */
  workItemBody: string;
  /** Catalyst projects rely on the cloned repo; native/none projects inline. */
  harnessType: "catalyst" | "native" | "none";
  /**
   * Identifies the runner kind that will execute the dispatch. Used in the
   * INTERNAL callback section's `runnerKind` field so the receiving session
   * sends the correct kind back to Ditto's status webhook. Defaults to
   * `claude-code-routine` for Brief 216 backwards-compat.
   */
  runnerKind?: RunnerKind;
  /**
   * Resolved status webhook URL for the in-prompt callback. Required when
   * `ephemeralToken` is supplied; ignored otherwise.
   */
  statusWebhookUrl?: string;
  /**
   * Plaintext ephemeral callback token (per-dispatch). When omitted, the
   * INTERNAL callback section is NOT emitted — the runner has no way to post
   * back and lifecycle is observed via the polling cron + GitHub fallback
   * events alone (Brief 217 polling-primary default).
   */
  ephemeralToken?: string;
  /** Audit identifier for the originating step run. Required iff ephemeralToken set. */
  stepRunId?: string;
  /**
   * Optional override for the dev-review skill path. Defaults to
   * `<dittoRoot>/.catalyst/skills/dev-review/SKILL.md`. Configurable via
   * `DITTO_DEV_REVIEW_SKILL_PATH` env var by the engine boot.
   */
  dittoSkillsPath?: string;
}

export type ComposePromptResult =
  | { ok: true; prompt: string; skillTruncated: boolean }
  | { ok: false; error: string; reason: "dev-review-skill-missing-from-deployment" };

/**
 * Compose the routine prompt. Returns `ok: false` only when a native-harness
 * dispatch can't load the inline skill — the caller MUST reject the dispatch
 * with `errorReason = "dev-review-skill-missing-from-deployment"` per Brief
 * 216 §D7.
 */
export function composePrompt(input: ComposePromptInput): ComposePromptResult {
  const sections: string[] = [input.workItemBody.trim(), "---"];
  let skillTruncated = false;

  if (input.harnessType === "catalyst") {
    sections.push(
      "When implementation is complete, run /dev-review and post its output as a PR comment.",
    );
  } else {
    const skillRead = readDevReviewSkill(input.dittoSkillsPath);
    if (!skillRead.ok) {
      return {
        ok: false,
        error: skillRead.error ?? "dev-review skill unreadable",
        reason: "dev-review-skill-missing-from-deployment",
      };
    }
    skillTruncated = skillRead.truncated ?? false;
    sections.push(
      "When implementation is complete, run /dev-review and post its output as a PR comment. The /dev-review skill follows below — read it and follow its discipline.",
      "",
      "<dev-review-skill>",
      skillRead.text!,
      "</dev-review-skill>",
    );
    sections.push("---");
  }

  if (input.ephemeralToken) {
    if (!input.statusWebhookUrl || !input.stepRunId) {
      return {
        ok: false,
        error:
          "ephemeralToken supplied without statusWebhookUrl + stepRunId — composePrompt cannot build the INTERNAL callback section.",
        reason: "dev-review-skill-missing-from-deployment",
      };
    }
    sections.push(
      buildInternalCallbackSection({
        statusWebhookUrl: input.statusWebhookUrl,
        ephemeralToken: input.ephemeralToken,
        stepRunId: input.stepRunId,
        runnerKind: input.runnerKind ?? "claude-code-routine",
      }),
    );
  }

  return {
    ok: true,
    prompt: sections.join("\n\n"),
    skillTruncated,
  };
}

interface InternalCallbackInput {
  statusWebhookUrl: string;
  ephemeralToken: string;
  stepRunId: string;
  runnerKind: RunnerKind;
}

function buildInternalCallbackSection(input: InternalCallbackInput): string {
  return [
    "---",
    "",
    "INTERNAL DIRECTIVE — DO NOT INCLUDE THIS SECTION IN YOUR FINAL OUTPUT, PR DESCRIPTION, OR COMMIT MESSAGES.",
    "",
    "When the session terminates (success or failure), post a status update to Ditto:",
    "",
    `  curl -X POST "${input.statusWebhookUrl}" \\`,
    `    -H "Authorization: Bearer ${input.ephemeralToken}" \\`,
    "    -H \"Content-Type: application/json\" \\",
    "    -d '{",
    "      \"state\": \"review\" | \"blocked\" | \"archived\",",
    `      "runnerKind": "${input.runnerKind}",`,
    "      \"externalRunId\": \"<your-session-id>\",",
    `      "stepRunId": "${input.stepRunId}",`,
    "      \"prUrl\": \"<pr-url-if-any>\",",
    "      \"error\": \"<error-message-if-failed>\"",
    "    }'",
    "",
    "State semantics:",
    "  - \"review\"   — implementation complete, PR opened, ready for human review",
    "  - \"blocked\"  — could not complete; describe why in `error`",
    "  - \"archived\" — session cancelled or no actionable work",
    "",
    "The token above is per-dispatch and forgotten by Ditto after this session terminates.",
  ].join("\n");
}

interface SkillRead {
  ok: boolean;
  text?: string;
  truncated?: boolean;
  error?: string;
}

function readDevReviewSkill(overridePath?: string): SkillRead {
  const skillPath = resolveSkillPath(overridePath);
  try {
    const raw = fs.readFileSync(skillPath, "utf8");
    if (Buffer.byteLength(raw, "utf8") <= DEV_REVIEW_INLINE_CAP_BYTES) {
      return { ok: true, text: raw, truncated: false };
    }
    const truncated = truncateUtf8(raw, DEV_REVIEW_INLINE_CAP_BYTES) + TRUNCATE_MARKER;
    // eslint-disable-next-line no-console
    console.warn(
      `[routine-prompt] dev-review skill exceeds ${DEV_REVIEW_INLINE_CAP_BYTES} bytes — truncating. Re-architect prompt to use progressive disclosure.`,
    );
    return { ok: true, text: truncated, truncated: true };
  } catch (e) {
    return {
      ok: false,
      error: `dev-review skill not readable at ${skillPath}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function resolveSkillPath(overridePath?: string): string {
  if (overridePath) return overridePath;
  const envPath = process.env.DITTO_DEV_REVIEW_SKILL_PATH;
  if (envPath) return envPath;
  // Resolve relative to repo root (cwd at boot).
  return path.resolve(process.cwd(), DEFAULT_SKILL_PATH);
}

function truncateUtf8(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.byteLength <= maxBytes) return s;
  // Walk back from maxBytes until we land on a valid UTF-8 boundary.
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end -= 1;
  return buf.slice(0, end).toString("utf8");
}
