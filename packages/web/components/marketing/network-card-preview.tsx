"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowUpRight, Paperclip, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NetworkProfileCardBlock } from "@/lib/engine";
import { NetworkProfileCardRenderer } from "@/app/network/chat/network-profile-card-renderer";

export type NetworkLandingMode = "expert" | "client";

interface ExpertFixture {
  name: string;
  title: string;
  signal: string;
  tags: string[];
  line: string;
}

const EXPERT_FIXTURES: ExpertFixture[] = [
  {
    name: "Priya Patel",
    title: "Principal data scientist",
    signal: "Turns messy growth data into commercial calls.",
    tags: ["Revenue", "B2B", "Forecasts"],
    line: "Allergic to dashboards nobody acts on.",
  },
  {
    name: "Morgan Lee",
    title: "Marketplace operator",
    signal: "Knows what breaks when supply gets thin.",
    tags: ["Supply", "Trust", "Ops"],
    line: "Best when the brief is half formed.",
  },
  {
    name: "Elena Ruiz",
    title: "Enterprise sales lead",
    signal: "Gets founder-led sales unstuck without theatre.",
    tags: ["Sales", "Founder", "Enterprise"],
    line: "No interest in generic playbooks.",
  },
];

const CLIENT_PROMPTS = [
  "Who should I talk to at Shopify about enterprise rollouts?",
  "Find someone who has rebuilt trust after a failed launch.",
  "I need a second brain on marketplace liquidity this week.",
];

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
  mode,
  onOpen,
  card,
}: {
  mode: NetworkLandingMode;
  onOpen: () => void;
  card?: NetworkProfileCardBlock | null;
}) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [mode]);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % 3);
    }, 5000);
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  const expert = EXPERT_FIXTURES[index % EXPERT_FIXTURES.length];
  const prompt = CLIENT_PROMPTS[index % CLIENT_PROMPTS.length];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative block w-full text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-text-primary/20",
      )}
      aria-label={`Open ${mode === "expert" ? "expert" : "client"} network chat`}
    >
      <div className="pointer-events-none absolute -inset-10 -z-10 opacity-10 blur-3xl [background:var(--gradient-phoenix-orange)]" />
      {mode === "expert" && card ? (
        <NetworkProfileCardRenderer card={card} />
      ) : mode === "expert" ? (
        <ExpertPreviewCard fixture={expert} />
      ) : (
        <ClientPreviewCard prompt={prompt} />
      )}
    </button>
  );
}

function ExpertPreviewCard({ fixture }: { fixture: ExpertFixture }) {
  const palette = useMemo(() => ["#ffd7f0", "#b7efb2", "#ffef99"], []);

  return (
    <div className="mx-auto w-full max-w-[340px] rounded-xl border border-white/80 bg-white p-3 shadow-large transition-transform duration-200 group-hover:-translate-y-1">
      <div className="rounded-lg bg-surface-raised p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-text-muted">Profile</p>
          <ArrowUpRight className="h-4 w-4 text-text-muted" />
        </div>
        <div className="mt-5 h-12 w-12 rounded-full bg-white shadow-medium">
          <div className="h-full w-full rounded-full [background:var(--gradient-phoenix-orange)] opacity-80" />
        </div>
      </div>
      <div className="mt-3">
        <h3 className="text-lg font-semibold text-text-primary">{fixture.name}</h3>
        <p className="mt-1 text-sm text-text-secondary">{fixture.title}</p>
        <p className="mt-3 text-[15px] leading-snug text-text-primary">
          {fixture.signal}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {fixture.tags.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: palette[i % palette.length] }}
            />
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-[21px] leading-tight text-text-primary">
          {fixture.line}
        </p>
      </div>
    </div>
  );
}

function ClientPreviewCard({ prompt }: { prompt: string }) {
  return (
    <div className="mx-auto w-full max-w-[520px] rounded-xl border border-white/80 bg-white p-4 shadow-large transition-transform duration-200 group-hover:-translate-y-1">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
        <Search className="h-4 w-4 text-text-muted" />
        <p className="min-h-8 flex-1 text-base leading-tight text-text-primary">
          {prompt}
        </p>
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-text-muted">
          <Paperclip className="h-4 w-4" />
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <ArrowUp className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["Talent search", "Market map", "Warm intro"].map((label) => (
          <div key={label} className="rounded-lg bg-surface-raised p-3">
            <p className="text-sm font-medium text-text-primary">{label}</p>
            <div className="mt-5 space-y-1.5">
              <div className="h-1.5 rounded-full bg-border" />
              <div className="h-1.5 w-2/3 rounded-full bg-border" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
