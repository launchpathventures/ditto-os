/**
 * @ditto/core — Trust Module
 */

export { SPOT_CHECK_RATE } from "./constants.js";
export {
  computeStructuredDiff,
  computeEditRatio,
  classifyEditSeverity,
  classifyEdit,
  type DiffStats,
  type StructuredDiff,
} from "./trust-diff.js";
