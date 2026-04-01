"use client";

/**
 * Block renderer for ConnectionSetupBlock (Brief 072).
 *
 * Shows service name, display name, and connection status indicator.
 * Status states: disconnected (gray), connecting (amber pulse),
 * connected (green), error (red + message).
 * For credential-based connections: renders fields as inputs.
 * "Connect" triggers onAction("form-submit", { blockType: "connection_setup", values }).
 * Does NOT store credentials in block — triggers the existing /api/credential route.
 *
 * Provenance: Brief 072, ADR-021 block registry.
 */

import { useState, useCallback } from "react";
import type { ConnectionSetupBlock } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  block: ConnectionSetupBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

function StatusDot({ status }: { status: ConnectionSetupBlock["connectionStatus"] }) {
  const base = "w-2 h-2 rounded-full shrink-0";
  switch (status) {
    case "connected":
      return <span className={cn(base, "bg-green-500")} />;
    case "connecting":
      return <span className={cn(base, "bg-amber-500 animate-pulse")} />;
    case "error":
      return <span className={cn(base, "bg-red-500")} />;
    case "disconnected":
    default:
      return <span className={cn(base, "bg-gray-400")} />;
  }
}

function statusLabel(status: ConnectionSetupBlock["connectionStatus"]): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "error":
      return "Error";
    case "disconnected":
    default:
      return "Not connected";
  }
}

export function ConnectionSetupBlockComponent({ block, onAction }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConnect = useCallback(() => {
    setIsSubmitting(true);
    onAction?.("form-submit", {
      blockType: "connection_setup",
      values: {
        serviceName: block.serviceName,
        ...values,
      },
    });
  }, [block.serviceName, values, onAction]);

  const isConnected = block.connectionStatus === "connected";

  return (
    <div className="my-4 border-l-2 border-l-vivid rounded-xl border border-border bg-surface-primary shadow-sm overflow-hidden">
      {/* Header with status */}
      <div className="px-4 py-3 bg-surface-secondary/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">
            {block.serviceDisplayName}
          </h3>
          <p className="text-xs text-text-tertiary">{block.serviceName}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={block.connectionStatus} />
          <span className="text-xs text-text-secondary">
            {statusLabel(block.connectionStatus)}
          </span>
        </div>
      </div>

      {/* Error message */}
      {block.connectionStatus === "error" && block.errorMessage && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-700">{block.errorMessage}</p>
        </div>
      )}

      {/* Credential fields (only for disconnected/error states with fields) */}
      {!isConnected && block.fields && block.fields.length > 0 && (
        <div className="px-4 py-3 space-y-3">
          {block.fields.map((field) => (
            <div key={field.name} className="space-y-1">
              <label className="text-sm text-text-secondary">
                {field.label}{field.required ? " *" : ""}
              </label>
              <Input
                type={field.name.toLowerCase().includes("key") || field.name.toLowerCase().includes("secret") || field.name.toLowerCase().includes("token") ? "password" : "text"}
                value={values[field.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                placeholder={field.placeholder}
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      )}

      {/* Action */}
      {!isConnected && (
        <div className="px-4 py-3 border-t border-border">
          <Button
            onClick={handleConnect}
            disabled={isSubmitting || block.connectionStatus === "connecting"}
            size="sm"
          >
            {block.connectionStatus === "connecting"
              ? "Connecting..."
              : isSubmitting
                ? "Connecting..."
                : "Connect"}
          </Button>
        </div>
      )}
    </div>
  );
}
