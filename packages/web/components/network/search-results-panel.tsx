"use client";

/**
 * Search results panel (Brief 274)
 *
 * Renders the Possible Connection set with its honest states: loading,
 * empty, partial (members now / public-web still running or unavailable),
 * public-web unavailable, and the reasoned result list. Never a long
 * marketplace list — a compact set with the strongest fit first.
 */

import { Loader2, Search, WifiOff } from "lucide-react";
import type { NetworkManualSearchResult } from "@/lib/engine";
import { cn } from "@/lib/utils";
import {
  PossibleConnectionCard,
  type PossibleConnectionFeedbackKind,
} from "./possible-connection-card";

export function SearchResultsPanel({
  result,
  loading,
  error,
  onAction,
  busy,
  className,
}: {
  result: NetworkManualSearchResult | null;
  loading?: boolean;
  error?: string | null;
  onAction?: (
    kind: PossibleConnectionFeedbackKind,
    connectionId: string,
  ) => void;
  busy?: { connectionId: string; kind: PossibleConnectionFeedbackKind } | null;
  className?: string;
}) {
  if (loading) {
    return (
      <section
        aria-label="Searching the network"
        data-testid="search-results-loading"
        className={cn(
          "flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-4 text-sm text-text-secondary shadow-subtle",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Looking for possible connections — reasoning over signals, not
        scraping a list.
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label="Search error"
        data-testid="search-results-error"
        className={cn(
          "rounded-2xl border border-border bg-white px-4 py-4 text-sm text-text-secondary shadow-subtle",
          className,
        )}
      >
        {error}
      </section>
    );
  }

  if (!result) return null;

  if (result.connections.length === 0) {
    return (
      <section
        aria-label="No possible connections"
        data-testid="search-results-empty"
        className={cn(
          "rounded-2xl border border-border bg-white px-4 py-4 text-sm text-text-secondary shadow-subtle",
          className,
        )}
      >
        <p className="flex items-center gap-2 font-semibold text-text-primary">
          <Search className="h-4 w-4" aria-hidden="true" />
          Nothing strong enough to put forward yet.
        </p>
        <p className="mt-1">
          Tell me what to change — more commercial, a different geography,
          a tighter proof bar — and I&apos;ll run it again.
        </p>
        {!result.webSearchAvailable && result.webUnavailableNotice ? (
          <p className="mt-2 flex items-start gap-1.5 text-text-secondary">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {result.webUnavailableNotice}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-label="Possible connections"
      data-testid="search-results-panel"
      className={cn("w-full max-w-full space-y-3", className)}
    >
      {!result.webSearchAvailable && result.webUnavailableNotice ? (
        <p
          data-testid="search-results-web-unavailable"
          className="flex items-start gap-1.5 rounded-2xl border border-[#f1e3b8] bg-[#fdf7e6] px-4 py-3 text-xs leading-5 text-[#77510b]"
        >
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {result.webUnavailableNotice}
        </p>
      ) : result.partial ? (
        <p
          data-testid="search-results-partial"
          className="flex items-start gap-1.5 rounded-2xl border border-border bg-surface-raised px-4 py-3 text-xs leading-5 text-text-secondary"
        >
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
          Showing members now — still reaching for public leads. I&apos;ll
          add them as they land.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {result.connections.map((connection) => (
          <PossibleConnectionCard
            key={connection.id}
            connection={connection}
            busyKind={
              busy && busy.connectionId === connection.id ? busy.kind : null
            }
            onAction={(kind) => onAction?.(kind, connection.id)}
          />
        ))}
      </div>
    </section>
  );
}
