"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  NetworkCardPreview,
  type NetworkLandingMode,
} from "./network-card-preview";
import { cn } from "@/lib/utils";

const COPY: Record<
  NetworkLandingMode,
  {
    eyebrow: string;
    titlePrefix: string;
    verb: string;
    titleSuffix: string;
    subtitle: string;
  }
> = {
  expert: {
    eyebrow: "No. 01 / Two halves of the same loop",
    titlePrefix: "Opportunities",
    verb: "find",
    titleSuffix: "you.",
    subtitle:
      "Tell us what you're great at. We'll match you with the other side.",
  },
  client: {
    eyebrow: "No. 01 / Two halves of the same loop",
    titlePrefix: "Find help you can't",
    verb: "Google",
    titleSuffix: ".",
    subtitle:
      "Tell us what you need. We'll find the person worth speaking to.",
  },
};

export function NetworkLanding() {
  const router = useRouter();
  const [mode, setMode] = useState<NetworkLandingMode>("expert");
  const copy = COPY[mode];

  const openChat = (nextMode = mode) => {
    router.push(`/network/chat?mode=${nextMode}`);
  };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "e") {
        event.preventDefault();
        setMode("expert");
      }
      if (key === "c") {
        event.preventDefault();
        setMode("client");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <section className="relative flex h-[calc(100dvh-72px)] overflow-hidden px-5 pb-16 pt-5 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(17,17,17,0.08)_1px,transparent_1px)] [background-size:96px_96px] opacity-20" />

      <div className="relative mx-auto flex w-full max-w-[1100px] flex-col items-center justify-center gap-5 text-center">
        <div className="max-w-[900px]">
          <p className="text-xs font-medium uppercase text-text-secondary">
            {copy.eyebrow}
          </p>
          <h1 className="mt-4 text-5xl font-semibold leading-none text-text-primary sm:text-[56px] md:text-[64px]">
            {copy.titlePrefix}{" "}
            <span className="font-instrument-serif font-normal">{copy.verb}</span>
            {copy.titleSuffix === "." ? copy.titleSuffix : ` ${copy.titleSuffix}`}
          </h1>
          <p className="mx-auto mt-4 max-w-[620px] text-base leading-relaxed text-text-secondary md:text-[17px]">
            {copy.subtitle}
          </p>
        </div>

        <div className="w-full">
          <NetworkCardPreview mode={mode} onOpen={() => openChat(mode)} />
        </div>

        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span className="hidden sm:inline">Switch: Cmd-E experts / Cmd-C clients</span>
          <span className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex cursor-default items-center gap-1 text-text-muted opacity-70"
          >
            Talk it through
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="fixed bottom-4 left-1/2 z-20 w-[min(92vw,360px)] -translate-x-1/2 rounded-lg border border-white/10 bg-[#111111] p-1 shadow-large">
        <div className="grid grid-cols-2 gap-1">
          <ModeButton
            label="Experts"
            active={mode === "expert"}
            onClick={() => {
              if (mode === "expert") {
                openChat("expert");
              } else {
                setMode("expert");
              }
            }}
          />
          <ModeButton
            label="Clients"
            active={mode === "client"}
            onClick={() => {
              if (mode === "client") {
                openChat("client");
              } else {
                setMode("client");
              }
            }}
          />
        </div>
      </div>
    </section>
  );
}

function ModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-md px-3 text-sm font-semibold uppercase transition-colors",
        active
          ? "bg-white text-[#111111]"
          : "text-white/60 hover:bg-white/10 hover:text-white",
      )}
    >
      {label}
    </button>
  );
}
