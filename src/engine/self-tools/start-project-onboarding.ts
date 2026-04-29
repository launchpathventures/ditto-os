/**
 * Ditto — Self Tool: Start Project Onboarding (Brief 225)
 *
 * Triggered when the user wants to connect a GitHub repo to Ditto. The Self
 * picks this tool whenever a message contains a GitHub URL pattern + a
 * connection verb ("connect", "onboard", "add"), or the user pastes a bare
 * GitHub URL on a line by itself, or the user lands on the conversation
 * via the sidebar "+ Connect a project" CTA (which seeds the conversation
 * with "Connect a new project").
 *
 * The tool emits a `ConnectionSetupBlock` with `serviceName: 'github-project'`
 * (existing block type — no schema change). The renderer extension at
 * `packages/web/components/blocks/connection-setup-block.tsx` branches on
 * the serviceName to show the URL-paste form per Designer spec §Stage 0.
 *
 * The intent-recognition pattern is encoded IN this tool's description —
 * Self uses tool descriptions as the few-shot examples for tool selection
 * (no separate intent-recognition file).
 *
 * Gating: this tool is only registered when `DITTO_PROJECT_ONBOARDING_READY`
 * is set to `true`. The Self can't pick a tool that isn't registered, so
 * the entry path is hidden in production until the analyser ships.
 *
 * Provenance: Brief 225 §What Changes; existing Self tool patterns at
 *   `src/engine/self-tools/connect-service.ts` + `quick-capture.ts`;
 *   ContentBlock pattern at `packages/core/src/content-blocks.ts:234-241`.
 */

import type { DelegationResult } from "../self-delegation";
import type { ContentBlock, InteractiveField } from "../content-blocks";

export interface StartProjectOnboardingInput {
  /**
   * GitHub repo URL the user wants to connect, in any of these shapes:
   *   - `https://github.com/owner/repo`
   *   - `github.com/owner/repo`
   *   - `owner/repo`
   * The renderer + the URL probe accept the URL verbatim; normalisation
   * happens server-side when the form is submitted.
   *
   * May be empty when the user kicks off the flow without a URL pasted
   * yet (e.g., from the sidebar CTA).
   */
  repoUrl?: string;
}

export const START_PROJECT_ONBOARDING_TOOL_NAME = "start_project_onboarding";

/**
 * Whether the tool is enabled in this environment. Sub-brief #1 ships the
 * plumbing; sub-brief #2 ships the analyser logic that makes the surface
 * useful — until then production keeps the env var unset and the tool
 * absent from Self's registry.
 */
export function isStartProjectOnboardingEnabled(): boolean {
  return process.env.DITTO_PROJECT_ONBOARDING_READY === "true";
}

/**
 * Build the `ConnectionSetupBlock` for the Connect form. Pure — no DB,
 * no I/O. Exported for tests.
 */
export function buildConnectionSetupBlock(repoUrl: string): ContentBlock {
  const fields: InteractiveField[] = [
    {
      name: "repoUrl",
      label: "Repo URL",
      type: "text",
      value: repoUrl,
      required: true,
      placeholder: "https://github.com/owner/repo",
    },
    {
      name: "displayName",
      label: "Display name",
      type: "text",
      required: false,
      placeholder: "Auto-filled from repo",
    },
    {
      name: "slug",
      label: "Slug",
      type: "text",
      required: false,
      placeholder: "Auto-filled from repo",
    },
  ];
  return {
    type: "connection_setup",
    serviceName: "github-project",
    serviceDisplayName: "GitHub Repository",
    connectionStatus: "disconnected",
    fields,
  };
}

export async function handleStartProjectOnboarding(
  input: StartProjectOnboardingInput,
): Promise<DelegationResult> {
  if (!isStartProjectOnboardingEnabled()) {
    return {
      toolName: START_PROJECT_ONBOARDING_TOOL_NAME,
      success: false,
      output:
        "Project onboarding is not yet available in this environment. " +
        "Set DITTO_PROJECT_ONBOARDING_READY=true to enable.",
    };
  }
  const block = buildConnectionSetupBlock(input.repoUrl ?? "");
  return {
    toolName: START_PROJECT_ONBOARDING_TOOL_NAME,
    success: true,
    output: input.repoUrl
      ? `Pre-filled the Connect form with ${input.repoUrl}. Click [Verify access] when ready.`
      : "Paste a GitHub repo URL into the form and click [Verify access].",
    metadata: {
      contentBlocks: [block],
    },
  };
}
