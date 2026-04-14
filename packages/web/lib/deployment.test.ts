import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getDeploymentMode,
  isPublicDeployment,
  isWorkspaceDeployment,
} from "./deployment";

describe("deployment mode", () => {
  beforeEach(() => {
    vi.stubEnv("DITTO_DEPLOYMENT", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to workspace when env is unset", () => {
    expect(getDeploymentMode()).toBe("workspace");
    expect(isWorkspaceDeployment()).toBe(true);
    expect(isPublicDeployment()).toBe(false);
  });

  it("returns public when DITTO_DEPLOYMENT=public", () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "public");
    expect(getDeploymentMode()).toBe("public");
    expect(isPublicDeployment()).toBe(true);
    expect(isWorkspaceDeployment()).toBe(false);
  });

  it("returns workspace when DITTO_DEPLOYMENT=workspace", () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "workspace");
    expect(getDeploymentMode()).toBe("workspace");
  });

  it("is case-insensitive and trims whitespace", () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "  PUBLIC ");
    expect(getDeploymentMode()).toBe("public");
  });

  it("falls back to workspace for unknown values (safe default)", () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "marketing");
    expect(getDeploymentMode()).toBe("workspace");
  });

  it("falls back to workspace for empty string", () => {
    vi.stubEnv("DITTO_DEPLOYMENT", "");
    expect(getDeploymentMode()).toBe("workspace");
  });
});
