"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, Search, FilePlus, Eye } from "lucide-react";
import { NetworkCardPreview } from "./network-card-preview";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import type { NetworkEntryIntent } from "@/lib/network-entry-intent";
import { cn } from "@/lib/utils";

export type { NetworkEntryIntent };

interface EntryDefinition {
  intent: NetworkEntryIntent;
  label: string;
  copy: string;
  cta: string;
  href: string;
  icon: typeof Compass;
}

const ENTRIES: EntryDefinition[] = [
  {
    intent: "member-signal",
    label: "Help Ditto understand me",
    copy: "Build a living signal from your links, work, and context. You choose what is visible.",
    cta: "Start my signal",
    href: "/network/chat?mode=expert&intent=member-signal",
    icon: Compass,
  },
  {
    intent: "manual-search",
    label: "Find someone now",
    copy: "Search for the person who can change the outcome, with source-backed evidence — not guesswork.",
    cta: "Search now",
    href: "/network/chat?mode=client&intent=manual-search",
    icon: Search,
  },
  {
    intent: "request",
    label: "Create a request",
    copy: "Turn a need, opportunity, or target outcome into a brief Ditto can quietly work from.",
    cta: "Draft a request",
    href: "/network/chat?mode=client&intent=request",
    icon: FilePlus,
  },
  {
    intent: "background-watch",
    label: "Keep watch for me",
    copy: "Let Ditto quietly look for strong-fit people and timing while you are not scrolling.",
    cta: "Set the watch",
    href: "/network/chat?mode=client&intent=background-watch",
    icon: Eye,
  },
];

export function NetworkLanding() {
  const router = useRouter();
  const [activeIntent, setActiveIntent] = useState<NetworkEntryIntent>("member-signal");
  const isInteractingRef = useRef(false);

  function selectEntry(intent: NetworkEntryIntent, href: string) {
    trackMarketingEvent("network_entry_selected", { intent });
    router.push(href);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      // Pause auto-cycle while the user is hovering / focusing an entry —
      // otherwise the preview fights the user's interaction.
      if (isInteractingRef.current) return;
      setActiveIntent((current) => {
        const index = ENTRIES.findIndex((entry) => entry.intent === current);
        return ENTRIES[(index + 1) % ENTRIES.length].intent;
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const active = ENTRIES.find((entry) => entry.intent === activeIntent) ?? ENTRIES[0];

  return (
    <section className="relative flex min-h-[calc(100dvh-72px)] overflow-hidden px-5 pb-20 pt-4 sm:px-8">
      <div className="relative mx-auto grid w-full max-w-[1180px] items-start gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:items-center lg:py-10">
        <div className="max-w-[720px] text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
            Ditto Network
          </p>
          <h1 className="mt-4 text-[44px] font-semibold leading-[0.96] tracking-[-0.035em] text-text-primary sm:text-[56px] md:text-[64px]">
            A{" "}
            <span className="font-instrument-serif font-normal">superconnector</span>{" "}
            for everyone.
          </h1>
          <p className="mt-5 max-w-[620px] text-base leading-relaxed text-text-secondary md:text-[17px]">
            Ditto understands what people are excellent at, what they need, and when a thoughtful
            introduction could create real value — work, hires, funding, partnerships, advice,
            collaborators. Fewer, better, consent-based introductions, not more networking activity.
          </p>

          <nav
            aria-label="Network entry points"
            className="mt-7 grid gap-3 sm:grid-cols-2"
            onMouseEnter={() => {
              isInteractingRef.current = true;
            }}
            onMouseLeave={() => {
              isInteractingRef.current = false;
            }}
            onFocusCapture={() => {
              isInteractingRef.current = true;
            }}
            onBlurCapture={() => {
              isInteractingRef.current = false;
            }}
          >
            {ENTRIES.map((entry) => (
              <EntryCard
                key={entry.intent}
                entry={entry}
                active={activeIntent === entry.intent}
                onHover={() => setActiveIntent(entry.intent)}
                onClick={() => selectEntry(entry.intent, entry.href)}
              />
            ))}
          </nav>

          <p className="mt-6 max-w-[620px] text-sm leading-5 text-text-secondary">
            Search now or keep watch quietly. Ditto asks if someone is open before any introduction;
            sensitive filters stay private. Every claim Ditto surfaces traces back to a source.
          </p>
        </div>

        <div className="w-full">
          <NetworkCardPreview
            intent={activeIntent}
            onOpen={() => selectEntry(active.intent, active.href)}
          />
          <p className="mx-auto mt-4 max-w-[520px] text-center text-sm leading-5 text-text-secondary lg:text-left">
            {active.copy}
          </p>
        </div>
      </div>
    </section>
  );
}

function EntryCard({
  entry,
  active,
  onHover,
  onClick,
}: {
  entry: EntryDefinition;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      data-intent={entry.intent}
      className={cn(
        "group flex min-h-[112px] flex-col gap-2 rounded-lg border bg-white p-4 text-left shadow-subtle transition-all",
        active
          ? "border-text-primary shadow-medium"
          : "border-border hover:border-text-primary/50 hover:shadow-medium",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">{entry.label}</span>
      </span>
      <span className="text-[13px] leading-5 text-text-secondary">{entry.copy}</span>
      <span className="mt-auto inline-flex items-center gap-1 text-[12px] font-semibold text-text-primary opacity-0 transition-opacity group-hover:opacity-100">
        {entry.cta}
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </span>
    </button>
  );
}
