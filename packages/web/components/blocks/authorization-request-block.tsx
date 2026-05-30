"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCw } from "lucide-react";
import type {
  AuthorizationActionClass,
  AuthorizationRequestBlock,
  AuthorizationRequestState,
  ContentBlock,
} from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  ConfirmationActions,
  ConfirmationExecuting,
  ConfirmationFailed,
  ConfirmationPartial,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationRoot,
  ConfirmationSucceeded,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import { TextBlockComponent } from "./text-block";
import { DataBlockComponent } from "./data-block";

interface Props {
  block: AuthorizationRequestBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

const ACTION_COPY: Record<AuthorizationActionClass, { accept: string; edit: string; reject: string }> = {
  "email-send": { accept: "Send it", edit: "Edit first", reject: "Not yet" },
  "sms-send": { accept: "Send", edit: "Edit first", reject: "Not yet" },
  "calendar-invite": { accept: "Send invite", edit: "Edit first", reject: "Not yet" },
  "list-share": { accept: "Share it", edit: "Edit first", reject: "Not yet" },
  "multi-recipient-send": { accept: "Send all", edit: "Choose who", reject: "Not yet" },
};

function formatSentAt(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function firstRecipient(block: AuthorizationRequestBlock): string {
  return block.recipientLabel ?? block.executionResult?.recipients?.[0] ?? "the recipient";
}

function renderPreviewBlock(block: ContentBlock, index: number) {
  if (block.type === "text") {
    return <TextBlockComponent key={index} block={block} />;
  }
  if (block.type === "data") {
    return <DataBlockComponent key={index} block={block} />;
  }
  return (
    <pre
      key={index}
      className="my-2 max-h-56 overflow-auto rounded-md bg-surface-secondary p-3 text-xs text-text-secondary"
    >
      {JSON.stringify(block, null, 2)}
    </pre>
  );
}

function buildPayload(block: AuthorizationRequestBlock, event: string): Record<string, unknown> {
  return {
    message: event === "send-it"
      ? "[AUTHORIZATION_ACTION:send-it]"
      : event === "edit-first"
        ? "Edit first"
        : event === "not-yet"
          ? "Not yet"
          : event,
    authorizationAction: {
      event,
      authorizationId: block.authorizationId ?? null,
      actionClass: block.actionClass,
      recipientLabel: block.recipientLabel,
      header: block.header,
      preview: block.preview,
      request: block.request ?? null,
      draft: block.draft ?? null,
      requesterId: block.requesterId ?? null,
      costLabel: block.costLabel ?? null,
      createdAt: new Date().toISOString(),
    },
  };
}

export function AuthorizationRequestBlockComponent({ block, onAction }: Props) {
  const [localState, setLocalState] = useState<AuthorizationRequestState>(block.state);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLocalState(block.state);
  }, [block.state]);

  useEffect(() => {
    if (block.state !== "pending" || localState !== "pending" || !block.expiresAt) return;
    const delay = Math.max(0, new Date(block.expiresAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      setLocalState("expired");
      onAction?.("authorization-request:expired", buildPayload(block, "expired"));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [block, block.expiresAt, block.state, localState, onAction]);

  const copy = ACTION_COPY[block.actionClass];
  const recipient = firstRecipient(block);
  const sentAt = formatSentAt(block.executionResult?.sentAt);
  const preview = block.preview ?? [];
  const shouldCollapse = preview.length > 1;
  const visiblePreview = expanded || !shouldCollapse ? preview : preview.slice(0, 1);

  const statusLine = useMemo(() => {
    if (localState === "succeeded") {
      return `Sent to ${recipient}.${sentAt ? ` ${sentAt}.` : ""}`;
    }
    if (localState === "failed") {
      return `Couldn't send - ${block.executionResult?.reasonForVisitor ?? "try again in a minute."}`;
    }
    if (localState === "partial") {
      const rows = block.executionResult?.partial ?? [];
      const sent = rows.filter((row) => row.status === "sent").length;
      return `Sent ${sent} of ${rows.length}.`;
    }
    return null;
  }, [block.executionResult, localState, recipient, sentAt]);

  function fire(event: "send-it" | "edit-first" | "not-yet" | "retry" | "expired") {
    if (event === "send-it" || event === "retry") setLocalState("executing");
    if (event === "edit-first") setLocalState("edit-requested");
    if (event === "not-yet") setLocalState("rejected");
    if (event === "expired") setLocalState("expired");
    onAction?.(`authorization-request:${event}`, buildPayload(block, event));
  }

  return (
    <div data-testid="authorization-request-block" className="my-3">
      <ConfirmationRoot state={localState} title={block.header}>
        <ConfirmationTitle />
        <ConfirmationRequest>
          {localState === "expired"
            ? "This paused while you were away. I can ask again if you still want it."
            : localState === "edit-requested"
              ? "Draft held. Tell me what to change."
              : "Quick scan first - nothing goes out unless you choose it."}
        </ConfirmationRequest>

        {preview.length > 0 && (
          <div
            className={cn(
              "mt-3 border-y border-border/60 py-2",
              localState === "expired" && "opacity-70",
            )}
          >
            {visiblePreview.map(renderPreviewBlock)}
            {shouldCollapse && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="mt-1 text-xs font-medium text-text-secondary hover:text-text-primary"
              >
                {expanded ? "Show less" : "Show full"}
              </button>
            )}
          </div>
        )}

        {block.costLabel ? (
          <p className="mt-2 text-xs font-medium text-text-muted">
            {block.costLabel}
          </p>
        ) : null}

        <ConfirmationExecuting>Sending...</ConfirmationExecuting>
        <ConfirmationSucceeded>{statusLine}</ConfirmationSucceeded>
        <ConfirmationRejected>Got it - paused this.</ConfirmationRejected>
        <ConfirmationFailed>
          <div className="space-y-2">
            <p>{statusLine}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fire("retry")}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-vivid)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          </div>
        </ConfirmationFailed>
        <ConfirmationPartial>
          <div className="space-y-2">
            <p>{statusLine}</p>
            <ul className="space-y-1 text-sm">
              {(block.executionResult?.partial ?? []).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3">
                  <span>{row.recipient}</span>
                  <span className={row.status === "sent" ? "text-positive" : "text-negative"}>
                    {row.status === "sent" ? "Sent" : row.reasonForVisitor ?? "Needs retry"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </ConfirmationPartial>

        <ConfirmationActions
          variant="trio"
          labels={copy}
          onAccept={() => fire("send-it")}
          onEdit={() => fire("edit-first")}
          onReject={() => fire("not-yet")}
        />
      </ConfirmationRoot>
    </div>
  );
}
