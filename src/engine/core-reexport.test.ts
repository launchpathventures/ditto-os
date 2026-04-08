/**
 * Verify that src/engine/ re-exports resolve to the same objects
 * as direct @ditto/core imports. This ensures no accidental divergence.
 */

import { describe, it, expect } from "vitest";

import {
  HarnessPipeline,
  harnessEvents,
  SPOT_CHECK_RATE,
  routingHandler,
  parseHarnessConfig,
  getCognitiveCore,
  renderBlockToText,
  classifyEditSeverity,
  computeStructuredDiff,
  createHarnessContext,
  trustGateHandler,
  stepExecutionHandler,
} from "@ditto/core";

import { HarnessPipeline as HP2, createHarnessContext as CHC2 } from "./harness";
import { harnessEvents as HE2 } from "./events";
import { SPOT_CHECK_RATE as SR2 } from "./trust-constants";
import { classifyEditSeverity as CES2, computeStructuredDiff as CSD2 } from "./trust-diff";
import { routingHandler as RH2 } from "./harness-handlers/routing";
import { parseHarnessConfig as PHC2 } from "./harness-handlers/harness-config";
import { getCognitiveCore as GCC2 } from "./cognitive-core";
import { renderBlockToText as RBT2 } from "./content-blocks";

describe("@ditto/core re-export identity", () => {
  it("HarnessPipeline is the same constructor", () => {
    expect(HarnessPipeline).toBe(HP2);
  });

  it("createHarnessContext is the same function", () => {
    expect(createHarnessContext).toBe(CHC2);
  });

  it("harnessEvents is the same singleton", () => {
    expect(harnessEvents).toBe(HE2);
  });

  it("SPOT_CHECK_RATE is the same value", () => {
    expect(SPOT_CHECK_RATE).toBe(SR2);
  });

  it("classifyEditSeverity is the same function", () => {
    expect(classifyEditSeverity).toBe(CES2);
  });

  it("computeStructuredDiff is the same function", () => {
    expect(computeStructuredDiff).toBe(CSD2);
  });

  it("routingHandler is the same object", () => {
    expect(routingHandler).toBe(RH2);
  });

  it("parseHarnessConfig is the same function", () => {
    expect(parseHarnessConfig).toBe(PHC2);
  });

  it("getCognitiveCore is the same function", () => {
    expect(getCognitiveCore).toBe(GCC2);
  });

  it("renderBlockToText is the same function", () => {
    expect(renderBlockToText).toBe(RBT2);
  });
});

describe("@ditto/core functional", () => {
  it("computeStructuredDiff works", () => {
    const diff = computeStructuredDiff("hello world", "hello changed world");
    expect(diff.stats.wordsAdded).toBeGreaterThan(0);
  });

  it("classifyEditSeverity returns correct tiers", () => {
    expect(classifyEditSeverity(0.05)).toBe("formatting");
    expect(classifyEditSeverity(0.2)).toBe("correction");
    expect(classifyEditSeverity(0.5)).toBe("revision");
    expect(classifyEditSeverity(0.8)).toBe("rewrite");
  });

  it("getCognitiveCore loads the framework", () => {
    expect(getCognitiveCore().length).toBeGreaterThan(100);
  });

  it("harness handlers have correct names", () => {
    expect(routingHandler.name).toBe("routing");
    expect(trustGateHandler.name).toBe("trust-gate");
    expect(stepExecutionHandler.name).toBe("step-execution");
  });
});
