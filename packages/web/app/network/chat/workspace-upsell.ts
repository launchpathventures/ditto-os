export type WorkspaceUpsellMode = "client" | "expert";

export const CLIENT_LANE_UPSELL_COPY =
  "Brief's saved. I'll keep it open and let you know if anyone good comes through.\n\nOne more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**";

export const EXPERT_LANE_UPSELL_COPY =
  "Card's ready. I'll save this and you can chat with me at `ditto.partners/people/{handle}` — share that link with anyone curious about you.\n\nOne more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**";

export const CLIENT_LANE_UPSELL_ACCEPT_LABEL = "Yes, set up workspace";
export const CLIENT_LANE_UPSELL_DECLINE_LABEL = "Not now, just my brief";
export const EXPERT_LANE_UPSELL_DECLINE_LABEL = "Not now, just my card";

export function resetWorkspaceUpsellGuardsForTest() {
  // Kept for older focused tests; Brief 261 moved idempotency to the server-side
  // network_session_upsell_log table.
}

export function emitWorkspaceUpsell(
  mode: WorkspaceUpsellMode,
  options: { sessionId?: string | null; handle?: string | null } = {},
): string {
  if (mode === "client") {
    return CLIENT_LANE_UPSELL_COPY;
  }

  return EXPERT_LANE_UPSELL_COPY.replace("{handle}", options.handle || "{handle}");
}
