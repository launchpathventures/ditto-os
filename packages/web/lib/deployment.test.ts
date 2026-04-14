import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getDeploymentMode,
  isPublicDeployment,
  isWorkspaceDeployment,
} from "./deployment";

describe("deployment mode", () => {
  const original = process.env.DITTO_DEPLOYMENT;

  beforeEach(() => {
    delete process.env.DITTO_DEPLOYMENT;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DITTO_DEPLOYMENT;
    } else {
      process.env.DITTO_DEPLOYMENT = original;
    }
  });

  it("defaults to workspace when env is unset", () => {
    expect(getDeploymentMode()).toBe("workspace");
    expect(isWorkspaceDeployment()).toBe(true);
    expect(isPublicDeployment()).toBe(false);
  });

  it("returns public when DITTO_DEPLOYMENT=public", () => {
    process.env.DITTO_DEPLOYMENT = "public";
    expect(getDeploymentMode()).toBe("public");
    expect(isPublicDeployment()).toBe(true);
    expect(isWorkspaceDeployment()).toBe(false);
  });

  it("returns workspace when DITTO_DEPLOYMENT=workspace", () => {
    process.env.DITTO_DEPLOYMENT = "workspace";
    expect(getDeploymentMode()).toBe("workspace");
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.DITTO_DEPLOYMENT = "  PUBLIC ";
    expect(getDeploymentMode()).toBe("public");
  });

  it("falls back to workspace for unknown values (safe default)", () => {
    process.env.DITTO_DEPLOYMENT = "marketing";
    expect(getDeploymentMode()).toBe("workspace");
  });

  it("falls back to workspace for empty string", () => {
    process.env.DITTO_DEPLOYMENT = "";
    expect(getDeploymentMode()).toBe("workspace");
  });
});
