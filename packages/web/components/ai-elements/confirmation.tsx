"use client";

/**
 * Confirmation — Adopted from AI Elements (Deep Adoption, Brief 061)
 *
 * State-aware tool approval UI with composable subcomponents.
 * Shows different content based on state: pending (request + buttons),
 * accepted (accepted message), rejected (rejected message).
 *
 * Actions route through onApprove/onReject to the engine for feedback capture.
 *
 * Provenance: vercel/ai-elements confirmation.tsx, adapted for Ditto trust model.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { getToolDisplayLabel } from "./tool-display-names";

// --- Context ---

interface ConfirmationContextValue {
  state: "pending" | "accepted" | "rejected";
  title: string;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

function useConfirmationContext() {
  const ctx = useContext(ConfirmationContext);
  if (!ctx) throw new Error("Confirmation subcomponent must be used within <ConfirmationRoot>");
  return ctx;
}

// --- Composable Subcomponents ---

interface ConfirmationRootProps {
  state: "pending" | "accepted" | "rejected";
  title: string;
  children: ReactNode;
  className?: string;
}

function ConfirmationRoot({ state, title, children, className }: ConfirmationRootProps) {
  const borderColor = {
    pending: "border-[var(--color-caution)]",
    accepted: "border-[var(--color-positive)]",
    rejected: "border-border",
  }[state];

  return (
    <ConfirmationContext.Provider value={{ state, title }}>
      <div
        className={cn(
          "my-2 border-l-2 pl-[var(--spacing-4)] transition-colors duration-150",
          borderColor,
          className,
        )}
      >
        {children}
      </div>
    </ConfirmationContext.Provider>
  );
}

function ConfirmationTitle({ className }: { className?: string }) {
  const { title } = useConfirmationContext();
  return (
    <div className={cn("text-base font-semibold text-text-primary", className)}>
      {title}
    </div>
  );
}

function ConfirmationRequest({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state !== "pending") return null;
  return (
    <div className={cn("text-sm text-text-secondary mt-1", className)}>
      {children}
    </div>
  );
}

function ConfirmationAccepted({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state !== "accepted") return null;
  return (
    <div className={cn("flex items-center gap-1.5 text-sm text-positive mt-1", className)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {children ?? "Approved"}
    </div>
  );
}

function ConfirmationRejected({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state !== "rejected") return null;
  return (
    <div className={cn("flex items-center gap-1.5 text-sm text-text-muted mt-1", className)}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m18 6-12 12" /><path d="m6 6 12 12" />
      </svg>
      {children ?? "Rejected"}
    </div>
  );
}

function ConfirmationActions({
  onAccept,
  onReject,
  className,
}: {
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state !== "pending") return null;
  return (
    <div className={cn("flex items-center gap-2 mt-2", className)}>
      <button
        onClick={onAccept}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded-[var(--radius-full)] transition-colors",
          "bg-[var(--color-vivid)] text-white hover:opacity-90",
        )}
      >
        Go ahead
      </button>
      <button
        onClick={onReject}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded-[var(--radius-full)] transition-colors",
          "border border-border text-text-secondary hover:text-text-primary hover:border-border-strong",
        )}
      >
        Hold on
      </button>
    </div>
  );
}

// --- Backward-Compatible Default Export ---

interface ConfirmationProps {
  toolCallId: string;
  toolName: string;
  onApprove: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
  className?: string;
}

/**
 * Default composition — backward-compatible with Brief 058 API.
 * message.tsx uses: <Confirmation toolCallId={...} toolName={...} onApprove={...} onReject={...} />
 *
 * Tracks local state so the component shows accepted/rejected immediately
 * after the user clicks, before the SDK replaces the tool part.
 */
export function Confirmation({
  toolCallId,
  toolName,
  onApprove,
  onReject,
  className,
}: ConfirmationProps) {
  const [state, setState] = useState<"pending" | "accepted" | "rejected">("pending");

  const handleAccept = useCallback(() => {
    setState("accepted");
    onApprove(toolCallId);
  }, [onApprove, toolCallId]);

  const handleReject = useCallback(() => {
    setState("rejected");
    onReject(toolCallId);
  }, [onReject, toolCallId]);

  const displayLabel = getToolDisplayLabel(toolName);
  // Human-language title: "Ready to search knowledge" (infinitive from tool display name)
  const humanTitle = `Ready to ${displayLabel.action}`;

  return (
    <ConfirmationRoot state={state} title={state === "pending" ? humanTitle : humanTitle} className={className}>
      <ConfirmationTitle />
      <ConfirmationRequest>
        Ditto needs your go-ahead before proceeding.
      </ConfirmationRequest>
      <ConfirmationActions
        onAccept={handleAccept}
        onReject={handleReject}
      />
      <ConfirmationAccepted>Done</ConfirmationAccepted>
      <ConfirmationRejected>Cancelled</ConfirmationRejected>
    </ConfirmationRoot>
  );
}

// Named exports for composable usage
export {
  ConfirmationRoot,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
};
