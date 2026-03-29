/**
 * Ditto — Composition Utilities
 *
 * Shared helpers used across composition functions.
 * Provenance: original.
 */

/** Map trust tier to user language per .impeccable.md */
export function formatTrustTier(tier: string): string {
  switch (tier) {
    case "supervised":
      return "Check everything";
    case "spot-checked":
      return "Spot check";
    case "autonomous":
      return "Let it run";
    case "critical":
      return "Check everything";
    default:
      return tier;
  }
}

/** Format an ISO date as relative time (e.g., "5m ago", "3h ago", "2d ago") */
export function formatRelativeTime(isoDate: string): string {
  const time = new Date(isoDate).getTime();
  if (Number.isNaN(time)) return "";
  const diff = Date.now() - time;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(0, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
