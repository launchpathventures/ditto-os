"use client";

import { useState } from "react";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { NetworkProfileCardRenderer } from "./network-profile-card-renderer";

export type NetworkChatMode = "expert" | "client";

export function PreviewPane({
  mode,
  profileCard,
  profileProgress = 1,
}: {
  mode: NetworkChatMode | null;
  profileCard?: NetworkProfileCardBlock | null;
  profileProgress?: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const eyebrow =
    mode === "client"
      ? "Opportunity brief"
      : "Profile";
  const boundedProgress = Math.max(1, Math.min(6, profileProgress));
  const opacity = mode === "expert" ? 0.16 + ((boundedProgress - 1) / 5) * 0.84 : 1;
  const expertPreview = profileCard
    ? (
        <div
          className="transition-[opacity,filter] duration-[400ms] ease-out"
          style={{ opacity, filter: boundedProgress < 6 ? "blur(0.6px)" : "blur(0)" }}
        >
          <NetworkProfileCardRenderer card={profileCard} />
        </div>
      )
    : <GhostProfile />;

  return (
    <>
      {mode === "expert" && (
        <div className="fixed right-4 top-20 z-30 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="min-h-11 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary shadow-medium"
          >
            Tap to see your card →
          </button>
        </div>
      )}

      {mobileOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-4 md:hidden">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
              Editable preview
            </p>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="min-h-11 rounded-md border border-border px-4 text-sm font-semibold"
            >
              Close
            </button>
          </div>
          {expertPreview}
        </div>
      )}

      <aside className="hidden min-h-0 flex-1 bg-white px-5 py-5 md:flex md:px-8 md:py-8">
        <div className="mx-auto flex w-full max-w-[500px] flex-col justify-center">
          <div className="rounded-[24px] border border-border bg-white p-5 shadow-medium">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
              {eyebrow}
            </p>

            {mode === "expert" && (
              <div className="mt-5">
                {expertPreview}
              </div>
            )}

            {mode === "client" && (
              // TODO(Brief 257): replace this ghost with the live JobRequestCardBlock preview.
              <GhostOpportunity />
            )}

            {mode === null && <GhostProfile />}
          </div>
        </div>
      </aside>
    </>
  );
}

function GhostProfile() {
  return (
    <div className="mt-5 space-y-5">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-surface-raised" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-2/3 rounded-full bg-surface-raised" />
          <div className="h-3 w-1/2 rounded-full bg-surface-raised" />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="h-2 rounded-full bg-surface-raised" />
        ))}
      </div>

      <div className="space-y-2">
        <div className="h-3 rounded-full bg-surface-raised" />
        <div className="h-3 w-5/6 rounded-full bg-surface-raised" />
        <div className="h-3 w-2/3 rounded-full bg-surface-raised" />
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-[24px] leading-tight text-text-primary">
          Hunting next thing...
        </p>
      </div>
    </div>
  );
}

function GhostOpportunity() {
  return (
    <div className="mt-5 space-y-5">
      <div className="space-y-2">
        <div className="h-3 w-3/4 rounded-full bg-surface-raised" />
        <div className="h-3 w-1/2 rounded-full bg-surface-raised" />
      </div>

      <div className="rounded-lg bg-surface-raised p-4">
        <div className="space-y-2">
          <div className="h-3 rounded-full bg-white" />
          <div className="h-3 w-5/6 rounded-full bg-white" />
          <div className="h-3 w-2/3 rounded-full bg-white" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="h-10 rounded-lg bg-surface-raised" />
        <div className="h-10 rounded-lg bg-surface-raised" />
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-[24px] leading-tight text-text-primary">
          Need the right person...
        </p>
      </div>
    </div>
  );
}
