import { requireNetworkStepRunId } from "./network-step-run";
import {
  draftNeedRequestWithLlm,
  type NeedRequestDraft,
  type NeedRequestIdentity,
} from "./need-request-calibration";
import type { createCompletion } from "./llm";

export const DRAFT_NEED_REQUEST_TOOL_NAME = "draft_need_request";

export interface DraftNeedRequestInput {
  rawNeed: string;
  requesterContext?: NeedRequestIdentity | null;
  stepRunId?: string | null;
  now?: Date;
  completion?: typeof createCompletion;
}

export async function draftNeedRequest(input: DraftNeedRequestInput): Promise<NeedRequestDraft> {
  requireNetworkStepRunId(input.stepRunId, DRAFT_NEED_REQUEST_TOOL_NAME);
  return draftNeedRequestWithLlm({
    rawNeed: input.rawNeed,
    requesterContext: input.requesterContext,
    now: input.now,
    completion: input.completion,
  });
}
