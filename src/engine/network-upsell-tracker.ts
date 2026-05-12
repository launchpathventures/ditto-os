export type NetworkUpsellLane = "expert" | "client" | "kb";

const firedBySession = new Map<string, Set<NetworkUpsellLane>>();

function trackerKey(userId: string, sessionId: string): string {
  return `${userId.trim().toLowerCase()}:${sessionId.trim()}`;
}

export function hasFiredUpsell(
  userId: string,
  sessionId: string,
  lane: NetworkUpsellLane,
): boolean {
  return firedBySession.get(trackerKey(userId, sessionId))?.has(lane) ?? false;
}

export function recordUpsellFired(
  userId: string,
  sessionId: string,
  lane: NetworkUpsellLane,
): void {
  const key = trackerKey(userId, sessionId);
  const lanes = firedBySession.get(key) ?? new Set<NetworkUpsellLane>();
  lanes.add(lane);
  firedBySession.set(key, lanes);
}

export function resetNetworkUpsellTrackerForTests(): void {
  firedBySession.clear();
}
