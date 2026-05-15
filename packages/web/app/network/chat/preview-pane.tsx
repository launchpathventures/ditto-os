"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { JobRequestCardBlock, NetworkProfileCardBlock } from "@/lib/engine";
import { JobRequestCardRenderer, type JobRequestEditableField } from "./job-request-card-renderer";
import { NetworkProfileCardRenderer } from "./network-profile-card-renderer";

export type NetworkChatMode = "expert" | "client";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function previewPaneOpacity(mode: NetworkChatMode | null, profileProgress: number): number {
  const boundedProgress = mode === "client"
    ? Math.max(1, Math.min(7, profileProgress))
    : Math.max(1, Math.min(6, profileProgress));
  return mode === "client"
    ? 0.48 + ((boundedProgress - 1) / 6) * 0.52
    : mode === "expert"
      ? 0.48 + ((boundedProgress - 1) / 5) * 0.52
      : 1;
}

function boundedPreviewProgress(mode: NetworkChatMode | null, profileProgress: number): number {
  return mode === "client"
    ? Math.max(1, Math.min(7, profileProgress))
    : Math.max(1, Math.min(6, profileProgress));
}

export function mobileEditPrompt(field: JobRequestEditableField): string {
  return `Want to change the ${field}? Tell me what it should be.`;
}

function trapDialogTab(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== "Tab" || !container) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function PreviewPane({
  mode,
  profileCard,
  jobRequestCard,
  profileProgress = 1,
  mobileControls,
  mobileInitiallyOpen = false,
  onMobileEditRequest,
}: {
  mode: NetworkChatMode | null;
  profileCard?: NetworkProfileCardBlock | null;
  jobRequestCard?: JobRequestCardBlock | null;
  profileProgress?: number;
  mobileControls?: ReactNode;
  mobileInitiallyOpen?: boolean;
  onMobileEditRequest?: (message: string, field: JobRequestEditableField) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(mobileInitiallyOpen);
  const mobileChipRef = useRef<HTMLButtonElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileDialogRef = useRef<HTMLDivElement>(null);
  const eyebrow =
    mode === "client"
      ? "Live opportunity brief"
      : "Live profile card";
  const caption =
    mode === "client"
      ? "Private working draft. Candidate-facing copy hides budget and bad-fit filters."
      : "This becomes the public card after you choose visibility.";
  const boundedProgress = boundedPreviewProgress(mode, profileProgress);
  const opacity = previewPaneOpacity(mode, profileProgress);
  const expertPreview = profileCard
    ? (
        <div
          className="transition-[opacity,filter] duration-[400ms] ease-out"
          style={{ opacity, filter: boundedProgress < 6 ? "blur(0.25px)" : "blur(0)" }}
        >
          <NetworkProfileCardRenderer card={profileCard} preview />
        </div>
      )
    : <GhostProfile />;
  const clientPreview = jobRequestCard
    ? (
        <div
          className="transition-[opacity,filter] duration-[400ms] ease-out motion-reduce:transition-none"
          style={{ opacity, filter: boundedProgress < 7 ? "blur(0.25px)" : "blur(0)" }}
        >
          <JobRequestCardRenderer
            card={jobRequestCard}
            editable={mobileOpen}
            onEditField={(field) => {
              closeMobileOverlay();
              onMobileEditRequest?.(mobileEditPrompt(field), field);
            }}
          />
        </div>
      )
    : (
        <div
          className="transition-[opacity,filter] duration-[400ms] ease-out motion-reduce:transition-none"
          style={{ opacity, filter: boundedProgress < 7 ? "blur(0.25px)" : "blur(0)" }}
        >
          <GhostOpportunity />
        </div>
      );
  const mobileChipLabel = mode === "client" ? "Open brief preview" : "Open card preview";
  const mobilePreview = mode === "client" ? clientPreview : expertPreview;

  useEffect(() => {
    if (mobileOpen) {
      mobileCloseRef.current?.focus();
    }
  }, [mobileOpen]);

  function closeMobileOverlay() {
    setMobileOpen(false);
    window.setTimeout(() => mobileChipRef.current?.focus(), 0);
  }

  function handleMobileDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      closeMobileOverlay();
      return;
    }
    trapDialogTab(event, mobileDialogRef.current);
  }

  return (
    <>
      {(mode === "expert" || mode === "client") && (
        <div className="fixed right-4 top-[112px] z-30 md:hidden">
          <button
            ref={mobileChipRef}
            type="button"
            aria-label={mobileChipLabel}
            onClick={() => setMobileOpen(true)}
            className="min-h-10 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-text-primary shadow-medium"
          >
            {mode === "client" ? "Preview: brief" : "Preview: card"}
          </button>
        </div>
      )}

      {mobileOpen && (
        <div
          ref={mobileDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={mobileChipLabel}
          onKeyDown={handleMobileDialogKeyDown}
          className="fixed inset-0 z-50 overflow-y-auto bg-white p-4 md:hidden"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
              {eyebrow}
            </p>
            <button
              ref={mobileCloseRef}
              type="button"
              onClick={closeMobileOverlay}
              className="min-h-10 rounded-md border border-border px-4 text-sm font-semibold"
            >
              Close
            </button>
          </div>
          {mobilePreview}
          {mobileControls ? (
            <div className="mt-4">
              {mobileControls}
            </div>
          ) : null}
        </div>
      )}

      <aside className="hidden min-h-0 flex-1 bg-background px-5 py-5 md:flex md:px-8 md:py-8">
        <div className="mx-auto flex w-full max-w-[520px] flex-col justify-center">
          <div className="rounded-[24px] border border-border bg-white p-5 shadow-medium">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
                  {eyebrow}
                </p>
                <p className="mt-1 text-sm leading-5 text-text-secondary">
                  {caption}
                </p>
              </div>
              <div className="flex items-center gap-1" aria-hidden="true">
                {Array.from({ length: mode === "client" ? 7 : 6 }).map((_, index) => (
                  <span
                    key={index}
                    className={index < boundedProgress ? "h-1.5 w-4 rounded-full bg-text-primary" : "h-1.5 w-4 rounded-full bg-surface-raised"}
                  />
                ))}
              </div>
            </div>

            {mode === "expert" && (
              <div className="mt-5">
                {expertPreview}
              </div>
            )}

            {mode === "client" && (
              <div className="mt-5">
                {clientPreview}
              </div>
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
          Card preview builds here.
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
          Brief preview builds here.
        </p>
      </div>
    </div>
  );
}
