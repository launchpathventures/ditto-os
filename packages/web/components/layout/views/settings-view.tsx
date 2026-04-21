"use client";

/**
 * Ditto — Settings view
 *
 * Thin wrapper over the existing ConnectionsPanel, plus a greeting in
 * the design handoff's voice. Kept minimal on purpose: settings should
 * surface "what I can reach" and "how much you trust me" in human
 * language, not a nested config tree.
 */

import React from "react";
import { ConnectionsPanel } from "@/components/settings/connections-panel";
import { Greet } from "./view-shell";

export function SettingsView() {
  return (
    <div>
      <Greet
        title="Settings"
        summary="How you’ve set me up, what I can reach, and how much you trust me with."
      />
      <ConnectionsPanel />
    </div>
  );
}
