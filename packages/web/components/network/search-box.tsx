"use client";

/**
 * Manual search box (Brief 274)
 *
 * First-class entry point for asking Ditto directly for people,
 * expertise, or opportunities — from /network, an Active Request, or a
 * Member Signal. Carries a source scope (members / public web / both)
 * and a save-to-request affordance. Manual Search never contacts anyone.
 */

import { useState } from "react";
import { Search } from "lucide-react";
import type { NetworkSearchMode } from "@ditto/core/db/network";
import { cn } from "@/lib/utils";

export type SearchSourceScope = "ditto-members" | "public-web" | "both";

const SCOPE_OPTIONS: { value: SearchSourceScope; label: string }[] = [
  { value: "both", label: "Members + public web" },
  { value: "ditto-members", label: "Ditto members only" },
  { value: "public-web", label: "Public web only" },
];

export interface ManualSearchSubmit {
  query: string;
  sourcesAllowed: SearchSourceScope;
  mode: NetworkSearchMode;
  saveToRequest: boolean;
}

export function SearchBox({
  onSubmit,
  loading,
  defaultQuery = "",
  groundedMode,
  showSaveToRequest = true,
  className,
}: {
  onSubmit: (input: ManualSearchSubmit) => void;
  loading?: boolean;
  defaultQuery?: string;
  /** When grounded in an Active Request / Member Signal, fix the mode. */
  groundedMode?: NetworkSearchMode;
  showSaveToRequest?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [scope, setScope] = useState<SearchSourceScope>("both");
  const [saveToRequest, setSaveToRequest] = useState(false);

  function submit() {
    const clean = query.trim();
    if (!clean || loading) return;
    const mode: NetworkSearchMode =
      groundedMode ??
      (scope === "ditto-members"
        ? "member"
        : scope === "public-web"
          ? "public-web"
          : "both");
    onSubmit({ query: clean, sourcesAllowed: scope, mode, saveToRequest });
  }

  return (
    <section
      aria-label="Manual network search"
      data-testid="network-search-box"
      className={cn(
        "rounded-2xl border border-border bg-white p-4 shadow-subtle",
        className,
      )}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <label
          htmlFor="network-search-query"
          className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted"
        >
          Ask me to find someone
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="network-search-query"
            type="text"
            value={query}
            disabled={loading}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. marketplace operations expert for a messy two-sided network"
            className="min-h-11 w-full rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none transition focus:border-vivid disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!groundedMode ? (
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="font-semibold text-text-muted">Look in</span>
              <select
                aria-label="Search source scope"
                value={scope}
                disabled={loading}
                onChange={(event) =>
                  setScope(event.target.value as SearchSourceScope)
                }
                className="min-h-9 rounded-md border border-border bg-white px-2 text-xs text-text-primary outline-none focus:border-vivid disabled:opacity-60"
              >
                {SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {showSaveToRequest ? (
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={saveToRequest}
                disabled={loading}
                onChange={(event) => setSaveToRequest(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Save this as an Active Request so Ditto can keep watching
            </label>
          ) : null}
        </div>
        <p className="text-[11px] leading-4 text-text-muted">
          I&apos;ll come back with a few possible connections and why — no
          one is contacted without your say-so.
        </p>
      </form>
    </section>
  );
}
