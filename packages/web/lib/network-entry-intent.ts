export type NetworkEntryIntent =
  | "member-signal"
  | "manual-search"
  | "request"
  | "background-watch";

export const NETWORK_ENTRY_INTENTS: readonly NetworkEntryIntent[] = [
  "member-signal",
  "manual-search",
  "request",
  "background-watch",
] as const;

export function isNetworkEntryIntent(value: unknown): value is NetworkEntryIntent {
  return (
    value === "member-signal" ||
    value === "manual-search" ||
    value === "request" ||
    value === "background-watch"
  );
}
