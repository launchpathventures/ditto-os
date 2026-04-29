/**
 * @ditto/core/work-items — public exports (Brief 223 + Brief 220).
 */

export * from "./brief-types.js";
export {
  briefStateSchema,
  workItemTypeSchema,
  runnerKindSchema,
  workItemBriefInputSchema,
  workItemStatusUpdateSchema,
  type WorkItemBriefInputParsed,
  type WorkItemStatusUpdateParsed,
} from "./brief-validation.js";
// Brief 220 — brief-state state machine (deploy gate).
export {
  BRIEF_STATE_TRANSITIONS,
  transitionBriefState,
  type BriefStateTransitionOk,
  type BriefStateTransitionError,
  type BriefStateTransitionResult,
} from "./state-machine.js";
