export type WorkspaceUpsellMode = "client" | "expert";

export const CLIENT_LANE_UPSELL_COPY =
  "Brief's saved. I'll keep it open and let you know if anyone good comes through.\n\nOne more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**";

export const EXPERT_LANE_UPSELL_COPY =
  "Card's ready. I'll save this and you can chat with me at `ditto.partners/people/{handle}` — share that link with anyone curious about you.\n\nOne more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**";

export const CLIENT_LANE_UPSELL_ACCEPT_LABEL = "Yes, set up workspace";
export const CLIENT_LANE_UPSELL_DECLINE_LABEL = "Not now, just my brief";
export const EXPERT_LANE_UPSELL_DECLINE_LABEL = "Not now, just my card";

export const WORKSPACE_UPSELL_OQ1_WARN =
  "Brief 257 OQ1: client-lane upsell using parent 254 §Workspace upsell — Client lane variant (post-2026-05-10 amendment)";

const warnedSessionLanes = new Set<string>();

export function resetWorkspaceUpsellGuardsForTest() {
  warnedSessionLanes.clear();
}

export function emitWorkspaceUpsell(
  mode: WorkspaceUpsellMode,
  options: { sessionId?: string | null; handle?: string | null } = {},
): string {
  const sessionId = options.sessionId || "anonymous";
  if (mode === "client") {
    const warningKey = `client:${sessionId}`;
    if (!warnedSessionLanes.has(warningKey)) {
      warnedSessionLanes.add(warningKey);
      // TODO(post-261): remove OQ1 guard when sub-brief 261 wires live upsell trigger
      console.warn(WORKSPACE_UPSELL_OQ1_WARN);
    }
    return CLIENT_LANE_UPSELL_COPY;
  }

  return EXPERT_LANE_UPSELL_COPY.replace("{handle}", options.handle || "{handle}");
}
