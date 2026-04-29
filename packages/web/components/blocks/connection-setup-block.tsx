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
 * Brief 225 — `serviceName === 'github-project'` branch: GitHub repo Connect
 * flow. Title becomes "Connect a GitHub repository", the raw `serviceName`
 * subtitle is suppressed, an alex-line annotation introduces the form, and
 * the primary CTA reads "Begin analysis →". The block-level
 * `connectionStatus` is wired by sub-brief #2's URL probe (placeholder this
 * brief). The submit dispatcher (Brief 072 ADR-021 Section 8) routes this
 * block-type to `POST /api/v1/projects` with `kickOffOnboarding: true`
 * instead of the legacy `/api/credential` path.
 *
 * Provenance: Brief 072, ADR-021 block registry; Brief 225 §AC #10.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import type { ConnectionSetupBlock } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  block: ConnectionSetupBlock;
  onAction?: (actionId: string, payload?: Record<string, unknown>) => void;
}

const GITHUB_PROJECT_SERVICE = "github-project";

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
  const isGithubProject = block.serviceName === GITHUB_PROJECT_SERVICE;
  const initialValues = useMemo(() => {
    const seeded: Record<string, string> = {};
    block.fields?.forEach((f) => {
      if (typeof f.value === "string") seeded[f.name] = f.value;
    });
    return seeded;
  }, [block.fields]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clear the in-flight flag when the parent re-emits the block in a
  // terminal state (connected / error). Prevents the CTA from being stuck
  // "Starting..." forever after a transient submit failure.
  useEffect(() => {
    if (
      block.connectionStatus === "connected" ||
      block.connectionStatus === "error"
    ) {
      setIsSubmitting(false);
    }
  }, [block.connectionStatus]);

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
  const fields = block.fields ?? [];

  // Header copy: github-project gets a friendly title; others use the
  // `serviceDisplayName` + `serviceName` pair from the legacy renderer.
  const headerTitle = isGithubProject
    ? "Connect a GitHub repository"
    : block.serviceDisplayName;
  const headerSubtitle = isGithubProject ? null : block.serviceName;

  return (
    <div className="my-4 border-l-2 border-l-vivid rounded-xl border border-border bg-surface-primary shadow-sm overflow-hidden">
      {/* Header with status */}
      <div className="px-4 py-3 bg-surface-secondary/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-text-primary">
            {headerTitle}
          </h3>
          {headerSubtitle && (
            <p className="text-xs text-text-tertiary">{headerSubtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={block.connectionStatus} />
          <span className="text-xs text-text-secondary">
            {statusLabel(block.connectionStatus)}
          </span>
        </div>
      </div>

      {/* Brief 225 — alex-line annotation above the form (github-project only) */}
      {isGithubProject && !isConnected && (
        <div className="alex-line px-4 pt-3 pb-1 text-xs italic text-text-tertiary">
          Paste a repo URL — I&apos;ll take a look at it before you commit to
          anything.
        </div>
      )}

      {/* Error message */}
      {block.connectionStatus === "error" && block.errorMessage && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-700">{block.errorMessage}</p>
        </div>
      )}

      {/* Credential / form fields */}
      {!isConnected && fields.length > 0 && (
        <div className="px-4 py-3 space-y-3">
          {fields.map((field) => (
            <div key={field.name} className="space-y-1">
              <label className="text-sm text-text-secondary">
                {field.label}
                {field.required ? " *" : ""}
              </label>
              <Input
                type={
                  field.name.toLowerCase().includes("key") ||
                  field.name.toLowerCase().includes("secret") ||
                  field.name.toLowerCase().includes("token")
                    ? "password"
                    : "text"
                }
                value={values[field.name] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [field.name]: e.target.value }))
                }
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
            {isGithubProject
              ? block.connectionStatus === "connecting"
                ? "Analysing..."
                : isSubmitting
                  ? "Starting..."
                  : "Begin analysis →"
              : block.connectionStatus === "connecting"
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
