/**
 * Brief 228 — Retrofit prompt template unit tests.
 *
 * Golden-string assertions on the rendered prompt; payload-by-reference
 * verified (file contents NOT in the prompt body).
 */

import { describe, it, expect } from "vitest";
import { composeRetrofitPrompt } from "./retrofit-prompt";
import type { RetrofitDispatchPayload } from "@ditto/core";

const SAMPLE_PAYLOAD: RetrofitDispatchPayload = {
  commitMessage: "chore(ditto): retrofit substrate v1 (run abc-123)",
  files: [
    {
      path: ".ditto/version.txt",
      content: "1\n",
      contentHash: "deadbeef",
      action: "create",
    },
    {
      path: ".ditto/guidance.md",
      content: "# Project guidance\n\nBuild: pnpm build\nTest: pnpm test\n",
      contentHash: "cafebabe",
      action: "create",
    },
  ],
  branch: "main",
  instructions: "Retrofit 2 files into .ditto/. Trust tier: autonomous.",
  processRunId: "abc-123",
};

describe("composeRetrofitPrompt", () => {
  it("returns a prompt + payloadKey", () => {
    const result = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(result.payloadKey).toBe("retrofitDispatch");
    expect(typeof result.prompt).toBe("string");
    expect(result.prompt.length).toBeGreaterThan(100);
  });

  it("references the payload BY KEY (not inline)", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    // Payload key is named in the prompt
    expect(prompt).toContain("retrofitDispatch");
    // The actual file content should NOT appear inline in the prompt
    // (token-budget discipline per Brief 228 §Constraints).
    expect(prompt).not.toContain("Build: pnpm build");
    expect(prompt).not.toContain("# Project guidance");
  });

  it("includes the project slug + schema version in the heading", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(prompt).toContain("my-project");
    expect(prompt).toContain("v1");
  });

  it("lists every file's path + action in the file summary", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(prompt).toContain(".ditto/version.txt");
    expect(prompt).toContain(".ditto/guidance.md");
    expect(prompt).toContain("create");
  });

  it("instructs the runner to commit + push + return structured response", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(prompt).toContain("commitMessage");
    expect(prompt).toContain("Push to");
    expect(prompt).toContain("commitSha");
    expect(prompt).toContain("actuallyChangedFiles");
  });

  it("forbids touching sibling directories", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(prompt).toContain(".git/");
    expect(prompt).toContain(".github/");
    expect(prompt).toContain(".claude/");
    expect(prompt).toContain(".catalyst/");
    expect(prompt).toContain("ADR-043");
  });

  it("forbids force push", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(prompt).toMatch(/git push --force/i);
    expect(prompt).toMatch(/DO NOT/);
  });

  it("includes the processRunId in the DO NOT EDIT header reference", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(prompt).toContain("abc-123");
    expect(prompt).toContain("DO NOT EDIT");
  });

  it("renders the no-files case explicitly", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: { ...SAMPLE_PAYLOAD, files: [] },
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(prompt).toContain("no files to write");
  });

  // Brief 232 — wire instruction for responseBody (AC #10)
  it("Brief 232 — instructs the runner to POST responseBody in the callback", () => {
    const { prompt } = composeRetrofitPrompt({
      payload: SAMPLE_PAYLOAD,
      projectSlug: "my-project",
      ditoSchemaVersion: 1,
    });
    expect(prompt).toContain("responseBody");
    // Wire location must be unambiguous: callback to status webhook.
    expect(prompt).toMatch(/callback/i);
    expect(prompt).toContain("/api/v1/work-items/");
    // The example body shape must wrap the structured fields under responseBody.
    expect(prompt).toMatch(/"responseBody"\s*:\s*\{/);
  });
});
