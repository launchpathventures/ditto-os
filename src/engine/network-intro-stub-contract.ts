export type IntroRequestStub = {
  recipientHandle: string;
  jobRequestId: string;
  suggestedCandidateRationale: string;
  requesterContext:
    | { kind: "workspace-user"; userId: string }
    | { kind: "visitor"; fingerprint: string };
};
