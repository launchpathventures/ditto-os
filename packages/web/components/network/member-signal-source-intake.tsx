"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Globe2, Link2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MemberSignalProvenance,
  type MemberSignalSourceStatus,
} from "./member-signal-provenance";

type SourceType =
  | "linkedin"
  | "website"
  | "x"
  | "instagram"
  | "other_url"
  | "pasted_text"
  | "upload";

export interface MemberSignalSourceDraft {
  id: string;
  type: SourceType;
  label: string;
  value: string;
}

export interface MemberSignalSourceRow {
  id: string;
  sourceType: string;
  sourceLabel: string;
  sourceUrl?: string | null;
  status: MemberSignalSourceStatus;
  accessNote?: string | null;
  evidenceSnippet?: string | null;
  confidence?: "high" | "medium" | "low" | string | null;
}

export interface MemberSignalResearchResponse {
  memberSignal: {
    id: string;
    sourceSummary?: string | null;
    calibrationQuestions?: unknown;
  };
  sources: MemberSignalSourceRow[];
  webEnrichment: { status: string };
}

const DEFAULT_SOURCES: MemberSignalSourceDraft[] = [
  { id: "linkedin", type: "linkedin", label: "LinkedIn", value: "" },
  { id: "website", type: "website", label: "Website", value: "" },
  { id: "x", type: "x", label: "X", value: "" },
  { id: "instagram", type: "instagram", label: "Instagram", value: "" },
];

const PLACEHOLDERS: Record<SourceType, string> = {
  linkedin: "linkedin.com/in/...",
  website: "your site or portfolio",
  x: "x.com/...",
  instagram: "instagram.com/...",
  other_url: "any public URL",
  pasted_text: "Paste a bio, post, or short source",
  upload: "Upload text",
};

export function memberSignalLimitedSourceCopy(sourceType: string): string {
  if (sourceType === "linkedin" || sourceType === "x" || sourceType === "instagram") {
    return "Could not read beyond public bio. Paste text or upload screenshots if you want Ditto to consider more.";
  }
  return "Source needs pasted text before Ditto can use it.";
}

function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function MemberSignalSourceIntake({
  sessionId,
  userId,
  initialPastedText,
  autoResearchInitial = false,
  onResearchComplete,
  className,
}: {
  sessionId?: string | null;
  userId?: string | null;
  initialPastedText?: string;
  autoResearchInitial?: boolean;
  onResearchComplete?: (response: MemberSignalResearchResponse) => void;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [sources, setSources] = useState<MemberSignalSourceDraft[]>(DEFAULT_SOURCES);
  const [pastedText, setPastedText] = useState(initialPastedText ?? "");
  const [uploadedText, setUploadedText] = useState("");
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "reading" | "error" | "complete">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [sourceRows, setSourceRows] = useState<MemberSignalSourceRow[]>([]);
  const initialResearchStartedRef = useRef(false);

  function updateSource(id: string, value: string) {
    setSources((current) =>
      current.map((source) => source.id === id ? { ...source, value } : source),
    );
  }

  function removeSource(id: string) {
    setSources((current) => current.filter((source) => source.id !== id));
  }

  function addOtherUrl() {
    setSources((current) => [
      ...current,
      {
        id: nextId("source"),
        type: "other_url",
        label: "Other URL",
        value: "",
      },
    ]);
  }

  async function readUpload(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setUploadedText(text);
    setUploadedName(file.name);
  }

  async function startResearch() {
    const payloadSources = sources
      .filter((source) => source.value.trim())
      .map((source) => ({
        type: source.type,
        value: source.value.trim(),
        label: source.label,
      }));
    if (pastedText.trim()) {
      payloadSources.push({
        type: "pasted_text",
        value: pastedText.trim(),
        label: "Pasted text",
      });
    }
    if (uploadedText.trim()) {
      payloadSources.push({
        type: "upload",
        value: uploadedText.trim(),
        label: uploadedName || "Uploaded text",
      });
    }
    if (payloadSources.length === 0) {
      setStatus("error");
      setMessage("Add at least one source.");
      return;
    }

    setStatus("reading");
    setMessage(null);
    try {
      const response = await fetch("/api/v1/network/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "research",
          sessionId,
          userId,
          sources: payloadSources,
        }),
      });
      const payload = await response.json() as MemberSignalResearchResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "member_signal_research_failed");
      setSourceRows(payload.sources);
      setStatus("complete");
      setMessage(
        payload.webEnrichment.status === "unconfigured"
          ? "Sources saved. Web enrichment is unavailable here, so Ditto will only use what you provided."
          : "Sources saved.",
      );
      onResearchComplete?.(payload);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Research failed.");
    }
  }

  useEffect(() => {
    if (!autoResearchInitial || initialResearchStartedRef.current || !initialPastedText?.trim()) return;
    if (!sessionId && !userId) return;
    initialResearchStartedRef.current = true;
    void startResearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResearchInitial, initialPastedText, sessionId, userId]);

  return (
    <section className={cn("rounded-2xl bg-white p-5 shadow-medium", className)} data-testid="member-signal-source-intake">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">Profile</p>
          <h2 className="mt-2 text-2xl font-semibold text-text-primary">Add sources</h2>
          <p className="mt-2 max-w-xl text-sm leading-5 text-text-secondary">
            Add a few places Ditto should read. You approve what becomes public.
          </p>
        </div>
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground sm:inline-flex">
          <Search className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {sources.map((source) => (
          <label key={source.id} className="grid gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">{source.label}</span>
            <span className="flex min-h-12 items-center gap-2 rounded-2xl border border-border bg-surface-raised px-3 transition-colors focus-within:border-text-primary">
              <Link2 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <input
                value={source.value}
                onChange={(event) => updateSource(source.id, event.target.value)}
                placeholder={PLACEHOLDERS[source.type]}
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              {source.type === "other_url" ? (
                <button
                  type="button"
                  onClick={() => removeSource(source.id)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-white hover:text-text-primary"
                  aria-label="Remove source"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={addOtherUrl}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add another URL
      </button>

      <label className="mt-5 grid gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-text-muted">Pasted text</span>
        <textarea
          value={pastedText}
          onChange={(event) => setPastedText(event.target.value)}
          placeholder={PLACEHOLDERS.pasted_text}
          className="min-h-28 resize-none rounded-2xl border border-border bg-surface-raised px-4 py-3 text-sm leading-5 text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-text-primary"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          className="hidden"
          onChange={(event) => void readUpload(event.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised"
        >
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Import text
        </button>
        {uploadedName ? (
          <span className="inline-flex min-h-9 items-center gap-2 rounded-md bg-surface-raised px-3 text-xs font-semibold text-text-secondary">
            <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
            {uploadedName}
          </span>
        ) : null}
      </div>

      {sourceRows.length > 0 ? (
        <div className="mt-5 grid gap-2" aria-label="Source status rows">
          {sourceRows.map((source) => (
            <div key={source.id} className="rounded-2xl border border-border bg-surface-raised p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <MemberSignalProvenance
                  sourceLabel={source.sourceLabel}
                  sourceUrl={source.sourceUrl}
                  confidence={source.confidence}
                  status={source.status}
                />
                <span className="text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
                  {source.status === "found" ? "Reading sources" : source.status === "limited" ? "Limited" : source.status}
                </span>
              </div>
              {source.status === "limited" || source.status === "needs_paste" ? (
                <p className="mt-2 text-xs leading-5 text-text-secondary">
                  {source.accessNote || memberSignalLimitedSourceCopy(source.sourceType)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {message ? (
        <p className={cn("mt-4 text-sm leading-5", status === "error" ? "text-negative" : "text-text-secondary")}>
          {message}
        </p>
      ) : null}

      <button
        type="button"
        disabled={status === "reading"}
        onClick={() => void startResearch()}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        {status === "reading" ? "Reading sources" : "Read sources"}
      </button>
    </section>
  );
}
