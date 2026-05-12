"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

export function JobRequestCardInspectorModal({
  operatorPreview,
  candidatePreview,
  defaultOpen = false,
}: {
  operatorPreview: ReactNode;
  candidatePreview: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  function closeDialog() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      closeDialog();
      return;
    }
    trapDialogTab(event, dialogRef.current);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-10 items-center justify-center text-left text-xs font-semibold text-text-primary underline-offset-4 transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary/25"
      >
        How does this look to candidates? ▸
      </button>

      {open ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Candidate privacy preview"
          onKeyDown={handleDialogKeyDown}
          className="fixed inset-0 z-50 overflow-y-auto bg-text-primary/35 px-4 py-6 backdrop-blur-sm"
        >
          <div className="mx-auto max-w-5xl rounded-[24px] bg-white p-4 shadow-large sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Privacy preview
                </p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">
                  Operator view beside candidate view
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close candidate privacy preview"
                onClick={closeDialog}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-white text-text-primary transition hover:bg-surface-raised"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section aria-label="Operator view" className="min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Operator view
                </p>
                {operatorPreview}
              </section>
              <section aria-label="Candidate view" className="min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Candidate view
                </p>
                {candidatePreview}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
