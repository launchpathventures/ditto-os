"use client";

/**
 * Archive Drawer — Brief 281.
 *
 * Compact command-palette-style overlay launched from the chat header.
 * It is an escape hatch for recall, NOT a replacement home screen — the
 * conversation stays the default workspace IA (Brief 280).
 *
 * All query logic lives in the shared `recallWorkspace()` helper behind
 * `/api/v1/workspace/archive`. This component owns presentation only: it
 * never duplicates DB query logic (Brief 281 AC3).
 *
 * Read-only: rows are drill links to existing pages. No mutating actions
 * (Brief 281 — archive management stays on detail surfaces).
 *
 * Accessibility: focus-trapped dialog, Escape closes, restores focus to
 * the trigger, 44px touch targets, and reduced-motion-safe transitions
 * (Brief 281 AC15).
 *
 * Kind labels are inlined (not imported from `workspace-recall`) so the
 * server-only DB import never reaches the client bundle. The route is the
 * single source of truth for the data; labels are pure display.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

type RecallKind =
  | "project"
  | "process"
  | "memory"
  | "work"
  | "review"
  | "activity";

const KIND_LABEL: Record<RecallKind, string> = {
  project: "Projects",
  process: "Processes",
  memory: "Memories",
  work: "Work",
  review: "Reviews",
  activity: "Recent activity",
};

const KIND_ORDER: RecallKind[] = [
  "project",
  "process",
  "memory",
  "work",
  "review",
  "activity",
];

interface RecallResult {
  kind: RecallKind;
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  updatedAt?: string;
  projectSlug?: string;
  route?: string;
  evidence?: string;
  archived?: boolean;
}

interface RecallResponse {
  results: RecallResult[];
  counts: Record<RecallKind, number>;
  truncated: boolean;
  query: string | null;
  kinds: RecallKind[];
}

export interface ArchiveDrawerProps {
  open: boolean;
  onClose: () => void;
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const day = 86_400_000;
  if (diff < 0) return "";
  if (diff < day) return "today";
  const days = Math.round(diff / day);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function ArchiveDrawer({ open, onClose }: ArchiveDrawerProps) {
  const [query, setQuery] = useState("");
  const [activeKinds, setActiveKinds] = useState<Set<RecallKind>>(new Set());
  const [includeArchived, setIncludeArchived] = useState(false);
  const [resp, setResp] = useState<RecallResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Remember what had focus before the dialog opened and restore it on
  // close — keyboard users land back on the Archive trigger, not at the
  // top of the page (Brief 281 AC15).
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      (document.activeElement as HTMLElement | null) ?? null;
    return () => {
      restoreFocusRef.current?.focus?.();
      restoreFocusRef.current = null;
    };
  }, [open]);

  // Escape closes; Tab is trapped inside the panel so focus can't wander
  // behind the scrim of an `aria-modal` dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Autofocus the search input on open.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Debounced recall fetch — driven by query/filters while open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setErrored(false);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("query", query.trim());
        for (const k of activeKinds) params.append("kinds", k);
        if (includeArchived) params.set("includeArchived", "true");
        params.set("limit", "25");
        const r = await fetch(
          `/api/v1/workspace/archive?${params.toString()}`,
          { headers: { Accept: "application/json" } },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data: RecallResponse = await r.json();
        if (!cancelled) setResp(data);
      } catch {
        if (!cancelled) {
          setErrored(true);
          setResp(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query, activeKinds, includeArchived]);

  const toggleKind = useCallback((k: RecallKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  if (!open) return null;

  const results = resp?.results ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close archive"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 motion-safe:transition-opacity"
      />

      {/* Panel — bottom sheet on mobile, centered palette on desktop */}
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-[640px] max-h-[85vh] sm:max-h-[70vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-background shadow-2xl motion-safe:transition-transform"
      >
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border/60">
          <h2
            id={titleId}
            className="text-sm font-semibold text-text-primary shrink-0"
          >
            Archive
          </h2>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, processes, memories, work…"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-text-primary placeholder:text-text-muted text-sm outline-none transition-colors focus:border-text-primary/40"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary motion-safe:transition-colors"
          >
            Esc
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/40">
          {KIND_ORDER.map((k) => {
            const on = activeKinds.has(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKind(k)}
                className={`min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-full text-xs font-medium border motion-safe:transition-colors ${
                  on
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-background text-text-muted border-border hover:text-text-primary"
                }`}
              >
                {KIND_LABEL[k]}
              </button>
            );
          })}
          <label className="min-h-[44px] sm:min-h-0 flex items-center gap-2 px-3 py-1.5 text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="accent-accent"
            />
            Include archived
          </label>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 py-2" role="list">
          {loading && (
            <p className="px-3 py-6 text-sm text-text-muted text-center">
              Searching…
            </p>
          )}
          {!loading && errored && (
            <p className="px-3 py-6 text-sm text-amber-600 dark:text-amber-400 text-center">
              Couldn&apos;t load the archive. Try again or narrow your search.
            </p>
          )}
          {!loading && !errored && results.length === 0 && (
            <p className="px-3 py-6 text-sm text-text-muted text-center">
              Nothing matched. Try a different word, or remove a filter.
            </p>
          )}
          {!loading &&
            !errored &&
            results.map((r) => {
              const meta = [
                KIND_LABEL[r.kind],
                r.status,
                relativeTime(r.updatedAt),
              ]
                .filter(Boolean)
                .join(" · ");
              const inner = (
                <>
                  <span className="block text-sm font-medium text-text-primary truncate">
                    {r.title}
                    {r.archived && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-text-muted">
                        archived
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-text-muted truncate">
                    {meta}
                    {r.subtitle ? ` — ${r.subtitle}` : ""}
                  </span>
                </>
              );
              const rowClass =
                "block min-h-[44px] px-3 py-2 rounded-lg motion-safe:transition-colors hover:bg-text-primary/5";
              // Semantic structure: list → listitem → link (review
              // Finding 7). Rows with no real page are non-interactive
              // listitems, never invented links (Brief 281 AC10).
              return (
                <div key={`${r.kind}-${r.id}`} role="listitem">
                  {r.route ? (
                    <Link
                      href={r.route}
                      className={rowClass}
                      onClick={onClose}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div
                      aria-disabled="true"
                      className={`${rowClass} cursor-default`}
                    >
                      {inner}
                    </div>
                  )}
                </div>
              );
            })}
          {!loading && !errored && resp?.truncated && (
            <p className="px-3 py-3 text-xs text-text-muted text-center">
              More exist. Narrow with a word or a filter to see the rest.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
