export const ADMIN_REVEAL_REASON_OPTIONS = [
  {
    value: "complaint-investigation",
    label: "Complaint investigation",
  },
  {
    value: "privacy-leakage-review",
    label: "Privacy leakage review",
  },
  {
    value: "source-policy-review",
    label: "Source policy review",
  },
  {
    value: "operator-safety-review",
    label: "Operator safety review",
  },
] as const;

export type AdminRevealReason =
  (typeof ADMIN_REVEAL_REASON_OPTIONS)[number]["value"];

export const ADMIN_DECISION_REASON_GROUPS = [
  {
    label: "Review",
    options: [
      { value: "operator-reviewed", label: "Operator reviewed" },
      { value: "high_risk_reviewed", label: "High-risk review complete" },
      { value: "source_policy_reviewed", label: "Source policy reviewed" },
    ],
  },
  {
    label: "Approve",
    options: [
      { value: "operator-approved", label: "Operator approved" },
      { value: "trusted_source_match", label: "Trusted source match" },
    ],
  },
  {
    label: "Suppress",
    options: [
      { value: "operator-suppressed", label: "Operator suppressed" },
      { value: "source_policy_block", label: "Source policy block" },
      { value: "suppression_match", label: "Suppression match" },
      { value: "complaint_risk", label: "Complaint risk" },
      { value: "privacy_risk", label: "Privacy risk" },
    ],
  },
] as const;

export type AdminDecisionReason =
  (typeof ADMIN_DECISION_REASON_GROUPS)[number]["options"][number]["value"];

export const ADMIN_PAUSE_REASON_OPTIONS = [
  { value: "operator-pause", label: "Operator pause" },
  { value: "private-leakage-review", label: "Private leakage review" },
  { value: "complaint-spike", label: "Complaint spike" },
  { value: "source-policy-risk", label: "Source policy risk" },
  { value: "operator-resume", label: "Operator resume" },
] as const;

export type AdminPauseReason =
  (typeof ADMIN_PAUSE_REASON_OPTIONS)[number]["value"];

export const ADMIN_DRY_RUN_REASON_OPTIONS = [
  { value: "dry-run-safety-check", label: "Safety check" },
  { value: "watch-replay-review", label: "Watch replay review" },
  { value: "operator-validation", label: "Operator validation" },
] as const;

export type AdminDryRunReason =
  (typeof ADMIN_DRY_RUN_REASON_OPTIONS)[number]["value"];

export const ADMIN_OVERRIDE_REASON_OPTIONS = [
  { value: "source-policy-reviewed", label: "Source policy reviewed" },
  { value: "privacy-leakage-reviewed", label: "Privacy leakage reviewed" },
  { value: "complaint-reviewed", label: "Complaint reviewed" },
  { value: "operator-risk-reviewed", label: "Operator risk reviewed" },
] as const;

export type AdminOverrideReason =
  (typeof ADMIN_OVERRIDE_REASON_OPTIONS)[number]["value"];

const ADMIN_REVEAL_REASON_VALUES = new Set<string>(
  ADMIN_REVEAL_REASON_OPTIONS.map((option) => option.value),
);

const ADMIN_DECISION_REASON_VALUES = new Set<string>(
  ADMIN_DECISION_REASON_GROUPS.flatMap((group) =>
    group.options.map((option) => option.value),
  ),
);

const ADMIN_PAUSE_REASON_VALUES = new Set<string>(
  ADMIN_PAUSE_REASON_OPTIONS.map((option) => option.value),
);

const ADMIN_DRY_RUN_REASON_VALUES = new Set<string>(
  ADMIN_DRY_RUN_REASON_OPTIONS.map((option) => option.value),
);

const ADMIN_OVERRIDE_REASON_VALUES = new Set<string>(
  ADMIN_OVERRIDE_REASON_OPTIONS.map((option) => option.value),
);

export function isAdminRevealReason(value: string): value is AdminRevealReason {
  return ADMIN_REVEAL_REASON_VALUES.has(value);
}

export function isAdminDecisionReason(value: string): value is AdminDecisionReason {
  return ADMIN_DECISION_REASON_VALUES.has(value);
}

export function isAdminPauseReason(value: string): value is AdminPauseReason {
  return ADMIN_PAUSE_REASON_VALUES.has(value);
}

export function isAdminDryRunReason(value: string): value is AdminDryRunReason {
  return ADMIN_DRY_RUN_REASON_VALUES.has(value);
}

export function isAdminOverrideReason(value: string): value is AdminOverrideReason {
  return ADMIN_OVERRIDE_REASON_VALUES.has(value);
}
