"use client";

type MarketingEventName =
  | "wedge_play_pressed"
  | "wedge_autoplay"
  | "wedge_completed"
  | "wedge_skipped"
  | "wedge_replayed"
  | "network_entry_selected";

export type MarketingSurface = "front-door" | "network-chat";

interface MarketingEventPayload {
  event: MarketingEventName;
  surface: MarketingSurface;
  metadata: Record<string, unknown>;
  timestamp: string;
}

declare global {
  interface Window {
    dittoAnalytics?: {
      track?: (event: string, metadata?: Record<string, unknown>) => void;
    };
    analytics?: {
      track?: (event: string, metadata?: Record<string, unknown>) => void;
    };
  }
}

export function trackMarketingEvent(
  event: MarketingEventName,
  metadata: Record<string, unknown>,
  surface: MarketingSurface = "front-door",
) {
  if (typeof window === "undefined") return;

  const payload: MarketingEventPayload = {
    event,
    surface,
    metadata,
    timestamp: new Date().toISOString(),
  };

  window.dispatchEvent(new CustomEvent("ditto:marketing-event", { detail: payload }));
  window.dittoAnalytics?.track?.(event, metadata);
  window.analytics?.track?.(event, metadata);

  if (process.env.NODE_ENV === "development") {
    console.debug("[marketing-event]", payload);
  }
}
