import type { ActiveRequestDraft } from "./request-review";

const TRACKED_FIELDS = [
  "outcomeNeeded",
  "idealPerson",
  "proofRequired",
  "badFit",
  "urgency",
  "geography",
  "commercialShape",
  "successOutcome",
  "outcomeValueHint",
  "budgetPrivate",
  "budgetShareableLabel",
  "shareableSummary",
  "privateNotes",
] as const satisfies ReadonlyArray<keyof ActiveRequestDraft>;

export type TrackedField = (typeof TRACKED_FIELDS)[number];

const FIELD_LABELS: Record<TrackedField, string> = {
  outcomeNeeded: "outcome",
  idealPerson: "ideal person",
  proofRequired: "proof",
  badFit: "avoid",
  urgency: "urgency",
  geography: "geography",
  commercialShape: "commercial shape",
  successOutcome: "success",
  outcomeValueHint: "outcome value",
  budgetPrivate: "private budget",
  budgetShareableLabel: "shareable budget label",
  shareableSummary: "shareable summary",
  privateNotes: "private notes",
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function diffDraftFields(
  before: ActiveRequestDraft | null,
  after: ActiveRequestDraft,
): TrackedField[] {
  if (!before) return [];
  const changed: TrackedField[] = [];
  for (const key of TRACKED_FIELDS) {
    if (normalize(before[key] as string | null) !== normalize(after[key] as string | null)) {
      changed.push(key);
    }
  }
  return changed;
}

export function fieldLabel(field: TrackedField): string {
  return FIELD_LABELS[field];
}

export function labelChangedFields(fields: TrackedField[]): string {
  const labels = fields.map(fieldLabel);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}
