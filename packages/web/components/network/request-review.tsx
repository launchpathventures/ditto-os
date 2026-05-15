import type { JobRequestCardBlock } from "@/lib/engine";

export type ActiveRequestMode = "manual-search" | "background-watch" | "both";
export type ActiveRequestSources = "ditto-members" | "public-web" | "both";
export type ActiveRequestContactPolicy =
  | "ask-before-contact"
  | "ask-before-intro"
  | "never-contact-without-approval";

export interface ActiveRequestDraft {
  rawNeed: string;
  outcomeNeeded: string;
  idealPerson: string;
  proofRequired: string;
  badFit: string;
  urgency: string;
  geography: string;
  commercialShape: string;
  successOutcome: string;
  outcomeValueHint: string | null;
  budgetPrivate: string;
  budgetShareableLabel: string;
  shareableSummary: string;
  privateNotes: string;
  sourcesAllowed: ActiveRequestSources;
  contactPolicy: ActiveRequestContactPolicy;
  mode: ActiveRequestMode;
  missingFields: string[];
  quickAnswerField: string | null;
  quickAnswers: string[];
  jobRequestCard?: JobRequestCardBlock;
}

export async function saveActiveRequest({
  draft,
  visitorSessionId,
  publish,
  fetchImpl = fetch,
}: {
  draft: ActiveRequestDraft;
  visitorSessionId: string;
  publish: boolean;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl("/api/v1/network/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: "save",
      rawNeed: draft.rawNeed,
      visitorSessionId,
      publish,
      draft,
    }),
  });
  const payload = (await response.json()) as {
    request?: { id: string; status: string };
    error?: string;
  };
  if (!response.ok || !payload.request) {
    throw new Error(payload.error || `Request save failed: ${response.status}`);
  }
  return payload.request;
}
