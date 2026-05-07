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
import { AlertTriangle, Check, Loader2, PauseCircle, Pencil, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getToolDisplayLabel } from "./tool-display-names";

// --- Context ---

export type ConfirmationState =
  | "pending"
  | "accepted"
  | "rejected"
  | "executing"
  | "succeeded"
  | "failed"
  | "edit-requested"
  | "partial"
  | "expired";

interface ConfirmationContextValue {
  state: ConfirmationState;
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
  state: ConfirmationState;
  title: string;
  children: ReactNode;
  className?: string;
}

function ConfirmationRoot({ state, title, children, className }: ConfirmationRootProps) {
  const borderColor = {
    pending: "border-[var(--color-caution)]",
    accepted: "border-[var(--color-positive)]",
    executing: "border-[var(--color-vivid)]",
    succeeded: "border-[var(--color-positive)]",
    failed: "border-[var(--color-negative)]",
    rejected: "border-border",
    "edit-requested": "border-[var(--color-caution)]",
    partial: "border-[var(--color-caution)]",
    expired: "border-border",
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
  if (state !== "pending" && state !== "edit-requested" && state !== "expired") return null;
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
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
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
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      {children ?? "Rejected"}
    </div>
  );
}

function ConfirmationExecuting({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state !== "executing") return null;
  return (
    <div className={cn("flex items-center gap-1.5 text-sm text-text-secondary mt-1", className)}>
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      {children ?? "Working..."}
    </div>
  );
}

function ConfirmationSucceeded({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state !== "succeeded") return null;
  return (
    <div className={cn("flex items-center gap-1.5 text-sm text-positive mt-1", className)}>
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      {children ?? "Done"}
    </div>
  );
}

function ConfirmationFailed({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state !== "failed") return null;
  return (
    <div className={cn("flex items-start gap-1.5 text-sm text-negative mt-1", className)}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <div>{children ?? "Something went wrong."}</div>
    </div>
  );
}

function ConfirmationPartial({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state !== "partial") return null;
  return (
    <div className={cn("text-sm text-text-secondary mt-1", className)}>
      {children}
    </div>
  );
}

function ConfirmationActions({
  onAccept,
  onReject,
  onEdit,
  variant = "default",
  labels,
  className,
}: {
  onAccept: () => void;
  onReject: () => void;
  onEdit?: () => void;
  variant?: "default" | "trio";
  labels?: {
    accept?: string;
    edit?: string;
    reject?: string;
  };
  className?: string;
}) {
  const { state } = useConfirmationContext();
  if (state === "edit-requested") return null;
  const disabled = state === "expired";
  if (state !== "pending" && !disabled) return null;
  const isTrio = variant === "trio";
  return (
    <div className={cn("flex flex-col gap-2 mt-3 sm:flex-row sm:items-center", className)}>
      <button
        onClick={onAccept}
        disabled={disabled}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors",
          "bg-[var(--color-vivid)] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        {isTrio ? <Send className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
        {labels?.accept ?? "Go ahead"}
      </button>
      {isTrio && (
        <button
          onClick={onEdit}
          disabled={disabled}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors",
            "border border-border text-text-secondary hover:text-text-primary hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-45",
          )}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {labels?.edit ?? "Edit first"}
        </button>
      )}
      <button
        onClick={onReject}
        disabled={disabled}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-[var(--radius-md)] transition-colors",
          "border border-border text-text-secondary hover:text-text-primary hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        {isTrio ? <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
        {labels?.reject ?? "Hold on"}
      </button>
    </div>
  );
}

function ConfirmationActionsTrio(props: Omit<Parameters<typeof ConfirmationActions>[0], "variant">) {
  return <ConfirmationActions {...props} variant="trio" />;
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
  ConfirmationExecuting,
  ConfirmationSucceeded,
  ConfirmationFailed,
  ConfirmationPartial,
  ConfirmationActions,
  ConfirmationActionsTrio,
};
