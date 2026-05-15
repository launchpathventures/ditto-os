"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceUpsellContext = "expert" | "client";

export interface WorkspaceUpsellCtaProps {
  copy: string;
  declineLabel: string;
  sessionId?: string | null;
  context?: WorkspaceUpsellContext;
  provisionEndpoint?: string;
  /** @deprecated Workspace provisioning now resolves the user from the live lane session. */
  userId?: string | null;
  className?: string;
}

export async function requestWorkspaceProvision({
  fetchImpl = fetch,
  endpoint = "/api/v1/network/workspace-provision",
  sessionId,
  context,
}: {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  sessionId?: string | null;
  context: WorkspaceUpsellContext;
}): Promise<Record<string, unknown>> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ sessionId: sessionId ?? null, context }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Workspace provisioning failed: ${response.status}`,
    );
  }
  return payload;
}

export function WorkspaceUpsellCta({
  copy,
  declineLabel,
  sessionId,
  context,
  provisionEndpoint,
  className,
}: WorkspaceUpsellCtaProps) {
  const [dismissed, setDismissed] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  async function provisionWorkspace() {
    if (provisioning) return;
    if (!sessionId || !context) {
      setError("Open the live lane before setting up a workspace.");
      return;
    }
    setProvisioning(true);
    setError(null);
    try {
      await requestWorkspaceProvision({
        endpoint: provisionEndpoint,
        sessionId,
        context,
      });
      setAccepted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workspace provisioning failed.");
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <div
      data-testid="workspace-upsell-cta"
      className={cn(
        "mt-3 rounded-[24px] border border-border bg-white px-4 py-3 text-[15px] leading-6 text-text-primary shadow-subtle",
        className,
      )}
    >
      <p className="whitespace-pre-line">{copy}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void provisionWorkspace()}
          disabled={provisioning || accepted || !sessionId || !context}
          title={!sessionId || !context ? "Open the live lane before setting up a workspace." : undefined}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60",
            provisioning ? "disabled:cursor-wait" : "disabled:cursor-not-allowed",
          )}
        >
          {provisioning ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : accepted ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : null}
          Yes, set up workspace
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary transition hover:bg-surface-raised"
        >
          {declineLabel}
        </button>
      </div>
      {accepted ? (
        <p className="mt-2 text-xs font-medium text-text-muted">
          Workspace setup started. Watch your email for the login link.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs font-medium text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
