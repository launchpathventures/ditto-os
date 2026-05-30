import type { NetworkUpsellTrigger } from "@ditto/core/db/network";

export const WORKSPACE_UPSELL_ACCEPT_LABEL = "Yes, set up workspace";
export const WORKSPACE_UPSELL_DECLINE_CARD_LABEL = "Not now, just my card";
export const WORKSPACE_UPSELL_DECLINE_BRIEF_LABEL = "Not now, just my brief";

export const WORKSPACE_UPSELL_COPY: Record<NetworkUpsellTrigger, string> = {
  "expert-q6":
    "Card's ready. I'll save this and you can chat with me at `ditto.partners/people/{handle}` — share that link with anyone curious about you.\n\nOne more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**",
  "client-q6":
    "Brief's saved. I'll keep it open and let you know if anyone good comes through.\n\nOne more thing — want a workspace? It's where I'd remember the briefs you write up for me, track which intros went somewhere, and pull in calendar/email so 'who should I see next week' actually has an answer. Free tier covers it. **Worth it if you do this kind of hunting more than twice a year.**",
};

export function composeWorkspaceUpsell({
  trigger,
  handle,
}: {
  trigger: NetworkUpsellTrigger;
  greeterName?: string | null;
  userFirstName?: string | null;
  handle?: string | null;
}): string {
  return WORKSPACE_UPSELL_COPY[trigger].replace("{handle}", handle || "{handle}");
}

export function workspaceUpsellDeclineLabel(trigger: NetworkUpsellTrigger): string {
  return trigger === "expert-q6"
    ? WORKSPACE_UPSELL_DECLINE_CARD_LABEL
    : WORKSPACE_UPSELL_DECLINE_BRIEF_LABEL;
}
