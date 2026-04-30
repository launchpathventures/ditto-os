/**
 * Project Onboarding system-agent registration barrel.
 *
 * Re-exports the analyser handlers so `src/engine/system-agents/index.ts`
 * can register them under stable names. Brief 225 (placeholders) and
 * Brief 226 (real analyser logic) both register through this barrel —
 * the function names stay stable while the bodies flipped from no-op to
 * read-only repo analyser at Brief 226.
 *
 * Provenance: Brief 225 §What Changes; Brief 226 §What Changes.
 */

export {
  // Step 1
  executeOnboardingCloneAndScan,
  runCloneAndScan,
  // Steps 2-5 — detectors
  executeOnboardingDetectBuildSystem,
  runDetectBuildSystem,
  executeOnboardingDetectTestFramework,
  runDetectTestFramework,
  executeOnboardingDetectCI,
  runDetectCI,
  executeOnboardingDetectHarness,
  runDetectHarness,
  // Steps 6-8 — scoring + recommendation
  executeOnboardingScorePersonaFit,
  runScorePersonaFit,
  executeOnboardingMatchGoldStandard,
  runMatchGoldStandard,
  executeOnboardingRecommendRunnerTier,
  runRecommendRunnerTier,
  // Step 9
  executeOnboardingSurfaceReport,
  runSurfaceReport,
  STEP_IDS,
  type OnboardingHandlerContext,
} from "./handlers";

// Brief 228 — retrofitter handlers (sub-brief #3a)
export {
  executeRetrofitGeneratePlan,
  runGeneratePlan,
  executeRetrofitSurfacePlan,
  runSurfacePlan,
  executeRetrofitDispatchWrite,
  runDispatchWrite,
  executeRetrofitVerifyCommit,
  runVerifyCommit,
  RETROFIT_STEP_IDS,
  composeRetrofitPlan,
  computeDispatchOutcome,
  DITTO_SCHEMA_VERSION,
} from "./retrofitter";
