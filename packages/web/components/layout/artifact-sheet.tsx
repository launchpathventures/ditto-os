"use client";

/**
 * Ditto — Artifact Bottom Sheet (Mobile <1024px)
 *
 * Slides up from bottom for artifact review on mobile viewports.
 * Swipe-to-dismiss via touch events. Renders the same content as
 * the right panel artifact viewer.
 *
 * AC12: Mobile artifact-review transitions show bottom sheet.
 *
 * Provenance: Brief 046, iOS/Android bottom sheet convention.
 */

import { useCallback, useRef, useState } from "react";
import type { PanelContext } from "./right-panel";
import { ArtifactViewerPanel } from "./artifact-viewer-panel";
import { ProcessBuilderPanel } from "./process-builder-panel";

interface ArtifactSheetProps {
  context: PanelContext;
  onClose: () => void;
}

export function ArtifactSheet({ context, onClose }: ArtifactSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
    setDragY(0);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    // Only allow dragging down
    if (delta > 0) {
      setDragY(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    // Dismiss if dragged more than 100px
    if (dragY > 100) {
      onClose();
    } else {
      setDragY(0);
    }
  }, [dragY, onClose]);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-text-primary/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-[var(--shadow-large)] max-h-[80vh] flex flex-col transition-transform"
        style={{
          transform: `translateY(${dragY}px)`,
          transitionDuration: isDragging.current ? "0ms" : "200ms",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Close button */}
        <div className="flex justify-end px-4 -mt-2 mb-1">
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors text-sm p-1"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {context.type === "artifact-review" && (
            <ArtifactViewerPanel
              runId={context.runId}
              processId={context.processId}
            />
          )}
          {context.type === "process-builder" && (
            <ProcessBuilderPanel yaml={context.yaml} slug={context.slug} />
          )}
          {context.type === "briefing" && (
            <div className="text-sm text-text-secondary">
              <p>Briefing details available in workspace view.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
