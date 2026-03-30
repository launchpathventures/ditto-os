"use client";

/**
 * Ditto — Interaction Event Hook (Brief 056)
 *
 * Frontend hook for emitting semantic UI interaction events.
 * Fire-and-forget: uses navigator.sendBeacon() (survives page navigation)
 * with fetch() fallback. Debounces duplicate events within 1 second.
 *
 * Provenance: PostHog/Segment event model (pattern), Brief 056.
 */

import { useCallback, useRef } from "react";

interface InteractionEventPayload {
  eventType: string;
  entityId?: string;
  properties?: Record<string, unknown>;
}

/**
 * Returns an `emit` function that posts interaction events to the API.
 * Debounces duplicate events (same eventType + entityId) within 1 second.
 */
export function useInteractionEvent() {
  const lastEmitRef = useRef<Map<string, number>>(new Map());

  const emit = useCallback(
    (eventType: string, entityId?: string, properties?: Record<string, unknown>) => {
      // Include a properties fingerprint in the key so that different
      // navigation destinations (e.g., today→work vs today→roadmap) are
      // not suppressed by the debounce.
      const propsKey = properties ? JSON.stringify(properties) : "";
      const key = `${eventType}:${entityId ?? ""}:${propsKey}`;
      const now = Date.now();
      const lastEmit = lastEmitRef.current.get(key);

      // Debounce: skip if same event emitted within 1 second
      if (lastEmit && now - lastEmit < 1000) return;
      lastEmitRef.current.set(key, now);

      // Clean old entries to prevent memory leak
      if (lastEmitRef.current.size > 100) {
        const cutoff = now - 5000;
        for (const [k, t] of lastEmitRef.current) {
          if (t < cutoff) lastEmitRef.current.delete(k);
        }
      }

      const payload: InteractionEventPayload = {
        eventType,
        entityId,
        properties,
      };

      const body = JSON.stringify(payload);

      // Prefer sendBeacon (survives page navigation), fallback to fetch
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        const sent = navigator.sendBeacon("/api/events/interaction", blob);
        if (sent) return;
      }

      // Fallback: fire-and-forget fetch
      fetch("/api/events/interaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // Non-critical — lost events are acceptable
      });
    },
    [],
  );

  return { emit };
}
