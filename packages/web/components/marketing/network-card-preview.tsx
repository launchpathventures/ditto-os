"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Eye, FileText, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NetworkEntryIntent } from "@/lib/network-entry-intent";

export type NetworkPreviewIntent = NetworkEntryIntent;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function NetworkCardPreview({
  intent,
  onOpen,
}: {
  intent: NetworkPreviewIntent;
  onOpen: () => void;
}) {
  // Reduced motion still respected: parent rotates intents on an interval and we
  // keep transitions cheap so this respects user-system motion preferences.
  const reducedMotion = useReducedMotion();

  return (
    <button
      type="button"
      onClick={onOpen}
      data-preview-intent={intent}
      className={cn(
        "group relative flex w-full appearance-none border-0 bg-transparent p-0 text-left outline-none shadow-none",
        "focus-visible:ring-2 focus-visible:ring-text-primary/20",
        reducedMotion ? "" : "transition-transform",
      )}
      aria-label={`Open ${intent} entry`}
    >
      {intent === "member-signal" ? (
        <MemberSignalPreview />
      ) : intent === "manual-search" ? (
        <ManualSearchPreview />
      ) : intent === "request" ? (
        <RequestPreview />
      ) : (
        <BackgroundWatchPreview />
      )}
    </button>
  );
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[420px] rounded-xl border border-border bg-white p-4 text-left shadow-large transition-transform duration-200 group-hover:-translate-y-1">
      {children}
    </div>
  );
}

function MemberSignalPreview() {
  return (
    <PreviewFrame>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          Member signal
        </p>
        <span className="rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
          Drafting signal
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full [background:var(--gradient-phoenix-orange)] opacity-80" />
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Your signal</h3>
          <p className="text-sm text-text-secondary">What you do, who fits, who does not.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {[
          { label: "Reading sources", value: "linkedin.com/in/you · 4 links" },
          { label: "Drafted claim", value: "Turns messy growth data into commercial calls." },
          { label: "Visibility", value: "Private until you approve" },
        ].map((row) => (
          <div key={row.label} className="rounded-lg bg-surface-raised px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              {row.label}
            </p>
            <p className="mt-0.5 text-sm text-text-primary">{row.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
        {[
          { label: "Shape", icon: Sparkles },
          { label: "Approve", icon: CheckCircle2 },
          { label: "Represent", icon: ArrowUpRight },
        ].map(({ label, icon: Icon }) => (
          <span key={label} className="inline-flex items-center gap-1">
            <Icon className="h-3 w-3 text-text-primary" aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </PreviewFrame>
  );
}

function ManualSearchPreview() {
  return (
    <PreviewFrame>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          Manual search
        </p>
        <span className="rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
          Reading sources
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
        <Search className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <p className="flex-1 text-sm leading-tight text-text-primary">
          A marketplace operator who has restored supply after a trust failure.
        </p>
      </div>
      <div className="mt-3 grid gap-2">
        {[
          {
            name: "Possible connection",
            fit: "Why this fits: founder-led marketplace, post-incident rebuild.",
            source: "Source: member signal · approved 2026-04",
            state: "Needs approval",
          },
          {
            name: "Possible connection",
            fit: "Why this fits: trust-and-safety scope, hands-on with operators.",
            source: "Source: off-network scout · perplexity.ai",
            state: "Needs approval",
          },
        ].map((row, index) => (
          <div key={index} className="rounded-lg bg-surface-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text-primary">{row.name}</p>
              <span className="rounded-full border border-border bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
                {row.state}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-text-secondary">{row.fit}</p>
            <p className="mt-1 text-[11px] font-medium text-text-muted">{row.source}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-text-muted">
        Ditto will ask if they are open before any introduction.
      </p>
    </PreviewFrame>
  );
}

function RequestPreview() {
  return (
    <PreviewFrame>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          Active request
        </p>
        <span className="rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
          Private draft
        </span>
      </div>
      <div className="mt-4 rounded-lg bg-surface-raised p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          <FileText className="h-3 w-3" aria-hidden="true" />
          Outcome
        </p>
        <p className="mt-1 text-[15px] leading-snug text-text-primary">
          Hire a fractional revenue lead who has rebuilt founder-led sales motions.
        </p>
      </div>
      <div className="mt-3 grid gap-2">
        {[
          { label: "Reference shape", copy: "Sold 6-figure ARR into ops-heavy buyers." },
          { label: "Bad fit", copy: "Generic playbook consultants. Stays private." },
          { label: "Budget", copy: "Defined, kept off candidate-facing copy." },
        ].map((row) => (
          <div key={row.label} className="rounded-lg bg-surface-raised px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              {row.label}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-text-primary">{row.copy}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-text-muted">
        Ditto turns this into a brief Possible Connections can be matched against.
      </p>
    </PreviewFrame>
  );
}

function BackgroundWatchPreview() {
  return (
    <PreviewFrame>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
          Background watch
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-text-primary/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-text-primary" />
          </span>
          Watch active
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised">
          <Eye className="h-5 w-5 text-text-primary" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Watching quietly</h3>
          <p className="text-sm text-text-secondary">No outreach without your approval.</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {[
          { label: "Looking for", value: "Operators with founder-led sales scars." },
          { label: "Last check", value: "12 minutes ago · nothing strong enough to surface" },
          { label: "Will notify when", value: "Source-traced fit lands AND timing reads warm." },
        ].map((row) => (
          <div key={row.label} className="rounded-lg bg-surface-raised px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              {row.label}
            </p>
            <p className="mt-0.5 text-sm text-text-primary">{row.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-5 text-text-muted">
        Pause anytime. Surfaces require your approval before reaching anyone.
      </p>
    </PreviewFrame>
  );
}
