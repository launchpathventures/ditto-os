/**
 * Brief 225 — `start_project_onboarding` Self tool tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildConnectionSetupBlock,
  handleStartProjectOnboarding,
  isStartProjectOnboardingEnabled,
  START_PROJECT_ONBOARDING_TOOL_NAME,
} from "./start-project-onboarding";

const ORIGINAL_ENV = process.env.DITTO_PROJECT_ONBOARDING_READY;

beforeEach(() => {
  delete process.env.DITTO_PROJECT_ONBOARDING_READY;
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) {
    delete process.env.DITTO_PROJECT_ONBOARDING_READY;
  } else {
    process.env.DITTO_PROJECT_ONBOARDING_READY = ORIGINAL_ENV;
  }
});

describe("isStartProjectOnboardingEnabled", () => {
  it("returns false when env var unset", () => {
    expect(isStartProjectOnboardingEnabled()).toBe(false);
  });
  it("returns false when env var is 'false'", () => {
    process.env.DITTO_PROJECT_ONBOARDING_READY = "false";
    expect(isStartProjectOnboardingEnabled()).toBe(false);
  });
  it("returns true when env var is 'true'", () => {
    process.env.DITTO_PROJECT_ONBOARDING_READY = "true";
    expect(isStartProjectOnboardingEnabled()).toBe(true);
  });
});

describe("buildConnectionSetupBlock", () => {
  it("emits a ConnectionSetupBlock with serviceName 'github-project'", () => {
    const block = buildConnectionSetupBlock(
      "https://github.com/facebook/react",
    );
    expect(block.type).toBe("connection_setup");
    if (block.type !== "connection_setup") return;
    expect(block.serviceName).toBe("github-project");
    expect(block.serviceDisplayName).toBe("GitHub Repository");
    expect(block.connectionStatus).toBe("disconnected");
    expect(block.fields).toHaveLength(3);
    expect(block.fields?.[0].name).toBe("repoUrl");
    expect(block.fields?.[0].value).toBe("https://github.com/facebook/react");
    expect(block.fields?.[1].name).toBe("displayName");
    expect(block.fields?.[2].name).toBe("slug");
  });

  it("accepts an empty URL (sidebar CTA flow)", () => {
    const block = buildConnectionSetupBlock("");
    if (block.type !== "connection_setup") return;
    expect(block.fields?.[0].value).toBe("");
  });
});

describe("handleStartProjectOnboarding", () => {
  it("returns a failure DelegationResult when env var is unset", async () => {
    const result = await handleStartProjectOnboarding({ repoUrl: "owner/repo" });
    expect(result.success).toBe(false);
    expect(result.toolName).toBe(START_PROJECT_ONBOARDING_TOOL_NAME);
    expect(result.metadata?.contentBlocks).toBeUndefined();
  });

  it("emits a content block when env var is set", async () => {
    process.env.DITTO_PROJECT_ONBOARDING_READY = "true";
    const result = await handleStartProjectOnboarding({
      repoUrl: "facebook/react",
    });
    expect(result.success).toBe(true);
    const blocks = (result.metadata?.contentBlocks ?? []) as Array<{
      type: string;
    }>;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("connection_setup");
  });
});
